/**
* OMNI-WORKER v31.7: CONDITIONAL GATE & ADVANCED OBFUSCATION
* Features: 5-Stage Portal Logic, Strict User-Agent Gate, Export Defeat Layer
*/
let cachedOnlinePortals = [];
let cacheExpiryTime = 0;

const PROBE_URLS = {
  debit: "http://debitmaxi.com:80/play/live.php?mac=00:1A:79:ca:e9:38&stream=577220&extension=ts&play_token=uOOO76Al9y",
  sbhgoldpro5: "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:70:88:83&stream=827982&extension=ts&play_token=GBcrehxdq4",
  dinomultiservice: "http://dinomultiservice.online:80/play/live.php?mac=00:1A:79:b3:e7:5e&stream=500958&extension=ts&play_token=AGhZuDDmNV",
  skunky5: "http://skunkytv.live:80/play/live.php?mac=00:1A:79:41:1B:0F&stream=626876&extension=ts&play_token=pYQxDrf2Oh",
  dino3: "http://mag.dino.ws:80/play/live.php?mac=00:1A:79:77:DA:73&stream=552001&extension=ts&play_token=KCi5KBNrnI",
  sbhgoldpro7: "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:6d:e3:f2&stream=827982&extension=ts&play_token=7MHJet0pvc",
  dinodox: "http://dinodox.sbs:80/play/live.php?mac=00:1A:79:00:00:1D&stream=577220&extension=ts&play_token=JqJ4zO6p4V",
  skunky3: "http://skunkytv.live:80/play/live.php?mac=00:1A:79:B6:F3:A5&stream=577227&extension=ts&play_token=jtdad5WUqA",
  dinofox: "http://dinofox.sbs:80/play/live.php?mac=00:1A:79:00:23:D6&stream=577220&extension=ts&play_token=U036lFid5L",
  trexiptv2: "http://tv.trexiptv.com:80/play/live.php?mac=A0:BB:3E:20:2F:96&stream=1014302&extension=ts&play_token=XjAUd9lYS4",
  skunky1: "http://skunkytv.live:80/play/live.php?mac=00:1A:79:68:89:7F&stream=1284528&extension=ts&play_token=k71xe1n5Sf",
  trexiptv: "http://tv.trexiptv.com:80/play/live.php?mac=00:1A:79:46:71:90&stream=45331&extension=ts&play_token=wYunhZTSSw",
  wowtv3: "http://wowtv.cc:80/play/live.php?mac=00:1A:79:B6:C3:BA&stream=577227&extension=ts&play_token=RECZsVaio0",
  wowtv2: "http://wowtv.cc:80/play/live.php?mac=00:1A:79:B6:CB:5A&stream=577227&extension=ts&play_token=wzgzOhA7oQ",
  skunky4: "http://skunkytv.live:80/play/live.php?mac=00:1A:79:B6:F3:A5&stream=577227&extension=ts&play_token=1WKOIaENI7",
  suiptv2: "http://suiptv265.xyz:80/play/live.php?mac=00:1A:79:73:A6:5D&stream=577220&extension=ts&play_token=trbtKVDfuG",
  sbhgoldpro4: "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:62:33:32&stream=626823&extension=ts&play_token=Rb4hRVC6Rs"
};

const FALLBACK_CONFIG = {};

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
  // Adult/18+ channels
  "ADULT", "18+", "XXX", "ADULTS", "PORN", "NSFW", "EROTIC",
  "ADULT MOVIES", "ADULT HD", "ADULT FHD", "ADULT SD",
  "[18+]", "18+ MOVIES", "18+ HD", "ADULT CHANNELS",
  "HUSTLER", "PLAYBOY", "PENTHOUSE", "BRAZZERS", "BANG BROS",
  "ADULT ENTERTAINMENT", "ADULT SPORTS"
];

const CH_DUPLICATION_RULES = {
  'group-title="UK HUB SPORTS",': 'group-title="EPL",',
  'group-title="UK ASTRO SPORTS",': 'group-title="EPL",',
  'group-title="[UK] SPORTS UHD",UK - SUPERSPORT': 'group-title="EPL",UK - SUPERSPORT',
  'group-title="[UK] SPORTS UHD",UK - TNT SPORTS': 'group-title="EPL",UK - TNT SPORTS',
  ',SPORTS - STAR SPORTS SELECT': 'group-title="EPL",SPORTS - STAR SPORTS SELECT',
  'group-title="Sports On Demand",UK - TNT SPORTS': 'group-title="EPL",UK - TNT SPORTS',
  'group-title="Sports On Demand",UK - HUB PREMIER': 'group-title="EPL",UK - HUB PREMIER',
};

const KEEP_CHANNELS = [
  "UK - HUB PREMIER",
  "UK - MAN UNITED FHD",
  "UK - MUTV",
  "F1 - SKY SPORTS F1",
  "UK - TNT SPORTS",
  "TNT SPORTS",
  "UK - LFC TV",
  "STAR SPORTS SELECT",
  "BEIN SPORTS",
  "US - FUBO SPORTS",
  // Adult/18+ channels - add specific channel names you want to always include
  "Hustler TV",
  "Playboy TV",
  "Penthouse HD",
  "Brazzers TV",
  "Bang Bros",
  "Adult Swim"
];

const customDomain = "https://virtual.anbox.dpdns.org";
const STICKY_CACHE_KEY = "http://cache.lib/sticky_portal";

// Mock Cloudflare KV for local testing
const mockKV = {
  playlists: {
    get: async (key) => {
      const mockData = {
        webplaylist: null,
        anbox_playlist: null,
        k12: null
      };
      return mockData[key] || null;
    },
    put: async (key, value) => console.log(`[MOCK KV] Stored ${key}`)
  },
  portalist: {
    get: async (key) => null,
    put: async (key, value) => console.log(`[MOCK KV] Stored portalist ${key}`)
  }
};

// Mock fetch for local testing
const mockFetch = async (url, options) => {
  console.log(`[MOCK FETCH] ${url}`);
  
  // Simulate successful probe for a few URLs
  if (url.includes("play/live.php") || url.includes("portal.php")) {
    return {
      ok: true,
      status: 200,
      text: async () => {
        if (url.includes("portal.php")) {
          // Simulate portal response
          return JSON.stringify({
            js: {
              data: [
                { id: "1", name: "Test Channel 1" },
                { id: "2", name: "UK - HUB PREMIER" },
                { id: "3", name: "Test Channel 2" }
              ]
            }
          });
        }
        return "";
      }
    };
  }
  
  // Simulate external playlist
  if (url.includes("tv.m3u")) {
    return {
      ok: true,
      status: 200,
      text: async () => `#EXTM3U
#EXTINF:-1,Test Channel A
http://example.com/stream1.ts
#EXTINF:-1,Test Channel B
http://example.com/stream2.ts`
    };
  }
  
  return {
    ok: false,
    status: 404,
    text: async () => "Not found"
  };
};

// Mock caches
const mockCaches = {
  default: {
    match: async () => null
  }
};

// Override global objects for local testing
global.playlists = mockKV.playlists;
global.portalist = mockKV.portalist;
global.caches = mockCaches;
global.fetch = mockFetch;

// Main script starts here
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, event));
});

async function handleRequest(request, event) {
  const url = new URL(request.url);
  const ua = request.headers.get("User-Agent") || "";
  const isBrowserOrIdm = /Mozilla|Chrome|Safari|Edge|IDM|Wget|Curl|Go-http-client/i.test(ua);
  const isTargetPlayer = /IPTVExtreme|VLC|OttNavigator|PerfectPlayer|StbEmu/i.test(ua);

  if (url.pathname === "/playlist.m3u" || url.pathname === "/virtual.php") {
    if (isBrowserOrIdm && !isTargetPlayer) {
      return new Response("#EXTM3U\n#INFO: Access Denied. Unauthorized Device Layout.", { 
        status: 403, 
        headers: { "Content-Type": "text/plain" } 
      });
    }

    // Cache-first approach: serve cached M3U immediately, refresh in background
    const cachedM3U = await playlists.get("cached_m3u");
    if (cachedM3U) {
      // Trigger background refresh
      event.waitUntil(refreshPlaylistCache());
      return new Response(cachedM3U, {
        headers: {
          "Content-Type": "application/x-mpegURL",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // Cache miss - build synchronously
    const freshPlaylist = await refreshPlaylistCache();
    return new Response(freshPlaylist, {
      headers: {
        "Content-Type": "application/x-mpegURL",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  async function refreshPlaylistCache() {
    let finalM3U = "#EXTM3U\n";

    try {
      const webplaylist = await playlists.get("webplaylist");
      if (webplaylist) finalM3U += webplaylist.trim() + "\n";

      const anbox = await playlists.get("anbox_playlist");
      if (anbox) finalM3U += anbox.trim() + "\n";

      finalM3U += await processPlaylist("http://tv123.vvvv.ee/tv.m3u");

      const k12 = await playlists.get("k12");
      if (k12) {
        const probeUrl = "http://iptv12k.com:35461/live/m260419337880865/111111/585.ts";
        if (await probePortal(probeUrl)) {
          finalM3U += virtualisePlaylist(k12.trim() + "\n");
        } else {
          finalM3U += "#DEBUG: k12 probe failed\n";
        }
      }
    } catch (e) {
      finalM3U += `#DEBUG: KV error - ${e.message}\n`;
    }

    async function processPlaylist(url) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.text();
          return virtualisePlaylist(data);
        } else {
          return `#DEBUG: paid probe failed (Status: ${response.status})\n`;
        }
      } catch (error) {
        return `#DEBUG: paid probe failed (Network Error)\n`;
      }
    }

    function virtualisePlaylist(rawText) {
      if (!rawText) return "";
      const lines = rawText.split(/\r?\n/);
      let output = "";
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("#EXTINF:")) {
          let nextLine = (lines[i+1] || "").trim();
          if (nextLine && !nextLine.startsWith("#")) {
            const virtualUrl = `${customDomain}/resolve?src=${Buffer.from(nextLine).toString('base64')}`;
            output += `${line}\n${virtualUrl}\n`;
            i++;
            continue;
          }
        }
        output += line + "\n";
      }
      return output;
    }

    let onlinePortals = [];
    try {
      const now = Date.now();
      if (cachedOnlinePortals.length > 0 && now < cacheExpiryTime) {
        onlinePortals = cachedOnlinePortals;
      } else {
        onlinePortals = await getWorkingPortals();
        if (onlinePortals.length > 0) {
          cachedOnlinePortals = onlinePortals;
          cacheExpiryTime = now + 1200000;
        }
      }
    } catch (e) {
      finalM3U += `#DEBUG: Portal alignment error - ${e.message}\n`;
    }

    if (onlinePortals.length > 0) {
      const processingPromises = onlinePortals.map(async (portalKey, index) => {
        try {
          let m3uChunk = await portalist.get(portalKey);
          if (!m3uChunk) {
            m3uChunk = await generateAndFilterMagM3U(portalKey);
            if (m3uChunk) event.waitUntil(portalist.put(portalKey, m3uChunk, { expirationTtl: 86400 }));
          }
          if (index > 0 && m3uChunk) {
            const lines = m3uChunk.split('\n');
            const modifiedLines = lines.map(line =>
              line.startsWith('#EXTINF:') ? line.replace(/,(.+)$/, `,$1 [BKP-${portalKey.toUpperCase()}]`) : line
            );
            m3uChunk = modifiedLines.join('\n');
          }
          return m3uChunk;
        } catch (err) { return ""; }
      });

      const results = await Promise.all(processingPromises);
      const combinedM3UText = results.filter(Boolean).join('\n');
      finalM3U += `\n#EXTINF:-1,--- ACTIVE SOURCES: ${onlinePortals.map(p => p.toUpperCase()).join(' & ')} ---\n`;
      finalM3U += `http://dummy.address/portal_header.ts\n`;
      finalM3U += combinedM3UText;
    }

    try {
      let activeFallback = null;
      for (const [name, url] of Object.entries(FALLBACK_CONFIG)) {
        if (await probePortal(url)) {
          activeFallback = { name, url };
          break;
        }
      }
      if (activeFallback) {
        const extText = await portalist.get(activeFallback.name);
        if (extText) {
          finalM3U += `\n#EXTINF:-1,--- ACTIVE FALLBACK: ${activeFallback.name.toUpperCase()} ---\n`;
          const extLines = extText.split(/\r?\n/);
          for (let k = 0; k < extLines.length; k++) {
            let line = extLines[k].trim();
            if (line.startsWith('#EXTINF:')) {
              let nextLine = (extLines[k + 1] || "").trim();
              if (nextLine && !nextLine.startsWith('#')) {
                const virtualizedUrl = `${customDomain}/resolve?src=${Buffer.from(nextLine).toString('base64')}`;
                finalM3U += `${line}\n${virtualizedUrl}\n`;
                k++;
              }
            }
          }
        }
      }
    } catch (e) {
      finalM3U += `#DEBUG: Fallback pull error - ${e.message}\n`;
    }

    const processedM3U = processIndividualDuplications(finalM3U);

    // Cache the result (5-minute expiry)
    await playlists.put("cached_m3u", processedM3U, { expirationTtl: 300 });

    return processedM3U;
  }

  if (url.pathname === "/resolve") {
    const src = url.searchParams.get("src");
    if (!src) return new Response("No source", { status: 400 });
    if (isBrowserOrIdm && !isTargetPlayer) return new Response("Unauthorized playback entity detected.", { status: 403 });
    try { 
      return Response.redirect(Buffer.from(src, 'base64').toString('utf8'), 302); 
    } catch { 
      return new Response("Invalid source", { status: 400 }); 
    }
  }
  return new Response("Worker is active.", { status: 200 });
}

async function getWorkingPortals() {
  const keys = Object.keys(PROBE_URLS);
  // Shuffle for diversity
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  // Probe in batches to avoid exceeding CF's 50 subrequest limit
  const batchSize = 10;
  let selected = [];
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    try {
      const results = await Promise.allSettled(
        batch.map(async (name) => {
          const ok = await probePortal(PROBE_URLS[name]);
          return ok ? name : null;
        })
      );
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          selected.push(result.value);
        }
      }
    } catch {}
  }
  console.log(`[Portal Probe] Found ${selected.length} alive out of ${keys.length}`);
  return selected;
}

async function probePortal(url) {
  const u = new URL(url);
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch(url, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; MAG200 stb)", 
        "Cookie": `mac=${u.searchParams.get("mac")}` 
      },
      redirect: "manual",
      signal: controller.signal
    });
    clearTimeout(id);
    return [200, 206, 302].includes(resp.status);
  } catch { return false; }
}

async function generateAndFilterMagM3U(portalKey) {
  const u = new URL(PROBE_URLS[portalKey]);
  const portalBase = u.origin;
  const mac = u.searchParams.get("mac");
  const token = u.searchParams.get("play_token");

  try {
    const resp = await fetch(`${portalBase}/portal.php?type=itv&action=get_all_channels&JsHttpRequest=1-xml`, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; MAG200 stb)", 
        "Cookie": `mac=${mac}` 
      }
    });
    const text = await resp.text();
    const jsonStr = text.match(/\{.*\}/s);
    if (!jsonStr) return "";
    const json = JSON.parse(jsonStr[0]);
    const channels = json.js.data || json.js;

    let m3u = "";
    let currentMarker = null;
    for (const ch of channels) {
      const name = (ch.name || "").trim();
      if (/^#{3,}.+#{3,}$/i.test(name)) {
        currentMarker = name.replace(/#/g, "").trim();
        continue;
      }

      const realUrl = `${portalBase}/play/live.php?mac=${mac}&stream=${ch.id}&extension=ts&play_token=${token}`;

      if (KEEP_CHANNELS.some(k => name.toUpperCase().includes(k.toUpperCase()))) {
        m3u += `#EXTINF:-1 tvg-id="${ch.id}" group-title="Sports On Demand",${name}\n${customDomain}/resolve?src=${Buffer.from(realUrl).toString('base64')}\n`;
        continue;
      }

      if (currentMarker && DEFAULT_MARKERS.some(m => m.toUpperCase() === currentMarker.toUpperCase())) {
        m3u += `#EXTINF:-1 tvg-id="${ch.id}" group-title="${currentMarker}",${name}\n${customDomain}/resolve?src=${Buffer.from(realUrl).toString('base64')}\n`;
      }
    }
    return m3u;
  } catch { return ""; }
}

function processIndividualDuplications(content) {
  const lines = content.split('\n');
  let result = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXTINF:-1')) {
      const block = [lines[i]];
      let j = i + 1;
      while (j < lines.length && lines[j] && !lines[j].startsWith('#EXTINF:-1')) {
        block.push(lines[j]);
        j++;
      }
      result.push(...block);
      Object.entries(CH_DUPLICATION_RULES).forEach(([keyword, newGroupString]) => {
        if (block[0].includes(keyword)) {
          const duplicatedBlock = [...block];
          duplicatedBlock[0] = duplicatedBlock[0].replace(/group-title="[^"]+"/, newGroupString);
          result.push(...duplicatedBlock);
        }
      });
      i = j - 1;
    } else {
      result.push(lines[i]);
    }
  }
  return result.join('\n');
}

// Export for Node.js testing
exports = { handleRequest, getWorkingPortals, probePortal, generateAndFilterMagM3U };
console.log("✅ Script saved with Node.js mocks for local testing");
console.log("📁 Location: /opt/data/anbox-iptv-worker.js");
