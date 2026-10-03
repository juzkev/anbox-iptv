const fs = require('fs');
const path = require('path');

const scriptPath = path.join(__dirname, '../src/anbox-iptv-worker.js');
const script = fs.readFileSync(scriptPath, 'utf8');

const probeUrlsMatch = script.match(/const PROBE_URLS = \{([\s\S]*?)\};/);
const PROBE_URLS = new Function(`return {${probeUrlsMatch[1]}};`)();

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
        let currentCategory = "UNKNOWN";

        channels.forEach(ch => {
            const chName = (ch.name || '').trim();
            const lower = chName.toLowerCase();

            // Track current category (markers: ### Category ###)
            if (chName.startsWith('###') && chName.endsWith('###')) {
                currentCategory = chName.replace(/#/g, '').trim();
                categories.add(currentCategory);
            }

            // Detect Explicit
            if (EXPLICIT_KEYWORDS.some(kw => lower.includes(kw))) {
                explicitChannels.push({ 
                    name: chName, 
                    id: ch.id,
                    category: currentCategory,
                    portal: name
                });
            }
        });

        return { name, categories: Array.from(categories), explicitChannels };
    } catch (e) {
        return { name, error: e.message };
    }
}

async function main() {
    console.log('🚀 Scanning ALL portals with source tracking...');
    
    const allCategories = new Set();
    const allExplicit = [];
    const portKeys = Object.keys(PROBE_URLS);

    for (const key of portKeys) {
        process.stdout.write(`Scanning ${key}... `);
        const res = await scanPortal(key, PROBE_URLS[key]);
        
        if (res.error) {
            console.log(`❌ ${res.error}`);
        } else {
            console.log(`✅ ${res.categories.length} cats, ${res.explicitChannels.length} explicit`);
            res.categories.forEach(c => allCategories.add(c));
            allExplicit.push(...res.explicitChannels);
        }
    }

    console.log('\n--- SUMMARY ---');
    console.log(`Unique Categories: ${allCategories.size}`);
    console.log(`Explicit Channels: ${allExplicit.length}`);

    // Save detailed explicit channels with source
    fs.writeFileSync('explicit_channels_detailed.json', JSON.stringify(allExplicit, null, 2));
    fs.writeFileSync('all_categories.txt', Array.from(allCategories).sort().join('\n'));
    
    console.log('\n✅ Saved:');
    console.log('  - scripts/explicit_channels_detailed.json (with portal & category)');
    console.log('  - scripts/all_categories.txt');
}

main();