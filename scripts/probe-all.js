#!/usr/bin/env node
/**
 * Probe all portals and generate status report
 * Checks: expiry, channel count, category count, stream health
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { PROBE_URLS } = require('./portals.js');

const PORTAL_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; MAG200 stb)',
  'Accept': '*/*'
};

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: options.headers || PORTAL_HEADERS,
      timeout: options.timeout || 15000
    };
    
    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    
    req.end();
  });
}

function extractMac(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('mac') || null;
  } catch {
    return null;
  }
}

function extractBaseUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? ':' + parsed.port : ''}`;
  } catch {
    return url;
  }
}

async function probePortal(name, url) {
  const mac = extractMac(url);
  const baseUrl = extractBaseUrl(url);
  
  const now = new Date().toISOString();
  const result = {
    name,
    url,
    mac,
    lastProbe: now,
    status: 'unknown',
    expiry: null,
    expiryDays: null,
    channelCount: 0,
    categoryCount: 0,
    categories: [],
    streamTest: null,
    error: null
  };
  
  // 1. Check expiry via account_info endpoint
  try {
    const expiryUrl = `${baseUrl}/portal.php?type=account_info&action=get_main_info&JsHttpRequest=1-xml`;
    const resp = await fetchUrl(expiryUrl, {
      headers: { 'Cookie': `mac=${mac}`, ...PORTAL_HEADERS }
    });
    
    if (resp.status === 200) {
      const jsonMatch = resp.data.match(/\{.*\}/s);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        const js = data.js || {};
        const expiryStr = js.phone || js.exp_date || js.expiry;
        
        if (expiryStr) {
          result.expiry = expiryStr;
          // Parse date
          const dateMatch = expiryStr.match(/(\w+ \d+, \d{4})/);
          if (dateMatch) {
            const expiryDate = new Date(dateMatch[1]);
            const today = new Date();
            result.expiryDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
          }
        }
      }
    }
  } catch (e) {
    result.error = `Expiry check failed: ${e.message}`;
  }
  
  // 2. Get channel list and count categories
  try {
    const channelUrl = `${baseUrl}/portal.php?type=itv&action=get_all_channels&JsHttpRequest=1-xml`;
    const resp = await fetchUrl(channelUrl, {
      headers: { 'Cookie': `mac=${mac}`, ...PORTAL_HEADERS }
    });
    
    if (resp.status === 200) {
      const jsonMatch = resp.data.match(/\{.*\}/s);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        const channels = data.js?.data || [];
        result.channelCount = channels.length;
        
        // Count unique categories (group-title)
        const categorySet = new Set();
        for (const ch of channels) {
          const genreId = ch.tv_genre_id;
          if (genreId) categorySet.add(genreId);
        }
        result.categoryCount = categorySet.size;
        
        // Sample a few categories
        const genreMap = {};
        for (const ch of channels.slice(0, 100)) {
          const genreId = ch.tv_genre_id;
          if (genreId) {
            genreMap[genreId] = (genreMap[genreId] || 0) + 1;
          }
        }
        result.categories = Object.entries(genreMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([id, count]) => `Genre ${id}: ${count}`);
        
        // Test first stream
        if (channels.length > 0 && channels[0].cmd) {
          const cmd = channels[0].cmd;
          const streamMatch = cmd.match(/(https?:\/\/[^\s"\\]+)/);
          if (streamMatch) {
            try {
              const streamResp = await fetchUrl(streamMatch[1], { timeout: 5000 });
              result.streamTest = streamResp.status;
            } catch {
              result.streamTest = 'error';
            }
          }
        }
      }
    } else {
      result.status = 'portal_error';
    }
  } catch (e) {
    result.error = `Channel fetch failed: ${e.message}`;
    result.status = 'error';
  }
  
  // Save detailed results as JSON for build-m3u.js to use
  const statusData = {
    lastUpdated: now,
    portals: portals.map(p => ({
      name: p.name,
      url: p.url,
      mac: p.mac,
      lastProbe: p.lastProbe,
      status: p.status,
      expiry: p.expiry,
      expiryDays: p.expiryDays,
      channelCount: p.channelCount,
      categoryCount: p.categoryCount
    }))
  };
  
  const statusPath = path.join(__dirname, '../portal-status.json');
  fs.writeFileSync(statusPath, JSON.stringify(statusData, null, 2));
  
  // Determine status
  if (result.channelCount > 0) {
    result.status = 'working';
  } else if (result.error) {
    result.status = 'error';
  } else {
    result.status = 'no_channels';
  }
  
  return result;
}

async function main() {
  console.log('🔍 Probing all portals...\n');
  
  const results = await Promise.allSettled(
    Object.entries(PROBE_URLS).map(([name, url]) => probePortal(name, url))
  );
  
  const portals = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
  
  // Sort by expiry days (soonest first)
  portals.sort((a, b) => {
    if (a.expiryDays === null && b.expiryDays === null) return 0;
    if (a.expiryDays === null) return 1;
    if (b.expiryDays === null) return -1;
    return a.expiryDays - b.expiryDays;
  });
  
  // Generate markdown report
  const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
  let md = `# IPTV Portal Status Report\n\n`;
  md += `**Generated:** ${now}\n\n`;
  md += `## Summary\n\n`;
  
  const working = portals.filter(p => p.status === 'working').length;
  const expired = portals.filter(p => p.expiryDays !== null && p.expiryDays <= 0).length;
  const expiringSoon = portals.filter(p => p.expiryDays !== null && p.expiryDays > 0 && p.expiryDays <= 30).length;
  const active = portals.filter(p => p.expiryDays !== null && p.expiryDays > 30).length;
  const errors = portals.filter(p => p.status === 'error').length;
  const noInfo = portals.filter(p => p.expiryDays === null && p.status !== 'error').length;
  
  md += `- **Total Portals:** ${portals.length}\n`;
  md += `- **Working:** ${working}\n`;
  md += `- **Active (>30 days):** ${active}\n`;
  md += `- **Expiring Soon (≤30 days):** ${expiringSoon}\n`;
  md += `- **Expired:** ${expired}\n`;
  md += `- **Errors:** ${errors}\n`;
  md += `- **No Expiry Info:** ${noInfo}\n\n`;
  
  // Total stats
  const totalChannels = portals.reduce((sum, p) => sum + p.channelCount, 0);
  const totalCategories = new Set(portals.flatMap(p => p.categories.map(c => c.split(':')[0]))).size;
  md += `- **Total Channels (all portals):** ${totalChannels.toLocaleString()}\n`;
  md += `- **Total Unique Categories:** ~${totalCategories}\n\n`;
  
  // Expiry Table
  md += `## Expiry Status\n\n`;
  md += `| Portal | MAC | Expiry Date | Days Left | Channels | Status |\n`;
  md += `|--------|-----|-------------|-----------|----------|--------|\n`;
  
  for (const p of portals) {
    const mac = p.mac ? `**${p.mac}**` : '-';
    const expiry = p.expiry || '-';
    const days = p.expiryDays !== null ? (p.expiryDays <= 0 ? `❌ ${p.expiryDays}` : p.expiryDays > 30 ? `✓ ${p.expiryDays}` : `⚠ ${p.expiryDays}`) : '-';
    const channels = p.channelCount > 0 ? p.channelCount.toLocaleString() : '0';
    
    let statusIcon = '✓';
    if (p.status === 'error') statusIcon = '✗';
    else if (p.expiryDays !== null && p.expiryDays <= 0) statusIcon = '❌';
    else if (p.expiryDays !== null && p.expiryDays <= 30) statusIcon = '⚠';
    
    md += `| ${p.name} | ${mac} | ${expiry} | ${days} | ${channels} | ${statusIcon} |\n`;
  }
  
  // Detailed breakdown
  md += `\n## Working Portals (${working})\n\n`;
  for (const p of portals.filter(p => p.status === 'working')) {
    md += `### ${p.name}\n\n`;
    md += `- **MAC:** ${p.mac}\n`;
    md += `- **Channels:** ${p.channelCount.toLocaleString()}\n`;
    md += `- **Categories:** ${p.categoryCount}\n`;
    md += `- **Expiry:** ${p.expiry || 'N/A'}\n`;
    md += `- **Days Left:** ${p.expiryDays !== null ? p.expiryDays : 'N/A'}\n`;
    md += `- **Stream Test:** ${p.streamTest ? 'HTTP ' + p.streamTest : 'N/A'}\n`;
    if (p.categories && p.categories.length > 0) {
      md += `- **Top Categories:** ${p.categories.slice(0, 5).join(', ')}\n`;
    }
    md += `\n`;
  }
  
  // Error portals
  if (errors > 0) {
    md += `## Error Portals (${errors})\n\n`;
    for (const p of portals.filter(p => p.status === 'error')) {
      md += `- **${p.name}:** ${p.error || 'Unknown error'}\n`;
    }
    md += `\n`;
  }
  
  // Expiring soon
  if (expiringSoon > 0) {
    md += `## ⚠️ Expiring Soon (≤30 days)\n\n`;
    for (const p of portals.filter(p => p.expiryDays !== null && p.expiryDays > 0 && p.expiryDays <= 30)) {
      md += `- **${p.name}:** ${p.expiry} (${p.expiryDays} days left)\n`;
    }
    md += `\n`;
  }
  
  // Expired
  if (expired > 0) {
    md += `## ❌ Expired Portals\n\n`;
    for (const p of portals.filter(p => p.expiryDays !== null && p.expiryDays <= 0)) {
      md += `- **${p.name}:** ${p.expiry} (expired ${Math.abs(p.expiryDays)} days ago)\n`;
    }
    md += `\n`;
  }
  
  // Save report
  const reportPath = path.join(__dirname, '../PORTAL_STATUS.md');
  fs.writeFileSync(reportPath, md);
  console.log(`✅ Report saved to PORTAL_STATUS.md`);
  
  // Also print summary to console
  console.log(`\n=== SUMMARY ===`);
  console.log(`Working: ${working}/${portals.length}`);
  console.log(`Active (>30d): ${active}`);
  console.log(`Expiring Soon (≤30d): ${expiringSoon}`);
  console.log(`Expired: ${expired}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total Channels: ${totalChannels.toLocaleString()}`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
