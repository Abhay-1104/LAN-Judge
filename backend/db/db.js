const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'localjudge.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.transaction = (fn) => {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
};

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  college_id TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student', -- student | admin
  status TEXT NOT NULL DEFAULT 'active', -- active | disabled
  avatar_color TEXT DEFAULT '#22C55E',
  admin_requested INTEGER NOT NULL DEFAULT 0, -- 1 = applied for admin/professor access, awaiting approval
  admin_requested_at TEXT,
  rating INTEGER NOT NULL DEFAULT 1200, -- judge rating, Codeforces-style starting value
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL, -- e.g. A, B, C or slug
  title TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'Easy', -- Easy | Medium | Hard
  tags TEXT DEFAULT '[]', -- json array
  statement TEXT,
  input_desc TEXT,
  output_desc TEXT,
  constraints TEXT,
  time_limit_ms INTEGER DEFAULT 2000,
  memory_limit_mb INTEGER DEFAULT 256,
  editorial TEXT,
  visible INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL,
  input TEXT,
  output TEXT,
  explanation TEXT,
  FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS testcases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL,
  input_path TEXT NOT NULL,
  output_path TEXT NOT NULL,
  is_sample INTEGER DEFAULT 0,
  ordinal INTEGER DEFAULT 0,
  FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  problem_id INTEGER NOT NULL,
  contest_id INTEGER,
  language TEXT NOT NULL,
  source TEXT NOT NULL,
  verdict TEXT NOT NULL DEFAULT 'Pending', -- Pending, Accepted, Wrong Answer, Runtime Error, Compilation Error, TLE, MLE
  runtime_ms REAL,
  memory_kb REAL,
  score INTEGER DEFAULT 0,
  passed_count INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  detail TEXT, -- json array of per-testcase result
  submitted_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (problem_id) REFERENCES problems(id)
);

CREATE TABLE IF NOT EXISTS contests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  visibility TEXT DEFAULT 'public', -- public | private
  pin TEXT, -- optional join PIN; NULL/empty = no PIN required
  rating_processed INTEGER NOT NULL DEFAULT 0, -- 1 once rating deltas have been applied for this contest
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS contest_problems (
  contest_id INTEGER NOT NULL,
  problem_id INTEGER NOT NULL,
  label TEXT,
  points INTEGER NOT NULL DEFAULT 100, -- weighted score for a full-accept on this problem in this contest
  PRIMARY KEY (contest_id, problem_id),
  FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
  FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contest_participants (
  contest_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (contest_id, user_id)
);

CREATE TABLE IF NOT EXISTS discussions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contest_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  warning_number INTEGER NOT NULL DEFAULT 1, -- 1, 2, or 3 (3 = auto-submit)
  auto_submitted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Server-side authority for the proctoring lock. The browser can raise
-- violations and *ask* to auto-submit, but whether a student is actually
-- locked out of the editor is decided here, so a page refresh (or a
-- tampered client) can't bypass it. An admin "allow to continue" clears the
-- row instead of deleting it, so the reset is itself auditable.
CREATE TABLE IF NOT EXISTS contest_locks (
  contest_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  locked_at TEXT,
  unlocked_by INTEGER,
  unlocked_at TEXT,
  PRIMARY KEY (contest_id, user_id),
  FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (unlocked_by) REFERENCES users(id)
);

-- Small generic key/value store for institution-wide settings that aren't
-- tied to any one row elsewhere — currently just the HOD master passkey
-- hash. Never store the passkey in plaintext, even here.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- One row per contest per student once rating deltas have been applied, so
-- the "Judge Rating" shown on a profile is auditable and reprocessing a
-- contest (e.g. after fixing a testcase) doesn't double-apply deltas.
CREATE TABLE IF NOT EXISTS rating_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contest_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  old_rating INTEGER NOT NULL,
  new_rating INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ── Quiz / MCQ assessment system ──────────────────────────────────────────
-- Deliberately a parallel set of tables rather than reusing the contest
-- tables directly: quizzes have questions+options instead of problems, and
-- keeping them separate means nothing here can ever affect the
-- already-working contest/coding-problem flow.
CREATE TABLE IF NOT EXISTS quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  visibility TEXT DEFAULT 'public',
  pin TEXT,
  proctored INTEGER NOT NULL DEFAULT 1, -- reuse the same anti-cheat engine as contests
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL, -- 'a' | 'b' | 'c' | 'd'
  points INTEGER NOT NULL DEFAULT 10,
  ordinal INTEGER DEFAULT 0,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_participants (
  quiz_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  joined_at TEXT DEFAULT (datetime('now')),
  submitted INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT,
  PRIMARY KEY (quiz_id, user_id),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS quiz_answers (
  quiz_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  selected_option TEXT, -- 'a' | 'b' | 'c' | 'd' | NULL (skipped)
  answered_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (question_id, user_id),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS quiz_violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  warning_number INTEGER NOT NULL DEFAULT 1,
  auto_submitted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS quiz_locks (
  quiz_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  locked_at TEXT,
  unlocked_by INTEGER,
  unlocked_at TEXT,
  PRIMARY KEY (quiz_id, user_id),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (unlocked_by) REFERENCES users(id)
);
`);

// Lightweight migration for databases created before admin-approval support
// existed — CREATE TABLE IF NOT EXISTS won't add new columns to an existing
// table, so add them by hand if missing.
const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userColumns.includes('admin_requested')) {
  db.exec("ALTER TABLE users ADD COLUMN admin_requested INTEGER NOT NULL DEFAULT 0");
}
if (!userColumns.includes('admin_requested_at')) {
  db.exec("ALTER TABLE users ADD COLUMN admin_requested_at TEXT");
}

const contestColumns = db.prepare("PRAGMA table_info(contests)").all().map((c) => c.name);
if (!contestColumns.includes('pin')) {
  db.exec("ALTER TABLE contests ADD COLUMN pin TEXT");
}
if (!contestColumns.includes('rating_processed')) {
  db.exec("ALTER TABLE contests ADD COLUMN rating_processed INTEGER NOT NULL DEFAULT 0");
}

if (!userColumns.includes('rating')) {
  db.exec("ALTER TABLE users ADD COLUMN rating INTEGER NOT NULL DEFAULT 1200");
}

const contestProblemColumns = db.prepare("PRAGMA table_info(contest_problems)").all().map((c) => c.name);
if (!contestProblemColumns.includes('points')) {
  db.exec("ALTER TABLE contest_problems ADD COLUMN points INTEGER NOT NULL DEFAULT 100");
}

// Profile picture support — stores a relative URL under /uploads/avatars,
// served statically by the backend. NULL means "no photo, show the
// initial-letter avatar" (existing behavior, unchanged).
if (!userColumns.includes('avatar_url')) {
  db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT");
}

// Quiz-taking layout: 'single' = every question on one scrollable page
// (existing/default behavior, unchanged); 'paged' = one question per page
// with left/right navigation. require_all_answered blocks voluntary submit
// until every question has an answer (auto-submit from proctoring always
// bypasses this — see the /submit route's `force` handling).
const quizColumns = db.prepare("PRAGMA table_info(quizzes)").all().map((c) => c.name);
if (!quizColumns.includes('layout_mode')) {
  db.exec("ALTER TABLE quizzes ADD COLUMN layout_mode TEXT NOT NULL DEFAULT 'single'");
}
if (!quizColumns.includes('require_all_answered')) {
  db.exec("ALTER TABLE quizzes ADD COLUMN require_all_answered INTEGER NOT NULL DEFAULT 0");
}

// Optional hints list for a problem — JSON array of strings, same storage
// pattern as `tags`. Only ever shown outside a live contest (see the
// contest-time gating logic in problems.js / ContestDetail).
const problemColumns = db.prepare("PRAGMA table_info(problems)").all().map((c) => c.name);
if (!problemColumns.includes('hints')) {
  db.exec("ALTER TABLE problems ADD COLUMN hints TEXT DEFAULT '[]'");
}

// Community solutions — one markdown post per row. The editor's template
// (Intuition/Approach/Complexity/Code, possibly several named approaches
// with their own code fences) all lives inside `body` as plain markdown,
// so no extra schema is needed to support "multiple approaches" or
// "multiple languages" — they're just more headers/code blocks in the text.
db.exec(`
CREATE TABLE IF NOT EXISTS solutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  tags TEXT DEFAULT '[]', -- json array, e.g. languages/topics
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`);

// Optional image for a quiz question — one image per question, shown above
// the question text on the attempt page. Stored locally (see
// backend/routes/uploads.js), same as every other upload in the app.
const quizQuestionColumns = db.prepare("PRAGMA table_info(quiz_questions)").all().map((c) => c.name);
if (!quizQuestionColumns.includes('image_url')) {
  db.exec("ALTER TABLE quiz_questions ADD COLUMN image_url TEXT");
}

module.exports = db;
