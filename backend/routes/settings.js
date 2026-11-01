const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Whether a master passkey has been configured at all — used by Register.jsx
// to decide whether to even show the "I have a passkey" field. Never reveals
// the passkey itself, and doesn't require auth since a brand-new professor
// signing up has no account yet.
router.get('/passkey/status', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key='hod_passkey_hash'").get();
  res.json({ configured: !!row?.value });
});

// Admin: set or change the master passkey. Only ever stored hashed — once
// set, nobody (including other admins) can retrieve the plaintext again
// through this app; whoever set it is responsible for sharing it with
// trusted faculty directly (verbally, over email, on a printed sheet for the
// lab, etc).
router.post('/passkey', requireAuth, requireAdmin, (req, res) => {
  const { passkey } = req.body;
  if (!passkey || typeof passkey !== 'string' || passkey.trim().length < 6) {
    return res.status(400).json({ error: 'Passkey must be at least 6 characters' });
  }
  const hash = bcrypt.hashSync(passkey.trim(), 10);
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('hod_passkey_hash', ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).run(hash);
  res.json({ ok: true });
});

// Admin: clear the passkey — after this, ALL new admin/professor signups go
// back to the HOD approval queue with no instant-grant path.
router.delete('/passkey', requireAuth, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM settings WHERE key='hod_passkey_hash'").run();
  res.json({ ok: true });
});

module.exports = router;
