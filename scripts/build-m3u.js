#!/usr/bin/env node
/**
 * Build M3U playlist from IPTV portals
 * Runs on Node.js (GitHub Actions / VPS) - NOT on Cloudflare Workers
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load portal URLs from centralized config
const { PROBE_URLS } = require('./portals.js');

const KEEP_CHANNELS = [
  "UK SPORTS", "SPORTS", "BEIN SPORTS", "EPL", "SKY SPORTS", "SUPERSPORT", "NOW SPORTS"
];

const DEFAULT_MARKERS = [
  "GENERAL", "ENTERTAINMENT", "NEWS", "MOVIES", "DOCUMENTARY", "SPORTS"
];

const customDomain = "https://anbox-iptv.kkhk.workers.dev";

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 10000
    };
    
    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, ok: res.statusCode < 400 }));
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    
    req.end();
  });
}

async function probePortal(url) {
  try {
    const parsed = new URL(url);
    const mac = parsed.searchParams.get('mac');
    // Test portal.php instead of play/live.php
    const probeUrl = `${parsed.origin}/portal.php?type=itv&action=get_all_channels&JsHttpRequest=1-xml`;
    const { status } = await fetchUrl(probeUrl, {
      headers: {
        'Cookie': `mac=${mac}`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; MAG200 stb)'
      },
      timeout: 5000
    });
    return status === 200;
  } catch {
    return false;
  }
}

async function fetchChannelList(portalKey, url) {
  try {
    const parsed = new URL(url);
    const apiUrl = `${parsed.origin}/portal.php?type=itv&action=get_all_channels&JsHttpRequest=1-xml`;
    
    const { status, data } = await fetchUrl(apiUrl, {
      headers: {
        Cookie: `mac=${parsed.searchParams.get('mac')}`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; MAG200 stb)'
      },
      timeout: 15000
    });
    
    if (status !== 200) return [];
    
    const jsonMatch = data.match(/\{.*\}/s);
    if (!jsonMatch) return [];
    
    const json = JSON.parse(jsonMatch[0]);
    return json.js?.data || [];
  } catch (e) {
    console.error(`Error fetching ${portalKey}:`, e.message);
    return [];
  }
}

// Normalize channel name to group alternative streams together
function normalizeChannelName(name) {
  return name
    .toUpperCase()
    .replace(/\[.*?\]/g, '') // strip portal suffix like [DEBIT], [DINODOX]
    .replace(/[^A-Z0-9]/g, '') // remove special characters
    .replace(/(HEVC|FHD|HD|SD|UHD|4K|1080P|720P|BACKUP|ALT|DIRECT|RAW)/g, '') // strip quality tags
    .trim();
}

async function buildM3U() {
  console.log('🔍 Probing portals...');
  
  // Probe in parallel batches
  const results = await Promise.allSettled(
    Object.entries(PROBE_URLS).map(async ([name, url]) => {
      const ok = await probePortal(url);
      return { name, url, ok };
    })
  );
  
  const workingPortals = results
    .filter(r => r.status === 'fulfilled' && r.value.ok)
    .map(r => r.value);
  
  console.log(`✅ Found ${workingPortals.length}/${Object.keys(PROBE_URLS).length} working portals`);
  console.log('Working:', workingPortals.map(p => p.name).join(', '));
  
  const channelMap = new Map(); // key: normalized name, value: array of channel objects

  for (const portal of workingPortals) {
    console.log(`📥 Fetching channels from ${portal.name}...`);
    const channels = await fetchChannelList(portal.name, portal.url);
    
    const parsed = new URL(portal.url);
    const portalBase = parsed.origin;
    const mac = parsed.searchParams.get('mac');
    
    let currentMarker = null;
    
    for (const ch of channels) {
      const name = (ch.name || '').trim();
      
      // Skip markers
      if (/^#{3,}.+#{3,}$/i.test(name)) {
        currentMarker = name.replace(/#/g, '').trim();
        continue;
      }
      
      // Extract fresh token from channel's cmd field (ffmpeg URL)
      const cmd = ch.cmd || '';
      let token = mac; // fallback to mac if no token found
      
      // Try to extract play_token from cmd
      const tokenMatch = cmd.match(/play_token=([A-Za-z0-9]+)/);
      if (tokenMatch) {
        token = tokenMatch[1];
      } else {
        // Try to extract full stream URL from cmd
        const urlMatch = cmd.match(/(https?:\/\/[^\\s"']+)/);
        if (urlMatch) {
          try {
            const urlObj = new URL(urlMatch[1]);
            token = urlObj.searchParams.get('play_token') || token;
          } catch {}
        }
      }
      
      const realUrl = `${portalBase}/play/live.php?mac=${mac}&stream=${ch.id}&extension=ts&play_token=${token}`;
      
      let groupTitle = '';
      let shouldInclude = false;
      
      if (KEEP_CHANNELS.some(k => name.toUpperCase().includes(k.toUpperCase()))) {
        groupTitle = 'Sports On Demand';
        shouldInclude = true;
      } else if (currentMarker && DEFAULT_MARKERS.some(m => m.toUpperCase() === currentMarker.toUpperCase())) {
   groupTitle = currentMarker;
   shouldInclude = true;
 } else if (!groupTitle) {
   // Include all channels if no marker matches
   groupTitle = 'Other';
   shouldInclude = true;
 }
      
      if (!shouldInclude) continue;

      const normName = normalizeChannelName(name);
      if (!channelMap.has(normName)) {
        channelMap.set(normName, []);
      }
      channelMap.get(normName).push({
        id: ch.id,
        name: name,
        groupTitle: groupTitle,
        url: realUrl,
        portal: portal.name
      });
    }
  }

  // Generate M3U playlist with grouped/deduplicated channels
  let m3u = '#EXTM3U\n';
  m3u += `#Generated: ${new Date().toISOString()}\n`;
  m3u += `#Active Sources: ${workingPortals.map(p => p.name.toUpperCase()).join(' & ')}\n\n`;

  let totalChannels = 0;
  const seenUrls = new Set();

  for (const [normName, list] of channelMap.entries()) {
    // Get unique portals for this channel
    const portals = [...new Set(list.map(ch => ch.portal))];
    const mainCh = list[0];
    const b64Url = Buffer.from(mainCh.url).toString('base64');
    const streamUrl = `${customDomain}/resolve?src=${encodeURIComponent(b64Url)}`;

    // Skip exact URL duplicates
    if (seenUrls.has(mainCh.url)) continue;
    seenUrls.add(mainCh.url);

    // Create channel name with all portal sources
    const portalSuffix = portals.length > 1 ? ` [${portals.join(', ')}]` : ` [${portals[0]}]`;
    const displayName = `${mainCh.name}${portalSuffix}`;

    m3u += `#EXTINF:-1 tvg-id="${mainCh.id}" tvg-name="${displayName}" group-title="${mainCh.groupTitle}",${displayName}\n`;
    m3u += `${streamUrl}\n`;
    totalChannels++;
  }

  console.log(`📊 Total unique channels: ${totalChannels}`);
  
  return m3u;
}

async function main() {
  try {
    const m3u = await buildM3U();
    const outputPath = path.join(__dirname, '..', 'playlist.m3u');
    fs.writeFileSync(outputPath, m3u);
    console.log(`✅ Playlist written to ${outputPath}`);
    console.log(`📊 Total size: ${(m3u.length / 1024).toFixed(2)} KB`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();