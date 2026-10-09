/**
 * IPTV Portal Tester Worker
 * Test portals, browse channels, preview streams.
 * KV optional: falls back to in-memory storage if env.portalist is not bound
 * (e.g. temporary-account deploys where the KV ids don't exist).
 */

const KV_STORE = 'portalist';
// In-memory fallback when KV binding is absent. Note: per-isolate, resets on redeploy.
const memStore = new Map();

function makeStore(kv) {
  return {
    async get(key) {
      if (kv) return await kv.get(key);
      return memStore.has(key) ? memStore.get(key) : null;
    },
    async put(key, val) {
      if (kv) { await kv.put(key, val); return; }
      memStore.set(key, val);
    },
    async *list(prefix) {
      if (kv) {
        for await (const k of kv.list({ prefix })) yield k.name;
        return;
      }
      for (const key of memStore.keys()) {
        if (key.startsWith(prefix)) yield key;
      }
    }
  };
}

async function fetchPortalChannels(portalUrl, mac) {
  try {
    const parsed = new URL(portalUrl);
    const apiUrl = parsed.origin + '/portal.php?type=itv&action=get_all_channels&JsHttpRequest=1-xml';
    const response = await fetch(apiUrl, {
      headers: {
        'Cookie': 'mac=' + mac,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; MAG200 stb)'
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      return { error: 'HTTP ' + response.status, channels: [] };
    }
    const text = await response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { error: 'No JSON in response', channels: [] };
    }
    const json = JSON.parse(jsonMatch[0]);
    const channels = (json.js && json.js.data) || [];
    return { channels: channels };
  } catch (e) {
    return { error: e.message, channels: [] };
  }
}

async function testPortal(probeUrl) {
  try {
    const parsed = new URL(probeUrl);
    const mac = parsed.searchParams.get('mac') || '';
    const probeApiUrl = parsed.origin + '/portal.php?type=itv&action=get_all_channels&JsHttpRequest=1-xml';
    const response = await fetch(probeApiUrl, {
      headers: {
        'Cookie': 'mac=' + mac,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; MAG200 stb)'
      },
      signal: AbortSignal.timeout(10000)
    });
    return {
      working: response.ok,
      status: response.status,
      mac: mac,
      url: probeUrl
    };
  } catch (e) {
    return { working: false, error: e.message, url: probeUrl };
  }
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const store = makeStore(env ? env[KV_STORE] : undefined);

  if (url.pathname === '/api/test' && request.method === 'POST') {
    const body = await request.json();
    const result = await testPortal(body.portalUrl);
    return Response.json(result);
  }

  if (url.pathname === '/api/save' && request.method === 'POST') {
    const body = await request.json();
    await store.put('portal:' + body.name, body.url);
    return Response.json({ ok: true });
  }

  if (url.pathname === '/api/portals' && request.method === 'GET') {
    const portals = [];
    for await (const key of store.list('portal:')) {
      const name = key.replace('portal:', '');
      const u = await store.get(key);
      if (u) portals.push({ name: name, url: u });
    }
    return Response.json(portals);
  }

  if (url.pathname === '/api/channels' && request.method === 'GET') {
    const params = url.searchParams;
    const portalName = params.get('portalName');
    const page = parseInt(params.get('page')) || 1;
    const limit = parseInt(params.get('limit')) || 50;
    const portal = await store.get('portal:' + portalName);
    if (!portal) {
      return Response.json({ error: 'Portal not found. Click Test first.' }, { status: 404 });
    }
    const parsed = new URL(portal);
    const mac = parsed.searchParams.get('mac') || '';
    const result = await fetchPortalChannels(portal, mac);
    const channels = result.channels || [];
    const start = (page - 1) * limit;
    return Response.json({
      name: portalName,
      total: channels.length,
      page: page,
      limit: limit,
      channels: channels.slice(start, start + limit),
      mac: mac
    });
  }

  return new Response(HTML_PAGE, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// IMPORTANT: the browser script below deliberately uses ONLY string
// concatenation — no backticks and no ${...} anywhere. This whole page is an
// outer JS template literal; any ${...} inside would be evaluated in the
// Worker scope at load time and crash deploys with "X is not defined".
const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IPTV Portal Tester</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #eee; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #e94560; margin-bottom: 20px; text-align: center; }
    .test-section, .channels-section, .player-section { background: #16213e; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
    h2 { margin-bottom: 15px; }
    .input-group { display: flex; gap: 10px; margin-bottom: 15px; }
    input { flex: 1; padding: 12px; border: 1px solid #0f3460; background: #0d1b33; color: #eee; border-radius: 5px; }
    button { padding: 12px 24px; background: #e94560; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
    button:hover { background: #c73e54; }
    .results { margin-top: 15px; }
    .portal-status { display: flex; align-items: center; gap: 10px; padding: 10px; background: #0f3460; border-radius: 5px; margin-bottom: 10px; flex-wrap: wrap; }
    .status-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
    .status-dot.ok { background: #4ade80; }
    .status-dot.fail { background: #f87171; }
    .channel-list { max-height: 500px; overflow-y: auto; }
    .channel-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #0f3460; margin-bottom: 5px; border-radius: 5px; gap: 10px; }
    .channel-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .play-btn { padding: 5px 15px; background: #4ade80; color: #000; border: none; border-radius: 3px; cursor: pointer; font-weight: bold; flex-shrink: 0; }
    video { width: 100%; max-width: 800px; background: #000; border-radius: 5px; }
    .player-info { margin-top: 10px; padding: 10px; background: #0f3460; border-radius: 5px; word-break: break-all; font-size: 12px; }
    .saved-portals { margin-top: 15px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .portal-tag { padding: 6px 12px; background: #0f3460; border-radius: 20px; display: flex; align-items: center; gap: 8px; font-size: 13px; }
    .portal-tag button { padding: 2px 8px; font-size: 11px; }
    .muted { color: #888; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>IPTV Portal Tester</h1>

    <div class="test-section">
      <h2>Test Portal</h2>
      <div class="input-group">
        <input type="text" id="portalUrl" placeholder="http://host:port/c/?mac=00:1A:79:XX:XX:XX&stream=123&play_token=abc">
        <button onclick="testPortal()">Test</button>
      </div>
      <div id="testResults" class="results"></div>
      <div id="savedPortals" class="saved-portals"></div>
    </div>

    <div class="channels-section" id="channelsSection" style="display: none;">
      <h2>Channels <span id="channelCount" class="muted"></span></h2>
      <div id="channelList" class="channel-list"></div>
    </div>

    <div class="player-section" id="playerSection" style="display: none;">
      <h2>Player</h2>
      <video id="videoPlayer" controls></video>
      <div class="player-info">
        <div><strong>URL:</strong> <span id="playerUrl"></span></div>
        <div><strong>Channel:</strong> <span id="playerChannel"></span></div>
      </div>
    </div>
  </div>

  <script>
    var currentPortal = null;

    function esc(s) {
      var d = document.createElement('div');
      d.textContent = (s == null) ? '' : String(s);
      return d.innerHTML;
    }

    async function testPortal() {
      var url = document.getElementById('portalUrl').value.trim();
      if (!url) return;
      var results = document.getElementById('testResults');
      results.innerHTML = '<p>Testing...</p>';
      try {
        var res = await fetch('/api/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ portalUrl: url })
        });
        var data = await res.json();
        if (data.working) {
          results.innerHTML =
            '<div class="portal-status">' +
            '<div class="status-dot ok"></div>' +
            '<span>Portal is WORKING</span>' +
            '<span class="muted" style="margin-left:auto;">MAC: ' + esc(data.mac || '(none in URL)') + '</span>' +
            '</div>' +
            '<button onclick="loadChannels()">Load Channels</button>';
        } else {
          results.innerHTML =
            '<div class="portal-status">' +
            '<div class="status-dot fail"></div>' +
            '<span>Portal NOT working</span>' +
            '<span class="muted" style="margin-left:auto;color:#f87171;">' +
            esc(data.error || (data.status ? 'HTTP ' + data.status : 'Unknown error')) + '</span>' +
            '</div>';
        }
      } catch (e) {
        results.innerHTML = '<p style="color:#f87171;">Error: ' + esc(e.message) + '</p>';
      }
    }

    async function loadChannels() {
      var portalUrl = document.getElementById('portalUrl').value.trim();
      var parsed = new URL(portalUrl);
      var portalName = parsed.hostname;
      var mac = parsed.searchParams.get('mac') || '';

      try {
        await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: portalName, url: portalUrl })
        });
      } catch (e) {}

      try {
        var res = await fetch('/api/channels?portalName=' + encodeURIComponent(portalName));
        var data = await res.json();
        if (data.error) {
          document.getElementById('testResults').innerHTML +=
            '<p style="color:#f87171;">Channels error: ' + esc(data.error) + '</p>';
          return;
        }
        currentPortal = { name: portalName, url: portalUrl, mac: (data.mac || mac) };
        document.getElementById('channelCount').textContent = '(' + data.total + ' channels)';
        renderChannels(data.channels);
        document.getElementById('channelsSection').style.display = 'block';
        loadSavedPortals();
      } catch (e) {
        document.getElementById('testResults').innerHTML +=
          '<p style="color:#f87171;">Error: ' + esc(e.message) + '</p>';
      }
    }

    function renderChannels(channels) {
      var list = document.getElementById('channelList');
      list.innerHTML = '';
      channels.forEach(function(ch, i) {
        var div = document.createElement('div');
        div.className = 'channel-item';
        // textContent for the name (no XSS), addEventListener for the button (no inline JS)
        var nameSpan = document.createElement('span');
        nameSpan.className = 'channel-name';
        nameSpan.textContent = (i + 1) + '. ' + (ch.name || 'Unknown');
        var btn = document.createElement('button');
        btn.className = 'play-btn';
        btn.textContent = 'Play';
        btn.addEventListener('click', function() { playChannel(ch.id); });
        div.appendChild(nameSpan);
        div.appendChild(btn);
        list.appendChild(div);
      });
    }

    function playChannel(streamId) {
      if (!currentPortal) return;
      var parsed = new URL(currentPortal.url);
      var baseUrl = parsed.origin;
      var tokenMatch = currentPortal.url.match(/play_token=([^&]+)/);
      var token = tokenMatch ? tokenMatch[1] : '';
      var playUrl = baseUrl + '/play/live.php?mac=' + encodeURIComponent(currentPortal.mac) +
        '&stream=' + encodeURIComponent(streamId) + '&extension=ts&play_token=' + encodeURIComponent(token);

      var playerSection = document.getElementById('playerSection');
      playerSection.style.display = 'block';
      var video = document.getElementById('videoPlayer');
      video.src = playUrl;
      video.play().catch(function() {});
      document.getElementById('playerUrl').textContent = playUrl;
      document.getElementById('playerChannel').textContent = currentPortal.name + ' (stream ' + streamId + ')';
      playerSection.scrollIntoView({ behavior: 'smooth' });
    }

    async function loadSavedPortals() {
      try {
        var res = await fetch('/api/portals');
        var portals = await res.json();
        var container = document.getElementById('savedPortals');
        container.innerHTML = '<strong>Saved:</strong>';
        if (!portals.length) {
          var none = document.createElement('span');
          none.className = 'muted';
          none.textContent = 'none yet';
          container.appendChild(none);
          return;
        }
        portals.forEach(function(p) {
          var tag = document.createElement('div');
          tag.className = 'portal-tag';
          var label = document.createElement('span');
          label.textContent = p.name;
          var btn = document.createElement('button');
          btn.textContent = 'Load';
          btn.addEventListener('click', function() {
            document.getElementById('portalUrl').value = p.url;
            testPortal();
          });
          tag.appendChild(label);
          tag.appendChild(btn);
          container.appendChild(tag);
        });
      } catch (e) {}
    }

    loadSavedPortals();
  </script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};
