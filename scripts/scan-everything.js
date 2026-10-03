const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// Load original script to get PROBE_URLS
const scriptPath = path.join(__dirname, '../src/anbox-iptv-worker.js');
const script = fs.readFileSync(scriptPath, 'utf8');

const probeUrlsMatch = script.match(/const PROBE_URLS = \{([\s\S]*?)\};/);
const PROBE_URLS = new Function(`return {${probeUrlsMatch[1]}};`)();

// High-confidence explicit keywords
const EXPLICIT_KEYWORDS = [
  'hustler', 'playboy', 'penthouse', 'brazzers', 'bangbros', 
  'xxx', 'porn', 'erotic', 'nsfw', 'adult', '18+'
];

async function scanPortal(name, url) {
    try {
        const u = new URL(url);
        const mac = u.searchParams.get("mac");
        const portalUrl = `${u.origin}/portal.php?type=itv&action=get_all_channels&JsHttpRequest=1-xml`;

        const response = await fetch(portalUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; MAG200 stb)", "Cookie": `mac=${mac}` },
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) return { name, error: `HTTP ${response.status}` };

        const text = await response.text();
        const jsonStr = text.match(/\{.*\}/s);
        if (!jsonStr) return { name, error: "No JSON" };

        const json = JSON.parse(jsonStr[0]);
        const channels = json.js?.data || json.js || [];

        const categories = new Set();
        const explicitChannels = [];

        channels.forEach(ch => {
            const name = (ch.name || '').trim();
            const lower = name.toLowerCase();

            // Extract Category (Markers: ### Category ###)
            if (name.startsWith('###') && name.endsWith('###')) {
                categories.add(name.replace(/#/g, '').trim());
            }

            // Detect Explicit (Strict)
            if (EXPLICIT_KEYWORDS.some(kw => lower.includes(kw))) {
                explicitChannels.push({ name: ch.name, id: ch.id });
            }
        });

        return { name, categories: Array.from(categories), explicitChannels };
    } catch (e) {
        return { name, error: e.message };
    }
}

async function runScan() {
    console.log('🚀 Scanning ALL portals (this may take a minute)...');
    
    const results = { allCategories: new Set(), explicit: [] };
    const portKeys = Object.keys(PROBE_URLS);
    
    // Scan in chunks to avoid overwhelming the system
    for (const key of portKeys) {
        process.stdout.write(`Scanning ${key}... `);
        const res = await scanPortal(key, PROBE_URLS[key]);
        
        if (res.error) {
            console.log(`❌ ${res.error}`);
        } else {
            console.log(`✅ ${res.categories.length} categories, ${res.explicitChannels.length} explicit`);
            res.categories.forEach(c => results.allCategories.add(c));
            results.explicit.push(...res.explicitChannels);
        }
    }

    console.log('\n--- REPORT ---');
    console.log(`Total Unique Categories found: ${results.allCategories.size}`);
    console.log(`Total Explicit Channels found: ${results.explicit.length}`);
    
    // Save data
    fs.writeFileSync('all_categories.txt', Array.from(results.allCategories).sort().join('\n'));
    fs.writeFileSync('explicit_channels.json', JSON.stringify(results.explicit, null, 2));
    
    console.log('\n✅ Data saved to scripts/all_categories.txt and scripts/explicit_channels.json');
}

runScan();
