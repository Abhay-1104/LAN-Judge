const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const db = require('../db/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const TC_DIR = path.join(__dirname, '..', 'uploads', 'testcases');

function slugify(title) {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
}

function computeAcceptance(problemId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) total, SUM(CASE WHEN verdict='Accepted' THEN 1 ELSE 0 END) accepted
       FROM submissions WHERE problem_id = ?`
    )
    .get(problemId);
  const total = row.total || 0;
  const accepted = row.accepted || 0;
  return total === 0 ? 0 : Math.round((accepted / total) * 1000) / 10;
}

function solvedCount(problemId) {
  return db
    .prepare(`SELECT COUNT(DISTINCT user_id) c FROM submissions WHERE problem_id=? AND verdict='Accepted'`)
    .get(problemId).c;
}

// List problems
router.get('/', requireAuth, (req, res) => {
  const { difficulty, tag, search } = req.query;
  let rows = db.prepare('SELECT * FROM problems WHERE visible = 1 ORDER BY id ASC').all();
  if (difficulty && difficulty !== 'All') rows = rows.filter((p) => p.difficulty === difficulty);
  if (tag) rows = rows.filter((p) => JSON.parse(p.tags || '[]').includes(tag));
  if (search) rows = rows.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()));

  const myAccepted = new Set(
    db
      .prepare(`SELECT DISTINCT problem_id FROM submissions WHERE user_id=? AND verdict='Accepted'`)
      .all(req.user.id)
      .map((r) => r.problem_id)
  );
  const myAttempted = new Set(
    db.prepare(`SELECT DISTINCT problem_id FROM submissions WHERE user_id=?`).all(req.user.id).map((r) => r.problem_id)
  );

  const result = rows.map((p) => ({
    id: p.id,
    code: p.code,
    title: p.title,
    difficulty: p.difficulty,
    tags: JSON.parse(p.tags || '[]'),
    acceptance: computeAcceptance(p.id),
    solved: solvedCount(p.id),
    status: myAccepted.has(p.id) ? 'Solved' : myAttempted.has(p.id) ? 'Attempted' : 'Todo',
  }));
  res.json({ problems: result });
});

// ── Custom tags ────────────────────────────────────────────────────────────
// Base preset tags plus any custom ones a professor has added, stored as a
// JSON array under a single settings key so they persist without a new
// table. Placed before "/:id" so "tags" is never swallowed as an :id param.
const BASE_TAGS = ['Array', 'String', 'Math', 'Binary Search', 'Hash Table', 'Stack', 'Sorting', 'Graph', 'Shortest Path', 'Dynamic Programming'];

function getCustomTags() {
  const row = db.prepare("SELECT value FROM settings WHERE key='custom_problem_tags'").get();
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

router.get('/tags', requireAuth, (req, res) => {
  res.json({ tags: [...BASE_TAGS, ...getCustomTags()] });
});

router.post('/tags', requireAuth, requireAdmin, (req, res) => {
  const name = (req.body.tag || '').trim();
  if (!name) return res.status(400).json({ error: 'Tag name is required' });
  const custom = getCustomTags();
  const all = [...BASE_TAGS, ...custom];
  if (all.some((t) => t.toLowerCase() === name.toLowerCase())) {
    return res.json({ tags: [...BASE_TAGS, ...custom] }); // already exists, no-op
  }
  const next = [...custom, name];
  db.prepare("INSERT INTO settings (key, value) VALUES ('custom_problem_tags', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(
    JSON.stringify(next)
  );
  res.json({ tags: [...BASE_TAGS, ...next] });
});

// Get single problem detail
router.get('/:id', requireAuth, (req, res) => {
  const p = db.prepare('SELECT * FROM problems WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Problem not found' });
  const samples = db.prepare('SELECT * FROM samples WHERE problem_id=?').all(p.id);
  res.json({
    problem: {
      ...p,
      tags: JSON.parse(p.tags || '[]'),
      hints: JSON.parse(p.hints || '[]'),
      acceptance: computeAcceptance(p.id),
      solved: solvedCount(p.id),
      samples,
      // hide full editorial for non-solvers is skipped for simplicity; expose it
    },
  });
});

// Create problem (admin)
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { title, difficulty, tags, statement, inputDesc, outputDesc, constraints, timeLimitMs, memoryLimitMb, samples, editorial, hints } = req.body;
  if (!title || !statement) return res.status(400).json({ error: 'Title and statement are required' });

  let code = slugify(title) || `p${Date.now()}`;
  let base = code;
  let n = 1;
  while (db.prepare('SELECT id FROM problems WHERE code=?').get(code)) {
    code = `${base}-${n++}`;
  }

  const info = db
    .prepare(
      `INSERT INTO problems (code, title, difficulty, tags, statement, input_desc, output_desc, constraints, time_limit_ms, memory_limit_mb, editorial, hints, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      code,
      title,
      difficulty || 'Easy',
      JSON.stringify(tags || []),
      statement,
      inputDesc || '',
      outputDesc || '',
      constraints || '',
      timeLimitMs || 2000,
      memoryLimitMb || 256,
      editorial || '',
      JSON.stringify(Array.isArray(hints) ? hints.filter((h) => h && h.trim()) : []),
      req.user.id
    );

  const problemId = info.lastInsertRowid;
  if (Array.isArray(samples)) {
    const stmt = db.prepare('INSERT INTO samples (problem_id, input, output, explanation) VALUES (?,?,?,?)');
    for (const s of samples) {
      stmt.run(problemId, s.input || '', s.output || '', s.explanation || '');
      // Also register samples as judged testcases so "Run" works immediately
    }
  }

  res.status(201).json({ problem: { id: problemId, code } });
});

// Update problem (admin)
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM problems WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Problem not found' });
  const fields = req.body;
  const merged = {
    title: fields.title ?? p.title,
    difficulty: fields.difficulty ?? p.difficulty,
    tags: JSON.stringify(fields.tags ?? JSON.parse(p.tags || '[]')),
    statement: fields.statement ?? p.statement,
    input_desc: fields.inputDesc ?? p.input_desc,
    output_desc: fields.outputDesc ?? p.output_desc,
    constraints: fields.constraints ?? p.constraints,
    time_limit_ms: fields.timeLimitMs ?? p.time_limit_ms,
    memory_limit_mb: fields.memoryLimitMb ?? p.memory_limit_mb,
    editorial: fields.editorial ?? p.editorial,
    hints: JSON.stringify(
      Array.isArray(fields.hints) ? fields.hints.filter((h) => h && h.trim()) : JSON.parse(p.hints || '[]')
    ),
    visible: fields.visible === undefined ? p.visible : (fields.visible ? 1 : 0),
  };
  db.prepare(
    `UPDATE problems SET title=?, difficulty=?, tags=?, statement=?, input_desc=?, output_desc=?, constraints=?, time_limit_ms=?, memory_limit_mb=?, editorial=?, hints=?, visible=? WHERE id=?`
  ).run(
    merged.title, merged.difficulty, merged.tags, merged.statement, merged.input_desc, merged.output_desc,
    merged.constraints, merged.time_limit_ms, merged.memory_limit_mb, merged.editorial, merged.hints, merged.visible, req.params.id
  );
  res.json({ ok: true });
});

// Delete problem (admin)
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = req.params.id;
  try {
    const deleteSubmissions = db.prepare('DELETE FROM submissions WHERE problem_id = ?');
    const deleteSamples = db.prepare('DELETE FROM samples WHERE problem_id = ?');
    const deleteTestcases = db.prepare('DELETE FROM testcases WHERE problem_id = ?');
    const deleteContestProblems = db.prepare('DELETE FROM contest_problems WHERE problem_id = ?');
    const deleteDiscussions = db.prepare('DELETE FROM discussions WHERE problem_id = ?');
    const deleteSolutions = db.prepare('DELETE FROM solutions WHERE problem_id = ?');
    const deleteProblem = db.prepare('DELETE FROM problems WHERE id = ?');

    db.transaction(() => {
      deleteSubmissions.run(id);
      deleteSamples.run(id);
      deleteTestcases.run(id);
      deleteContestProblems.run(id);
      deleteDiscussions.run(id);
      deleteSolutions.run(id);
      deleteProblem.run(id);
    })();

    // Also remove testcase directory from disk if it exists
    const problemDir = path.join(TC_DIR, String(id));
    if (fs.existsSync(problemDir)) {
      try {
        fs.rmSync(problemDir, { recursive: true, force: true });
      } catch (e) {
        console.error('Failed to remove problem directory', problemDir, e);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete problem', id, err);
    res.status(500).json({ error: 'Failed to delete problem: ' + err.message });
  }
});

// Upload testcases as a ZIP of matching .txt/.in/.out pairs (admin)
// Expect a single ZIP field "testcases" containing files like 1.in/1.out, 2.in/2.out ...
router.post('/:id/testcases', requireAuth, requireAdmin, upload.single('zip'), (req, res) => {
  const p = db.prepare('SELECT * FROM problems WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Problem not found' });
  if (!req.file) return res.status(400).json({ error: 'ZIP file is required (field name "zip")' });

  let zip;
  try {
    zip = new AdmZip(req.file.buffer);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid ZIP file' });
  }

  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  const byBase = {};
  for (const entry of entries) {
    const name = path.basename(entry.entryName);
    const ext = path.extname(name).toLowerCase();
    const base = name.slice(0, -ext.length);
    if (!byBase[base]) byBase[base] = {};
    if (['.in', '.txt'].includes(ext) && !name.toLowerCase().includes('out')) byBase[base].input = entry.getData().toString('utf8');
    if (ext === '.out' || name.toLowerCase().includes('output')) byBase[base].output = entry.getData().toString('utf8');
  }

  const problemDir = path.join(TC_DIR, String(p.id));
  fs.mkdirSync(problemDir, { recursive: true });

  db.prepare('DELETE FROM testcases WHERE problem_id=?').run(p.id);
  const insert = db.prepare('INSERT INTO testcases (problem_id, input_path, output_path, ordinal) VALUES (?,?,?,?)');

  let ordinal = 0;
  const sortedKeys = Object.keys(byBase).sort();
  let saved = 0;
  for (const key of sortedKeys) {
    const pair = byBase[key];
    if (pair.input === undefined || pair.output === undefined) continue;
    ordinal++;
    const inPath = path.join(problemDir, `${ordinal}.in`);
    const outPath = path.join(problemDir, `${ordinal}.out`);
    fs.writeFileSync(inPath, pair.input);
    fs.writeFileSync(outPath, pair.output);
    insert.run(p.id, inPath, outPath, ordinal);
    saved++;
  }

  res.json({ ok: true, testcasesSaved: saved });
});

// Duplicate a problem (statement, samples, and testcase files) as a starting
// point for a variant — e.g. a make-up exam version of an existing question.
router.post('/:id/clone', requireAuth, requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM problems WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Problem not found' });

  let code = `${slugify(p.title)}-copy` || `p${Date.now()}-copy`;
  let base = code;
  let n = 1;
  while (db.prepare('SELECT id FROM problems WHERE code=?').get(code)) {
    code = `${base}-${n++}`;
  }

  const info = db
    .prepare(
      `INSERT INTO problems (code, title, difficulty, tags, statement, input_desc, output_desc, constraints, time_limit_ms, memory_limit_mb, editorial, hints, visible, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      code, `${p.title} (Copy)`, p.difficulty, p.tags, p.statement, p.input_desc, p.output_desc,
      p.constraints, p.time_limit_ms, p.memory_limit_mb, p.editorial, p.hints || '[]', 0 /* start hidden until reviewed */, req.user.id
    );
  const newId = info.lastInsertRowid;

  const samples = db.prepare('SELECT * FROM samples WHERE problem_id=?').all(p.id);
  const insSample = db.prepare('INSERT INTO samples (problem_id, input, output, explanation) VALUES (?,?,?,?)');
  for (const s of samples) insSample.run(newId, s.input, s.output, s.explanation);

  const testcases = db.prepare('SELECT * FROM testcases WHERE problem_id=?').all(p.id);
  if (testcases.length > 0) {
    const newDir = path.join(TC_DIR, String(newId));
    fs.mkdirSync(newDir, { recursive: true });
    const insTc = db.prepare('INSERT INTO testcases (problem_id, input_path, output_path, is_sample, ordinal) VALUES (?,?,?,?,?)');
    for (const tc of testcases) {
      const newIn = path.join(newDir, path.basename(tc.input_path));
      const newOut = path.join(newDir, path.basename(tc.output_path));
      try {
        fs.copyFileSync(tc.input_path, newIn);
        fs.copyFileSync(tc.output_path, newOut);
        insTc.run(newId, newIn, newOut, tc.is_sample, tc.ordinal);
      } catch {
        // Source testcase file missing on disk (e.g. moved DB without uploads folder) — skip it rather than fail the whole clone.
      }
    }
  }

  res.status(201).json({ problem: { id: newId, code } });
});

router.get('/:id/testcases', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, ordinal FROM testcases WHERE problem_id=? ORDER BY ordinal').all(req.params.id);
  res.json({ testcases: rows });
});

module.exports = router;
