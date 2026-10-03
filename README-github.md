# IPTV Playlist Builder

Builds M3U playlist from IPTV portals using Node.js (runs on GitHub Actions / VPS, NOT Cloudflare Workers).

## Quick Start

```bash
cd /opt/data/anbox-iptv
node scripts/build-m3u.js
```

## GitHub Actions Setup

Add to your GitHub repo as `.github/workflows/build-playlist.yml`:

```yaml
name: Build IPTV Playlist
on:
  schedule:
    - cron: '*/30 * * * *'  # Every 30 minutes
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Build playlist
        run: node scripts/build-m3u.js
      
      - name: Commit and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add playlist.m3u
          git diff --cached --quiet || git commit -m "Update playlist $(date -u '+%Y-%m-%d %H:%M:%S')"
          git push
```

Then enable GitHub Pages:
1. Settings → Pages
2. Source: Deploy from branch → main → /root
3. URL will be: `https://<username>.github.io/<repo>/playlist.m3u`

## Why Not Cloudflare Workers?

Cloudflare Workers **blocks outbound connections** to IPTV portals. Node.js on GitHub Actions / VPS works fine.

## Files

- `scripts/build-m3u.js` - Build script
- `playlist.m3u` - Generated playlist (committed to GitHub)

## Usage

Build locally:
```bash
node scripts/build-m3u.js
# Output: playlist.m3u
```

The playlist can then be used in OKTV, VLC, etc.
