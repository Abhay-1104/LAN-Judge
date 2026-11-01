const fs = require('fs');
const path = require('path');
const os = require('os');
const selfsigned = require('selfsigned');

const CERT_DIR = path.join(__dirname, '..', 'certs');
const KEY_PATH = path.join(CERT_DIR, 'key.pem');
const CERT_PATH = path.join(CERT_DIR, 'cert.pem');

function getLanIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

/**
 * Camera/microphone access (getUserMedia) is only allowed by browsers on a
 * "secure context" — HTTPS, or exactly "localhost". A plain LAN address like
 * http://192.168.1.42:4000 is treated as insecure, so proctoring would
 * silently fail to get camera/mic permission. This generates a self-signed
 * cert covering localhost + every LAN IP found on this machine, so HTTPS
 * works out of the box. Students will see a one-time "not secure" warning
 * in their browser the first time they connect — that's expected for a
 * self-signed cert and is safe to click through on a trusted classroom LAN.
 */
function ensureCert() {
  if (fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) {
    return { key: fs.readFileSync(KEY_PATH), cert: fs.readFileSync(CERT_PATH) };
  }

  fs.mkdirSync(CERT_DIR, { recursive: true });

  const lanIps = getLanIps();
  const altNames = [
    { type: 2, value: 'localhost' }, // DNS
    { type: 7, ip: '127.0.0.1' }, // IP
    ...lanIps.map((ip) => ({ type: 7, ip })),
  ];

  const attrs = [{ name: 'commonName', value: 'localjudge.local' }];
  const pems = selfsigned.generate(attrs, {
    days: 3650,
    keySize: 2048,
    extensions: [{ name: 'subjectAltName', altNames }],
  });

  fs.writeFileSync(KEY_PATH, pems.private);
  fs.writeFileSync(CERT_PATH, pems.cert);

  return { key: pems.private, cert: pems.cert };
}

module.exports = { ensureCert, getLanIps };
