#!/usr/bin/env node
/**
 * Local test script for anbox-iptv-worker.js
 * Tests the core functionality without Cloudflare Workers
 */

const fs = require('fs');
const path = require('path');

// Load the main script
const scriptPath = path.join(__dirname, '../src/anbox-iptv-worker.js');
const script = fs.readFileSync(scriptPath, 'utf8');

// Mock Cloudflare environment
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
  
  async text() {
    return this._body;
  }
}

// Mock KV stores
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

// Mock fetch with test responses
const mockFetch = async (url, options) => {
  console.log(`🌐 [MOCK FETCH] ${url}`);
  
  // Simulate external playlist
  if (url.includes('tv.m3u') || url.includes('tv123.vvvv.ee')) {
    return {
      ok: true,
      status: 200,
      text: async () => `#EXTM3U
#EXTINF:-1 tvg-id="1" group-title="UK SPORTS",BBC Sport
http://stream1.example.com/bbc.ts
#EXTINF:-1 tvg-id="2" group-title="UK SPORTS",Sky Sports 1
http://stream2.example.com/sky1.ts
#EXTINF:-1 tvg-id="3" group-title="MOVIES FHD",Movie Channel
http://stream3.example.com/movie.ts`
    };
  }
  
  // Simulate portal.php response
  if (url.includes('portal.php')) {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        js: {
          data: [
            { id: "101", name: "##### UK SPORTS #####" },
            { id: "102", name: "UK - HUB PREMIER" },
            { id: "103", name: "UK - TNT SPORTS" },
            { id: "104", name: "##### MOVIES FHD #####" },
            { id: "105", name: "Movie Channel 1" }
          ]
        }
      })
    };
  }
  
  // Simulate probe URLs (return 200 for testing)
  if (url.includes('play/live.php')) {
    return {
      ok: true,
      status: 200,
      text: async () => ''
    };
  }
  
  return {
    ok: false,
    status: 404,
    text: async () => 'Not found'
  };
};

// Mock caches
const mockCaches = {
  default: {
    match: async () => null
  }
};

// Set up global mocks
global.playlists = mockKV.playlists;
global.portalist = mockKV.portalist;
global.caches = mockCaches;
global.fetch = mockFetch;
global.Request = MockRequest;
global.Response = MockResponse;

// Mock addEventListener - capture the handler
global.addEventListener = (event, handler) => {
  if (event === 'fetch') {
    global.fetchHandler = handler;
  }
};

// Execute the script
eval(script);

// Test functions
async function testPlaylistGeneration() {
  console.log('\n🧪 TEST 1: Playlist Generation');
  console.log('='.repeat(50));
  
  const mockRequest = new Request('http://localhost/playlist.m3u', {
    headers: { 'User-Agent': 'IPTVExtreme' }
  });
  
  // Create a mock event with respondWith
  const mockEvent = {
    request: mockRequest,
    waitUntil: (promise) => promise,
    respondWith: async (promise) => {
      const response = await promise;
      const text = await response.text();
      
      console.log('\n📄 Generated Playlist:');
      console.log(text);
      
      // Check for expected content
      const hasExtM3U = text.includes('#EXTM3U');
      const hasVirtualUrl = text.includes('virtual.anbox.dpdns.org/resolve');
      const hasActiveSources = text.includes('ACTIVE SOURCES');
      
      console.log('\n✅ Checks:');
      console.log(`  - Has EXTM3U header: ${hasExtM3U ? '✓' : '✗'}`);
      console.log(`  - Has virtual URLs: ${hasVirtualUrl ? '✓' : '✗'}`);
      console.log(`  - Has active sources: ${hasActiveSources ? '✓' : '✗'}`);
      
      return response;
    }
  };
  
  await global.fetchHandler(mockEvent);
}

async function testResolveEndpoint() {
  console.log('\n\n🧪 TEST 2: Resolve Endpoint');
  console.log('='.repeat(50));
  
  const testUrl = 'http://example.com/stream.ts';
  const encoded = Buffer.from(testUrl).toString('base64');
  
  const mockRequest = new Request(`http://localhost/resolve?src=${encoded}`, {
    headers: { 'User-Agent': 'IPTVExtreme' }
  });
  
  const mockEvent = {
    request: mockRequest,
    waitUntil: (promise) => promise,
    respondWith: async (promise) => {
      const response = await promise;
      
      console.log(`\n🔗 Input: /resolve?src=${encoded}`);
      console.log(`🔗 Expected redirect: ${testUrl}`);
      console.log(`🔗 Status: ${response.status}`);
      console.log(`🔗 Redirect location: ${response.headers.location || 'N/A'}`);
      
      const isRedirect = response.status === 302;
      const correctLocation = response.headers.location === testUrl;
      
      console.log('\n✅ Checks:');
      console.log(`  - Returns 302 redirect: ${isRedirect ? '✓' : '✗'}`);
      console.log(`  - Correct location: ${correctLocation ? '✓' : '✗'}`);
      
      return response;
    }
  };
  
  await global.fetchHandler(mockEvent);
}

async function testUserAgentBlocking() {
  console.log('\n\n🧪 TEST 3: User-Agent Blocking');
  console.log('='.repeat(50));
  
  const mockRequest = new Request('http://localhost/playlist.m3u', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0)' }
  });
  
  const mockEvent = {
    request: mockRequest,
    waitUntil: (promise) => promise,
    respondWith: async (promise) => {
      const response = await promise;
      const text = await response.text();
      
      console.log(`\n🔒 User-Agent: Mozilla/5.0 (Windows NT 10.0)`);
      console.log(`🔒 Status: ${response.status}`);
      console.log(`🔒 Response: ${text.trim()}`);
      
      const isBlocked = response.status === 403;
      const hasDeniedMessage = text.includes('Access Denied');
      
      console.log('\n✅ Checks:');
      console.log(`  - Returns 403: ${isBlocked ? '✓' : '✗'}`);
      console.log(`  - Has denial message: ${hasDeniedMessage ? '✓' : '✗'}`);
      
      return response;
    }
  };
  
  await global.fetchHandler(mockEvent);
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting Local Tests for Anbox IPTV Worker');
  console.log('='.repeat(60));
  
  try {
    await testPlaylistGeneration();
    await testResolveEndpoint();
    await testUserAgentBlocking();
    
    console.log('\n\n🎉 All tests completed!');
    console.log('\n💡 Note: This is a local simulation. Real functionality requires:');
    console.log('   - Cloudflare Workers environment');
    console.log('   - Real KV storage');
    console.log('   - Actual IPTV portal access');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests, testPlaylistGeneration, testResolveEndpoint, testUserAgentBlocking };
