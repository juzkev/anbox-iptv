/**
 * IPTV Portal Tester Worker
 * Allows testing portals, browsing channels, and previewing streams
 */

// Store portal URLs in KV (keyed by portal name)
const KV_STORE = 'portalist';

async function getPortalUrl(name, kv) {
  const key = `portal:${name}`;
  const url = await kv.get(key);
  return url || null;
}

async function savePortalUrl(name, kv, url) {
  const key = `portal:${name}`;
  await kv.put(key, url);
  return true;
}

async function deletePortalUrl(name, kv) {
  const key = `portal:${name}`;
  await kv.delete(key);
  return true;
}

async function listPortals(kv) {
  const iterator = kv.list({ prefix: 'portal:' });
  const portals = [];
  for await (const key of iterator) {
    const name = key.name.replace('portal:', '');
    const url = await kv.get(key.name);
    if (url) {
      portals.push({ name, url });
    }
  }
  return portals;
}

async function fetchPortalChannels(url, mac) {
  try {
    const portalBase = url.replace(/\/[^/]*$/, '');
    const apiUrl = `${portalBase}/portal.php?type=itv&action=get_all_channels&JsHttpRequest=1-xml`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'Cookie': `mac=${mac}`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; MAG200 stb)'
      }
    });
    
    if (!response.ok) {
      return { error: `HTTP ${response.status}`, channels: [] };
    }
    
    const data = await response.text();
    const jsonMatch = data.match(/{.*}/s);
    if (!jsonMatch) {
      return { error: 'No JSON found in response', channels: [] };
    }
    
    const json = JSON.parse(jsonMatch[0]);
    const channels = json.js?.data || [];
    return { channels, mac };
  } catch (e) {
    return { error: e.message, channels: [] };
  }
}

async function testPortal(probeUrl) {
  try {
    const parsed = new URL(probeUrl);
    const mac = parsed.searchParams.get('mac') || '';
    const probeApiUrl = `${parsed.origin}/portal.php?type=itv&action=get_all_channels&JsHttpRequest=1-xml`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(probeApiUrl, {
      headers: {
        'Cookie': `mac=${mac}`,
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; MAG200 stb)'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    return {
      working: response.ok,
      status: response.status,
      mac,
      url: probeUrl
    };
  } catch (e) {
    return {
      working: false,
      error: e.message,
      url: probeUrl
    };
  }
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  
  // API endpoints
  if (url.pathname === '/api/test' && request.method === 'POST') {
    const { portalUrl } = await request.json();
    const result = await testPortal(portalUrl);
    return Response.json(result);
  }
  
  if (url.pathname === '/api/portals' && request.method === 'GET') {
    const portals = await listPortals(env[KV_STORE]);
    return Response.json(portals);
  }
  
  if (url.pathname === '/api/channels' && request.method === 'GET') {
    const { portalName, page = '1', limit = '50' } = Object.fromEntries(url.searchParams);
    const portal = await getPortalUrl(portalName, env[KV_STORE]);
    if (!portal) {
      return Response.json({ error: 'Portal not found' }, { status: 404 });
    }
    
    // Parse portal to get MAC
    const parsed = new URL(portal);
    const mac = parsed.searchParams.get('mac') || '';
    
    const channelsResult = await fetchPortalChannels(portal, mac);
    const channels = channelsResult.channels || [];
    
    // Simple pagination
    const pageNum = parseInt(page) || 1;
    const pageSize = parseInt(limit) || 50;
    const start = (pageNum - 1) * pageSize;
    const end = start + pageSize;
    const paginatedChannels = channels.slice(start, end);
    
    return Response.json({
      name: portalName,
      total: channels.length,
      page: pageNum,
      limit: pageSize,
      channels: paginatedChannels,
      mac: channelsResult.mac
    });
  }
  
  // Main page - HTML UI
  return new Response(HTML_PAGE, {
    headers: { 'Content-Type': 'text/html' }
  });
}

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IPTV Portal Tester</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e; color: #eee; padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #e94560; margin-bottom: 20px; text-align: center; }
    
    /* Test Section */
    .test-section {
      background: #16213e; padding: 20px; border-radius: 10px;
      margin-bottom: 20px;
    }
    .test-section h2 { margin-bottom: 15px; color: #0f3460; }
    .input-group { display: flex; gap: 10px; margin-bottom: 15px; }
    input {
      flex: 1; padding: 12px; border: 1px solid #0f3460;
      background: #16213e; color: #eee; border-radius: 5px;
    }
    button {
      padding: 12px 24px; background: #e94560; color: white;
      border: none; border-radius: 5px; cursor: pointer; font-weight: bold;
    }
    button:hover { background: #c73e54; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    
    /* Results */
    .results { margin-top: 15px; }
    .portal-status {
      display: flex; align-items: center; gap: 10px;
      padding: 10px; background: #0f3460; border-radius: 5px;
      margin-bottom: 10px;
    }
    .status-dot { width: 12px; height: 12px; border-radius: 50%; }
    .status-dot.ok { background: #4ade80; }
    .status-dot.fail { background: #f87171; }
    
    /* Channels */
    .channels-section {
      background: #16213e; padding: 20px; border-radius: 10px;
    }
    .channels-section h2 { margin-bottom: 15px; }
    .channel-list {
      max-height: 500px; overflow-y: auto;
    }
    .channel-item {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px; background: #0f3460; margin-bottom: 5px;
      border-radius: 5px; cursor: pointer; transition: background 0.2s;
    }
    .channel-item:hover { background: #1a1a4e; }
    .channel-name { flex: 1; }
    .channel-actions { display: flex; gap: 10px; }
    .play-btn {
      padding: 5px 15px; background: #4ade80; color: #000;
      border: none; border-radius: 3px; cursor: pointer;
    }
    
    /* Player */
    .player-section {
      background: #16213e; padding: 20px; border-radius: 10px;
      margin-top: 20px;
    }
    video { width: 100%; max-width: 800px; background: #000; }
    .player-info { margin-top: 10px; padding: 10px; background: #0f3460; border-radius: 5px; }
    
    /* Saved Portals */
    .saved-portals {
      margin-top: 15px; display: flex; flex-wrap: wrap; gap: 10px;
    }
    .portal-tag {
      padding: 8px 15px; background: #0f3460; border-radius: 20px;
      display: flex; align-items: center; gap: 10px;
    }
    .portal-tag button {
      padding: 2px 8px; background: #e94560; font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📺 IPTV Portal Tester</h1>
    
    <!-- Test Section -->
    <div class="test-section">
      <h2>Test Portal</h2>
      <div class="input-group">
        <input type="text" id="portalUrl" placeholder="Enter portal URL (e.g., http://klaratv.com:80/c/)">
        <button onclick="testPortal()">Test</button>
      </div>
      <div id="testResults" class="results"></div>
      <div id="savedPortals" class="saved-portals"></div>
    </div>
    
    <!-- Channels Section -->
    <div class="channels-section" id="channelsSection" style="display: none;">
      <h2>Channels <span id="channelCount"></span></h2>
      <div id="channelList" class="channel-list"></div>
    </div>
    
    <!-- Player Section -->
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
    let currentPortal = null;
    
    async function testPortal() {
      const url = document.getElementById('portalUrl').value.trim();
      if (!url) return;
      
      const results = document.getElementById('testResults');
      results.innerHTML = '<p>Testing...</p>';
      
      try {
        const res = await fetch('/api/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ portalUrl: url })
        });
        
        const data = await res.json();
        
        if (data.working) {
          results.innerHTML = \`
            <div class="portal-status">
              <div class="status-dot ok"></div>
              <span>✅ Portal is WORKING</span>
              <span style="margin-left: auto; color: #888;">MAC: \${data.mac}</span>
            </div>
            <button onclick="fetchChannels('\${url}', '\${data.mac}')">Load Channels</button>
          \`;
        } else {
          results.innerHTML = \`
            <div class="portal-status">
              <div class="status-dot fail"></div>
              <span>❌ Portal NOT working</span>
              <span style="margin-left: auto; color: #f87171;">\${data.error || data.status || 'Unknown error'}</span>
            </div>
          \`;
        }
      } catch (e) {
        results.innerHTML = '<p style="color: #f87171;">Error: ' + e.message + '</p>';
      }
    }
    
    async function fetchChannels(portalUrl, mac) {
      // Save portal
      const portalName = new URL(portalUrl).hostname.replace(/^www\\./, '').replace(/:\\d+$/, '');
      try {
        await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: portalName, url: portalUrl })
        });
      } catch (e) {}
      
      // Fetch channels
      try {
        const res = await fetch('/api/channels?portalName=' + encodeURIComponent(portalName));
        const data = await res.json();
        
        if (data.error) {
          document.getElementById('testResults').innerHTML += \'<p style="color: #f87171;">Error fetching channels: ' + data.error + '</p>\';
          return;
        }
        
        currentPortal = { name: portalName, url: portalUrl, mac };
        document.getElementById('channelCount').textContent = \`(${data.total} channels)\`;
        renderChannels(data.channels);
        document.getElementById('channelsSection').style.display = 'block';
      } catch (e) {
        document.getElementById('testResults').innerHTML += '<p style="color: #f87171;">Error: ' + e.message + '</p>';
      }
    }
    
    function renderChannels(channels) {
      const list = document.getElementById('channelList');
      list.innerHTML = '';
      
      channels.forEach((ch, i) => {
        const div = document.createElement('div');
        div.className = 'channel-item';
        div.innerHTML = \`
          <span class="channel-name">\${i + 1}. \${ch.name || 'Unknown'}</span>
          <div class="channel-actions">
            <button class="play-btn" onclick="playChannel('\${ch.id}')">▶ Play</button>
          </div>
        \`;
        list.appendChild(div);
      });
    }
    
    function playChannel(streamId) {
      if (!currentPortal) return;
      
      const parsed = new URL(currentPortal.url);
      const baseUrl = \`\${parsed.protocol}//\${parsed.hostname}\${parsed.port ? ':' + parsed.port : ''}\`;
      
      // Get token from saved URL
      const savedUrl = currentPortal.url;
      const tokenMatch = savedUrl.match(/play_token=([^&]+)/);
      const token = tokenMatch ? tokenMatch[1] : '';
      
      const playUrl = \`\${baseUrl}/play/live.php?mac=\${currentPortal.mac}&stream=\${streamId}&extension=ts&play_token=\${token}\`;
      
      const playerSection = document.getElementById('playerSection');
      playerSection.style.display = 'block';
      
      const video = document.getElementById('videoPlayer');
      video.src = playUrl;
      video.play();
      
      document.getElementById('playerUrl').textContent = playUrl;
      document.getElementById('playerChannel').textContent = currentPortal.name + ' (stream: ' + streamId + ')';
      
      playerSection.scrollIntoView({ behavior: 'smooth' });
    }
    
    // Load saved portals
    async function loadSavedPortals() {
      try {
        const res = await fetch('/api/portals');
        const portals = await res.json();
        const container = document.getElementById('savedPortals');
        container.innerHTML = '<strong>Saved Portals:</strong>';
        
        portals.forEach(p => {
          const tag = document.createElement('div');
          tag.className = 'portal-tag';
          tag.innerHTML = \`
            <span>\${p.name}</span>
            <button onclick="testSavedPortal('\${p.name}')">Test</button>
            <button onclick="loadSavedChannels('\${p.name}')">Channels</button>
          \`;
          container.appendChild(tag);
        });
      } catch (e) {}
    }
    
    async function testSavedPortal(name) {
      // Get portal URL
      const res = await fetch('/api/portals');
      const portals = await res.json();
      const portal = portals.find(p => p.name === name);
      if (!portal) return;
      
      document.getElementById('portalUrl').value = portal.url;
      testPortal();
    }
    
    async function loadSavedChannels(name) {
      // Get portal URL and fetch channels
      const res = await fetch('/api/portals');
      const portals = await res.json();
      const portal = portals.find(p => p.name === name);
      if (!portal) return;
      
      const parsed = new URL(portal.url);
      const mac = parsed.searchParams.get('mac') || '';
      fetchChannels(portal.url, mac);
    }
    
    // Init
    loadSavedPortals();
  </script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};
