// Miniflare wrapper — strips the local-testing mock block from the main worker
// and passes the cleaned code to miniflare.
// Usage: node scripts/miniflare-wrapper.js [--port 8787]

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAIN_SCRIPT = path.join(__dirname, '..', 'src', 'anbox-iptv-worker.js');
const CLEAN_SCRIPT = path.join(__dirname, '..', 'src', 'anbox-iptv-worker-clean.js');

// Strip the mock block (lines 123–200)
let code = fs.readFileSync(MAIN_SCRIPT, 'utf8');
code = code.replace(
  /\/\/ Mock Cloudflare KV for local testing[\s\S]*?global\.fetch = mockFetch;\n/,
  ''
);
fs.writeFileSync(CLEAN_SCRIPT, code);
console.log('✅ Stripped mock block → anbox-iptv-worker-clean.js');

// Parse port from args
let port = '8787';
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = args[i + 1];
    i++; // skip next arg
  } else if (args[i].startsWith('--port=')) {
    port = args[i].split('=')[1];
  }
}

console.log(`📺 Starting miniflare on port ${port}...`);

// Run miniflare
const result = spawnSync(
  process.execPath,
  [
    path.join(__dirname, '..', 'node_modules', '.bin', 'miniflare'),
    CLEAN_SCRIPT,
    '--port', port
  ],
  { cwd: path.join(__dirname, '..'), stdio: 'inherit' }
);

process.exit(result.status || 0);
