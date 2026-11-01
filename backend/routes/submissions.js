const express = require('express');
const fs = require('fs');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const { judgeSubmission } = require('../judge/judge');
const { enqueue, getQueueStatus } = require('../judge/queue');
const { broadcastToContest } = require('../ws');

const router = express.Router();

// Run code against custom input or sample input (does not save a submission)
router.post('/run', requireAuth, async (req, res) => {
  const { problemId, language, source, customInput, contestId } = req.body;
  if (!language || source === undefined) return res.status(400).json({ error: 'language and source are required' });

  if (contestId) {
    const lock = db.prepare('SELECT locked FROM contest_locks WHERE contest_id=? AND user_id=?').get(contestId, req.user.id);
    if (lock?.locked) return res.status(423).json({ error: 'Your test is frozen due to repeated proctoring violations. Ask your instructor to re-enable it.', locked: true });
  }

  let testInput = customInput || '';
  let expected = null;
  const limits = { timeLimitMs: 3000 };

  if (problemId) {
    const p = db.prepare('SELECT * FROM problems WHERE id=?').get(problemId);
    if (p) limits.timeLimitMs = p.time_limit_ms;
    if (customInput === undefined || customInput === '') {
      const sample = db.prepare('SELECT * FROM samples WHERE problem_id=? LIMIT 1').get(problemId);
      if (sample) {
        testInput = sample.input;
        expected = sample.output;
      }
    }
  }

  const result = await enqueue(() =>
    judgeSubmission(language, source, [{ input: testInput, output: expected || '' }], limits)
  );
  const single = result.detail[0];
  res.json({
    verdict: result.compileError ? 'Compilation Error' : expected === null ? 'Executed' : single.verdict,
    output: single ? single.got : '',
    stderr: single ? single.stderr : result.compileError || '',
    runtimeMs: result.runtimeMs,
    memoryKb: result.memoryKb,
    expected,
  });
});

// Submit code for full judging
router.post('/', requireAuth, async (req, res) => {
  const { problemId, language, source, contestId } = req.body;
  if (!problemId || !language || source === undefined) {
    return res.status(400).json({ error: 'problemId, language and source are required' });
  }

  if (contestId) {
    const lock = db.prepare('SELECT locked FROM contest_locks WHERE contest_id=? AND user_id=?').get(contestId, req.user.id);
    if (lock?.locked) return res.status(423).json({ error: 'Your test is frozen due to repeated proctoring violations. Ask your instructor to re-enable it.', locked: true });
  }

  const p = db.prepare('SELECT * FROM problems WHERE id=?').get(problemId);
  if (!p) return res.status(404).json({ error: 'Problem not found' });

  let testcases = db.prepare('SELECT * FROM testcases WHERE problem_id=? ORDER BY ordinal').all(problemId);
  if (testcases.length === 0) {
    // fall back to samples as testcases if admin hasn't uploaded a zip yet
    const samples = db.prepare('SELECT * FROM samples WHERE problem_id=?').all(problemId);
    testcases = samples.map((s) => ({ input_path: null, output_path: null, input: s.input, output: s.output }));
  } else {
    testcases = testcases.map((t) => ({
      input: fs.readFileSync(t.input_path, 'utf8'),
      output: fs.readFileSync(t.output_path, 'utf8'),
    }));
  }

  if (testcases.length === 0) {
    return res.status(400).json({ error: 'This problem has no test cases configured yet' });
  }

  const result = await enqueue(() =>
    judgeSubmission(language, source, testcases, {
      timeLimitMs: p.time_limit_ms,
      memoryLimitMb: p.memory_limit_mb,
    })
  );

  const score = Math.round((result.passed / result.total) * 100);

  const info = db
    .prepare(
      `INSERT INTO submissions (user_id, problem_id, contest_id, language, source, verdict, runtime_ms, memory_kb, score, passed_count, total_count, detail)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      req.user.id,
      problemId,
      contestId || null,
      language,
      source,
      result.compileError ? 'Compilation Error' : result.verdict,
      result.runtimeMs,
      result.memoryKb,
      score,
      result.passed,
      result.total,
      JSON.stringify(result.compileError ? { compileError: result.compileError } : result.detail)
    );

  res.status(201).json({
    submissionId: info.lastInsertRowid,
    verdict: result.compileError ? 'Compilation Error' : result.verdict,
    runtimeMs: result.runtimeMs,
    memoryKb: result.memoryKb,
    score,
    passed: result.passed,
    total: result.total,
    detail: result.detail,
    compileError: result.compileError,
  });

  if (contestId) {
    broadcastToContest(contestId, {
      type: 'activity',
      userId: req.user.id,
      event: 'submit',
      verdict: result.compileError ? 'Compilation Error' : result.verdict,
    });
  }
});

// Live queue status (admin, for sanity-checking load during a big contest)
router.get('/queue-status', requireAuth, (req, res) => {
  res.json(getQueueStatus());
});

// My submission history
router.get('/', requireAuth, (req, res) => {
  const { problemId, status, language } = req.query;
  let rows = db
    .prepare(
      `SELECT s.*, p.title as problem_title, p.code as problem_code FROM submissions s
       JOIN problems p ON p.id = s.problem_id WHERE s.user_id=? ORDER BY s.id DESC`
    )
    .all(req.user.id);
  if (problemId) rows = rows.filter((r) => String(r.problem_id) === String(problemId));
  if (status && status !== 'All') rows = rows.filter((r) => r.verdict === status);
  if (language && language !== 'All') rows = rows.filter((r) => r.language === language);
  res.json({
    submissions: rows.map((r) => ({
      id: r.id,
      problemId: r.problem_id,
      problemTitle: r.problem_title,
      problemCode: r.problem_code,
      language: r.language,
      verdict: r.verdict,
      runtimeMs: r.runtime_ms,
      memoryKb: r.memory_kb,
      score: r.score,
      submittedAt: r.submitted_at,
    })),
  });
});

router.get('/:id', requireAuth, (req, res) => {
  const r = db
    .prepare(`SELECT s.*, p.title as problem_title, p.code as problem_code FROM submissions s JOIN problems p ON p.id=s.problem_id WHERE s.id=?`)
    .get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Submission not found' });
  if (r.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Not allowed' });
  res.json({
    submission: {
      ...r,
      detail: JSON.parse(r.detail || '[]'),
    },
  });
});

module.exports = router;
