const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const AVATAR_COLORS = ['#22C55E', '#3B82F6', '#F59E0B', '#EF4444', '#A855F7', '#14B8A6'];

router.post('/register', (req, res) => {
  const { name, email, collegeId, password, requestAdmin, passkey } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  const hash = bcrypt.hashSync(password, 10);
  const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  // The very first account ever created has no one to approve it, so it
  // automatically becomes admin. Every account after that which requests
  // admin/professor access must either present the correct HOD master
  // passkey (instant grant) or be approved by an existing admin — this
  // prevents any student from just signing up as "admin" and deleting other
  // people's work.
  const userCount = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const isBootstrapAdmin = userCount === 0;

  let passkeyGranted = false;
  if (!isBootstrapAdmin && requestAdmin && passkey && typeof passkey === 'string' && passkey.trim()) {
    const row = db.prepare("SELECT value FROM settings WHERE key='hod_passkey_hash'").get();
    if (row?.value && bcrypt.compareSync(passkey.trim(), row.value)) passkeyGranted = true;
  }

  const role = isBootstrapAdmin || passkeyGranted ? 'admin' : 'student';
  const adminRequested = !isBootstrapAdmin && !passkeyGranted && requestAdmin ? 1 : 0;

  const info = db
    .prepare(
      'INSERT INTO users (name, email, college_id, password_hash, role, avatar_color, admin_requested, admin_requested_at) VALUES (?,?,?,?,?,?,?,?)'
    )
    .run(
      name,
      email.toLowerCase(),
      collegeId || null,
      hash,
      role,
      color,
      adminRequested,
      adminRequested ? new Date().toISOString() : null
    );

  const user = db
    .prepare('SELECT id, name, email, college_id, role, avatar_color, avatar_url, admin_requested FROM users WHERE id=?')
    .get(info.lastInsertRowid);
  const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user, adminRequestPending: !!adminRequested, passkeyGranted });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  if (user.status === 'disabled') return res.status(403).json({ error: 'This account has been disabled by an admin' });
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  delete user.password_hash;
  res.json({ token, user });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, name, email, college_id, role, avatar_color, avatar_url, created_at FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

module.exports = router;
