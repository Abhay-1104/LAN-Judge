const express = require('express');
const db = require('../db/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  return lines.join('\n');
}

function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

// ── Quiz grade scale (professor-configurable, with a sane default) ────────
// Stored as JSON in the generic `settings` key/value table so it survives
// restarts without needing a dedicated table. Cutoffs are inclusive minimums;
// the first one a score meets (scanning highest-to-lowest) wins.
const DEFAULT_GRADE_SCALE = [
  { min: 90, grade: 'A++' },
  { min: 80, grade: 'AA' },
  { min: 70, grade: 'A' },
  { min: 60, grade: 'B' },
  { min: 50, grade: 'C' },
  { min: 40, grade: 'D' },
  { min: 0, grade: 'F' },
];

function getGradeScale() {
  const row = db.prepare("SELECT value FROM settings WHERE key='quiz_grade_scale'").get();
  if (!row?.value) return DEFAULT_GRADE_SCALE;
  try {
    const parsed = JSON.parse(row.value);
    if (Array.isArray(parsed) && parsed.length) return parsed.sort((a, b) => b.min - a.min);
  } catch {
    /* fall through to default below */
  }
  return DEFAULT_GRADE_SCALE;
}

function letterGrade(percent, scale) {
  for (const tier of scale) if (percent >= tier.min) return tier.grade;
  return scale[scale.length - 1]?.grade || 'F';
}

// Read the current grade scale (professor sees what's configured, or the
// default if they've never set one).
router.get('/grade-scale', requireAuth, requireAdmin, (req, res) => {
  res.json({ scale: getGradeScale() });
});

// Set custom cutoffs. Any tier the professor leaves out simply isn't in the
// array they send — this endpoint replaces the whole scale, so the frontend
// should submit the complete edited list. Sending an empty/missing body
// resets to the default scale.
router.put('/grade-scale', requireAuth, requireAdmin, (req, res) => {
  const { scale } = req.body;
  if (!Array.isArray(scale) || scale.length === 0) {
    db.prepare("DELETE FROM settings WHERE key='quiz_grade_scale'").run();
    return res.json({ ok: true, scale: DEFAULT_GRADE_SCALE });
  }
  const clean = scale
    .filter((t) => t && typeof t.grade === 'string' && Number.isFinite(Number(t.min)))
    .map((t) => ({ min: Number(t.min), grade: t.grade.trim() }))
    .sort((a, b) => b.min - a.min);
  db.prepare("INSERT INTO settings (key, value) VALUES ('quiz_grade_scale', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(
    JSON.stringify(clean)
  );
  res.json({ ok: true, scale: clean });
});

// Every assessment (contest or quiz) that exists, for the Reports "Filter
// Scope" dropdown — built from whatever is actually in the DB, so a newly
// created contest/quiz shows up automatically with no hardcoding.
router.get('/assessments', requireAuth, requireAdmin, (req, res) => {
  const contests = db.prepare('SELECT id, title FROM contests ORDER BY start_time DESC').all().map((c) => ({ id: c.id, title: c.title, type: 'contest' }));
  const quizzes = db.prepare('SELECT id, title FROM quizzes ORDER BY start_time DESC').all().map((q) => ({ id: q.id, title: q.title, type: 'quiz' }));
  res.json({ assessments: [...contests, ...quizzes] });
});

// Every individual submission — the "row-by-row evaluation" export a
// professor needs for a lab gradebook, not just an aggregate summary.
router.get('/submissions.csv', requireAuth, requireAdmin, (req, res) => {
  const { contestId } = req.query;
  const rows = contestId
    ? db
        .prepare(
          `SELECT s.id, u.name student_name, u.college_id, u.email, p.title problem_title, s.language, s.verdict,
             s.passed_count, s.total_count, s.score, s.runtime_ms, s.memory_kb, s.submitted_at
           FROM submissions s JOIN users u ON u.id=s.user_id JOIN problems p ON p.id=s.problem_id
           WHERE s.contest_id=? ORDER BY s.submitted_at ASC`
        )
        .all(contestId)
    : db
        .prepare(
          `SELECT s.id, u.name student_name, u.college_id, u.email, p.title problem_title, s.language, s.verdict,
             s.passed_count, s.total_count, s.score, s.runtime_ms, s.memory_kb, s.submitted_at
           FROM submissions s JOIN users u ON u.id=s.user_id JOIN problems p ON p.id=s.problem_id
           ORDER BY s.submitted_at ASC`
        )
        .all();

  const headers = [
    'Submission ID', 'Student ID', 'Student Name', 'Email', 'Problem', 'Language', 'Verdict',
    'Test Cases Passed', 'Total Test Cases', 'Percentage Score', 'Runtime (ms)', 'Memory (KB)', 'Submitted At (UTC)',
  ];
  const dataRows = rows.map((r) => {
    const pct = r.total_count > 0 ? Math.round((r.passed_count / r.total_count) * 1000) / 10 : (r.verdict === 'Accepted' ? 100 : 0);
    return [
      r.id, r.college_id || '', r.student_name, r.email, r.problem_title, r.language, r.verdict,
      r.passed_count, r.total_count, `${pct}%`, r.runtime_ms ?? '', r.memory_kb ?? '', r.submitted_at,
    ];
  });
  sendCsv(res, contestId ? `submissions_contest_${contestId}.csv` : 'submissions_all.csv', toCsv(headers, dataRows));
});

// One row per enrolled student — aggregated attempts/solved/points/accuracy/
// preferred language, ready to drop straight into a gradebook spreadsheet.
router.get('/gradebook.csv', requireAuth, requireAdmin, (req, res) => {
  const { contestId } = req.query;

  const students = db.prepare(`SELECT id, name, email, college_id, rating FROM users WHERE role='student' ORDER BY name ASC`).all();

  const headers = [
    'Student ID', 'Name', 'Email', 'Total Attempts', 'Problems Solved', 'Total Points', 'Solve %', 'Preferred Language', 'Judge Rating',
  ];

  const dataRows = students.map((s) => {
    const scope = contestId ? 'AND s.contest_id = @contestId' : '';
    const params = contestId ? { uid: s.id, contestId } : { uid: s.id };

    const attempts = db.prepare(`SELECT COUNT(*) c FROM submissions s WHERE s.user_id=@uid ${scope}`).get(params).c;
    const solved = db
      .prepare(`SELECT COUNT(DISTINCT s.problem_id) c FROM submissions s WHERE s.user_id=@uid AND s.verdict='Accepted' ${scope}`)
      .get(params).c;

    let totalPoints = 0;
    if (contestId) {
      const row = db
        .prepare(
          `SELECT COALESCE(SUM(cp.points), 0) pts FROM (
             SELECT DISTINCT s.problem_id FROM submissions s WHERE s.user_id=@uid AND s.contest_id=@contestId AND s.verdict='Accepted'
           ) sp JOIN contest_problems cp ON cp.contest_id=@contestId AND cp.problem_id=sp.problem_id`
        )
        .get(params);
      totalPoints = row.pts;
    } else {
      totalPoints = solved * 100; // outside any specific contest, points aren't weighted — use a flat 100/problem as a rough total
    }

    const solvePct = attempts > 0 ? Math.round((solved / attempts) * 1000) / 10 : 0;
    const topLang = db
      .prepare(`SELECT language, COUNT(*) c FROM submissions s WHERE s.user_id=@uid ${scope} GROUP BY language ORDER BY c DESC LIMIT 1`)
      .get(params);

    return [s.college_id || '', s.name, s.email, attempts, solved, totalPoints, `${solvePct}%`, topLang?.language || '—', s.rating];
  });

  sendCsv(res, contestId ? `gradebook_contest_${contestId}.csv` : 'gradebook_all.csv', toCsv(headers, dataRows));
});

// ── Account detail log ─────────────────────────────────────────────────────
router.get('/accounts.csv', requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare(`SELECT id, name, email, college_id, role, status, rating, created_at FROM users ORDER BY name ASC`).all();
  const headers = ['User ID', 'Name', 'Email', 'College ID', 'Role', 'Status', 'Judge Rating', 'Submissions', 'Problems Solved', 'Contests Joined', 'Quizzes Taken', 'Joined At (UTC)'];
  const rows = users.map((u) => {
    const subs = db.prepare('SELECT COUNT(*) c FROM submissions WHERE user_id=?').get(u.id).c;
    const solved = db.prepare(`SELECT COUNT(DISTINCT problem_id) c FROM submissions WHERE user_id=? AND verdict='Accepted'`).get(u.id).c;
    const contestsJoined = db.prepare('SELECT COUNT(*) c FROM contest_participants WHERE user_id=?').get(u.id).c;
    const quizzesTaken = db.prepare('SELECT COUNT(*) c FROM quiz_participants WHERE user_id=? AND submitted=1').get(u.id).c;
    return [u.id, u.name, u.email, u.college_id || '', u.role, u.status, u.rating, subs, solved, contestsJoined, quizzesTaken, u.created_at];
  });
  sendCsv(res, 'accounts.csv', toCsv(headers, rows));
});

// ── Contest violation report ────────────────────────────────────────────────
router.get('/contest-violations.csv', requireAuth, requireAdmin, (req, res) => {
  const { contestId } = req.query;
  const rows = db
    .prepare(
      `SELECT v.id, u.name student_name, u.college_id, c.title contest_title, v.message, v.warning_number, v.auto_submitted, v.created_at
       FROM violations v JOIN users u ON u.id=v.user_id JOIN contests c ON c.id=v.contest_id
       ${contestId ? 'WHERE v.contest_id=?' : ''} ORDER BY v.created_at ASC`
    )
    .all(...(contestId ? [contestId] : []));
  const headers = ['Violation ID', 'Student ID', 'Student Name', 'Contest', 'Event', 'Warning #', 'Auto-Submitted', 'Timestamp (UTC)'];
  const dataRows = rows.map((r) => [r.id, r.college_id || '', r.student_name, r.contest_title, r.message, r.warning_number, r.auto_submitted ? 'Yes' : 'No', r.created_at]);
  sendCsv(res, contestId ? `contest_violations_${contestId}.csv` : 'contest_violations_all.csv', toCsv(headers, dataRows));
});

// ── Quiz grading log (score + letter grade) ─────────────────────────────────
router.get('/quiz-grading.csv', requireAuth, requireAdmin, (req, res) => {
  const { quizId } = req.query;
  const scale = getGradeScale();

  const quizzes = quizId
    ? db.prepare('SELECT id, title FROM quizzes WHERE id=?').all(quizId)
    : db.prepare('SELECT id, title FROM quizzes ORDER BY start_time DESC').all();

  const headers = ['Quiz', 'Student ID', 'Student Name', 'Score', 'Max Score', 'Percentage', 'Grade', 'Submitted At (UTC)'];
  const rows = [];

  for (const q of quizzes) {
    const maxScore = db.prepare('SELECT COALESCE(SUM(points),0) m FROM quiz_questions WHERE quiz_id=?').get(q.id).m;
    const participants = db
      .prepare(`SELECT p.user_id, p.submitted_at, u.name, u.college_id FROM quiz_participants p JOIN users u ON u.id=p.user_id WHERE p.quiz_id=? AND p.submitted=1`)
      .all(q.id);

    for (const p of participants) {
      const score = db
        .prepare(
          `SELECT COALESCE(SUM(qq.points),0) s FROM quiz_answers a
           JOIN quiz_questions qq ON qq.id=a.question_id
           WHERE a.quiz_id=? AND a.user_id=? AND a.selected_option=qq.correct_option`
        )
        .get(q.id, p.user_id).s;
      const pct = maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0;
      rows.push([q.title, p.college_id || '', p.name, score, maxScore, `${pct}%`, letterGrade(pct, scale), p.submitted_at || '']);
    }
  }

  sendCsv(res, quizId ? `quiz_grading_${quizId}.csv` : 'quiz_grading_all.csv', toCsv(headers, rows));
});

// ── Quiz violation report ───────────────────────────────────────────────────
router.get('/quiz-violations.csv', requireAuth, requireAdmin, (req, res) => {
  const { quizId } = req.query;
  const rows = db
    .prepare(
      `SELECT v.id, u.name student_name, u.college_id, q.title quiz_title, v.message, v.warning_number, v.auto_submitted, v.created_at
       FROM quiz_violations v JOIN users u ON u.id=v.user_id JOIN quizzes q ON q.id=v.quiz_id
       ${quizId ? 'WHERE v.quiz_id=?' : ''} ORDER BY v.created_at ASC`
    )
    .all(...(quizId ? [quizId] : []));
  const headers = ['Violation ID', 'Student ID', 'Student Name', 'Quiz', 'Event', 'Warning #', 'Auto-Submitted', 'Timestamp (UTC)'];
  const dataRows = rows.map((r) => [r.id, r.college_id || '', r.student_name, r.quiz_title, r.message, r.warning_number, r.auto_submitted ? 'Yes' : 'No', r.created_at]);
  sendCsv(res, quizId ? `quiz_violations_${quizId}.csv` : 'quiz_violations_all.csv', toCsv(headers, dataRows));
});

// ── Student self-service exports (own data only, no admin role required) ───

router.get('/my-submissions.csv', requireAuth, (req, res) => {
  const { contestId } = req.query;
  const rows = contestId
    ? db
        .prepare(
          `SELECT s.id, p.title problem_title, s.language, s.verdict, s.passed_count, s.total_count, s.score, s.runtime_ms, s.memory_kb, s.submitted_at
           FROM submissions s JOIN problems p ON p.id=s.problem_id
           WHERE s.user_id=? AND s.contest_id=? ORDER BY s.submitted_at ASC`
        )
        .all(req.user.id, contestId)
    : db
        .prepare(
          `SELECT s.id, p.title problem_title, s.language, s.verdict, s.passed_count, s.total_count, s.score, s.runtime_ms, s.memory_kb, s.submitted_at
           FROM submissions s JOIN problems p ON p.id=s.problem_id
           WHERE s.user_id=? ORDER BY s.submitted_at ASC`
        )
        .all(req.user.id);

  const headers = ['Submission ID', 'Problem', 'Language', 'Verdict', 'Test Cases Passed', 'Total Test Cases', 'Percentage Score', 'Runtime (ms)', 'Memory (KB)', 'Submitted At (UTC)'];
  const dataRows = rows.map((r) => {
    const pct = r.total_count > 0 ? Math.round((r.passed_count / r.total_count) * 1000) / 10 : (r.verdict === 'Accepted' ? 100 : 0);
    return [r.id, r.problem_title, r.language, r.verdict, r.passed_count, r.total_count, `${pct}%`, r.runtime_ms ?? '', r.memory_kb ?? '', r.submitted_at];
  });
  sendCsv(res, 'my_submissions.csv', toCsv(headers, dataRows));
});

router.get('/my-quiz-results.csv', requireAuth, (req, res) => {
  const scale = getGradeScale();
  const participations = db
    .prepare(`SELECT p.quiz_id, p.submitted_at, q.title FROM quiz_participants p JOIN quizzes q ON q.id=p.quiz_id WHERE p.user_id=? AND p.submitted=1`)
    .all(req.user.id);

  const headers = ['Quiz', 'Score', 'Max Score', 'Percentage', 'Grade', 'Submitted At (UTC)'];
  const rows = participations.map((p) => {
    const maxScore = db.prepare('SELECT COALESCE(SUM(points),0) m FROM quiz_questions WHERE quiz_id=?').get(p.quiz_id).m;
    const score = db
      .prepare(
        `SELECT COALESCE(SUM(qq.points),0) s FROM quiz_answers a
         JOIN quiz_questions qq ON qq.id=a.question_id
         WHERE a.quiz_id=? AND a.user_id=? AND a.selected_option=qq.correct_option`
      )
      .get(p.quiz_id, req.user.id).s;
    const pct = maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0;
    return [p.title, score, maxScore, `${pct}%`, letterGrade(pct, scale), p.submitted_at || ''];
  });
  sendCsv(res, 'my_quiz_results.csv', toCsv(headers, rows));
});

module.exports = router;
