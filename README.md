# Anbox IPTV Worker

A Cloudflare Worker that aggregates multiple IPTV portals into a unified M3U playlist with advanced filtering, URL virtualization, and user-agent based access control.

## Features

- **Portal Aggregation**: Tests multiple IPTV provider URLs to find working ones
- **Playlist Generation**: Combines playlists from active portals into a single M3U file
- **Channel Filtering**: Keeps only channels matching predefined categories or specific channel names
- **URL Virtualization**: Rewrites stream URLs through a `/resolve` endpoint to hide original sources
- **User-Agent Gate**: Blocks browsers/curl/wget - only allows IPTV players (IPTVExtreme, VLC, OttNavigator, PerfectPlayer, StbEmu)
- **Caching**: Uses Cloudflare KV storage to cache generated playlists
- **Adult Channel Support**: Can include adult/18+ channels based on keywords or specific channel names

## Project Structure

```
anbox-iptv/
├── src/                    # Source files
│   ├── anbox-iptv-worker.js # Original full script (Cloudflare Workers)
│   ├── miniflare-final.js  # Miniflare-compatible version
│   ├── worker.js           # CommonJS wrapper
│   └── worker.mjs          # ES Module wrapper
├── scripts/                # Utility scripts
│   ├── probe-channels.js   # Probe IPTV portals and discover channels
│   ├── test-anbox-worker.js # Automated test suite
│   └── server.js           # Local HTTP server for testing
├── config/                 # Configuration files
├── package.json            # npm configuration
├── wrangler.toml          # Cloudflare Workers configuration
└── README.md               # This file
```

## Quick Start

### Local Testing with Miniflare

1. Install dependencies:
   ```bash
   cd anbox-iptv
   npm install
   ```

2. Start Miniflare server:
   ```bash
   npm run dev
   ```

3. Test endpoints:
   ```bash
   # Get playlist (IPTV player User-Agent)
   curl -H "User-Agent: IPTVExtreme" http://localhost:8787/playlist.m3u
   
   # Get playlist (browser - should be blocked)
   curl -H "User-Agent: Mozilla" http://localhost:8787/playlist.m3u
   
   # Check server status
   curl http://localhost:8787/
   ```

### Probe IPTV Portals

To discover available channels from the configured portals:

```bash
npm run probe
```

This will:
- Test all 50+ PROBE_URLS to find alive portals
- Fetch channel lists from accessible portals
- Show channel counts, categories, and sample channels
- Identify priority "keep" channels

### Deploy to Cloudflare Workers

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```

2. Login to Cloudflare:
   ```bash
   wrangler login
   ```

3. Create KV namespaces:
   ```bash
   wrangler kv:namespace create playlists
   wrangler kv:namespace create portalist
   ```

4. Update `wrangler.toml` with the namespace IDs

5. Deploy:
   ```bash
   wrangler deploy
   ```

## Configuration

### Main Script Configuration

Edit `src/anbox-iptv-worker.js` to modify:

- **PROBE_URLS**: IPTV provider endpoints to test
- **customDomain**: Your public domain
- **KEEP_CHANNELS**: Channels to always include
- **DEFAULT_MARKERS**: Category markers to include
- **CH_DUPLICATION_RULES**: Duplicate channels with different group titles

### Channel Filtering

The script filters channels based on:

1. **Priority Keep List** (`KEEP_CHANNELS`): Always included regardless of category
2. **Category Markers** (`DEFAULT_MARKERS`): Channels in these categories are included
3. **Duplication Rules** (`CH_DUPLICATION_RULES`): Creates duplicate entries with modified group titles

## Usage

### For IPTV Players

Add the playlist URL to your IPTV player:
```
https://your-domain.workers.dev/playlist.m3u
```

Supported players:
- IPTV Extreme
- VLC
- OttNavigator
- Perfect Player
- StbEmu

### For Browsers

Browsers are blocked by default. To allow browser access, modify the User-Agent check in the script.

## Probed Channel Results

From our testing, we found:

- **5 out of 50 portals** are accessible from your IP
- **7,000-20,000+ channels** per portal
- **400-450 priority channels** matching the KEEP_CHANNELS list
- **100-450+ categories** per portal

### Alive Portals
1. sbhgoldpro6 - 17,675 channels, 411 categories
2. dinofox2 - 20,973 channels, 458 categories
3. debit - 20,972 channels, 458 categories
4. sbhgoldpro5 - 20,973 channels, 458 categories
5. diinox - 7,743 channels, 128 categories

### Sample Categories
- GENERAL (FHD, UHD, SD)
- SPORT
- CINEMA HEVC
- INFO HEVC
- ENFANT HEVC (Kids)
- DIVERTISSEMENT (Entertainment)
- FRANCE REGIONAL
- USA GENERAL/MOVIES/NEWS/MUSIC
- 4K/UHD channels

## Tips

1. **MAC Addresses**: The hardcoded MAC addresses in PROBE_URLS may be tied to specific subscriptions. Replace them with your own if needed.

2. **Authentication**: Some portals may require additional authentication beyond MAC/token.

3. **Rate Limiting**: Probing many URLs can hit rate limits. The script includes caching to minimize requests.

4. **Legal Considerations**: Ensure you have rights to access/distribute these streams.

## License

MIT
