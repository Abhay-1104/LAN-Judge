const express = require('express');
const db = require('../db/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Global leaderboard
router.get('/leaderboard', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.avatar_color,
        COUNT(DISTINCT CASE WHEN s.verdict='Accepted' THEN s.problem_id END) solved,
        COUNT(s.id) submissions,
        SUM(CASE WHEN s.verdict!='Accepted' THEN 1 ELSE 0 END) penalty
       FROM users u
       LEFT JOIN submissions s ON s.user_id = u.id
       WHERE u.role='student'
       GROUP BY u.id
       ORDER BY solved DESC, penalty ASC`
    )
    .all();
  res.json({ leaderboard: rows.map((r, i) => ({ rank: i + 1, ...r })) });
});

// Student dashboard summary
router.get('/dashboard', requireAuth, (req, res) => {
  const uid = req.user.id;
  const solved = db.prepare(`SELECT COUNT(DISTINCT problem_id) c FROM submissions WHERE user_id=? AND verdict='Accepted'`).get(uid).c;
  const totalSubs = db.prepare('SELECT COUNT(*) c FROM submissions WHERE user_id=?').get(uid).c;
  const accepted = db.prepare(`SELECT COUNT(*) c FROM submissions WHERE user_id=? AND verdict='Accepted'`).get(uid).c;
  const accuracy = totalSubs === 0 ? 0 : Math.round((accepted / totalSubs) * 1000) / 10;
  const totalProblems = db.prepare('SELECT COUNT(*) c FROM problems WHERE visible=1').get().c;
  const rating = db.prepare('SELECT rating FROM users WHERE id=?').get(uid)?.rating ?? 1200;

  const activeDays = new Set(
    db.prepare(`SELECT DISTINCT date(submitted_at) day FROM submissions WHERE user_id=? AND verdict='Accepted'`).all(uid).map((r) => r.day)
  );
  let streak = 0;
  const cursor = new Date();
  if (!activeDays.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  while (activeDays.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const recent = db
    .prepare(
      `SELECT s.id, p.title as problem, p.code, s.verdict as status, s.language, s.runtime_ms, s.memory_kb, s.submitted_at
       FROM submissions s JOIN problems p ON p.id=s.problem_id WHERE s.user_id=? ORDER BY s.id DESC LIMIT 6`
    )
    .all(uid);

  const now = new Date().toISOString();
  const ongoing = db.prepare(`SELECT * FROM contests WHERE start_time <= ? AND end_time >= ? ORDER BY end_time ASC LIMIT 1`).get(now, now);
  const upcoming = db.prepare(`SELECT * FROM contests WHERE start_time > ? ORDER BY start_time ASC LIMIT 3`).all(now);
  const contestsJoined = db.prepare('SELECT COUNT(*) c FROM contest_participants WHERE user_id=?').get(uid).c;

  const rankRow = db
    .prepare(
      `SELECT u.id FROM users u LEFT JOIN submissions s ON s.user_id=u.id AND s.verdict='Accepted'
       WHERE u.role='student' GROUP BY u.id ORDER BY COUNT(DISTINCT s.problem_id) DESC`
    )
    .all();
  const ranking = rankRow.findIndex((r) => r.id === uid) + 1;
  const enrolledStudents = db.prepare(`SELECT COUNT(*) c FROM users WHERE role='student'`).get().c;

  res.json({
    solvedProblems: solved,
    totalProblems,
    totalSubmissions: totalSubs,
    accuracy,
    contestsJoined,
    ranking: ranking || null,
    rating,
    streak,
    ongoingContest: ongoing || null,
    upcomingContests: upcoming,
    recentSubmissions: recent,
    enrolledStudents,
  });
});

// Admin dashboard summary
router.get('/admin', requireAuth, requireAdmin, (req, res) => {
  const problems = db.prepare('SELECT COUNT(*) c FROM problems').get().c;
  const users = db.prepare(`SELECT COUNT(*) c FROM users WHERE role='student'`).get().c;
  const submissions = db.prepare('SELECT COUNT(*) c FROM submissions').get().c;
  const contests = db.prepare('SELECT COUNT(*) c FROM contests').get().c;

  const recentSubmissions = db
    .prepare(
      `SELECT s.id, u.name as user, p.title as problem, s.verdict as status, s.language, s.submitted_at
       FROM submissions s JOIN users u ON u.id=s.user_id JOIN problems p ON p.id=s.problem_id
       ORDER BY s.id DESC LIMIT 8`
    )
    .all();

  const byVerdict = db.prepare(`SELECT verdict, COUNT(*) c FROM submissions GROUP BY verdict`).all();
  const byLanguage = db.prepare(`SELECT language, COUNT(*) c FROM submissions GROUP BY language`).all();
  const mostSolved = db
    .prepare(
      `SELECT p.title, COUNT(DISTINCT s.user_id) solvers FROM submissions s JOIN problems p ON p.id=s.problem_id
       WHERE s.verdict='Accepted' GROUP BY p.id ORDER BY solvers DESC LIMIT 5`
    )
    .all();

  res.json({
    stats: { problems, users, submissions, contests },
    recentSubmissions,
    byVerdict,
    byLanguage,
    mostSolved,
  });
});

module.exports = router;
