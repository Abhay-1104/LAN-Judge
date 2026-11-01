const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const db = require('./db/db');

const TC_DIR = path.join(__dirname, 'uploads', 'testcases');

function writeTestcase(problemId, ordinal, input, output) {
  const dir = path.join(TC_DIR, String(problemId));
  fs.mkdirSync(dir, { recursive: true });
  const inPath = path.join(dir, `${ordinal}.in`);
  const outPath = path.join(dir, `${ordinal}.out`);
  fs.writeFileSync(inPath, input);
  fs.writeFileSync(outPath, output);
  db.prepare('INSERT INTO testcases (problem_id, input_path, output_path, ordinal) VALUES (?,?,?,?)').run(problemId, inPath, outPath, ordinal);
}

function upsertUser(name, email, collegeId, password, role) {
  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (existing) return existing.id;
  const hash = bcrypt.hashSync(password, 10);
  const colors = ['#22C55E', '#3B82F6', '#F59E0B', '#EF4444', '#A855F7'];
  const info = db
    .prepare('INSERT INTO users (name, email, college_id, password_hash, role, avatar_color) VALUES (?,?,?,?,?,?)')
    .run(name, email, collegeId, hash, role, colors[Math.floor(Math.random() * colors.length)]);
  return info.lastInsertRowid;
}

const adminId = upsertUser('Professor Sharma', 'admin@localjudge.edu', 'FAC001', 'admin123', 'admin');
const students = [
  ['Abhay Verma', 'abhay@college.edu', 'CS21001'],
  ['Rahul Singh', 'rahul@college.edu', 'CS21002'],
  ['Priya Patel', 'priya@college.edu', 'CS21003'],
  ['Aman Gupta', 'aman@college.edu', 'CS21004'],
  ['Vivek Rao', 'vivek@college.edu', 'CS21005'],
  ['Neha Sharma', 'neha@college.edu', 'CS21006'],
].map(([name, email, cid]) => ({ id: upsertUser(name, email, cid, 'student123', 'student'), name, email }));

function upsertProblem(code, title, difficulty, tags, statement, inputDesc, outputDesc, constraints, samples, timeLimitMs = 2000) {
  const existing = db.prepare('SELECT id FROM problems WHERE code=?').get(code);
  if (existing) return existing.id;
  const info = db
    .prepare(
      `INSERT INTO problems (code, title, difficulty, tags, statement, input_desc, output_desc, constraints, time_limit_ms, editorial, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(code, title, difficulty, JSON.stringify(tags), statement, inputDesc, outputDesc, constraints, timeLimitMs, `## Approach\n\nRead the input, apply the direct algorithm, and print the result.\n\n## Complexity\n\n- Time: O(n)\n- Space: O(1)`, adminId);
  const pid = info.lastInsertRowid;
  const sStmt = db.prepare('INSERT INTO samples (problem_id, input, output, explanation) VALUES (?,?,?,?)');
  samples.forEach((s) => sStmt.run(pid, s.input, s.output, s.explanation || ''));
  return pid;
}

// 1. Sum of Array
const sumId = upsertProblem(
  'sum-of-array',
  'Sum of Array',
  'Easy',
  ['Array', 'Math'],
  'Given an array of n integers, calculate the sum of all elements in the array.',
  'The first line contains an integer n — the size of the array.\nThe second line contains n space-separated integers.',
  'Print a single integer — the sum of all elements.',
  '1 ≤ n ≤ 10^5\n-10^4 ≤ a[i] ≤ 10^4',
  [{ input: '5\n1 2 3 4 5', output: '15', explanation: '1 + 2 + 3 + 4 + 5 = 15' }]
);
writeTestcase(sumId, 1, '5\n1 2 3 4 5', '15');
writeTestcase(sumId, 2, '3\n5 5 5', '15');
writeTestcase(sumId, 3, '1\n100', '100');
writeTestcase(sumId, 4, '4\n-1 -2 -3 -4', '-10');

// 2. Binary Search
const bsId = upsertProblem(
  'binary-search',
  'Binary Search',
  'Easy',
  ['Binary Search', 'Array'],
  'Given a sorted array of n integers and a target value x, return the 0-indexed position of x in the array, or -1 if it is not present.',
  'The first line contains n and x. The second line contains n sorted space-separated integers.',
  'Print the index of x, or -1 if not found.',
  '1 ≤ n ≤ 10^5',
  [{ input: '5 4\n1 2 3 4 5', output: '3' }]
);
writeTestcase(bsId, 1, '5 4\n1 2 3 4 5', '3');
writeTestcase(bsId, 2, '5 10\n1 2 3 4 5', '-1');
writeTestcase(bsId, 3, '1 1\n1', '0');

// 3. Two Sum
const twoSumId = upsertProblem(
  'two-sum',
  'Two Sum',
  'Easy',
  ['Array', 'Hash Table'],
  'Given an array of integers and a target, return the indices of the two numbers that add up to the target. Assume exactly one solution exists.',
  'First line: n and target. Second line: n space-separated integers.',
  'Print the two 0-indexed positions separated by a space, in increasing order.',
  '2 ≤ n ≤ 10^4',
  [{ input: '4 9\n2 7 11 15', output: '0 1' }]
);
writeTestcase(twoSumId, 1, '4 9\n2 7 11 15', '0 1');
writeTestcase(twoSumId, 2, '3 6\n3 2 4', '1 2');

// 4. Reverse String
const revId = upsertProblem(
  'reverse-string',
  'Reverse String',
  'Easy',
  ['String'],
  'Given a string, print it reversed.',
  'A single line containing the string s (no spaces).',
  'Print the reversed string.',
  '1 ≤ |s| ≤ 10^5',
  [{ input: 'hello', output: 'olleh' }]
);
writeTestcase(revId, 1, 'hello', 'olleh');
writeTestcase(revId, 2, 'a', 'a');
writeTestcase(revId, 3, 'racecar', 'racecar');

// 5. Valid Parentheses
const validId = upsertProblem(
  'valid-parentheses',
  'Valid Parentheses',
  'Medium',
  ['Stack', 'String'],
  'Given a string containing just the characters (){}[], determine if the input string is valid — every open bracket must be closed by the same type in the correct order. Print "true" or "false".',
  'A single line containing the string.',
  'Print true or false.',
  '1 ≤ |s| ≤ 10^4',
  [{ input: '()[]{}', output: 'true' }]
);
writeTestcase(validId, 1, '()[]{}', 'true');
writeTestcase(validId, 2, '(]', 'false');
writeTestcase(validId, 3, '{[]}', 'true');

// 6. Merge Intervals
const mergeId = upsertProblem(
  'merge-intervals',
  'Merge Intervals',
  'Medium',
  ['Array', 'Sorting'],
  'Given a collection of intervals, merge all overlapping intervals and print them sorted by start, one per line as "start end".',
  'First line: n. Next n lines: start and end of each interval.',
  'Print the merged intervals, one per line.',
  '1 ≤ n ≤ 10^4',
  [{ input: '4\n1 3\n2 6\n8 10\n15 18', output: '1 6\n8 10\n15 18' }]
);
writeTestcase(mergeId, 1, '4\n1 3\n2 6\n8 10\n15 18', '1 6\n8 10\n15 18');
writeTestcase(mergeId, 2, '2\n1 4\n4 5', '1 5');

// 7. Dijkstra Algorithm
const dijId = upsertProblem(
  'dijkstra-algorithm',
  "Dijkstra's Algorithm",
  'Hard',
  ['Graph', 'Shortest Path'],
  'Given a weighted directed graph with n nodes and m edges, and a source node s, print the shortest distance from s to every node (1-indexed). Print -1 if unreachable.',
  'First line: n m s. Next m lines: u v w (edge from u to v with weight w).',
  'Print n integers: the shortest distance to node 1..n.',
  '1 ≤ n ≤ 1000, 0 ≤ w ≤ 1000',
  [{ input: '3 3 1\n1 2 4\n2 3 1\n1 3 7', output: '0 4 5' }]
);
writeTestcase(dijId, 1, '3 3 1\n1 2 4\n2 3 1\n1 3 7', '0 4 5');

// 8. DP Challenge (Longest Increasing Subsequence length)
const dpId = upsertProblem(
  'dp-challenge',
  'DP Challenge: Longest Increasing Subsequence',
  'Hard',
  ['Dynamic Programming'],
  'Given an array of n integers, print the length of the longest strictly increasing subsequence.',
  'First line: n. Second line: n space-separated integers.',
  'Print a single integer.',
  '1 ≤ n ≤ 2500',
  [{ input: '6\n10 9 2 5 3 7', output: '3' }]
);
writeTestcase(dpId, 1, '6\n10 9 2 5 3 7', '3');

// Contest
const now = new Date();
const start = new Date(now.getTime() - 10 * 60000); // started 10 min ago -> Live
const end = new Date(now.getTime() + 90 * 60000);
const existingContest = db.prepare('SELECT id FROM contests WHERE title=?').get('Weekly Contest 45');
let contestId;
if (!existingContest) {
  const info = db
    .prepare('INSERT INTO contests (title, description, start_time, end_time, visibility, created_by) VALUES (?,?,?,?,?,?)')
    .run('Weekly Contest 45', 'Weekly rated contest covering arrays, strings and graphs.', start.toISOString(), end.toISOString(), 'public', adminId);
  contestId = info.lastInsertRowid;
  const cpStmt = db.prepare('INSERT INTO contest_problems (contest_id, problem_id, label) VALUES (?,?,?)');
  [sumId, twoSumId, revId, validId].forEach((pid, i) => cpStmt.run(contestId, pid, 'ABCD'[i]));
} else {
  contestId = existingContest.id;
}

const upcoming1 = new Date(now.getTime() + 3 * 24 * 3600000);
const upcoming1End = new Date(upcoming1.getTime() + 2 * 3600000);
if (!db.prepare('SELECT id FROM contests WHERE title=?').get('Monthly Contest May 2026')) {
  db.prepare('INSERT INTO contests (title, description, start_time, end_time, visibility, created_by) VALUES (?,?,?,?,?,?)').run(
    'Monthly Contest May 2026', 'Monthly rated contest, 5 problems.', upcoming1.toISOString(), upcoming1End.toISOString(), 'public', adminId
  );
}

// Some sample submissions so dashboards/leaderboards aren't empty
const sampleSolutions = {
  [sumId]: { language: 'python', source: 'n=int(input())\na=list(map(int,input().split()))\nprint(sum(a))' },
  [revId]: { language: 'python', source: 's=input()\nprint(s[::-1])' },
};
const { judgeSubmission } = require('./judge/judge');

async function seedSubmissions() {
  for (const student of students.slice(0, 4)) {
    for (const [pid, sol] of Object.entries(sampleSolutions)) {
      const already = db.prepare('SELECT 1 FROM submissions WHERE user_id=? AND problem_id=?').get(student.id, pid);
      if (already) continue;
      const testcases = db.prepare('SELECT * FROM testcases WHERE problem_id=?').all(pid).map((t) => ({
        input: fs.readFileSync(t.input_path, 'utf8'),
        output: fs.readFileSync(t.output_path, 'utf8'),
      }));
      const problem = db.prepare('SELECT * FROM problems WHERE id=?').get(pid);
      const result = await judgeSubmission(sol.language, sol.source, testcases, { timeLimitMs: problem.time_limit_ms });
      const score = Math.round((result.passed / result.total) * 100);
      db.prepare(
        `INSERT INTO submissions (user_id, problem_id, language, source, verdict, runtime_ms, memory_kb, score, passed_count, total_count, detail)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      ).run(student.id, pid, sol.language, sol.source, result.verdict, result.runtimeMs, result.memoryKb, score, result.passed, result.total, JSON.stringify(result.detail));
      db.prepare('INSERT OR IGNORE INTO contest_participants (contest_id, user_id) VALUES (?,?)').run(contestId, student.id);
    }
  }
  console.log('Seed complete — demo data added.');
  console.log('Admin login: admin@localjudge.edu / admin123');
  console.log('Student login: abhay@college.edu / student123');
  console.log('\nThis is optional demo/testing data. For real use, delete localjudge.db');
  console.log('and just register real accounts through the app instead.');
}

seedSubmissions();
