const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const AVATAR_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.mimetype)) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  },
});

// ── Self-service profile editing (any authenticated user, own account only) ──

// Update own name / email / college ID. Kept separate from the admin-only
// role/status endpoints below — a student can never touch those fields.
router.put('/me', requireAuth, (req, res) => {
  const { name, email, collegeId } = req.body;
  const current = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!current) return res.status(404).json({ error: 'User not found' });

  const nextName = (name ?? current.name).trim();
  const nextEmail = (email ?? current.email).trim().toLowerCase();
  const nextCollegeId = collegeId === undefined ? current.college_id : (collegeId || '').trim() || null;

  if (!nextName) return res.status(400).json({ error: 'Name cannot be empty' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) return res.status(400).json({ error: 'Enter a valid email address' });

  const emailTaken = db.prepare('SELECT id FROM users WHERE email=? AND id<>?').get(nextEmail, req.user.id);
  if (emailTaken) return res.status(400).json({ error: 'That email is already in use by another account' });
  if (nextCollegeId) {
    const idTaken = db.prepare('SELECT id FROM users WHERE college_id=? AND id<>?').get(nextCollegeId, req.user.id);
    if (idTaken) return res.status(400).json({ error: 'That College ID is already in use by another account' });
  }

  db.prepare('UPDATE users SET name=?, email=?, college_id=? WHERE id=?').run(nextName, nextEmail, nextCollegeId, req.user.id);
  const updated = db.prepare('SELECT id, name, email, college_id, role, avatar_color, avatar_url, rating FROM users WHERE id=?').get(req.user.id);
  res.json({ ok: true, user: updated });
});

// Change own password — requires the current password so a hijacked/
// unlocked session can't be used to silently lock the real owner out.
router.put('/me/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

  const current = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!current || !bcrypt.compareSync(currentPassword, current.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, req.user.id);
  res.json({ ok: true });
});

// Upload/replace own profile picture. Stored on local disk under
// uploads/avatars — never a cloud host — and served statically by server.js.
router.post('/me/avatar', requireAuth, avatarUpload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file uploaded (field name "avatar")' });
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[req.file.mimetype] || 'png';
  const filename = `${req.user.id}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(AVATAR_DIR, filename), req.file.buffer);

  // Clean up this user's previous avatar file (best effort) so uploads/
  // avatars doesn't accumulate every old photo forever.
  const prev = db.prepare('SELECT avatar_url FROM users WHERE id=?').get(req.user.id);
  if (prev?.avatar_url) {
    const prevPath = path.join(AVATAR_DIR, path.basename(prev.avatar_url));
    fs.unlink(prevPath, () => {});
  }

  const avatarUrl = `/uploads/avatars/${filename}`;
  db.prepare('UPDATE users SET avatar_url=? WHERE id=?').run(avatarUrl, req.user.id);
  res.json({ ok: true, avatarUrl });
});

// Remove own profile picture, reverting to the initial-letter avatar.
router.delete('/me/avatar', requireAuth, (req, res) => {
  const current = db.prepare('SELECT avatar_url FROM users WHERE id=?').get(req.user.id);
  if (current?.avatar_url) {
    fs.unlink(path.join(AVATAR_DIR, path.basename(current.avatar_url)), () => {});
  }
  db.prepare('UPDATE users SET avatar_url=NULL WHERE id=?').run(req.user.id);
  res.json({ ok: true });
});

router.get('/', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, name, email, college_id, role, status, avatar_color, admin_requested, admin_requested_at, created_at FROM users ORDER BY id DESC').all();
  const withStats = rows.map((u) => {
    const solved = db.prepare(`SELECT COUNT(DISTINCT problem_id) c FROM submissions WHERE user_id=? AND verdict='Accepted'`).get(u.id).c;
    const submissions = db.prepare('SELECT COUNT(*) c FROM submissions WHERE user_id=?').get(u.id).c;
    return { ...u, solved, submissions };
  });
  res.json({ users: withStats });
});

// Pending admin/professor access requests, for an existing admin to review
router.get('/admin-requests', requireAuth, requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, name, email, college_id, avatar_color, admin_requested_at, created_at
       FROM users WHERE admin_requested = 1 AND role != 'admin' ORDER BY admin_requested_at ASC`
    )
    .all();
  res.json({ requests: rows });
});

router.post('/:id/approve-admin', requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare("UPDATE users SET role='admin', admin_requested=0 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/reject-admin', requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('UPDATE users SET admin_requested=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

router.put('/:id/role', requireAuth, requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!['student', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  db.prepare('UPDATE users SET role=? WHERE id=?').run(role, req.params.id);
  res.json({ ok: true });
});

router.put('/:id/status', requireAuth, requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!['active', 'disabled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE users SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ ok: true });
});

router.post('/:id/reset-password', requireAuth, requireAdmin, (req, res) => {
  const tempPassword = Math.random().toString(36).slice(2, 10);
  const hash = bcrypt.hashSync(tempPassword, 10);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, req.params.id);
  res.json({ ok: true, tempPassword });
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ error: "You can't delete your own account" });

  const user = db.prepare('SELECT id FROM users WHERE id=?').get(targetId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    db.exec('BEGIN');

    // Tables where user created content — NULL out the creator reference so
    // the content itself is preserved (problems, contests, quizzes created by
    // this user remain but become unattributed).
    db.prepare('UPDATE problems  SET created_by  = NULL WHERE created_by  = ?').run(targetId);
    db.prepare('UPDATE contests  SET created_by  = NULL WHERE created_by  = ?').run(targetId);
    db.prepare('UPDATE quizzes   SET created_by  = NULL WHERE created_by  = ?').run(targetId);

    // contest_locks and quiz_locks have two FK columns pointing at users:
    // user_id (the student being locked) and unlocked_by (the admin who
    // unlocked them). Delete lock rows owned by the user; NULL the admin
    // reference on rows they unlocked on behalf of other students.
    db.prepare('DELETE FROM contest_locks WHERE user_id = ?').run(targetId);
    db.prepare('UPDATE contest_locks SET unlocked_by = NULL WHERE unlocked_by = ?').run(targetId);
    db.prepare('DELETE FROM quiz_locks WHERE user_id = ?').run(targetId);
    db.prepare('UPDATE quiz_locks SET unlocked_by = NULL WHERE unlocked_by = ?').run(targetId);

    // Activity / participation rows — delete entirely.
    db.prepare('DELETE FROM submissions        WHERE user_id = ?').run(targetId);
    db.prepare('DELETE FROM contest_participants WHERE user_id = ?').run(targetId);
    db.prepare('DELETE FROM violations         WHERE user_id = ?').run(targetId);
    db.prepare('DELETE FROM rating_history     WHERE user_id = ?').run(targetId);
    db.prepare('DELETE FROM discussions        WHERE user_id = ?').run(targetId);
    db.prepare('DELETE FROM solutions          WHERE user_id = ?').run(targetId);
    db.prepare('DELETE FROM quiz_participants  WHERE user_id = ?').run(targetId);
    db.prepare('DELETE FROM quiz_answers       WHERE user_id = ?').run(targetId);
    db.prepare('DELETE FROM quiz_violations    WHERE user_id = ?').run(targetId);

    db.prepare('DELETE FROM users WHERE id = ?').run(targetId);

    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Failed to delete user', targetId, err);
    res.status(500).json({ error: 'Failed to delete user: ' + err.message });
  }
});

// Profile info + heatmap for any user (self or admin viewing)
router.get('/:id/profile', requireAuth, (req, res) => {
  const u = db.prepare('SELECT id, name, email, college_id, role, avatar_color, avatar_url, rating, created_at FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const solved = db.prepare(`SELECT COUNT(DISTINCT problem_id) c FROM submissions WHERE user_id=? AND verdict='Accepted'`).get(u.id).c;
  const totalSubs = db.prepare('SELECT COUNT(*) c FROM submissions WHERE user_id=?').get(u.id).c;
  const accepted = db.prepare(`SELECT COUNT(*) c FROM submissions WHERE user_id=? AND verdict='Accepted'`).get(u.id).c;
  const accuracy = totalSubs === 0 ? 0 : Math.round((accepted / totalSubs) * 1000) / 10;
  const contestsJoined = db.prepare('SELECT COUNT(*) c FROM contest_participants WHERE user_id=?').get(u.id).c;
  const heatmap = db
    .prepare(`SELECT date(submitted_at) day, COUNT(*) c FROM submissions WHERE user_id=? GROUP BY day`)
    .all(u.id);
  const recent = db
    .prepare(
      `SELECT s.id, p.title as problem, s.verdict as status, s.submitted_at, s.language FROM submissions s
       JOIN problems p ON p.id=s.problem_id WHERE s.user_id=? ORDER BY s.id DESC LIMIT 10`
    )
    .all(u.id);
  const byDifficulty = db
    .prepare(
      `SELECT p.difficulty, COUNT(DISTINCT s.problem_id) c FROM submissions s JOIN problems p ON p.id=s.problem_id
       WHERE s.user_id=? AND s.verdict='Accepted' GROUP BY p.difficulty`
    )
    .all(u.id);

  // Current practice streak: consecutive calendar days with at least one
  // accepted submission, counting backward from today (or yesterday, so a
  // student who hasn't solved anything *yet* today doesn't see their streak
  // drop to 0 before the day is even over).
  const activeDays = new Set(
    db
      .prepare(`SELECT DISTINCT date(submitted_at) day FROM submissions WHERE user_id=? AND verdict='Accepted'`)
      .all(u.id)
      .map((r) => r.day)
  );
  let streak = 0;
  const cursor = new Date();
  if (!activeDays.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  while (activeDays.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const ratingHistory = db
    .prepare('SELECT contest_id, rank, old_rating, new_rating, delta, created_at FROM rating_history WHERE user_id=? ORDER BY id ASC')
    .all(u.id);

  res.json({ profile: { ...u, solved, totalSubs, accuracy, contestsJoined, heatmap, recent, byDifficulty, streak, ratingHistory } });
});

module.exports = router;
