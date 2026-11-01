const express = require('express');
const db = require('../db/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { broadcastToQuiz, getLiveQuizActivity } = require('../ws');

const router = express.Router();

function sanitizeQuiz(q, isAdmin) {
  const { pin, ...rest } = q;
  return { ...rest, hasPin: !!pin, ...(isAdmin ? { pin } : {}) };
}

// Strip the correct_option field for anyone who isn't an admin — a student
// mid-quiz should never receive the answer key in the API response, even if
// the UI wouldn't display it.
function sanitizeQuestion(q, isAdmin) {
  if (isAdmin) return q;
  const { correct_option, ...rest } = q;
  return rest;
}

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM quizzes ORDER BY start_time DESC').all();
  const now = new Date();
  const isAdmin = req.user.role === 'admin';
  const result = rows.map((q) => {
    const status = now < new Date(q.start_time) ? 'Upcoming' : now > new Date(q.end_time) ? 'Finished' : 'Live';
    const questionCount = db.prepare('SELECT COUNT(*) c FROM quiz_questions WHERE quiz_id=?').get(q.id).c;
    const totalPoints = db.prepare('SELECT COALESCE(SUM(points),0) c FROM quiz_questions WHERE quiz_id=?').get(q.id).c;
    const participants = db.prepare('SELECT COUNT(*) c FROM quiz_participants WHERE quiz_id=?').get(q.id).c;
    const joined = !!db.prepare('SELECT 1 FROM quiz_participants WHERE quiz_id=? AND user_id=?').get(q.id, req.user.id);
    return { ...sanitizeQuiz(q, isAdmin), status, questionCount, totalPoints, participants, joined };
  });
  res.json({ quizzes: result });
});

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { title, description, startTime, endTime, visibility, pin, proctored, questions, layoutMode, requireAllAnswered } = req.body;
  if (!title || !startTime || !endTime) return res.status(400).json({ error: 'title, startTime, endTime are required' });
  if (!Array.isArray(questions) || questions.length === 0) return res.status(400).json({ error: 'At least one question is required' });

  const cleanPin = typeof pin === 'string' && pin.trim() ? pin.trim() : null;
  const cleanLayout = layoutMode === 'paged' ? 'paged' : 'single';

  const info = db
    .prepare(
      'INSERT INTO quizzes (title, description, start_time, end_time, visibility, pin, proctored, layout_mode, require_all_answered, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)'
    )
    .run(title, description || '', startTime, endTime, visibility || 'public', cleanPin, proctored === false ? 0 : 1, cleanLayout, requireAllAnswered ? 1 : 0, req.user.id);
  const quizId = info.lastInsertRowid;

  const insQ = db.prepare(
    `INSERT INTO quiz_questions (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_option, points, ordinal, image_url)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  );
  questions.forEach((q, i) => {
    if (!q.text || !q.optionA || !q.optionB || !q.optionC || !q.optionD || !q.correctOption) return;
    insQ.run(quizId, q.text, q.optionA, q.optionB, q.optionC, q.optionD, q.correctOption, Number(q.points) > 0 ? Math.round(Number(q.points)) : 10, i, q.imageUrl || null);
  });

  res.status(201).json({ quizId });
});

router.get('/:id', requireAuth, (req, res) => {
  const q = db.prepare('SELECT * FROM quizzes WHERE id=?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Quiz not found' });
  const isAdmin = req.user.role === 'admin';
  const questions = db.prepare('SELECT * FROM quiz_questions WHERE quiz_id=? ORDER BY ordinal ASC').all(q.id).map((x) => sanitizeQuestion(x, isAdmin));
  const joined = !!db.prepare('SELECT 1 FROM quiz_participants WHERE quiz_id=? AND user_id=?').get(q.id, req.user.id);
  const participant = db.prepare('SELECT * FROM quiz_participants WHERE quiz_id=? AND user_id=?').get(q.id, req.user.id);
  const now = new Date();
  const status = now < new Date(q.start_time) ? 'Upcoming' : now > new Date(q.end_time) ? 'Finished' : 'Live';
  const totalPoints = questions.reduce((s, x) => s + x.points, 0);

  // The student's own previously-saved answers (if any) — sent back so the
  // "answered/unanswered" tracker and highlighted options survive a page
  // refresh, since answers are already persisted server-side as they pick them.
  let myAnswers = {};
  if (joined && !participant?.submitted) {
    const rows = db.prepare('SELECT question_id, selected_option FROM quiz_answers WHERE quiz_id=? AND user_id=?').all(q.id, req.user.id);
    myAnswers = Object.fromEntries(rows.filter((r) => r.selected_option).map((r) => [r.question_id, r.selected_option]));
  }

  res.json({ quiz: { ...sanitizeQuiz(q, isAdmin), questions, joined, submitted: !!participant?.submitted, status, totalPoints, myAnswers } });
});

router.post('/:id/join', requireAuth, (req, res) => {
  const q = db.prepare('SELECT * FROM quizzes WHERE id=?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Quiz not found' });
  if (q.pin) {
    const submitted = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    if (!submitted) return res.status(400).json({ error: 'This quiz requires a PIN to join', pinRequired: true });
    if (submitted !== q.pin) return res.status(403).json({ error: 'Incorrect PIN', pinRequired: true });
  }
  db.prepare('INSERT OR IGNORE INTO quiz_participants (quiz_id, user_id) VALUES (?,?)').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// Autosave a single answer as the student picks it — mirrors how the coding
// editor's Run/Submit works, just for one MCQ at a time instead of a whole
// program, so nothing is lost if the browser crashes before final submit.
router.post('/:id/answer', requireAuth, (req, res) => {
  const quizId = req.params.id;
  const { questionId, selectedOption } = req.body;
  if (!questionId) return res.status(400).json({ error: 'questionId is required' });

  const lock = db.prepare('SELECT locked FROM quiz_locks WHERE quiz_id=? AND user_id=?').get(quizId, req.user.id);
  if (lock?.locked) return res.status(423).json({ error: 'Your test is frozen due to repeated proctoring violations. Ask your instructor to re-enable it.', locked: true });

  const participant = db.prepare('SELECT * FROM quiz_participants WHERE quiz_id=? AND user_id=?').get(quizId, req.user.id);
  if (!participant) return res.status(403).json({ error: 'Join the quiz before answering' });
  if (participant.submitted) return res.status(400).json({ error: 'You have already submitted this quiz' });

  const question = db.prepare('SELECT id FROM quiz_questions WHERE id=? AND quiz_id=?').get(questionId, quizId);
  if (!question) return res.status(404).json({ error: 'Question not found in this quiz' });

  db.prepare(
    `INSERT INTO quiz_answers (quiz_id, question_id, user_id, selected_option, answered_at) VALUES (?,?,?,?,datetime('now'))
     ON CONFLICT(question_id, user_id) DO UPDATE SET selected_option=excluded.selected_option, answered_at=excluded.answered_at`
  ).run(quizId, questionId, req.user.id, selectedOption || null);
  res.json({ ok: true });
});

// Final submit — locks in whatever answers exist and computes the score
// immediately (MCQ grading needs no judge/compile step). `force: true` in
// the body bypasses the "must answer everything" check — used only by the
// auto-submit paths (timer running out, proctoring violation limit), which
// must always be able to submit whatever the student has so far.
router.post('/:id/submit', requireAuth, (req, res) => {
  const quizId = req.params.id;
  const lock = db.prepare('SELECT locked FROM quiz_locks WHERE quiz_id=? AND user_id=?').get(quizId, req.user.id);
  if (lock?.locked) return res.status(423).json({ error: 'Your test is frozen due to repeated proctoring violations. Ask your instructor to re-enable it.', locked: true });

  const participant = db.prepare('SELECT * FROM quiz_participants WHERE quiz_id=? AND user_id=?').get(quizId, req.user.id);
  if (!participant) return res.status(403).json({ error: 'Join the quiz before submitting' });
  if (participant.submitted) return res.status(400).json({ error: 'Already submitted' });

  const quiz = db.prepare('SELECT require_all_answered FROM quizzes WHERE id=?').get(quizId);
  if (quiz?.require_all_answered && !req.body?.force) {
    const totalQuestions = db.prepare('SELECT COUNT(*) c FROM quiz_questions WHERE quiz_id=?').get(quizId).c;
    const answered = db
      .prepare(`SELECT COUNT(*) c FROM quiz_answers WHERE quiz_id=? AND user_id=? AND selected_option IS NOT NULL`)
      .get(quizId, req.user.id).c;
    if (answered < totalQuestions) {
      return res.status(400).json({ error: `Answer all questions before submitting (${totalQuestions - answered} left).`, unanswered: totalQuestions - answered });
    }
  }

  db.prepare(`UPDATE quiz_participants SET submitted=1, submitted_at=datetime('now') WHERE quiz_id=? AND user_id=?`).run(quizId, req.user.id);
  const result = scoreQuizFor(quizId, req.user.id);
  res.json({ ok: true, ...result });
});

function scoreQuizFor(quizId, userId) {
  const questions = db.prepare('SELECT * FROM quiz_questions WHERE quiz_id=?').all(quizId);
  const answers = db.prepare('SELECT * FROM quiz_answers WHERE quiz_id=? AND user_id=?').all(quizId, userId);
  const answerMap = new Map(answers.map((a) => [a.question_id, a.selected_option]));
  let score = 0;
  let correct = 0;
  const totalPoints = questions.reduce((s, q) => s + q.points, 0);
  for (const q of questions) {
    const picked = answerMap.get(q.id);
    if (picked && picked === q.correct_option) {
      score += q.points;
      correct += 1;
    }
  }
  return { score, totalPoints, correct, totalQuestions: questions.length };
}

// A student's own results — only available once they've submitted, so
// nobody can peek at their live score to game remaining questions.
router.get('/:id/results', requireAuth, (req, res) => {
  const participant = db.prepare('SELECT * FROM quiz_participants WHERE quiz_id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!participant?.submitted) return res.status(403).json({ error: 'Submit the quiz to see your results' });
  const result = scoreQuizFor(req.params.id, req.user.id);

  const questions = db.prepare('SELECT * FROM quiz_questions WHERE quiz_id=? ORDER BY ordinal ASC').all(req.params.id);
  const answers = db.prepare('SELECT * FROM quiz_answers WHERE quiz_id=? AND user_id=?').all(req.params.id, req.user.id);
  const answerMap = new Map(answers.map((a) => [a.question_id, a.selected_option]));
  const breakdown = questions.map((q) => ({
    id: q.id,
    text: q.question_text,
    options: { a: q.option_a, b: q.option_b, c: q.option_c, d: q.option_d },
    correctOption: q.correct_option,
    selectedOption: answerMap.get(q.id) || null,
    points: q.points,
    isCorrect: answerMap.get(q.id) === q.correct_option,
  }));

  res.json({ ...result, breakdown });
});

router.get('/:id/leaderboard', requireAuth, (req, res) => {
  const participants = db
    .prepare(`SELECT u.id, u.name, u.avatar_color, p.submitted, p.submitted_at FROM quiz_participants p JOIN users u ON u.id=p.user_id WHERE p.quiz_id=?`)
    .all(req.params.id);
  const rows = participants.map((p) => {
    const { score, totalPoints, correct, totalQuestions } = scoreQuizFor(req.params.id, p.id);
    return { id: p.id, name: p.name, avatar_color: p.avatar_color, submitted: !!p.submitted, score, totalPoints, correct, totalQuestions };
  });
  rows.sort((a, b) => b.score - a.score);
  res.json({ leaderboard: rows.map((r, i) => ({ rank: i + 1, ...r })) });
});

router.get('/:id/lock-status', requireAuth, (req, res) => {
  const row = db.prepare('SELECT locked, reason, locked_at FROM quiz_locks WHERE quiz_id=? AND user_id=?').get(req.params.id, req.user.id);
  res.json({ locked: !!(row && row.locked), reason: row?.reason || null, lockedAt: row?.locked_at || null });
});

router.post('/:id/unlock/:userId', requireAuth, requireAdmin, (req, res) => {
  const quizId = req.params.id;
  const userId = req.params.userId;
  const row = db.prepare('SELECT * FROM quiz_locks WHERE quiz_id=? AND user_id=?').get(quizId, userId);
  if (!row || !row.locked) return res.status(400).json({ error: 'This student is not currently locked' });
  db.prepare(`UPDATE quiz_locks SET locked=0, unlocked_by=?, unlocked_at=datetime('now') WHERE quiz_id=? AND user_id=?`).run(req.user.id, quizId, userId);
  db.prepare(`UPDATE quiz_participants SET submitted=0 WHERE quiz_id=? AND user_id=?`).run(quizId, userId);
  broadcastToQuiz(quizId, { type: 'quiz_control', action: 'unlock', userId: Number(userId), by: req.user.name });
  res.json({ ok: true });
});

router.post('/:id/end', requireAuth, requireAdmin, (req, res) => {
  const q = db.prepare('SELECT * FROM quizzes WHERE id=?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Quiz not found' });
  db.prepare('UPDATE quizzes SET end_time=? WHERE id=?').run(new Date().toISOString(), req.params.id);
  // Auto-submit anyone still in progress so their partial answers are graded
  // instead of silently lost when the quiz window closes.
  const inProgress = db.prepare('SELECT user_id FROM quiz_participants WHERE quiz_id=? AND submitted=0').all(req.params.id);
  const submitStmt = db.prepare(`UPDATE quiz_participants SET submitted=1, submitted_at=datetime('now') WHERE quiz_id=? AND user_id=?`);
  for (const p of inProgress) submitStmt.run(req.params.id, p.user_id);
  broadcastToQuiz(req.params.id, { type: 'quiz_control', action: 'end' });
  res.json({ ok: true });
});

router.get('/:id/monitor', requireAuth, requireAdmin, (req, res) => {
  const violations = db
    .prepare(`SELECT v.*, u.name as student_name FROM quiz_violations v JOIN users u ON u.id=v.user_id WHERE v.quiz_id=? ORDER BY v.id DESC LIMIT 200`)
    .all(req.params.id);
  const locks = db
    .prepare(`SELECT l.*, u.name as student_name FROM quiz_locks l JOIN users u ON u.id=l.user_id WHERE l.quiz_id=? AND l.locked=1`)
    .all(req.params.id);
  res.json({ students: getLiveQuizActivity(req.params.id), violations, locks });
});

// Delete a quiz (admin). Cascades to its questions/participants/answers/
// violations/locks via ON DELETE CASCADE in the schema.
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const q = db.prepare('SELECT id FROM quizzes WHERE id=?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Quiz not found' });
  db.prepare('DELETE FROM quizzes WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
