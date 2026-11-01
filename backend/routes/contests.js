const express = require('express');
const db = require('../db/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getLiveActivity, broadcastToContest } = require('../ws');

const router = express.Router();

// Judge Rating: a simplified, rank-based performance rating (in the spirit of
// Codeforces/TopCoder-style contest rating systems, not a literal
// reimplementation of either). For N participants, a student ranked `rank`
// gets a "performance" score, and their rating moves a damped fraction of
// the way toward that performance. K=4 keeps early swings gentle so one bad
// (or lucky) contest doesn't wildly swing a rating that's meant to reflect
// consistency over many contests.
const RATING_BASE = 1200;
const RATING_K = 4;

function performanceFor(rank, n) {
  if (n <= 1) return RATING_BASE;
  // Best rank -> highest performance, worst rank -> lowest; centered on RATING_BASE.
  const percentile = (n - rank) / (n - 1); // 1 for 1st place, 0 for last place
  return Math.round(RATING_BASE + (percentile - 0.5) * 800);
}

function processContestRatings(contestId) {
  const contest = db.prepare('SELECT * FROM contests WHERE id=?').get(contestId);
  if (!contest || contest.rating_processed) return;
  if (new Date(contest.end_time) > new Date()) return; // not actually over yet

  const rows = db
    .prepare(
      `SELECT u.id,
        (SELECT COALESCE(SUM(cp.points), 0) FROM (
           SELECT DISTINCT s.problem_id FROM submissions s
           WHERE s.user_id = u.id AND s.contest_id = cpt.contest_id AND s.verdict='Accepted'
         ) sp JOIN contest_problems cp ON cp.contest_id = cpt.contest_id AND cp.problem_id = sp.problem_id
        ) score,
        (SELECT COUNT(*) FROM submissions s WHERE s.user_id = u.id AND s.contest_id = cpt.contest_id) attempts
       FROM contest_participants cpt JOIN users u ON u.id = cpt.user_id
       WHERE cpt.contest_id = ? ORDER BY score DESC, attempts ASC`
    )
    .all(contestId);

  if (rows.length === 0) {
    db.prepare('UPDATE contests SET rating_processed=1 WHERE id=?').run(contestId);
    return;
  }

  const insertHistory = db.prepare(
    'INSERT INTO rating_history (contest_id, user_id, rank, old_rating, new_rating, delta) VALUES (?,?,?,?,?,?)'
  );
  const updateRating = db.prepare('UPDATE users SET rating=? WHERE id=?');

  const tx = db.transaction(() => {
    rows.forEach((r, i) => {
      const rank = i + 1;
      const user = db.prepare('SELECT rating FROM users WHERE id=?').get(r.id);
      const oldRating = user?.rating ?? RATING_BASE;
      const perf = performanceFor(rank, rows.length);
      const newRating = Math.max(0, Math.round(oldRating + (perf - oldRating) / RATING_K));
      updateRating.run(newRating, r.id);
      insertHistory.run(contestId, r.id, rank, oldRating, newRating, newRating - oldRating);
    });
    db.prepare('UPDATE contests SET rating_processed=1 WHERE id=?').run(contestId);
  });
  tx();
}

// Never send the raw pin to the browser except to the admin who set it —
// students only need to know a PIN is required, not what it is.
function sanitizeContest(c, isAdmin) {
  const { pin, ...rest } = c;
  return { ...rest, hasPin: !!pin, ...(isAdmin ? { pin } : {}) };
}

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM contests ORDER BY start_time DESC').all();
  const now = new Date();
  const isAdmin = req.user.role === 'admin';
  const result = rows.map((c) => {
    const start = new Date(c.start_time);
    const end = new Date(c.end_time);
    const status = now < start ? 'Upcoming' : now > end ? 'Finished' : 'Live';
    const problems = db
      .prepare(`SELECT p.id, p.code, p.title, p.difficulty, cp.points FROM contest_problems cp JOIN problems p ON p.id=cp.problem_id WHERE cp.contest_id=?`)
      .all(c.id);
    const participants = db.prepare('SELECT COUNT(*) c FROM contest_participants WHERE contest_id=?').get(c.id).c;
    const joined = !!db.prepare('SELECT 1 FROM contest_participants WHERE contest_id=? AND user_id=?').get(c.id, req.user.id);
    return { ...sanitizeContest(c, isAdmin), status, problems, participants, joined };
  });
  res.json({ contests: result });
});

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { title, description, startTime, endTime, visibility, problemIds, pin, points } = req.body;
  if (!title || !startTime || !endTime) return res.status(400).json({ error: 'title, startTime, endTime are required' });

  // PIN is optional — trim it, and treat an empty string the same as "no PIN".
  const cleanPin = typeof pin === 'string' && pin.trim() ? pin.trim() : null;

  const info = db
    .prepare('INSERT INTO contests (title, description, start_time, end_time, visibility, pin, created_by) VALUES (?,?,?,?,?,?,?)')
    .run(title, description || '', startTime, endTime, visibility || 'public', cleanPin, req.user.id);
  const contestId = info.lastInsertRowid;
  if (Array.isArray(problemIds)) {
    const stmt = db.prepare('INSERT OR IGNORE INTO contest_problems (contest_id, problem_id, label, points) VALUES (?,?,?,?)');
    const labels = 'ABCDEFGH';
    problemIds.forEach((pid, i) => {
      // `points` is an optional object of { [problemId]: number } sent alongside
      // problemIds; anything unspecified (or invalid) falls back to 100.
      const raw = points && points[pid];
      const pts = Number.isFinite(Number(raw)) && Number(raw) > 0 ? Math.round(Number(raw)) : 100;
      stmt.run(contestId, pid, labels[i] || String(i + 1), pts);
    });
  }
  res.status(201).json({ contestId });
});

router.get('/:id', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM contests WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contest not found' });
  const problems = db
    .prepare(`SELECT p.id, p.code, p.title, p.difficulty, cp.label, cp.points FROM contest_problems cp JOIN problems p ON p.id=cp.problem_id WHERE cp.contest_id=?`)
    .all(c.id);
  const joined = !!db.prepare('SELECT 1 FROM contest_participants WHERE contest_id=? AND user_id=?').get(c.id, req.user.id);
  const now = new Date();
  const status = now < new Date(c.start_time) ? 'Upcoming' : now > new Date(c.end_time) ? 'Finished' : 'Live';
  const isAdmin = req.user.role === 'admin';
  res.json({ contest: { ...sanitizeContest(c, isAdmin), problems, joined, status } });
});

router.post('/:id/join', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM contests WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contest not found' });
  if (c.pin) {
    const submitted = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    if (!submitted) return res.status(400).json({ error: 'This contest requires a PIN to join', pinRequired: true });
    if (submitted !== c.pin) return res.status(403).json({ error: 'Incorrect PIN', pinRequired: true });
  }
  db.prepare('INSERT OR IGNORE INTO contest_participants (contest_id, user_id) VALUES (?,?)').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// Admin: end a contest immediately (sets end_time to now) and broadcast to
// every connected student so their editors lock/submit right away instead
// of waiting for the next time-based poll.
router.post('/:id/end', requireAuth, requireAdmin, (req, res) => {
  const c = db.prepare('SELECT * FROM contests WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contest not found' });
  db.prepare('UPDATE contests SET end_time=? WHERE id=?').run(new Date().toISOString(), req.params.id);
  broadcastToContest(req.params.id, { type: 'contest_control', action: 'end' });
  processContestRatings(req.params.id);
  res.json({ ok: true });
});

router.get('/:id/leaderboard', requireAuth, (req, res) => {
  processContestRatings(req.params.id);
  // Score = sum of each problem's configured points, counted once per problem
  // the student has an Accepted submission for (not once per submission, and
  // NOT collapsed if two problems happen to share the same point value —
  // hence the nested "one row per solved problem" subquery instead of a
  // naive SUM(DISTINCT points), which would under-count that case).
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.avatar_color,
        (SELECT COUNT(*) FROM (
           SELECT DISTINCT s.problem_id FROM submissions s
           WHERE s.user_id = u.id AND s.contest_id = cpt.contest_id AND s.verdict='Accepted'
         )) solved,
        (SELECT COALESCE(SUM(cp.points), 0) FROM (
           SELECT DISTINCT s.problem_id FROM submissions s
           WHERE s.user_id = u.id AND s.contest_id = cpt.contest_id AND s.verdict='Accepted'
         ) sp
         JOIN contest_problems cp ON cp.contest_id = cpt.contest_id AND cp.problem_id = sp.problem_id
        ) score,
        (SELECT COUNT(*) FROM submissions s WHERE s.user_id = u.id AND s.contest_id = cpt.contest_id) attempts,
        (SELECT MAX(s.submitted_at) FROM submissions s WHERE s.user_id = u.id AND s.contest_id = cpt.contest_id) last_submit
       FROM contest_participants cpt
       JOIN users u ON u.id = cpt.user_id
       WHERE cpt.contest_id = ?
       ORDER BY score DESC, attempts ASC`
    )
    .all(req.params.id);
  res.json({ leaderboard: rows.map((r, i) => ({ rank: i + 1, ...r, penalty: r.attempts * 5 })) });
});

// A student's own lock status for this contest. Checked on page load/refresh
// so a 3rd-violation freeze can't be escaped just by reloading — the server,
// not the browser, is the source of truth (see contest_locks table).
router.get('/:id/lock-status', requireAuth, (req, res) => {
  const row = db
    .prepare('SELECT locked, reason, locked_at FROM contest_locks WHERE contest_id=? AND user_id=?')
    .get(req.params.id, req.user.id);
  res.json({ locked: !!(row && row.locked), reason: row?.reason || null, lockedAt: row?.locked_at || null });
});

// Admin: re-enable a locked (auto-submitted/frozen) student so they can keep
// working — for the common case where the 3rd violation wasn't actually
// cheating (bad webcam angle, sibling walked into frame, etc). This does not
// undo the auto-submitted submission itself; it just lets them submit again.
router.post('/:id/unlock/:userId', requireAuth, requireAdmin, (req, res) => {
  const contestId = req.params.id;
  const userId = req.params.userId;
  const row = db.prepare('SELECT * FROM contest_locks WHERE contest_id=? AND user_id=?').get(contestId, userId);
  if (!row || !row.locked) return res.status(400).json({ error: 'This student is not currently locked' });
  db.prepare(
    `UPDATE contest_locks SET locked=0, unlocked_by=?, unlocked_at=datetime('now') WHERE contest_id=? AND user_id=?`
  ).run(req.user.id, contestId, userId);
  broadcastToContest(contestId, { type: 'contest_control', action: 'unlock', userId: Number(userId), by: req.user.name });
  res.json({ ok: true });
});

// Admin: live monitoring data for a contest — connected students' activity,
// plus the persisted violation feed.
router.get('/:id/monitor', requireAuth, requireAdmin, (req, res) => {
  const violations = db
    .prepare(
      `SELECT v.*, u.name as student_name FROM violations v JOIN users u ON u.id=v.user_id
       WHERE v.contest_id=? ORDER BY v.id DESC LIMIT 200`
    )
    .all(req.params.id);
  const locks = db
    .prepare(
      `SELECT l.*, u.name as student_name FROM contest_locks l JOIN users u ON u.id=l.user_id
       WHERE l.contest_id=? AND l.locked=1`
    )
    .all(req.params.id);
  res.json({
    students: getLiveActivity(req.params.id),
    violations,
    locks,
  });
});

// Delete a contest (admin). Cascades to contest_problems/participants via
// ON DELETE CASCADE; submissions keep contest_id but the contest row itself
// (and its problem-selection/leaderboard) is removed.
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const c = db.prepare('SELECT id FROM contests WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Contest not found' });
  db.prepare('DELETE FROM contests WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
