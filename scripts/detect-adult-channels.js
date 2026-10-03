#!/usr/bin/env node
/**
 * Adult Channel Detector
 * This script scans portal channels and identifies adult/18+ content
 */

const fs = require('fs');
const path = require('path');

// Load the original script to extract PROBE_URLS
const scriptPath = path.join(__dirname, '../src/anbox-iptv-worker.js');
const script = fs.readFileSync(scriptPath, 'utf8');

// Extract PROBE_URLS from the script
const probeUrlsMatch = script.match(/const PROBE_URLS = \{([\s\S]*?)\};/);
if (!probeUrlsMatch) {
  console.error('❌ Could not find PROBE_URLS in script');
  process.exit(1);
}

// Parse the PROBE_URLS object
const probeUrlsStr = `{${probeUrlsMatch[1]}}`;
let PROBE_URLS;
try {
  const getProbeUrls = new Function(`return ${probeUrlsStr};`);
  PROBE_URLS = getProbeUrls();
} catch (error) {
  console.error('❌ Could not parse PROBE_URLS:', error.message);
  process.exit(1);
}

console.log(`🔍 Found ${Object.keys(PROBE_URLS).length} probe URLs`);
console.log('='.repeat(70));

// Adult channel detection keywords
const ADULT_KEYWORDS = [
  'adult', '18+', 'xxx', 'porn', 'nsfw', 'erotic', 'hustler', 'playboy',
  'penthouse', 'brazzers', 'bang bros', 'adult swim', 'xxx', 'nudity',
  'sexual', 'nude', 'erotic', 'softcore', 'hardcore', 'pussy', 'dick',
  'cock', 'pussy', 'ass', 'boobs', 'tits', 'porn', 'xxx'
];

// Function to probe a portal and get channels
async function getChannelsFromPortal(name, url) {
  try {
    const u = new URL(url);
    const portalBase = u.origin;
    const mac = u.searchParams.get("mac");
    const token = u.searchParams.get("play_token");

    const channelUrl = `${portalBase}/portal.php?type=itv&action=get_all_channels&JsHttpRequest=1-xml`;

    console.log(`   🔄 Fetching channels from: ${portalUrl}`);

    const response = await fetch(channelUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; MAG200 stb)",
        "Cookie": `mac=${mac}`
      }
    });

    if (!response.ok) {
      return { name, error: `HTTP ${response.status}` };
    }

    const text = await response.text();
    const jsonStr = text.match(/\{.*\}/s);

    if (!jsonStr) {
      return { name, error: "No JSON found in response" };
    }

    const json = JSON.parse(jsonStr[0]);
    const channels = json.js?.data || json.js || [];

    return { name, channels, count: channels.length };

  } catch (error) {
    return { name, error: error.message };
  }
}

// Function to check if channel is adult
function isAdultChannel(name) {
  const channelName = (name || '').toLowerCase();
  return ADULT_KEYWORDS.some(keyword => channelName.includes(keyword.toLowerCase()));
}

// Function to get category for channel
function getCategory(name) {
  // Simple category detection
  if (/adult|18\+|xxx|porn|nsfw/i.test(name)) return 'ADULT';
  if (/sports|sport|football|tennis|f1/i.test(name)) return 'SPORT';
  if (/movie|film|cinema|hd/i.test(name)) return 'MOVIE';
  if (/news|bbc|cnn/i.test(name)) return 'NEWS';
  return 'OTHER';
}

// Main function
async function main() {
  console.log('\n🎯 ADULT CHANNEL DETECTOR');
  console.log('='.repeat(70));
  console.log('This script will scan portals and identify adult/18+ channels\n');

  // Test a few portals first to save time
  const portalsToTest = Object.entries(PROBE_URLS).slice(0, 3);

  console.log('📺 Testing portals for adult channels...\n');

  for (const [name, url] of portalsToTest) {
    console.log(`\n🔍 Scanning ${name}...`);
    console.log('   ' + '-'.repeat(60));

    const result = await getChannelsFromPortal(name, url);

    if (result.error) {
      console.log(`   ⚠️  Error: ${result.error}`);
      continue;
    }

    console.log(`   ✅ Found ${result.count} channels`);

    // Find adult channels
    const adultChannels = result.channels.filter(ch => isAdultChannel(ch.name));
    const adultCategories = new Set();
    const adultByCategory = {};

    adultChannels.forEach(ch => {
      const category = getCategory(ch.name);
      adultCategories.add(category);
      if (!adultByCategory[category]) {
        adultByCategory[category] = [];
      }
      adultByCategory[category].push(ch);
    });

    if (adultChannels.length > 0) {
      console.log(`   🎬 Found ${adultChannels.length} adult channels!`);
      console.log(`   📊 Categories: ${[...adultCategories].join(', ')}`);
      console.log(`\n   Sample Adult Channels:`);
      adultChannels.slice(0, 10).forEach((ch, i) => {
        console.log(`      ${i + 1}. ${ch.name} (ID: ${ch.id})`);
      });
      if (adultChannels.length > 10) {
        console.log(`      ... and ${adultChannels.length - 10} more adult channels`);
      }

      console.log(`\n   📂 By Category:`);
      Object.entries(adultByCategory).forEach(([cat, channels]) => {
        console.log(`      ${cat}: ${channels.length} channels`);
      });
    } else {
      console.log(`   ❌ No adult channels found in this portal`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ Scan complete!\n');

  console.log('💡 Summary:');
  console.log('   - Adult channels are detected using keyword matching');
  console.log('   - The script checks for: adult, 18+, xxx, porn, etc.');
  console.log('   - You can add these keywords to DEFAULT_MARKERS to include them');
  console.log('   - Or add specific channel names to KEEP_CHANNELS\n');

  console.log('📝 To include adult channels in your playlist:');
  console.log('   1. Add keywords to DEFAULT_MARKERS in anbox-iptv-worker.js');
  console.log('   2. Add specific adult channel names to KEEP_CHANNELS');
  console.log('   3. Run: npm run probe to test');
}

// Run
main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
