const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const { problemId } = req.query;
  if (!problemId) return res.status(400).json({ error: 'problemId is required' });
  const rows = db
    .prepare(
      `SELECT s.id, s.title, s.tags, s.body, s.created_at, u.id as user_id, u.name as author_name, u.avatar_color, u.avatar_url, u.role as author_role
       FROM solutions s JOIN users u ON u.id = s.user_id
       WHERE s.problem_id = ? ORDER BY s.created_at DESC`
    )
    .all(problemId);
  res.json({ solutions: rows.map((r) => ({ ...r, tags: JSON.parse(r.tags || '[]') })) });
});

router.post('/', requireAuth, (req, res) => {
  const { problemId, title, tags, body } = req.body;
  if (!problemId) return res.status(400).json({ error: 'problemId is required' });
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!body || !body.trim()) return res.status(400).json({ error: 'Solution body cannot be empty' });
  if (body.length > 50000) return res.status(400).json({ error: 'Solution is too long (max 50,000 characters)' });

  const problem = db.prepare('SELECT id FROM problems WHERE id=?').get(problemId);
  if (!problem) return res.status(404).json({ error: 'Problem not found' });

  const info = db
    .prepare('INSERT INTO solutions (problem_id, user_id, title, tags, body) VALUES (?,?,?,?,?)')
    .run(problemId, req.user.id, title.trim(), JSON.stringify(Array.isArray(tags) ? tags : []), body);

  const row = db
    .prepare(
      `SELECT s.id, s.title, s.tags, s.body, s.created_at, u.id as user_id, u.name as author_name, u.avatar_color, u.avatar_url, u.role as author_role
       FROM solutions s JOIN users u ON u.id = s.user_id WHERE s.id=?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json({ solution: { ...row, tags: JSON.parse(row.tags || '[]') } });
});

router.delete('/:id', requireAuth, (req, res) => {
  const sol = db.prepare('SELECT * FROM solutions WHERE id=?').get(req.params.id);
  if (!sol) return res.status(404).json({ error: 'Solution not found' });
  if (sol.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Not allowed' });
  db.prepare('DELETE FROM solutions WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
