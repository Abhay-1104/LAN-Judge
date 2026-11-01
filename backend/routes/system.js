const express = require('express');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const db = require('../db/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Same commands the judge engine itself uses (backend/judge/judge.js) — kept
// in sync deliberately so "installed" here always means "the judge can
// actually use it", not just "something with this name exists on PATH".
const COMPILERS = [
  { key: 'python3', label: 'Python 3', candidates: ['python3', 'python', 'py'], args: ['--version'] },
  { key: 'node', label: 'JavaScript (Node.js)', candidates: ['node'], args: ['--version'] },
  { key: 'gpp', label: 'C++ (GCC/G++)', candidates: ['g++', 'gcc'], args: ['--version'] },
  { key: 'javac', label: 'Java (OpenJDK)', candidates: ['javac'], args: ['-version'] },
];

function checkCompiler({ candidates, args }) {
  for (const cmd of candidates) {
    try {
      const result = spawnSync(cmd, args, { timeout: 3000, encoding: 'utf8' });
      if (result.error) continue;
      const out = (result.stdout || result.stderr || '').trim().split('\n')[0];
      // On Windows, Microsoft stub outputs "Python was not found..."
      if (out.toLowerCase().includes('not found') || out.toLowerCase().includes('microsoft store')) {
        continue;
      }
      if (result.status === 0 || !!out) {
        return { installed: true, version: out, cmd };
      }
    } catch {
      continue;
    }
  }
  return { installed: false, version: null };
}

function localIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push({ interface: name, address: net.address });
    }
  }
  return ips;
}

// Download local SSL certificate so other lab PCs/laptops can install it and trust HTTPS
router.get('/certificate', (req, res) => {
  const certPath = path.join(__dirname, '..', '..', 'certs', 'cert.pem');
  if (fs.existsSync(certPath)) {
    res.setHeader('Content-Disposition', 'attachment; filename="localjudge-root-ca.crt"');
    res.setHeader('Content-Type', 'application/x-x509-ca-cert');
    return res.sendFile(certPath);
  }
  res.status(404).json({ error: 'Certificate not found' });
});

// Admin: compiler availability + host IP(s), so a professor can catch a
// missing g++/javac on a lab machine before students sit down, not mid-exam.
router.get('/diagnostics', requireAuth, requireAdmin, (req, res) => {
  const compilers = {};
  for (const c of COMPILERS) compilers[c.key] = { label: c.label, ...checkCompiler(c) };
  res.json({
    hostIps: localIps(),
    port: process.env.PORT || 4000,
    compilers,
    allReady: Object.values(compilers).every((c) => c.installed),
    sandboxDir: os.tmpdir(),
    nodeVersion: process.version,
    platform: `${os.platform()} ${os.release()}`,
  });
});

// Admin: RAM/uptime — a rough early-warning sign the host machine is getting
// overloaded before submissions start timing out for reasons that have
// nothing to do with the students' actual code.
router.get('/health', requireAuth, requireAdmin, (req, res) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const used = totalMem - freeMem;
  res.json({
    ram: {
      totalMb: Math.round(totalMem / 1024 / 1024),
      usedMb: Math.round(used / 1024 / 1024),
      freeMb: Math.round(freeMem / 1024 / 1024),
      usedPct: Math.round((used / totalMem) * 1000) / 10,
    },
    process: {
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      uptimeSec: Math.round(process.uptime()),
    },
    loadAvg: os.loadavg(), // [] on Windows, meaningful on Linux/macOS lab machines
    cpuCount: os.cpus().length,
  });
});

// Admin: a lightweight "live feed" the dashboard polls every few seconds —
// intentionally polling rather than another WebSocket channel, since this
// needs to show submissions from *any* problem/contest, not just one
// contest's room, and polling here is simple and doesn't touch the existing
// per-contest WS code at all.
router.get('/recent-submissions', requireAuth, requireAdmin, (req, res) => {
  const since = req.query.sinceId ? Number(req.query.sinceId) : 0;
  const rows = db
    .prepare(
      `SELECT s.id, u.name as student, p.title as problem, s.verdict, s.language, s.runtime_ms, s.memory_kb, s.submitted_at
       FROM submissions s JOIN users u ON u.id=s.user_id JOIN problems p ON p.id=s.problem_id
       WHERE s.id > ? ORDER BY s.id DESC LIMIT 50`
    )
    .all(since);
  res.json({ submissions: rows });
});

// Admin: hourly AC vs non-AC counts for the last 24h, for the velocity chart.
router.get('/velocity', requireAuth, requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT strftime('%Y-%m-%d %H:00', submitted_at) hour,
        SUM(CASE WHEN verdict='Accepted' THEN 1 ELSE 0 END) accepted,
        SUM(CASE WHEN verdict!='Accepted' THEN 1 ELSE 0 END) failed
       FROM submissions
       WHERE submitted_at >= datetime('now', '-24 hours')
       GROUP BY hour ORDER BY hour ASC`
    )
    .all();
  const totalToday = db.prepare(`SELECT COUNT(*) c FROM submissions WHERE submitted_at >= datetime('now', '-24 hours')`).get().c;
  const accepted24h = db.prepare(`SELECT COUNT(*) c FROM submissions WHERE submitted_at >= datetime('now', '-24 hours') AND verdict='Accepted'`).get().c;
  res.json({ hourly: rows, totalToday, accepted24h, failed24h: totalToday - accepted24h });
});

module.exports = router;
