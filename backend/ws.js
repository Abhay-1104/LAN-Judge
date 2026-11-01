const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./middleware/auth');
const db = require('./db/db');

// Sockets grouped by contest, so a broadcast only reaches people relevant to
// that contest instead of every connected client.
// contestId -> Set of { ws, userId, role }
const contestRooms = new Map();

// Same idea, parallel structure, for quizzes — kept entirely separate from
// contestRooms so nothing here can affect the existing contest proctoring
// behavior.
const quizRooms = new Map();

// Ephemeral, in-memory only — live activity stats reset if the server
// restarts, which is fine since they're just a monitoring convenience, not
// data of record (submissions/violations are the real persisted data).
// contestId -> userId -> { keystrokes, runs, submits, lastActiveAt, codeLength, status }
const liveActivity = new Map();
const liveQuizActivity = new Map();

function roomFor(contestId) {
  if (!contestRooms.has(contestId)) contestRooms.set(contestId, new Set());
  return contestRooms.get(contestId);
}

function quizRoomFor(quizId) {
  if (!quizRooms.has(quizId)) quizRooms.set(quizId, new Set());
  return quizRooms.get(quizId);
}

function activityFor(contestId) {
  if (!liveActivity.has(contestId)) liveActivity.set(contestId, new Map());
  return liveActivity.get(contestId);
}

function quizActivityFor(quizId) {
  if (!liveQuizActivity.has(quizId)) liveQuizActivity.set(quizId, new Map());
  return liveQuizActivity.get(quizId);
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function broadcastToContest(contestId, payload, { adminOnly = false } = {}) {
  const room = contestRooms.get(String(contestId));
  if (!room) return;
  for (const client of room) {
    if (adminOnly && client.role !== 'admin') continue;
    send(client.ws, payload);
  }
}

function broadcastToQuiz(quizId, payload, { adminOnly = false } = {}) {
  const room = quizRooms.get(String(quizId));
  if (!room) return;
  for (const client of room) {
    if (adminOnly && client.role !== 'admin') continue;
    send(client.ws, payload);
  }
}

function setupWebSocketServer(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    let identity = null; // { userId, role, name }
    let joinedContestId = null;
    let joinedQuizId = null;

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      // First message must authenticate with the same JWT used for the REST API.
      if (msg.type === 'auth') {
        try {
          const payload = jwt.verify(msg.token, JWT_SECRET);
          identity = { userId: payload.id, role: payload.role, name: payload.name };
          send(ws, { type: 'auth_ok' });
        } catch {
          send(ws, { type: 'auth_error' });
          ws.close();
        }
        return;
      }

      if (!identity) return; // ignore anything before auth

      if (msg.type === 'join_contest') {
        joinedContestId = String(msg.contestId);
        const client = { ws, userId: identity.userId, role: identity.role, name: identity.name };
        roomFor(joinedContestId).add(client);
        ws._client = client;

        if (identity.role !== 'admin') {
          const activity = activityFor(joinedContestId);
          activity.set(identity.userId, {
            userId: identity.userId,
            name: identity.name,
            keystrokes: 0,
            runs: 0,
            submits: 0,
            codeLength: 0,
            status: 'active',
            lastActiveAt: Date.now(),
          });
          broadcastToContest(joinedContestId, { type: 'student_joined', userId: identity.userId, name: identity.name }, { adminOnly: true });
        }
        return;
      }

      // Parallel to join_contest, for the MCQ/quiz proctoring flow — kept as
      // its own branch so it can never interfere with the contest one above.
      if (msg.type === 'join_quiz') {
        joinedQuizId = String(msg.quizId);
        const client = { ws, userId: identity.userId, role: identity.role, name: identity.name };
        quizRoomFor(joinedQuizId).add(client);
        ws._quizClient = client;

        if (identity.role !== 'admin') {
          const activity = quizActivityFor(joinedQuizId);
          activity.set(identity.userId, {
            userId: identity.userId,
            name: identity.name,
            answered: 0,
            status: 'active',
            lastActiveAt: Date.now(),
          });
          broadcastToQuiz(joinedQuizId, { type: 'student_joined', userId: identity.userId, name: identity.name }, { adminOnly: true });
        }
        return;
      }

      if (!joinedContestId && !joinedQuizId) return;

      // Live activity pings from a student's editor (keystrokes/runs/idle),
      // used only to populate the admin's monitoring cards.
      if (msg.type === 'activity' && identity.role !== 'admin' && joinedContestId) {
        const activity = activityFor(joinedContestId);
        const current = activity.get(identity.userId) || { userId: identity.userId, name: identity.name };
        Object.assign(current, msg.data, { lastActiveAt: Date.now() });
        activity.set(identity.userId, current);
        broadcastToContest(joinedContestId, { type: 'activity_update', userId: identity.userId, name: identity.name, data: current }, { adminOnly: true });
        return;
      }

      // Same idea for quizzes — e.g. "answered N of M questions so far".
      if (msg.type === 'activity' && identity.role !== 'admin' && joinedQuizId) {
        const activity = quizActivityFor(joinedQuizId);
        const current = activity.get(identity.userId) || { userId: identity.userId, name: identity.name };
        Object.assign(current, msg.data, { lastActiveAt: Date.now() });
        activity.set(identity.userId, current);
        broadcastToQuiz(joinedQuizId, { type: 'activity_update', userId: identity.userId, name: identity.name, data: current }, { adminOnly: true });
        return;
      }

      // A proctoring violation. Only ever a short text message — the actual
      // camera/mic streams never leave the student's browser.
      // A proctoring violation. Only ever a short text message — the actual
      // camera/mic streams never leave the student's browser.
      if (msg.type === 'violation' && identity.role !== 'admin' && joinedContestId) {
        const { message, warningNumber, autoSubmitted, freeze } = msg;
        db.prepare(
          `INSERT INTO violations (contest_id, user_id, message, warning_number, auto_submitted) VALUES (?,?,?,?,?)`
        ).run(joinedContestId, identity.userId, message, warningNumber || 1, autoSubmitted ? 1 : 0);

        // Strike 3 or explicit freeze locks the student server-side.
        if (autoSubmitted || freeze || (warningNumber && warningNumber >= 3)) {
          db.prepare(
            `INSERT INTO contest_locks (contest_id, user_id, locked, reason, locked_at)
             VALUES (?,?,1,?,datetime('now'))
             ON CONFLICT(contest_id, user_id) DO UPDATE SET locked=1, reason=excluded.reason, locked_at=excluded.locked_at, unlocked_by=NULL, unlocked_at=NULL`
          ).run(joinedContestId, identity.userId, message);
        }

        const activity = activityFor(joinedContestId);
        const current = activity.get(identity.userId) || { userId: identity.userId, name: identity.name };
        if (autoSubmitted) current.status = 'auto-submitted';
        else if (freeze || (warningNumber && warningNumber >= 3)) current.status = 'frozen';
        activity.set(identity.userId, current);

        broadcastToContest(
          joinedContestId,
          {
            type: 'violation',
            userId: identity.userId,
            name: identity.name,
            message,
            warningNumber: warningNumber || 1,
            autoSubmitted: !!autoSubmitted,
            frozen: !!(freeze || (warningNumber && warningNumber >= 3)),
            at: new Date().toISOString(),
          },
          { adminOnly: true }
        );
        return;
      }

      // Same violation/lock flow as contests, but writing to the quiz_* tables
      if (msg.type === 'violation' && identity.role !== 'admin' && joinedQuizId) {
        const { message, warningNumber, autoSubmitted, freeze } = msg;
        db.prepare(
          `INSERT INTO quiz_violations (quiz_id, user_id, message, warning_number, auto_submitted) VALUES (?,?,?,?,?)`
        ).run(joinedQuizId, identity.userId, message, warningNumber || 1, autoSubmitted ? 1 : 0);

        // Strike 3 or explicit freeze locks the student server-side.
        if (autoSubmitted || freeze || (warningNumber && warningNumber >= 3)) {
          db.prepare(
            `INSERT INTO quiz_locks (quiz_id, user_id, locked, reason, locked_at)
             VALUES (?,?,1,?,datetime('now'))
             ON CONFLICT(quiz_id, user_id) DO UPDATE SET locked=1, reason=excluded.reason, locked_at=excluded.locked_at, unlocked_by=NULL, unlocked_at=NULL`
          ).run(joinedQuizId, identity.userId, message);

          // Only submit quiz if autoSubmitted is explicitly true (e.g. 5-min timer expired)
          if (autoSubmitted) {
            db.prepare(
              `UPDATE quiz_participants SET submitted=1, submitted_at=datetime('now') WHERE quiz_id=? AND user_id=? AND submitted=0`
            ).run(joinedQuizId, identity.userId);
          }
        }

        const activity = quizActivityFor(joinedQuizId);
        const current = activity.get(identity.userId) || { userId: identity.userId, name: identity.name };
        if (autoSubmitted) current.status = 'auto-submitted';
        else if (freeze || (warningNumber && warningNumber >= 3)) current.status = 'frozen';
        activity.set(identity.userId, current);

        broadcastToQuiz(
          joinedQuizId,
          {
            type: 'violation',
            userId: identity.userId,
            name: identity.name,
            message,
            warningNumber: warningNumber || 1,
            autoSubmitted: !!autoSubmitted,
            at: new Date().toISOString(),
          },
          { adminOnly: true }
        );
        return;
      }

      // Admin manually ends/starts a contest — broadcast instantly instead of
      // waiting for students' clients to next poll the REST API.
      if (msg.type === 'contest_control' && identity.role === 'admin' && joinedContestId) {
        broadcastToContest(joinedContestId, { type: 'contest_control', action: msg.action });
        return;
      }

      if (msg.type === 'quiz_control' && identity.role === 'admin' && joinedQuizId) {
        broadcastToQuiz(joinedQuizId, { type: 'quiz_control', action: msg.action });
        return;
      }
    });

    ws.on('close', () => {
      if (joinedContestId && ws._client) {
        roomFor(joinedContestId).delete(ws._client);
        if (identity && identity.role !== 'admin') {
          const activity = activityFor(joinedContestId);
          const current = activity.get(identity.userId);
          if (current && current.status !== 'auto-submitted') current.status = 'disconnected';
          broadcastToContest(joinedContestId, { type: 'student_left', userId: identity.userId }, { adminOnly: true });
        }
      }
      if (joinedQuizId && ws._quizClient) {
        quizRoomFor(joinedQuizId).delete(ws._quizClient);
        if (identity && identity.role !== 'admin') {
          const activity = quizActivityFor(joinedQuizId);
          const current = activity.get(identity.userId);
          if (current && current.status !== 'auto-submitted') current.status = 'disconnected';
          broadcastToQuiz(joinedQuizId, { type: 'student_left', userId: identity.userId }, { adminOnly: true });
        }
      }
    });
  });

  return wss;
}

function getLiveActivity(contestId) {
  const activity = activityFor(String(contestId));
  return Array.from(activity.values());
}

function getLiveQuizActivity(quizId) {
  const activity = quizActivityFor(String(quizId));
  return Array.from(activity.values());
}

module.exports = { setupWebSocketServer, broadcastToContest, getLiveActivity, broadcastToQuiz, getLiveQuizActivity };
