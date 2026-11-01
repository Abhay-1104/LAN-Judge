const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Flat, chronological per-problem discussion thread — students and
// professors can post; anyone can read. Deliberately simple (no nested
// replies) since the existing `discussions` table has no parent_id column;
// a flat list already covers "write your thoughts about this problem".
router.get('/', requireAuth, (req, res) => {
  const { problemId } = req.query;
  if (!problemId) return res.status(400).json({ error: 'problemId is required' });
  const rows = db
    .prepare(
      `SELECT d.id, d.body, d.created_at, u.id as user_id, u.name as author_name, u.avatar_color, u.avatar_url, u.role as author_role
       FROM discussions d JOIN users u ON u.id = d.user_id
       WHERE d.problem_id = ? ORDER BY d.created_at ASC`
    )
    .all(problemId);
  res.json({ posts: rows });
});

router.post('/', requireAuth, (req, res) => {
  const { problemId, body } = req.body;
  if (!problemId) return res.status(400).json({ error: 'problemId is required' });
  const text = (body || '').trim();
  if (!text) return res.status(400).json({ error: 'Post cannot be empty' });
  if (text.length > 5000) return res.status(400).json({ error: 'Post is too long (max 5000 characters)' });

  const problem = db.prepare('SELECT id FROM problems WHERE id=?').get(problemId);
  if (!problem) return res.status(404).json({ error: 'Problem not found' });

  const info = db.prepare('INSERT INTO discussions (problem_id, user_id, body) VALUES (?,?,?)').run(problemId, req.user.id, text);
  const post = db
    .prepare(
      `SELECT d.id, d.body, d.created_at, u.id as user_id, u.name as author_name, u.avatar_color, u.avatar_url, u.role as author_role
       FROM discussions d JOIN users u ON u.id = d.user_id WHERE d.id=?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json({ post });
});

// Author (or an admin) can delete their own post.
router.delete('/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM discussions WHERE id=?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Not allowed' });
  db.prepare('DELETE FROM discussions WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
