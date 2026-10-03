#!/usr/bin/env node
/**
 * Probe IPTV portals to discover available channels
 * This script tests each PROBE_URL and attempts to fetch channel lists
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

// Parse the PROBE_URLS object - use Function constructor to safely eval
const probeUrlsStr = `{${probeUrlsMatch[1]}}`;
let PROBE_URLS;
try {
  // Use Function to create a safe evaluation context
  const getProbeUrls = new Function(`return ${probeUrlsStr};`);
  PROBE_URLS = getProbeUrls();
} catch (error) {
  console.error('❌ Could not parse PROBE_URLS:', error.message);
  process.exit(1);
}

console.log(`🔍 Found ${Object.keys(PROBE_URLS).length} probe URLs`);
console.log('='.repeat(70));

// Function to probe a single portal
async function probePortal(name, url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    
    // Use node-fetch or native fetch
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; MAG200 stb)",
        "Cookie": `mac=${new URL(url).searchParams.get("mac")}`
      },
      redirect: "manual",
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if ([200, 206, 302].includes(response.status)) {
      return { name, url, status: response.status, alive: true };
    }
    
    return { name, url, status: response.status, alive: false };
  } catch (error) {
    return { name, url, status: null, alive: false, error: error.message };
  }
}

// Function to get channels from a portal
async function getChannelsFromPortal(name, url) {
  try {
    const u = new URL(url);
    const portalBase = u.origin;
    const mac = u.searchParams.get("mac");
    const token = u.searchParams.get("play_token");
    
    const channelUrl = `${portalBase}/portal.php?type=itv&action=get_all_channels&JsHttpRequest=1-xml`;
    
    console.log(`   🔄 Fetching channels from: ${channelUrl}`);
    
    const response = await fetch(channelUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; MAG200 stb)",
        "Cookie": `mac=${mac}`
      }
    });
    
    if (!response.ok) {
      return { name, error: `HTTP ${response.status}`, status: response.status };
    }
    
    const text = await response.text();
    
    // Try to extract JSON from response
    const jsonStr = text.match(/\{.*\}/s);
    
    if (!jsonStr) {
      // Maybe it's XML or another format
      if (text.includes('<js>')) {
        // Try to parse as XML
        return { name, error: "XML format not yet supported", raw: text.substring(0, 200) };
      }
      return { name, error: "No JSON found in response", raw: text.substring(0, 200) };
    }
    
    let json;
    try {
      json = JSON.parse(jsonStr[0]);
    } catch (parseError) {
      return { name, error: "Invalid JSON", raw: jsonStr[0].substring(0, 200) };
    }
    
    const channels = json.js?.data || json.js || [];
    
    if (!Array.isArray(channels)) {
      return { name, error: "No channel array found", raw: JSON.stringify(json).substring(0, 200) };
    }
    
    return { name, channels, count: channels.length };
    
  } catch (error) {
    return { name, error: error.message };
  }
}

// Main function
async function main() {
  console.log('\n🎯 PROBING IPTV PORTALS');
  console.log('='.repeat(70));
  
  // First, probe all URLs to see which are alive
  console.log('\n🔍 Step 1: Probing portal health...\n');
  
  const probeResults = await Promise.all(
    Object.entries(PROBE_URLS).map(([name, url]) => 
      probePortal(name, url).catch(err => ({ name, url, alive: false, error: err.message }))
    )
  );
  
  const alivePortals = probeResults.filter(r => r.alive);
  const deadPortals = probeResults.filter(r => !r.alive);
  
  console.log(`✅ Alive: ${alivePortals.length}/${probeResults.length}`);
  console.log(`❌ Dead/Blocked: ${deadPortals.length}/${probeResults.length}`);
  
  if (alivePortals.length > 0) {
    console.log('\n  ✅ Alive Portals:');
    alivePortals.forEach(p => {
      console.log(`     ✓ ${p.name.padEnd(20)} - ${p.url}`);
    });
  }
  
  if (deadPortals.length > 0) {
    console.log('\n  ❌ Dead/Blocked Portals (first 10):');
    deadPortals.slice(0, 10).forEach(p => {
      const reason = p.error || `HTTP ${p.status}` || 'Timeout/Error';
      console.log(`     ✗ ${p.name.padEnd(20)} - ${reason}`);
    });
    if (deadPortals.length > 10) {
      console.log(`     ... and ${deadPortals.length - 10} more`);
    }
  }
  
  // Now try to get channels from alive portals
  if (alivePortals.length > 0) {
    console.log('\n\n📺 Step 2: Fetching channel lists from alive portals...\n');
    
    // Limit to first 5 alive portals to avoid too many requests
    const portalsToProbe = alivePortals.slice(0, 5);
    
    for (const portal of portalsToProbe) {
      console.log(`\n🔄 Probing ${portal.name}...`);
      const result = await getChannelsFromPortal(portal.name, portal.url);
      
      if (result.error) {
        console.log(`   ⚠️  Error: ${result.error}`);
        if (result.raw) {
          console.log(`   Raw: ${result.raw}...`);
        }
      } else if (result.channels) {
        console.log(`   ✅ Found ${result.count} channels`);
        
        // Categorize channels
        const categories = {};
        const keepChannels = [];
        const otherChannels = [];
        
        result.channels.forEach((ch, i) => {
          const name = (ch.name || 'Unnamed').trim();
          const id = ch.id || 'N/A';
          
          // Check if it's a category marker
          if (name.startsWith('###') && name.endsWith('###')) {
            const category = name.replace(/#/g, '').trim();
            categories[category] = (categories[category] || 0) + 1;
          } else if (name) {
            // Check if it matches KEEP_CHANNELS
            const KEEP_CHANNELS = ["UK - HUB PREMIER", "UK - MAN UNITED FHD", "UK - MUTV", "F1 - SKY SPORTS F1", "UK - TNT SPORTS", "TNT SPORTS", "UK - LFC TV", "STAR SPORTS SELECT", "BEIN SPORTS", "US - FUBO SPORTS"];
            if (KEEP_CHANNELS.some(k => name.toUpperCase().includes(k.toUpperCase()))) {
              keepChannels.push({ name, id });
            } else {
              otherChannels.push({ name, id });
            }
          }
        });
        
        // Show summary
        console.log(`   📊 Summary:`);
        console.log(`      - Category markers: ${Object.keys(categories).length}`);
        console.log(`      - Keep channels: ${keepChannels.length}`);
        console.log(`      - Other channels: ${otherChannels.length}`);
        
        if (Object.keys(categories).length > 0) {
          console.log(`\n   📁 Categories:`);
          Object.entries(categories).slice(0, 10).forEach(([cat, count]) => {
            console.log(`      - ${cat}: ${count}`);
          });
          if (Object.keys(categories).length > 10) {
            console.log(`      ... and ${Object.keys(categories).length - 10} more`);
          }
        }
        
        if (keepChannels.length > 0) {
          console.log(`\n   ⭐ Keep Channels (priority):`);
          keepChannels.slice(0, 10).forEach((ch, i) => {
            console.log(`      ${i + 1}. ${ch.name} (ID: ${ch.id})`);
          });
          if (keepChannels.length > 10) {
            console.log(`      ... and ${keepChannels.length - 10} more`);
          }
        }
        
        if (otherChannels.length > 0) {
          console.log(`\n   📺 Sample Channels:`);
          otherChannels.slice(0, 10).forEach((ch, i) => {
            console.log(`      ${i + 1}. ${ch.name} (ID: ${ch.id})`);
          });
          if (otherChannels.length > 10) {
            console.log(`      ... and ${otherChannels.length - 10} more`);
          }
        }
      }
    }
  } else {
    console.log('\n❌ No alive portals found. Cannot fetch channels.');
    console.log('   This is expected if you are not on a whitelisted IP.');
    console.log('   IPTV providers often block non-subscriber IPs.');
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Probe complete!');
  console.log('\n💡 Notes:');
  console.log('   - Most IPTV providers require authentication');
  console.log('   - Your IP may be blocked if not subscribed');
  console.log('   - Some providers use MAC address whitelisting');
  console.log('   - Response times may vary based on server location');
}

// Run
main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
