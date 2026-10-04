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

// External playlist sources (will be fetched and virtualized)
const EXTERNAL_PLAYLISTS = [
  'http://tv123.vvvv.ee/tv.m3u'  // Korean, Chinese, Japanese, Malaysia channels
];

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
    let currentUrl = url;
    let redirectCount = 0;
    const maxRedirects = 5;

    function doFetch(url, redirectOptions) {
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
        // Handle redirects
        if (options.followRedirects && [301, 302, 303, 307, 308].includes(res.statusCode)) {
          if (redirectCount >= maxRedirects) {
            return reject(new Error('Too many redirects'));
          }
          const location = res.headers.location;
          if (location) {
            redirectCount++;
            // Resolve relative URLs
            const nextUrl = location.startsWith('http') ? location : `${parsed.protocol}//${parsed.host}${location}`;
            return doFetch(nextUrl, options);
          }
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data }));
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });

      req.end();
    }

    doFetch(url, options);
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

// Consolidate categories into broader groups
const CATEGORY_MAP = {
  // Sports
  'Sports On Demand': 'Sports',
  'UK ASTRO SPORTS': 'Sports',
  'UK MATCHROOM SPORTS': 'Sports',
  'UK GAAGO SPORTS': 'Sports',
  'QUEBEC JUNIOR HOCKEY LEAGUE': 'Sports',
  'PSL CRICKET': 'Sports',
  'SERIE A/B/C': 'Sports',
  'USA NCAA LIVE': 'Sports',
  'USA MLB LIVE': 'Sports',
  'TABII SPORT': 'Sports',
  'PRIME': 'Sports',
  'FANATIZ': 'Sports',
  'ESPN PLAY': 'Sports',
  'PEACOCK': 'Sports',
  'DAZN': 'Sports',
  'SKY SPORTS': 'Sports',
  'SUPERSPORT': 'Sports',
  'SPORTS': 'Sports',
  'ASIA SPORTS': 'Sports',
  'SG SPORTS': 'Sports',
  'ASTRO': 'Sports',
  'SPORT': 'Sports',
  'SOCCER': 'Sports',
  'CRICKET': 'Sports',
  'TENNIS': 'Sports',
  'RUGBY': 'Sports',
  'GOLF': 'Sports',
  'BOXING': 'Sports',
  'FIGHT': 'Sports',
  'MMA': 'Sports',
  'UFC': 'Sports',
  'F1': 'Sports',
  'FORMULA 1': 'Sports',
  'NBA': 'Sports',
  'NFL': 'Sports',
  'MLB': 'Sports',
  'NHL': 'Sports',

  // Movies
  'USA MOVIES': 'Movies',
  'CINEMANIA TV SHOWS': 'Movies',
  'MOVIES': 'Movies',
  'FILMS': 'Movies',
  'CELESTIAL MOVIES': 'Movies',
  'MOVIE HD': 'Movies',
  'MOVIE': 'Movies',
  'MOVIE': 'Movies',
  'FILM': 'Movies',
  'CINEMA': 'Movies',
  'HOLLYWOOD': 'Movies',
  'BOLLYWOOD': 'Movies',
  'KOREAN MOVIES': 'Movies',
  'CHINESE MOVIES': 'Movies',
  'JAPANESE MOVIES': 'Movies',
  'Tamil': 'Movies',
  'Telugu': 'Movies',
  'Malayalam': 'Movies',
  'Kannada': 'Movies',
  'Marathi': 'Movies',
  'Punjabi': 'Movies',
  'Bengali': 'Movies',
  'Gujarati': 'Movies',
  'Hindi': 'Movies',
  'Action': 'Movies',
  'Comedy': 'Movies',
  'Drama': 'Movies',
  'Horror': 'Movies',
  'Thriller': 'Movies',
  'Romance': 'Movies',
  'Animation': 'Movies',
  'Animated': 'Movies',

  // Entertainment
  'ENTERTAINMENT': 'Entertainment',
  'SG ENTERTAINMENT': 'Entertainment',
  'SG ASIAN': 'Entertainment',
  'SG FILIPINO': 'Entertainment',
  'SG INDIA': 'Entertainment',
  'GENERAL': 'Entertainment',
  'LIVE': 'Entertainment',
  'CHANNEL': 'Entertainment',
  'TV': 'Entertainment',
  'SHOW': 'Entertainment',
  'REALITY SHOW': 'Entertainment',
  'VARIED': 'Entertainment',
  'VARIETY': 'Entertainment',
  'COMEDY': 'Entertainment',
  'DRAMA': 'Entertainment',
  'SERIES': 'Entertainment',
  'SERIES HD': 'Entertainment',
  'SERIE': 'Entertainment',

  // Kids
  'KIDS': 'Kids',
  'KIDS ONEPLAY': 'Kids',
  'CHILDREN': 'Kids',
  'DISNEY': 'Kids',
  'Cartoon': 'Kids',
  'CAROON': 'Kids',
  'NICKELODEON': 'Kids',
  'NICK': 'Kids',
  'Cartoon Network': 'Kids',
  'Disney Channel': 'Kids',
  'Disney Jr': 'Kids',
  'Nick Jr': 'Kids',
  'POCO': 'Kids',
  'POGO': 'Kids',
  'BOO': 'Kids',
  'TOON': 'Kids',
  'TOONS': 'Kids',
  'ANIMATION': 'Kids',
  'ANIMATED': 'Kids',

  // News
  'NEWS': 'News',
  'CNN': 'News',
  'BBC': 'News',
  'ALJAZEERA': 'News',
  'CNBC': 'News',
  'REUTERS': 'News',
  'FOX NEWS': 'News',
  'NEWS': 'News',
  'CURRENT': 'News',
  'CURRENT AFFAIRS': 'News',
  'INFO': 'News',
  'INFORMATION': 'News',
  'FINANCE': 'News',
  'BUSINESS': 'News',
  'WEATHER': 'News',

  // Music
  'MUSIC': 'Music',
  'MUSIC TV': 'Music',
  'MUSIC CHANNEL': 'Music',
  'MTV': 'Music',
  'MUSICA': 'Music',
  'POP': 'Music',
  'HIP HOP': 'Music',
  'RAP': 'Music',
  'ROCK': 'Music',
  'POP': 'Music',
  'JAZZ': 'Music',
  'CLASSICAL': 'Music',
  'COUNTRY': 'Music',
  'REGGAE': 'Music',
  'LATIN': 'Music',
  'BOLLYWOOD MUSIC': 'Music',

  // Documentary
  'DOCUMENTARY': 'Documentary',
  'DOCUMENTAIRE': 'Documentary',
  'DISCOVERY': 'Documentary',
  'NAT GEO': 'Documentary',
  'DISCOVERY ASIA': 'Documentary',
  'HISTORY': 'Documentary',
  'NAT GEO WILD': 'Documentary',
  'SCIENCE': 'Documentary',
  'CULTURE': 'Documentary',
  'GEOGRAPHY': 'Documentary',
  'NATURE': 'Documentary',
  'TRAVEL': 'Documentary',
  'LIFESTYLE': 'Documentary',
  'LIFE STYLE': 'Documentary',

  // Religion
  'RELIGION': 'Religion',
  'CHRISTIAN': 'Religion',
  'ISLAMIC': 'Religion',
  'RELIGIOUS': 'Religion',
  'SPIRITUAL': 'Religion',
  'GOD': 'Religion',
  'PRAYER': 'Religion',
  'QURAN': 'Religion',
  'BIBLE': 'Religion',

  // Live/Trending
  'LIVE': 'Live',
  'TRENDING': 'Live',
  'LIVE NOW': 'Live',
  'STREAM': 'Live',
  'LIVE TV': 'Live',
  'LIVE CHANNEL': 'Live',

  // US Networks - consolidate all state variants
  'ABC': 'US TV',
  'CBS': 'US TV',
  'FOX': 'US TV',
  'NBC': 'US TV',
  'CW': 'US TV',
  'PBS': 'US TV',
  'MY NETWORK': 'US TV',
  'SPECTRUM': 'US TV',
  'WESTERN': 'US TV',

  // Regional - consolidate all into "Regional"
  'USA': 'Regional',
  'UK': 'Regional',
  'EUROPE': 'Regional',
  'ASIA': 'Regional',
  'AFRICA': 'Regional',
  'AMERICA': 'Regional',
  'AUSTRALIA': 'Regional',
  'CANADA': 'Regional',
  'INDIA': 'Regional',
  'PAKISTAN': 'Regional',
  'BANGLADESH': 'Regional',
  'SRI LANKA': 'Regional',
  'NEPAL': 'Regional',
  'MYANMAR': 'Regional',
  'THAILAND': 'Regional',
  'VIETNAM': 'Regional',
  'PHILIPPINES': 'Regional',
  'INDONESIA': 'Regional',
  'MALAYSIA': 'Regional',
  'SINGAPORE': 'Regional',
  'CHINA': 'Regional',
  'JAPAN': 'Regional',
  'KOREA': 'Regional',
  'TAIWAN': 'Regional',
  'RUSSIA': 'Regional',
  'GERMANY': 'Regional',
  'FRANCE': 'Regional',
  'SPAIN': 'Regional',
  'ITALY': 'Regional',
  'NETHERLANDS': 'Regional',
  'BELGIUM': 'Regional',
  'SWITZERLAND': 'Regional',
  'AUSTRIA': 'Regional',
  'POLAND': 'Regional',
  'CZECH': 'Regional',
  'HUNGARY': 'Regional',
  'ROMANIA': 'Regional',
  'BULGARIA': 'Regional',
  'SERBIA': 'Regional',
  'CROATIA': 'Regional',
  'GREECE': 'Regional',
  'TURKEY': 'Regional',
  'ISRAEL': 'Regional',
  'ARAB': 'Regional',
  'MIDDLE EAST': 'Regional',
  'LATAM': 'Regional',
  'LATIN': 'Regional',
  'BRAZIL': 'Regional',
  'MEXICO': 'Regional',
  'ARGENTINA': 'Regional',
  'COLOMBIA': 'Regional',
  'PERU': 'Regional',
  'CHILE': 'Regional',
  'VENEZUELA': 'Regional',
  'ECUADOR': 'Regional',
  'KENYA': 'Regional',
  'NIGERIA': 'Regional',
  'GHANA': 'Regional',
  'SOUTH AFRICA': 'Regional',
  'EGYPT': 'Regional',
  'MOROCCO': 'Regional',
  'TUNISIA': 'Regional',
  'ALGERIA': 'Regional',
  'CAMBODIA': 'Regional',
  'LAOS': 'Regional',
  'VIET NAM': 'Regional',
  'MACEDONIA': 'Regional',
  'INDIAN REGIONAL': 'Regional',
  'TAMIL': 'Regional',
  'TELUGU': 'Regional',
  'MALAYALAM': 'Regional',
  'KANNADA': 'Regional',
  'BHOJPURI': 'Regional',
  'MARATHI': 'Regional',
  'PUNJABI': 'Regional',
  'BENGALI': 'Regional',
  'GUJARATI': 'Regional',

  // Portal brands - consolidate into "Streaming"
  'AZAM NETWORK': 'Streaming',
  'VIX': 'Streaming',
  'ODIDO VERMAAK': 'Streaming',
  'NETFLIX': 'Streaming',
  'HULU': 'Streaming',
  'HBO': 'Streaming',
  'PARAMOUNT': 'Streaming',
  'DISNEY': 'Streaming',
  'APPLE+': 'Streaming',
  'PEACOCK': 'Streaming',
  'FITE': 'Streaming',
  'TUBI': 'Streaming',
  'YUPP': 'Streaming',
  'FANATIZ': 'Streaming',
  'DAZN': 'Streaming',
  'VIAPLAY': 'Streaming',
  'SKY': 'Streaming',
  'NOW': 'Streaming',
  'PRIMA': 'Streaming',
  'JOYN': 'Streaming',
  'RTL+': 'Streaming',
  'CANAL+': 'Streaming',
  'OSN': 'Streaming',
  'SHAHID': 'Streaming',
  'ROTANA': 'Streaming',
  'BEIN': 'Streaming',
  'STAR': 'Streaming',
  'ZIGGO': 'Streaming',
  'TELEFONICA': 'Streaming',
  'TELENOR': 'Streaming',
  'STC': 'Streaming',
  'VODAFONE': 'Streaming',
  'TOD': 'Streaming',
  'FLO': 'Streaming',
  'M+.': 'Streaming',
  'MOVISTAR': 'Streaming',
  'LATV': 'Streaming',
  'LA TDT': 'Streaming',
  'TDT': 'Streaming',
};

// Normalize group-title to broader category
function normalizeCategory(groupTitle) {
  if (!groupTitle) return 'Other';
  const upper = groupTitle.toUpperCase().trim();

  // Exact match first
  if (CATEGORY_MAP[upper]) return CATEGORY_MAP[upper];

  // Check if any key is contained in the group title
  for (const [key, value] of Object.entries(CATEGORY_MAP)) {
    if (upper.includes(key)) return value;
  }

  return groupTitle; // Return original if no match
}


function isPPVChannel(name, groupTitle) {
  const combined = (name + ' ' + groupTitle).toUpperCase();
  // Exclude PPV channels
  if (/\bPPV\b/.test(combined)) return true;
  // Exclude temporary event channels with dates (various formats)
  if (/^(END|NEXT|ENDED)\s*\|/.test(name)) return true;
  // Exclude channels with timestamps like (2026-10-09 or Oct 09)
  if (/\(\d{4}-\d{2}-\d{2}/.test(name) || /\(\d{2}-\d{2}-\d{4}/.test(name)) return true;
  if (/\b\d{2}-\d{2}-\d{4}\b/.test(name)) return true;
  // Exclude "8K EXCLUSIVE" type channels
  if (/\b8K\s+EXCLUSIVE\b/.test(combined)) return true;
  return false;
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

      // Skip PPV/temporary event channels
      if (isPPVChannel(name, groupTitle)) continue;

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

  // Fetch and prepend external playlists (virtualized URLs)
  console.log('\n📡 Fetching external playlists...');
  for (const extUrl of EXTERNAL_PLAYLISTS) {
    try {
      const extM3u = await fetchExternalPlaylist(extUrl);
      if (extM3u) {
        m3u += extM3u;
        console.log(`  ✅ Added ${extUrl}`);
      } else {
        console.log(`  ⚠️  Skipped ${extUrl} (failed or empty)`);
      }
    } catch (e) {
      console.log(`  ❌ Error fetching ${extUrl}: ${e.message}`);
    }
  }
  m3u += '\n';

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

    // Sanitize the original name - fix unbalanced brackets
    let sanitizedName = mainCh.name
      .replace(/\[[^[\]]*\)/g, match => match.replace(')', ']')) // Fix ) to ] in brackets
      .replace(/\([^)]*\]/g, match => match.replace('[', '(')); // Fix [ to ( in parens
    // Remove any trailing brackets that might cause issues
    sanitizedName = sanitizedName.trim();

    const portalSuffix = portals.length > 1 ? ` [${portals.join(', ')}]` : ` [${portals[0]}]`;
    const displayName = `${sanitizedName}${portalSuffix}`;

    return {
      header: `#EXTINF:-1 tvg-id="${mainCh.id}" tvg-name="${displayName}" group-title="${normalizeCategory(mainCh.groupTitle)}",${displayName}\n`,
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

  console.log(`\\n📊 Total unique channels: ${totalChannels}`);

    return m3u;
  }

  // Fetch external playlist and virtualize URLs
  async function fetchExternalPlaylist(url) {
    try {
      console.log(`  📥 Fetching ${url}...`);
      const { status, data } = await fetchUrlWithRetry(url, { timeout: 15000, followRedirects: true });
      if (status !== 200 || !data) return null;
    
      // Parse and virtualize each line
      const lines = data.split('\\n');
      let output = '';
      let channelCount = 0;
    
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXTINF:')) {
          const nextLine = (lines[i + 1] || '').trim();
          if (nextLine && !nextLine.startsWith('#')) {
            const b64Url = Buffer.from(nextLine).toString('base64');
            const virtualUrl = `${customDomain}/resolve?src=${encodeURIComponent(b64Url)}`;
            output += `${line}\\n${virtualUrl}\\n`;
            channelCount++;
            i++; // skip original URL line
          } else {
            output += line + '\\n';
          }
        } else {
          output += line + '\\n';
        }
      }
    
      console.log(`    → ${channelCount} channels`);
      return output;
    } catch (e) {
      console.error(`    ❌ Error: ${e.message}`);
      return null;
    }
  }

  

/**
 * Build anime-only playlist from main M3U
 * - Only includes ANIMAX and ONEPLAY ANIME channels
 * - Skips Anime X HIDIVE
 * - Converts to direct portal URLs with godofiptv as first fallback
 */
function buildAnimePlaylist(m3u) {
  const portalMap = {};
  for (const [name, info] of Object.entries(PROBE_URLS)) {
    try {
      const parsed = new URL(info);
      portalMap[name] = {
        base: `${parsed.protocol}//${parsed.hostname}${parsed.port ? ':' + parsed.port : ''}`,
        mac: parsed.searchParams.get('mac')
      };
    } catch(e) {}
  }

  const lines = m3u.split('\n');
  const result = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('#EXTINF')) {
      const url = lines[i + 1] || '';
      const name = line.match(/,(.+)$/)?.[1] || '';

      // Include ANIMAX channels and ONEPLAY ANIME channels
      const isAnimax = name.toUpperCase().includes('ANIMAX');
      const isOneplayAnime = name.toUpperCase().includes('ONEPLAY') && name.toUpperCase().includes('ANIME');

      if (!isAnimax && !isOneplayAnime) {
        i += 2;
        continue;
      }

      // Skip Anime X HIDIVE (dubbed)
      if (name.toLowerCase().includes('anime x hidive')) {
        i += 2;
        continue;
      }

      // Skip V+, JP, PH Animax variants
      if (name.includes('V+| ANIMAX') || name.includes('JP| ANIMAX') || name.includes('PH|ANIMAX')) {
        i += 2;
        continue;
      }

      // Extract clean name - take part after last comma
      let cleanName = name.split(',').pop().trim();
      cleanName = cleanName.replace(/[.*?]/g, '').trim();

      if (url.includes('tv123.cc.cd')) {
        if (cleanName === 'Animax HD') {
          result.push(`#EXTINF:-1 tvg-name="${cleanName}",${cleanName}`);
          result.push(url);
          result.push('');
        }
      } else if (url.includes('workers.dev') && isOneplayAnime) {
        const b64 = url.split('src=')[1];
        const b64Decoded = decodeURIComponent(b64);
        const decoded = Buffer.from(b64Decoded, 'base64').toString('utf8');

        const streamIdMatch = decoded.match(/stream=(\d+)/);
        const streamId = streamIdMatch ? streamIdMatch[1] : null;
        const tokenMatch = decoded.match(/play_token=([A-Za-z0-9]+)/);
        const token = tokenMatch ? tokenMatch[1] : '';
        const extMatch = decoded.match(/extension=(\w+)/);
        const extension = extMatch ? extMatch[1] : 'ts';

        if (streamId && token && cleanName) {
          const portalMatch = name.match(/\[([^\]]+)\]/);
          if (portalMatch) {
            const portalNames = portalMatch[1].split(',').map(p => p.trim());
            
            result.push(`#EXTINF:-1 tvg-name="${cleanName}",${cleanName}`);

            // Build URLs and sort: godofiptv first
            const urls = [];
            for (const pName of portalNames) {
              const p = portalMap[pName];
              if (p) {
                urls.push(`${p.base}/play/live.php?mac=${p.mac}&stream=${streamId}&extension=${extension}&play_token=${token}`);
              }
            }
            
            urls.sort((a, b) => {
              if (a.includes('godofiptv') && !b.includes('godofiptv')) return -1;
              if (!a.includes('godofiptv') && b.includes('godofiptv')) return 1;
              return 0;
            });
            
            urls.forEach(u => result.push(u));
            result.push('');
          }
        }
      }
      i += 2;
    } else {
      i++;
    }
  }

  let output = '#EXTM3U\n';
  output += `#Generated: ${new Date().toISOString()}\n`;
  output += '#Anime Channels\n\n';
  
  for (const line of result) {
    output += line + '\n';
  }

  return output;
}

async function main() {
  try {
    const m3u = await buildM3U();
    const outputPath = path.join(__dirname, '..', 'playlist.m3u');
    fs.writeFileSync(outputPath, m3u);
    console.log(`✅ Playlist written to ${outputPath}`);
    console.log(`📊 Total size: ${(m3u.length / 1024).toFixed(2)} KB`);

    // Generate anime-only playlist
    const animeM3u = buildAnimePlaylist(m3u);
    const animePath = path.join(__dirname, '..', 'anime-all.m3u');
    fs.writeFileSync(animePath, animeM3u);
    console.log(`✅ Anime playlist written to ${animePath}`);
    console.log(`📊 Anime channels: ${(animeM3u.match(/#EXTINF/g) || []).length}`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
