#!/usr/bin/env node
/**
 * Accurate Adult Channel Scanner
 * Uses precise keywords to avoid false positives
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

// Accurate adult keywords (avoiding false positives)
const ADULT_KEYWORDS = [
  'hustler', 'playboy', 'penthouse', 'brazzers', 'bang bros',
  'adult swim', 'xxx', '18+', 'porn', 'nsfw', 'erotic',
  'erotik', 'nude', 'nudity', 'softcore', 'hardcore',
  'adult movies', 'adult channels', 'adult entertainment',
  'adult hd', 'adult fhd', 'adult 4k',
  'xxx movies', 'porn movies', '18+ movies'
];

// More specific patterns to avoid false positives
function isAdultChannel(name) {
  if (!name) return false;

  const lower = name.toLowerCase();

  // Exact adult brand names
  const adultBrands = ['hustler', 'playboy', 'penthouse', 'brazzers', 'bang bros', 'adult swim'];
  const hasAdultBrand = adultBrands.some(brand => lower.includes(brand));

  // Explicit adult terms
  const adultTerms = ['xxx', '18+', 'porn', 'nsfw', 'erotic', 'erotik', 'nudity', 'softcore', 'hardcore'];
  const hasAdultTerm = adultTerms.some(term => lower.includes(term));

  // Adult category markers
  const adultCategories = ['adult movies', 'adult channels', 'adult entertainment'];
  const hasAdultCategory = adultCategories.some(cat => lower.includes(cat));

  return hasAdultBrand || hasAdultTerm || hasAdultCategory;
}

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

    const adultChannels = channels.filter(ch => isAdultChannel(ch.name));

    return { name, totalChannels: channels.length, adultChannels };

  } catch (error) {
    return { name, error: error.message, adultChannels: [] };
  }
}

async function main() {
  console.log('\n🔍 ACCURATE ADULT CHANNEL SCANNER');
  console.log('='.repeat(70));

  const results = [];
  let totalAdult = 0;

  // Test all portals
  for (const [name, url] of Object.entries(PROBE_URLS)) {
    process.stdout.write(`📡 Scanning ${name}... `);

    const result = await scanPortal(name, url);
    results.push(result);

    if (result.error) {
      console.log(`❌ Error: ${result.error}`);
    } else {
      const adultCount = result.adultChannels.length;
      totalAdult += adultCount;

      if (adultCount > 0) {
        console.log(`✅ ${adultCount} adult channels (out of ${result.totalChannels} total)`);
      } else {
        console.log(`✅ No adult channels found`);
      }

      // Show samples if found
      if (adultCount > 0 && result.adultChannels.length > 0) {
        console.log(`   Sample: ${result.adultChannels[0].name}`);
        if (result.adultChannels.length > 1) {
          console.log(`           ${result.adultChannels[1].name}`);
        }
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`📊 FINAL SUMMARY:`);
  console.log(`   Total portals scanned: ${results.length}`);
  console.log(`   Portals with adult content: ${results.filter(r => r.adultChannels.length > 0).length}`);
  console.log(`   Total adult channels found: ${totalAdult}`);

  if (totalAdult > 0) {
    console.log(`\n✅ SUCCESS! Adult channels will be included in your playlist.`);
    console.log(`   The DEFAULT_MARKERS array already includes: ADULT, 18+, XXX, PORN, etc.`);
  } else {
    console.log(`\n⚠️  No adult channels found with current keywords.`);
    console.log(`   You can add more keywords to the ADULT_KEYWORDS array.`);
  }
}

main().catch(console.error);
