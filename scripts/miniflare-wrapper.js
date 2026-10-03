// Miniflare wrapper — strips the local-testing mock block from the main worker
// and passes the cleaned code to miniflare.
// Usage: node scripts/miniflare-wrapper.js [--port 8787]

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Always resolve relative to this file's location, not process cwd
const ROOT = path.resolve(__dirname, '..');
const MAIN_SCRIPT = path.join(ROOT, 'src', 'anbox-iptv-worker.js');
const CLEAN_SCRIPT = path.join(ROOT, 'src', 'anbox-iptv-worker-clean.js');
const MINIFLARE_BIN = path.join(ROOT, 'node_modules', '.bin', 'miniflare');

console.log(`Root: ${ROOT}`);
console.log(`Main exists: ${fs.existsSync(MAIN_SCRIPT)}`);
console.log(`Miniflare exists: ${fs.existsSync(MINIFLARE_BIN)}`);

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
    i++;
  } else if (args[i].startsWith('--port=')) {
    port = args[i].split('=')[1];
  }
}

console.log(`📺 Starting miniflare on port ${port}...`);

// Run miniflare with explicit cwd
const result = spawnSync(
  process.execPath,
  [MINIFLARE_BIN, CLEAN_SCRIPT, '--port', port],
  { cwd: ROOT, stdio: 'inherit' }
);

process.exit(result.status || 0);
