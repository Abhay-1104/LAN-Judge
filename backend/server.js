require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const http = require('http');
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] server stayed up, but this should be investigated:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection] server stayed up, but this should be investigated:', err);
});
const authRoutes = require('./routes/auth');
const problemRoutes = require('./routes/problems');
const submissionRoutes = require('./routes/submissions');
const contestRoutes = require('./routes/contests');
const statsRoutes = require('./routes/stats');
const userRoutes = require('./routes/users');
const settingsRoutes = require('./routes/settings');
const systemRoutes = require('./routes/system');
const exportRoutes = require('./routes/export');
const quizRoutes = require('./routes/quiz');
const discussionRoutes = require('./routes/discussions');
const solutionRoutes = require('./routes/solutions');
const uploadRoutes = require('./routes/uploads');
const importRoutes = require('./routes/import');
const { ensureCert, getLanIps } = require('./certs');
const { setupWebSocketServer } = require('./ws');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'LocalJudge API' }));

// Serve uploaded profile pictures only — deliberately NOT the whole
// uploads/ tree (uploads/testcases holds answer keys and must never be
// publicly reachable).
app.use('/uploads/avatars', express.static(path.join(__dirname, 'uploads', 'avatars')));
app.use('/uploads/images', express.static(path.join(__dirname, 'uploads', 'images')));

app.use('/api/auth', authRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/contests', contestRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/discussions', discussionRoutes);
app.use('/api/solutions', solutionRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/import', importRoutes);

// Serve the built frontend in production so the whole app is one server on the LAN
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(distPath));
app.get(/^\/(?!api).*/, (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) next();
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';

// HTTPS is required for camera/mic (proctoring) to work on a plain LAN IP —
// browsers block getUserMedia() on insecure (non-HTTPS, non-localhost)
// origins. Set DISABLE_HTTPS=1 in .env if you don't need proctoring and
// prefer plain HTTP (e.g. simpler local testing).
let server;
if (process.env.DISABLE_HTTPS === '1') {
  server = http.createServer(app);
} else {
  const { key, cert } = ensureCert();
  server = https.createServer({ key, cert }, app);
}

setupWebSocketServer(server);

server.listen(PORT, HOST, () => {
  const scheme = process.env.DISABLE_HTTPS === '1' ? 'http' : 'https';
  console.log(`LocalJudge API running at ${scheme}://${HOST}:${PORT}`);
  const ips = getLanIps();
  if (ips.length) {
    console.log('On your LAN, students can reach it at:');
    ips.forEach((ip) => console.log(`  ${scheme}://${ip}:${PORT}`));
  } else {
    console.log('On your LAN, students can reach it at your machine\'s IP address.');
  }
  if (scheme === 'https') {
    console.log('\nNote: this uses a self-signed certificate. Browsers will show a');
    console.log('"not secure" warning the first time — click "Advanced" then "Proceed"');
    console.log('to continue. This is expected and safe on a trusted classroom LAN.');
  }
});
