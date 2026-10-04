#!/usr/bin/env node
/**
 * Build M3U playlist from IPTV portals
 * Runs on Node.js (GitHub Actions / VPS) - NOT on Cloudflare Workers
 * 
 * Uses original anbox keyword whitelisting approach:
 * - KEEP_CHANNELS: Always include these channels
 * - DEFAULT_MARKERS: Include channels under these portal categories
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load portal URLs from centralized config
const { PROBE_URLS } = require('./portals.js');

// Keywords to always include (sports channels)
const KEEP_CHANNELS = [
  "UK SPORTS", "SPORTS", "BEIN SPORTS", "EPL", "SKY SPORTS", "SUPERSPORT", "NOW SPORTS",
  "UK ASTRO SPORTS", "UK NOW SPORTS", "UK HUB SPORTS", "UK WORLD SPORTS"
];

// Portal category markers to include (from original anbox script)
const DEFAULT_MARKERS = [
  "GENERAL FHD", "ENTERTAINMENT FHD", "NEWS SD / FHD", "DOCUMENTARY HEVC", "MOVIES FHD",
  "ITV X VIP", "SKY SPORTS FHD", "EPL PREMIER LEAGUE", "BEIN SPORTS ASIA", "SUPER SPORTS",
  "UK ASTRO SPORTS", "UK NOW SPORTS", "UK NOW TV", "NOW TV", "UK HUB SPORTS", "UK WORLD SPORTS", "UK OTHER SPORTS", "SKY SPORT", "SG ENTERTAINMENT",
  "SG ASIAN+", "SURINAME", "SG MALAYSIA", "SG SPORTS+", "INDIA", "TAMIL", "JAPAN",
  "UK", "UK SPORTS", "|UK| SPORTS", "[UK] SPORTS", "UNITED KINGDOM", "UK GENERAL", "UK ENTERTAINMENT", "UK MOVIES", "UK WORLD SPORTS",
  "UK DOCUMENTARY", "UK NEWS", "[UK] NEWS", "[UK] GENERAL", "[UK] ENTERTAINM. FHD",
  "[UK] SPORTS UHD", "[UK] SKY SPORTS FHD", "[UK] WORLD SPORTS", "[UK] MOVIES UHD", "[UK] DOCUMENTARY FHD",
  "UK WORLD SPORTS", "WORLD SPORTS", "WORLD SPORT", "INT: WORLD SPORTS", "BEIN SPORTS", "AUSTRALIA",
  "USA", "UNITED STATES", "USA GENERAL", "USA ENTERTAINMENT", "USA MOVIES", "BEE| STAR HUB",
  "USA NEWS", "USA SPORTS", "USA REGIONALS", "US:", "US|", "UK|", "UK| SPORTS",
  "UK DAZN SPORTS", "NEWS NETWORK", "SPORTS NETWORK", "ENTERTAINMENT", "MOVIES NETWORK",
  "SG ENTERTAINMENT", "SG ASIAN+", "SG MALAYSIA", "SG INDIA+", "SG FILIPINO+", "ASIA SPORTS", "AS SPORTS", "AS|SPORTS",
  "CANADA", "CAN", "|CA| CANADA", "CA:", "[CA] CANADA", "CA GENERAL", "CA SPORTS", "CA| SPORTS", "CA| SPORT", "[CA] SPORTS",
  "|AM| CANADA", "|NA| USA GENERAL", "|NA| USA NEWS", "|NA| USA MOVIES",
  "VIP CHANNELS", "VIP FORMULA 1", "VIP|FORMULA 1", "VIP | FORMULA 1", "SPORTS PREMIUM", "DOCUMENTARY", "CHINA", "HK", "HONGKONG", "MALAYSIA", "|AS| HONGKONG", "|AS| MALAYSIA",
  "U.S|", "U.S", "USA", "USA SPORT", "USA SPORTS", "UNCATEGORIZED", "SPORTS", "##### [UK] SPORTS UHD #####",
  "[UK] SPORTS UHD", "UK| SPORTS", "[UK] SKY SPORTS FHD", "EU | UK | SPORTS", "##### UK - SKY SPORTS F1 #####",
  "AS SPORTS", "|AS| SPORTS",
  // Singapore/Malaysia specific
  "SG ENTERTAINMENT", "SG ASIAN+", "SG MALAYSIA", "SG SPORTS+", "SG INDIA+", "SG FILIPINO+",
  "MALAYSIA", "ASTRO", "STAR HUB", "SINGTEL"
];

const customDomain = "https://anbox-iptv.kkhk.workers.dev";

// Retry logic with exponential backoff
async function fetchUrlWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchUrl(url, options);
    } catch (e) {
      if (i === retries - 1) throw e;
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
    
    const { status, data } = await fetchUrlWithRetry(apiUrl, {
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
    .replace(/\[.*?\]/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .replace(/(HEVC|FHD|HD|SD|UHD|4K|1080P|720P|BACKUP|ALT|DIRECT|RAW)/g, '')
    .trim();
}

// Check if a channel is Singapore/Malaysia related
function isSGChannel(name, groupTitle) {
  const combined = (name + ' ' + groupTitle).toUpperCase();
  if (/^UK\s*-/.test(name) || /^UK\s*\|/.test(name)) return false;
  
  return /\bSG\s+ENTERTAINMENT\b/.test(combined) ||
         /\bSG\s+ASIAN\b/.test(combined) ||
         /\bSG\s+MALAYSIA\b/.test(combined) ||
         /\bSG\s+SPORTS\b/.test(combined) ||
         /\bSG\s+INDIA\b/.test(combined) ||
         /\bSG\s+FILIPINO\b/.test(combined) ||
         /\bMALAYSIA\b/.test(combined) ||
         /\bASTRO\b/.test(groupTitle.toUpperCase()) ||
         /\bSTAR\s+HUB\b/.test(combined) ||
         /\bSINGTEL\b/.test(combined) ||
         /\bSINGAPORE\b/.test(combined);
}

async function buildM3U() {
  console.log('🔍 Loading portal status...');

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

  const excludePortals = new Set();
  if (probeData?.portals) {
    for (const p of probeData.portals) {
      if (p.expiryDays !== null && p.expiryDays <= 0) {
        excludePortals.add(p.name);
        console.log(`  ❌ Excluding expired: ${p.name} (expired ${Math.abs(p.expiryDays)} days ago)`);
      } else if (p.expiryDays !== null && p.expiryDays <= 7) {
        console.log(`  ⚠️  WARNING: ${p.name} expires in ${p.expiryDays} days!`);
      }
    }
  }

  console.log('🔍 Probing portals...');

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
  
  const channelMap = new Map();
  const sgChannelMap = new Map();

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

  for (const portal of allPortals) {
    const channels = portal.channels;
    const parsed = new URL(portal.url);
    const portalBase = parsed.origin;
    const mac = parsed.searchParams.get('mac');
    
    let currentMarker = null;
    
    for (const ch of channels) {
      const name = (ch.name || '').trim();
      
      if (/^#{3,}.+#{3,}$/i.test(name)) {
        currentMarker = name.replace(/#/g, '').trim();
        continue;
      }
      
      const cmd = ch.cmd || '';
      let token = mac;
      
      const tokenMatch = cmd.match(/play_token=([A-Za-z0-9]+)/);
      if (tokenMatch) {
        token = tokenMatch[1];
      } else {
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
      let shouldInclude = false;
      
      if (KEEP_CHANNELS.some(k => name.toUpperCase().includes(k.toUpperCase()))) {
        groupTitle = 'Sports On Demand';
        shouldInclude = true;
      } else if (currentMarker && DEFAULT_MARKERS.some(m => m.toUpperCase() === currentMarker.toUpperCase())) {
        groupTitle = currentMarker;
        shouldInclude = true;
      }
      
      if (!shouldInclude) continue;

      const normName = normalizeChannelName(name);
      
      if (isSGChannel(name, groupTitle)) {
        if (!sgChannelMap.has(normName)) {
          sgChannelMap.set(normName, []);
        }
        sgChannelMap.get(normName).push({
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

  let m3u = '#EXTM3U\n';
  m3u += `#Generated: ${new Date().toISOString()}\n`;
  m3u += `#Active Sources: ${allPortals.map(p => p.name.toUpperCase()).join(' & ')}\n\n`;

  let totalChannels = 0;
  const seenUrls = new Set();

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

  console.log('\n🇸🇬 Processing SG/MY channels...');
  const sgEntries = [];
  for (const [normName, list] of sgChannelMap.entries()) {
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
