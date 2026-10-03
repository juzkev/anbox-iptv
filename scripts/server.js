#!/usr/bin/env node
/**
 * Simple HTTP server to test the Anbox IPTV worker locally
 * Run: node server.js
 * Then visit: http://localhost:8787/playlist.m3u
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Load the worker script
const scriptPath = path.join(__dirname, '../src/anbox-iptv-worker.js');
const script = fs.readFileSync(scriptPath, 'utf8');

// Mock environment
const mockKV = {
  playlists: {
    data: {},
    get: async (key) => mockKV.playlists.data[key] || null,
    put: async (key, value) => { mockKV.playlists.data[key] = value; }
  },
  portalist: {
    data: {},
    get: async (key) => mockKV.portalist.data[key] || null,
    put: async (key, value) => { mockKV.portalist.data[key] = value; }
  }
};

// Mock fetch
const mockFetch = async (url, options) => {
  console.log(`[FETCH] ${url}`);
  
  if (url.includes('tv.m3u') || url.includes('tv123.vvvv.ee')) {
    return {
      ok: true,
      status: 200,
      text: async () => `#EXTM3U
#EXTINF:-1,Test Channel 1
http://example.com/stream1.ts
#EXTINF:-1,Test Channel 2
http://example.com/stream2.ts`
    };
  }
  
  if (url.includes('portal.php')) {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        js: {
          data: [
            { id: "1", name: "##### UK SPORTS #####" },
            { id: "2", name: "UK - HUB PREMIER" },
            { id: "3", name: "Sky Sports 1" }
          ]
        }
      })
    };
  }
  
  if (url.includes('play/live.php')) {
    return { ok: true, status: 200, text: async () => '' };
  }
  
  return { ok: false, status: 404, text: async () => 'Not found' };
};

// Set up globals
global.playlists = mockKV.playlists;
global.portalist = mockKV.portalist;
global.caches = { default: { match: async () => null } };
global.fetch = mockFetch;

// Mock classes
class MockRequest {
  constructor(url, options = {}) {
    this.url = url;
    this.headers = new Map(Object.entries(options.headers || {}));
  }
}

class MockResponse {
  constructor(body, options = {}) {
    this._body = body;
    this.status = options.status || 200;
    this.headers = options.headers || {};
  }
  async text() { return this._body; }
}

global.Request = MockRequest;
global.Response = MockResponse;

// Capture the fetch handler
global.addEventListener = (event, handler) => {
  if (event === 'fetch') {
    global.fetchHandler = handler;
  }
};

// Execute the script
try {
  eval(script);
} catch (error) {
  console.error('Script load error:', error);
  process.exit(1);
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  // Create mock request
  const mockRequest = new MockRequest(`http://localhost${req.url}`, {
    headers: req.headers
  });
  
  // Create mock event
  const mockEvent = {
    request: mockRequest,
    waitUntil: (p) => p,
    respondWith: async (promise) => {
      try {
        const response = await promise;
        
        // Handle redirect
        if (response.status === 302 && response.headers.location) {
          res.writeHead(302, { Location: response.headers.location });
          res.end();
          return;
        }
        
        // Handle normal response
        const body = await response.text();
        res.writeHead(response.status, response.headers);
        res.end(body);
      } catch (error) {
        console.error('Response error:', error);
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    }
  };
  
  // Call the handler
  try {
    await global.fetchHandler(mockEvent);
  } catch (error) {
    console.error('Handler error:', error);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

const PORT = 8787;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
  console.log(`📺 Test endpoints:`);
  console.log(`   - http://localhost:${PORT}/playlist.m3u`);
  console.log(`   - http://localhost:${PORT}/resolve?src=BASE64_ENCODED_URL`);
  console.log(`\n💡 Try with different User-Agents:`);
  console.log(`   curl -H "User-Agent: IPTVExtreme" http://localhost:${PORT}/playlist.m3u`);
  console.log(`   curl -H "User-Agent: Mozilla" http://localhost:${PORT}/playlist.m3u`);
});

server.on('error', (error) => {
  console.error('Server error:', error);
});
