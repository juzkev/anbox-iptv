#!/usr/bin/env node
/**
 * Build M3U playlist from IPTV portals
 * Runs on Node.js (GitHub Actions / VPS) - NOT on Cloudflare Workers
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PROBE_URLS = {
  debit: "http://debitmaxi.com:80/play/live.php?mac=00:1A:79:ca:e9:38&stream=1284583&extension=ts&play_token=2D7gUe5rZJ",
  dinodox: "http://dinodox.sbs:80/play/live.php?mac=00:1A:79:00:00:1D&stream=1284583&extension=ts&play_token=RR9gyGnK3x",
  dinofox: "http://dinofox.sbs:80/play/live.php?mac=00:1A:79:00:23:D6&stream=1284583&extension=ts&play_token=7FKXZsY1xS",
  dinomultiservice: "http://dinomultiservice.online:80/play/live.php?mac=00:1A:79:b3:e7:5e&stream=1284583&extension=ts&play_token=ugvC90VaUk",
  dsmax: "http://dsmax.xyz:80/play/live.php?mac=00:1A:79:7b:4f:9e&stream=1284583&extension=ts&play_token=bdApNj3w3H",
  iptvgoat: "http://line.iptvgoat.com:80/play/live.php?mac=00:1A:79:24:7A:C0&stream=2162327&extension=ts&play_token=9WlD9ZdX2S",
  mag_dino1: "http://mag.dino.ws:80/play/live.php?mac=00:1A:79:B6:E4:7E&stream=1066883&extension=ts&play_token=mbOkoENcPC",
  mag_dino2: "http://mag.dino.ws:80/play/live.php?mac=00:1A:79:B6:E4:DA&stream=924940&extension=ts&play_token=MfyRLX2RWW",
  greatott: "http://mag.greatott.me:80/play/live.php?mac=00:1A:79:D0:99:A1&stream=73276&extension=ts&play_token=sYuaUWC1f6",
  cwdn: "http://main2.cwdn.cx:80/play/live.php?mac=00:1A:79:73:E6:4C&stream=758665&extension=ts&play_token=yDDkqlq27F",
  mlnldino1: "http://mlnldino.xyz:80/play/live.php?mac=00:1A:79:5e:f2:49&stream=1066883&extension=ts&play_token=I90VMJRy1e",
  mlnldino2: "http://mlnldino.xyz:80/play/live.php?mac=00:1A:79:e7:58:87&stream=767638&extension=ts&play_token=MC1EG8QBaM",
  sbh1: "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:D0:80:82&stream=1410044&extension=ts&play_token=TUXTlgrFBK",
  sbh2: "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:62:33:32&stream=802545&extension=ts&play_token=MkTGweu60I",
  sbh3: "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:B6:C7:AD&stream=1410044&extension=ts&play_token=XDB7Nsqgaw",
  sbh4: "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:70:88:83&stream=1284583&extension=ts&play_token=MTVGgvYUj7",
  sbh5: "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:00:1F:6F&stream=1284583&extension=ts&play_token=AIMP2AAAm0",
  sbh6: "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:84:0A:31&stream=758665&extension=ts&play_token=V7TOi9db6g",
  sbh7: "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:6d:e3:f2&stream=763386&extension=ts&play_token=aHFsuCcI4o",
  skunky1: "http://skunkytv.live:80/play/live.php?mac=00:1A:79:68:89:7F&stream=1284583&extension=ts&play_token=B31flZxa9H",
  skunky2: "http://skunkytv.live:80/play/live.php?mac=00:1A:79:B6:F3:A5&stream=1284583&extension=ts&play_token=LHqwUFkJP7",
  skunky3: "http://skunkytv.live:80/play/live.php?mac=00:1A:79:41:1B:0F&stream=627033&extension=ts&play_token=SiUBbPS661",
  skunky4: "http://skunkytv.live:80/play/live.php?mac=00:1A:79:26:60:78&stream=1284583&extension=ts&play_token=fmgIu86xhm",
  suiptv: "http://suiptv265.xyz:80/play/live.php?mac=00:1A:79:73:A6:5D&stream=765924&extension=ts&play_token=tF51YhbinX",
  trxx: "http://trxx.in:80/play/live.php?mac=00:1A:79:00:00:5A&stream=2162327&extension=ts&play_token=SZPp1UJaOs"
};

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
    const { status } = await fetchUrl(url, { 
      headers: { 
        Cookie: `mac=${parsed.searchParams.get('mac')}`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; MAG200 stb)'
      },
      timeout: 3000
    });
    return [200, 206, 302].includes(status);
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
    const token = parsed.searchParams.get('play_token');
    
    let currentMarker = null;
    
    for (const ch of channels) {
      const name = (ch.name || '').trim();
      
      // Skip markers
      if (/^#{3,}.+#{3,}$/i.test(name)) {
        currentMarker = name.replace(/#/g, '').trim();
        continue;
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
  let alternateStreams = 0;

  for (const [normName, list] of channelMap.entries()) {
    // Keep the first channel as main
    const mainCh = list[0];
    const b64Url = Buffer.from(mainCh.url).toString('base64');
    const streamUrl = `${customDomain}/resolve?src=${encodeURIComponent(b64Url)}`;

    m3u += `#EXTINF:-1 tvg-id="${mainCh.id}" tvg-name="${mainCh.name} [${mainCh.portal.toUpperCase()}]" group-title="${mainCh.groupTitle}",${mainCh.name} [${mainCh.portal.toUpperCase()}]\n`;
    m3u += `${streamUrl}\n`;
    totalChannels++;

    // Add alternate streams if available (M3U supports fallback URLs using alt_url or comments)
    if (list.length > 1) {
      for (let i = 1; i < list.length; i++) {
        const altCh = list[i];
        const altB64Url = Buffer.from(altCh.url).toString('base64');
        const altStreamUrl = `${customDomain}/resolve?src=${encodeURIComponent(altB64Url)}`;
        
        m3u += `#EXTINF:-1 tvg-id="${altCh.id}" tvg-name="${altCh.name} [${altCh.portal.toUpperCase()}]" group-title="${altCh.groupTitle}",${altCh.name} [${altCh.portal.toUpperCase()}]\n`;
        m3u += `${altStreamUrl}\n`;
        alternateStreams++;
      }
    }
  }
  
  console.log(`📊 Total channels: ${totalChannels} (plus ${alternateStreams} alternative streams)`);
  
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