#!/usr/bin/env node
/**
 * Scan for Adult/18+ Channels in IPTV Portals
 */

const fs = require('fs');
const path = require('path');

// Load PROBE_URLS
const scriptPath = path.join(__dirname, '../src/anbox-iptv-worker.js');
const script = fs.readFileSync(scriptPath, 'utf8');

const probeUrlsMatch = script.match(/const PROBE_URLS = \{([\s\S]*?)\};/);
const probeUrlsStr = `{${probeUrlsMatch[1]}}`;
let PROBE_URLS;
try {
  const getProbeUrls = new Function(`return ${probeUrlsStr};`);
  PROBE_URLS = getProbeUrls();
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

// Adult keywords to detect
const ADULT_KEYWORDS = [
  'adult', '18+', 'xxx', 'porn', 'nsfw', 'erotic', 'hustler', 'playboy',
  'penthouse', 'brazzers', 'bang bros', 'adult swim', 'nudity', 'sexual',
  'nude', 'softcore', 'hardcore', 'pussy', 'dick', 'cock', 'ass', 'boobs',
  'tits', 'porn', 'xxx', 'hot', 'sexy', 'adult entertainment', 'adult channels'
];

// Test a portal and return adult channels
async function scanPortal(name, url) {
  try {
    const u = new URL(url);
    const portalBase = u.origin;
    const mac = u.searchParams.get("mac");

    const portalUrl = `${portalBase}/portal.php?type=itv&action=get_all_channels&JsHttpRequest=1-xml`;

    const response = await fetch(portalUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; MAG200 stb)",
        "Cookie": `mac=${mac}`
      }
    });

    if (!response.ok) {
      return { name, error: `HTTP ${response.status}`, adultChannels: [] };
    }

    const text = await response.text();
    const jsonStr = text.match(/\{.*\}/s);

    if (!jsonStr) {
      return { name, error: "No JSON", adultChannels: [] };
    }

    const json = JSON.parse(jsonStr[0]);
    const channels = json.js?.data || json.js || [];

    // Filter adult channels
    const adultChannels = channels.filter(ch => {
      const channelName = (ch.name || '').toLowerCase();
      return ADULT_KEYWORDS.some(keyword => channelName.includes(keyword.toLowerCase()));
    });

    return {
      name,
      totalChannels: channels.length,
      adultChannels: adultChannels.map(ch => ({
        id: ch.id,
        name: ch.name,
        category: extractCategory(ch.name)
      }))
    };

  } catch (error) {
    return { name, error: error.message, adultChannels: [] };
  }
}

function extractCategory(name) {
  // Try to extract category from channel name
  const match = name.match(/^###\s*([A-Z\s]+)\s*###$/);
  if (match) return match[1].trim();

  // Check for common patterns
  if (/^(UK|USA|FR|SP|IT|DE)/.test(name)) {
    if (/SPORT/.test(name)) return 'SPORT';
    if (/MOVIE|FILM|CINEMA/.test(name)) return 'MOVIE';
    if (/ADULT|18\+|XXX|PORN/.test(name)) return 'ADULT';
  }

  return 'UNKNOWN';
}

// Main scan
async function main() {
  console.log('\n🔍 SCANNING FOR ADULT/18+ CHANNELS');
  console.log('='.repeat(70));
  console.log(`Testing ${Object.keys(PROBE_URLS).length} portals...\n`);

  const results = [];
  let totalAdultChannels = 0;

  // Test first 3 portals to save time
  const portalsToTest = Object.entries(PROBE_URLS).slice(0, 3);

  for (const [name, url] of portalsToTest) {
    console.log(`📡 Scanning ${name}...`);
    const result = await scanPortal(name, url);
    results.push(result);

    if (result.error) {
      console.log(`   ⚠️  Error: ${result.error}`);
    } else {
      const adultCount = result.adultChannels.length;
      totalAdultChannels += adultCount;
      console.log(`   ✅ Total: ${result.totalChannels} channels`);
      console.log(`   🎬 Adult channels found: ${adultCount}`);

      if (adultCount > 0) {
        // Group by category
        const byCategory = {};
        result.adultChannels.forEach(ch => {
          const cat = ch.category || 'Unknown';
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(ch);
        });

        console.log(`   📊 By category:`);
        Object.entries(byCategory).forEach(([cat, channels]) => {
          console.log(`      ${cat}: ${channels.length}`);
        });

        console.log(`   Sample channels:`);
        result.adultChannels.slice(0, 5).forEach((ch, i) => {
          console.log(`      ${i + 1}. ${ch.name}`);
        });
      }
    }
    console.log('');
  }

  console.log('='.repeat(70));
  console.log(`📊 SUMMARY: Found ${totalAdultChannels} adult channels across ${results.filter(r => r.adultChannels.length > 0).length} portals`);
  console.log('\n💡 If adult channels are found, they will be included in your playlist.');
  console.log('   If not, check if the adult keywords need to be updated.\n');
}

main().catch(console.error);
