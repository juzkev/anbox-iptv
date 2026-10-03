const https = require('https');
const url = "http://debitmaxi.com:80/portal.php?type=itv&action=get_all_channels&JsHttpRequest=1-xml";

const req = https.request(url, { method: 'GET', headers: { Cookie: 'mac=00:1A:79:ca:e9:38' } }, (res) => {
  console.log('Status:', res.statusCode);
  res.on('data', chunk => console.log('Data:', chunk.toString().slice(0,200)));
}).on('error', e => console.log('Error:', e.message));

req.end();
