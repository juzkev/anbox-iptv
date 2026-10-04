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

// Singapore/Malaysia specific markers from original anbox
// Use word boundaries to avoid false positives (e.g., BARBASTRO, SG=handball teams)
const SG_MARKERS = [
  /\bSG ENTERTAINMENT\b/,
  /\bSG ASIAN\b/,
  /\bSG MALAYSIA\b/,
  /\bSG SPORTS\b/,
  /\bSG INDIA\b/,
  /\bSG FILIPINO\b/,
  /\bMALAYSIA\b/,
  /\bASIA SPORTS\b/,
  /\bASTRO\b/,  // Match standalone ASTRO (not BARBASTRO)
  /\bSTAR HUB\b/,
  /\bSINGTEL\b/,
  /\bSINGAPORE\b/
];

const KEEP_CHANNELS = [
  "UK SPORTS", "SPORTS", "BEIN SPORTS", "EPL", "SKY SPORTS", "SUPERSPORT", "NOW SPORTS",
  "UK ASTRO SPORTS", "UK NOW SPORTS", "UK HUB SPORTS", "UK WORLD SPORTS"
];

const DEFAULT_MARKERS = [
  "GENERAL", "ENTERTAINMENT", "NEWS", "MOVIES", "DOCUMENTARY", "SPORTS"
];

const customDomain = "https://anbox-iptv.kkhk.workers.dev";

// Retry logic with exponential backoff
async function fetchUrlWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchUrl(url, options);
    } catch (e) {
      if (i === retries - 1) throw e;
      // Wait before retry (exponential backoff)
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 500));
    }
  }
}

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
    const { status } = await fetchUrlWithRetry(probeUrl, {
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

    const { status, data } = await fetchUrlWithRetry(apiUrl, {
      headers: {
        Cookie: `mac=${parsed.searchParams.get('mac')}`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; MAG200 stb)'
      },
      timeout: 15000
    });

    if (status !== 200) return [];

    const jsonMatch = data.match(/{.*}/s);
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

// Check if a channel is Singapore/Malaysia related (for sorting)
function isSGChannel(name, groupTitle) {
  const combined = (name + ' ' + groupTitle).toUpperCase();
  // Exclude UK, VN, HK, PH channels (including UK| prefix)
  if (/^(UK\s*-|VN\s*-|HK\s*-|PH\s*-|UK\s*\|)/.test(name)) return false;

  // Match the original script's approach: check group-title and name
  return /\bSG\s+ENTERTAINMENT\b/.test(combined) ||
         /\bSG\s+ASIAN\b/.test(combined) ||
         /\bSG\s+MALAYSIA\b/.test(combined) ||
         /\bSG\s+SPORTS\b/.test(combined) ||
         /\bSG\s+INDIA\b/.test(combined) ||
         /\bSG\s+FILIPINO\b/.test(combined) ||
         /\bMALAYSIA\b/.test(combined) ||
         // Only match ASIA if it's "MALAYSIA" or "SINGAPORE" in the name
         (/\bASIA\b/.test(combined) && /\b(MALAYSIA|SINGAPORE)\b/.test(combined)) ||
         // Only match ASTRO if it's in the group-title and not cricket/PSL
         (/\bASTRO\b/.test(groupTitle.toUpperCase()) && !/\b(PSL|CR|CRICKET)\b/.test(groupTitle)) ||
         /\bSTAR\s+HUB\b/.test(combined) ||
         /\bSINGTEL\b/.test(combined) ||
         /\bSINGAPORE\b/.test(combined);
}

async function buildM3U() {
  console.log('🔍 Loading portal status...');

  // Load probe data if available
  let probeData = null;
  try {
    const statusPath = path.join(__dirname, '../portal-status.json');
    if (fs.existsSync(statusPath)) {
      probeData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      console.log(`  Loaded ${probeData.portals?.length || 0} portal statuses from ${probeData.lastUpdated}`);
    }
  } catch (e) {
    console.log('  No probe data found, will probe all portals');
  }

  // Filter out expired portals if we have probe data
  const excludePortals = new Set();
  if (probeData?.portals) {
    for (const p of probeData.portals) {
      // Exclude expired portals
      if (p.expiryDays !== null && p.expiryDays <= 0) {
        excludePortals.add(p.name);
        console.log(`  ❌ Excluding expired: ${p.name} (expired ${Math.abs(p.expiryDays)} days ago)`);
      }
      // Flag expiring soon
      else if (p.expiryDays !== null && p.expiryDays <= 7) {
        console.log(`  ⚠️  WARNING: ${p.name} expires in ${p.expiryDays} days!`);
      }
    }
  }

  console.log('🔍 Probing portals...');

  // Probe in parallel batches
  const results = await Promise.allSettled(
    Object.entries(PROBE_URLS).map(async ([name, url]) => {
      if (excludePortals.has(name)) {
        return { name, url, ok: false, reason: 'expired' };
      }
      const ok = await probePortal(url);
      return { name, url, ok };
    })
  );

  const workingPortals = results
    .filter(r => r.status === 'fulfilled' && r.value.ok)
    .map(r => r.value);

  console.log(`✅ Found ${workingPortals.length}/${Object.keys(PROBE_URLS).length} working portals`);
  console.log('Working:', workingPortals.map(p => p.name).join(', '));

  // Fetch channels from all portals in parallel with retry
  console.log('\n📥 Fetching channels from all portals in parallel...');
  const fetchResults = await Promise.allSettled(
    workingPortals.map(async (portal) => {
      console.log(`  📥 ${portal.name}...`);
      const channels = await fetchChannelList(portal.name, portal.url);
      return { name: portal.name, url: portal.url, channels, ok: true };
    })
  );

  const allPortals = fetchResults
    .filter(r => r.status === 'fulfilled' && r.value.ok)
    .map(r => r.value);

  console.log(`\n✅ Fetched from ${allPortals.length}/${workingPortals.length} portals`);

  const channelMap = new Map();
  const sgChannels = new Map();

  for (const portal of allPortals) {
    const parsed = new URL(portal.url);
    const portalBase = parsed.origin;
    const mac = parsed.searchParams.get('mac');
    const channels = portal.channels;

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
        const urlMatch = cmd.match(/(https?:\/\/[^\s"'])+/);
        if (urlMatch) {
          try {
            const urlObj = new URL(urlMatch[1]);
            token = urlObj.searchParams.get('play_token') || token;
          } catch {}
        }
      }

      const realUrl = `${portalBase}/play/live.php?mac=${mac}&stream=${ch.id}&extension=ts&play_token=${token}`;

      let groupTitle = currentMarker || 'Other';
      let shouldInclude = true;

      if (KEEP_CHANNELS.some(k => name.toUpperCase().includes(k.toUpperCase()))) {
        groupTitle = 'Sports On Demand';
      } else if (currentMarker && DEFAULT_MARKERS.some(m => m.toUpperCase() === currentMarker.toUpperCase())) {
        groupTitle = currentMarker;
      } else if (!groupTitle) {
        groupTitle = 'Other';
      }

      if (!shouldInclude) continue;

      const normName = normalizeChannelName(name);

      // Check if Singapore/Malaysia channel
      if (isSGChannel(name, groupTitle)) {
        if (!sgChannels.has(normName)) {
          sgChannels.set(normName, []);
        }
        sgChannels.get(normName).push({
          id: ch.id,
          name: name,
          groupTitle: groupTitle,
          url: realUrl,
          portal: portal.name
        });
      } else {
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
  }

  // Generate M3U playlist with SG channels first
  let m3u = '#EXTM3U\n';
  m3u += `#Generated: ${new Date().toISOString()}\n`;
  m3u += `#Active Sources: ${workingPortals.map(p => p.name.toUpperCase()).join(' & ')}\n\n`;

  let totalChannels = 0;
  const seenUrls = new Set();

  // Helper to format channel entry
  function formatChannel(entry) {
    const portals = [...new Set(entry.list.map(ch => ch.portal))];
    const mainCh = entry.list[0];
    const b64Url = Buffer.from(mainCh.url).toString('base64');
    const streamUrl = `${customDomain}/resolve?src=${encodeURIComponent(b64Url)}`;

    if (seenUrls.has(mainCh.url)) return null;
    seenUrls.add(mainCh.url);

    const portalSuffix = portals.length > 1 ? ` [${portals.join(', ')}]` : ` [${portals[0]}]`;
    const displayName = `${mainCh.name}${portalSuffix}`;

    return {
      header: `#EXTINF:-1 tvg-id="${mainCh.id}" tvg-name="${displayName}" group-title="${mainCh.groupTitle}",${displayName}\n`,
      url: streamUrl
    };
  }

  // Add SG channels first
  console.log('\n🇸🇬 Processing SG/MY channels...');
  const sgEntries = [];
  for (const [normName, list] of sgChannels.entries()) {
    const entry = formatChannel({ list });
    if (entry) {
      sgEntries.push(entry);
      totalChannels++;
    }
  }
  m3u += '# === SINGAPORE / MALAYSIA CHANNELS ===\n\n';
  for (const entry of sgEntries) {
    m3u += entry.header;
    m3u += entry.url + '\n';
  }
  console.log(`  Found ${sgEntries.length} SG/MY channels`);

  // Add remaining channels
  console.log('\n🌍 Processing international channels...');
  const intlEntries = [];
  for (const [normName, list] of channelMap.entries()) {
    const entry = formatChannel({ list });
    if (entry) {
      intlEntries.push(entry);
      totalChannels++;
    }
  }
  m3u += '# === INTERNATIONAL CHANNELS ===\n\n';
  for (const entry of intlEntries) {
    m3u += entry.header;
    m3u += entry.url + '\n';
  }
  console.log(`  Found ${intlEntries.length} international channels`);

  console.log(`\n📊 Total unique channels: ${totalChannels}`);

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
