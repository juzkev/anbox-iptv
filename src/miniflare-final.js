// Miniflare 2.x compatible worker with cache-first optimization
// Supports live portal probing with safe fallbacks

// Use global fetch (Miniflare provides fetch)
const realFetch = globalThis.fetch || ((url, opts) => {
  console.log(`[FETCH] ${url}`);
  return Promise.resolve({ ok: false, status: 404, text: async () => "Not found" });
});

// KV simulation with globalThis persistence
globalThis.playlistsData = globalThis.playlistsData || {};
globalThis.portalistData = globalThis.portalistData || {};

const playlists = globalThis.playlists || {
  get: async (key) => playlistsData[key] || null,
  put: async (key, value) => { playlistsData[key] = value; }
};

const portalist = globalThis.portalist || {
  get: async (key) => portalistData[key] || null,
  put: async (key, value) => { portalistData[key] = value; }
};

globalThis.playlists = playlists;
globalThis.portalist = portalist;
globalThis.caches = globalThis.caches || { default: { match: async () => null } };

// Configuration
const PROBE_URLS = {
  sbhgoldpro6: "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:B6:C7:AD&stream=577226&extension=ts&play_token=[TOKEN]",
  dinofox2: "http://dinofox.sbs:80/play/live.php?mac=00:1A:79:f5:81:14&stream=827982&extension=ts&play_token=[TOKEN]",
  debit: "http://debitmaxi.com:80/play/live.php?mac=00:1A:79:ca:e9:38&stream=577220&extension=ts&play_token=[TOKEN]",
  sbhgoldpro5: "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:70:88:83&stream=827982&extension=ts&play_token=[TOKEN]",
  mlnldino3: "http://mlnldino.xyz:80/play/live.php?mac=00:1A:79:e7:58:87&stream=708842&extension=ts&play_token=[TOKEN]",
  dinomultiservice: "http://dinomultiservice.online:80/play/live.php?mac=00:1A:79:b3:e7:5e&stream=500958&extension=ts&play_token=[TOKEN]",
  skunky5: "http://skunkytv.live:80/play/live.php?mac=00:1A:79:41:1B:0F&stream=626876&extension=ts&play_token=[TOKEN]",
  dino3: "http://mag.dino.ws:80/play/live.php?mac=00:1A:79:77:DA:73&stream=552001&extension=ts&play_token=[TOKEN]",
  trxx: "http://trxx.in:80/play/live.php?mac=00:1A:79:00:00:5A&stream=79725&extension=ts&play_token=[TOKEN]",
  greatott3: "http://mag.greatott.me:80/play/live.php?mac=00:1A:79:82:61:6F&stream=1468854&extension=ts&play_token=[TOKEN]"
};

// Use tokens from original script
PROBE_URLS.sbhgoldpro6 = "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:B6:C7:AD&stream=577226&extension=ts&play_token=tuKKtAXdHi";
PROBE_URLS.dinofox2 = "http://dinofox.sbs:80/play/live.php?mac=00:1A:79:f5:81:14&stream=827982&extension=ts&play_token=yP1EsusZp8";
PROBE_URLS.debit = "http://debitmaxi.com:80/play/live.php?mac=00:1A:79:ca:e9:38&stream=577220&extension=ts&play_token=uOOO76Al9y";
PROBE_URLS.sbhgoldpro5 = "http://sbhgoldpro.org:80/play/live.php?mac=00:1A:79:70:88:83&stream=827982&extension=ts&play_token=GBcrehxdq4";
PROBE_URLS.mlnldino3 = "http://mlnldino.xyz:80/play/live.php?mac=00:1A:79:e7:58:87&stream=708842&extension=ts&play_token=oyHFewi5va";
PROBE_URLS.dinomultiservice = "http://dinomultiservice.online:80/play/live.php?mac=00:1A:79:b3:e7:5e&stream=500958&extension=ts&play_token=AGhZuDDmNV";
PROBE_URLS.skunky5 = "http://skunkytv.live:80/play/live.php?mac=00:1A:79:41:1B:0F&stream=626876&extension=ts&play_token=pYQxDrf2Oh";
PROBE_URLS.dino3 = "http://mag.dino.ws:80/play/live.php?mac=00:1A:79:77:DA:73&stream=552001&extension=ts&play_token=KCi5KBNrnI";
PROBE_URLS.trxx = "http://trxx.in:80/play/live.php?mac=00:1A:79:00:00:5A&stream=79725&extension=ts&play_token=IvylNzniaZ";
PROBE_URLS.greatott3 = "http://mag.greatott.me:80/play/live.php?mac=00:1A:79:82:61:6F&stream=1468854&extension=ts&play_token=sdrPR4rYXK";

const DEFAULT_MARKERS = [
  "USA GENERAL", "USA ENTERTAINMENT", "USA MOVIES", "USA NEWS", "USA SPORTS", "USA MUSIC",
  "UK", "UK SPORTS", "UK GENERAL", "UK ENTERTAINMENT", "UK MOVIES", "UK NEWS", "UK DOCUMENTARY",
  "GENERAL FHD", "ENTERTAINMENT FHD", "NEWS SD / FHD", "DOCUMENTARY HEVC", "MOVIES FHD",
  "ITV X VIP", "SKY SPORTS FHD", "EPL PREMIER LEAGUE", "BEIN SPORTS ASIA", "SUPER SPORTS",
  "SG ENTERTAINMENT", "SG ASIAN+", "INDIA", "TAMIL", "JAPAN",
  "CANADA", "AUSTRALIA", "CHINA", "HK", "MALAYSIA",
  "SPORTS", "VIP CHANNELS", "VIP FORMULA 1", "SPORTS PREMIUM", "DOCUMENTARY",
  "ADULT", "18+", "XXX", "PORN", "HUSTLER", "PLAYBOY"
];

const KEEP_CHANNELS = [
  "UK - HUB PREMIER", "UK - MAN UNITED FHD", "UK - MUTV",
  "F1 - SKY SPORTS F1", "UK - TNT SPORTS", "TNT SPORTS",
  "UK - LFC TV", "STAR SPORTS SELECT", "BEIN SPORTS",
  "US - FUBO SPORTS",
  "Hustler TV", "Playboy TV", "Penthouse HD",
  "Brazzers TV", "Bang Bros", "Adult Swim"
];

const CH_DUPLICATION_RULES = {
  'group-title="UK HUB SPORTS",': 'group-title="EPL",',
  'group-title="Sports On Demand",UK - TNT SPORTS': 'group-title="EPL",UK - TNT SPORTS',
  'group-title="Sports On Demand",UK - HUB PREMIER': 'group-title="EPL",UK - HUB PREMIER'
};

const customDomain = "http://localhost:8787";
const FALLBACK_CONFIG = {};

// Main fetch handler
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, event));
});

async function handleRequest(request, event) {
  const url = new URL(request.url);
  const ua = request.headers.get("User-Agent") || "";
  const isBrowserOrIdm = /Mozilla|Chrome|Safari|Edge|IDM|Wget|Curl|Go-http-client/i.test(ua);
  const isTargetPlayer = /IPTVExtreme|VLC|OttNavigator|PerfectPlayer|StbEmu/i.test(ua);
  
  const encoder = new TextEncoder();
  function toBase64(str) {
    const bytes = encoder.encode(str);
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    return btoa(String.fromCharCode(...bytes));
  }
  function fromBase64(str) {
    let bytes;
    if (typeof Buffer !== 'undefined') {
      bytes = Buffer.from(str, 'base64');
    } else {
      const binary = atob(str);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  if (url.pathname === "/playlist.m3u" || url.pathname === "/virtual.php") {
    if (isBrowserOrIdm && !isTargetPlayer) {
      return new Response("#EXTM3U\n#INFO: Access Denied. Unauthorized Device Layout.", { 
        status: 403, 
        headers: { "Content-Type": "text/plain" } 
      });
    }

    // Cache-first approach
    const cachedM3U = await playlists.get("cached_m3u");
    if (cachedM3U) {
      // Background refresh
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

  if (url.pathname === "/resolve") {
    const src = url.searchParams.get("src");
    if (!src) return new Response("No source", { status: 400 });
    if (isBrowserOrIdm && !isTargetPlayer) return new Response("Unauthorized playback entity detected.", { status: 403 });
    try { 
      const decoded = fromBase64(src);
      return Response.redirect(decoded, 302); 
    } catch { 
      return new Response("Invalid source", { status: 400 }); 
    }
  }
  
  return new Response("Worker is active.", { status: 200 });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await realFetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Timeout fetching ${url}`);
    }
    throw error;
  }
}

async function refreshPlaylistCache() {
  let finalM3U = "#EXTM3U\n";
  
  try {
    const webplaylist = await playlists.get("webplaylist");
    if (webplaylist) finalM3U += webplaylist.trim() + "\n";

    const anbox = await playlists.get("anbox_playlist");
    if (anbox) finalM3U += anbox.trim() + "\n";

    try {
      const response = await fetchWithTimeout("http://tv123.vvvv.ee/tv.m3u", {}, 3000);
      if (response.ok) {
        const data = await response.text();
        finalM3U += virtualisePlaylist(data);
      }
    } catch {
      finalM3U += "#DEBUG: External playlist network error\n";
    }

    const k12 = await playlists.get("k12");
    if (k12) {
      const probeUrl = "http://iptv12k.com:35461/live/m260419337880865/111111/585.ts";
      if (await probePortal(probeUrl)) {
        finalM3U += virtualisePlaylist(k12.trim() + "\n");
      }
    }
  } catch (e) {
    finalM3U += `#DEBUG: KV error - ${e.message}\n`;
  }

  const onlinePortals = await getThreeWorkingPortals();
  
  if (onlinePortals.length > 0) {
    const processingPromises = onlinePortals.map(async (portalKey, index) => {
      try {
        let m3uChunk = await portalist.get(portalKey);
        if (!m3uChunk) {
          m3uChunk = await generateAndFilterMagM3U(portalKey);
          if (m3uChunk) playlists.put(portalKey, m3uChunk, { expirationTtl: 86400 });
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
    finalM3U += "http://dummy.address/portal_header.ts\n";
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
              const virtualizedUrl = `${customDomain}/resolve?src=${toBase64(nextLine)}`;
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
  await playlists.put("cached_m3u", processedM3U, { expirationTtl: 300 });
  
  return processedM3U;
}

async function getThreeWorkingPortals() {
  const keys = Object.keys(PROBE_URLS);
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  
  const setSize = Math.ceil(keys.length / 3);
  const sets = [
    keys.slice(0, setSize),
    keys.slice(setSize, setSize * 2),
    keys.slice(setSize * 2)
  ];
  
  let selected = [];
  for (const set of sets) {
    try {
      const alive = await Promise.any(
        set.map(name =>
          probePortal(PROBE_URLS[name]).then(ok => {
            if (ok) return name;
            return Promise.reject();
          })
        )
      );
      if (alive) selected.push(alive);
    } catch {}
  }
  return selected.slice(0, 3);
}

async function probePortal(url) {
  const u = new URL(url);
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1000);
    const resp = await realFetch(url, {
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

function virtualisePlaylist(rawText) {
  if (!rawText) return "";
  const encoder = new TextEncoder();
  const lines = rawText.split(/\r?\n/);
  let output = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXTINF:")) {
      let nextLine = (lines[i+1] || "").trim();
      if (nextLine && !nextLine.startsWith("#")) {
        const bytes = encoder.encode(nextLine);
        let virtualUrl;
        if (typeof Buffer !== 'undefined') {
          virtualUrl = `${customDomain}/resolve?src=${Buffer.from(bytes).toString('base64')}`;
        } else {
          virtualUrl = `${customDomain}/resolve?src=${btoa(String.fromCharCode(...bytes))}`;
        }
        output += `${line}\n${virtualUrl}\n`;
        i++;
        continue;
      }
    }
    output += line + "\n";
  }
  return output;
}

async function generateAndFilterMagM3U(portalKey) {
  const u = new URL(PROBE_URLS[portalKey]);
  const portalBase = u.origin;
  const mac = u.searchParams.get("mac");
  const token = u.searchParams.get("play_token");
  const encoder = new TextEncoder();

  function toBase64Local(str) {
    const bytes = encoder.encode(str);
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    return btoa(String.fromCharCode(...bytes));
  }

  try {
    const resp = await fetchWithTimeout(
      `${portalBase}/portal.php?type=itv&action=get_all_channels&JsHttpRequest=1-xml`,
      {
        headers: { 
          "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; MAG200 stb)", 
          "Cookie": `mac=${mac}` 
        }
      }, 5000
    );
    
    if (!resp || !resp.ok) {
      console.log(`[${portalKey}] Channel fetch failed with status: ${resp ? resp.status : 'no response'}`);
      return "";
    }
    
    const text = await resp.text();
    const jsonStr = text.match(/\{.*\}/s);
    if (!jsonStr) {
      console.log(`[${portalKey}] No JSON in response`);
      return "";
    }
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
        m3u += `#EXTINF:-1 tvg-id="${ch.id}" group-title="Sports On Demand",${name}\n${customDomain}/resolve?src=${toBase64Local(realUrl)}\n`;
        continue;
      }

      if (currentMarker && DEFAULT_MARKERS.some(m => m.toUpperCase() === currentMarker.toUpperCase())) {
        m3u += `#EXTINF:-1 tvg-id="${ch.id}" group-title="${currentMarker}",${name}\n${customDomain}/resolve?src=${toBase64Local(realUrl)}\n`;
      }
    }
    const channelCount = (m3u.match(/#EXTINF:/g) || []).length;
    console.log(`[${portalKey}] Generated ${channelCount} channels (${Math.floor(m3u.length/100)}KB)`);
    return m3u;
  } catch (e) { 
    console.log(`[${portalKey}] Error: ${e.message}`);
    return ""; 
  }
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

console.log("✅ Worker loaded with cache-first optimization");
console.log("📺 Starting on port 8787...");
