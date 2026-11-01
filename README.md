# SIH — LocalJudge

Offline, LAN-based competitive programming judge and classroom assessment platform. One professor's laptop hosts the server; students connect over the local network — no internet required.

## Stack
- **Backend:** Node.js + Express, SQLite (via `node:sqlite`), WebSocket for live proctoring/monitoring
- **Frontend:** React + Vite + Tailwind, Monaco editor
- **Judge:** Sandboxed subprocess execution — Python 3, Node.js, C++ (g++), Java (javac/java)

## Setup

```bash
cd backend && npm install && npm start
cd frontend && npm install && npm run dev
```

The backend serves over HTTPS with a self-signed cert (required for camera/mic proctoring permissions in the browser). On first run, check **Admin → LAN Diagnostic** for the exact URL to give students.

## What's in this build

### Phase 1 — Contest foundations
- PIN-protected contests (optional, 4–8 digit, server-verified)
- Weighted points per problem, configurable per contest

### Phase 2 — Admin quality-of-life
- HOD Master Passkey: correct passkey at registration grants instant admin access; otherwise the request goes to the HOD approval queue
- LAN Diagnostic panel: host IP, compiler/runtime availability (Python/Node/g++/javac), RAM, uptime

### Phase 3 — Grading & rating
- Judge Rating: rank-based performance rating computed when a contest ends, with a rating history audit trail
- CSV export: detailed per-submission log + per-student gradebook summary (both global and per-contest)

### Phase 4 — Monitoring dashboards
- Live Lab Submissions Feed (polling-based, spans every problem/contest)
- 24-hour AC vs non-AC velocity chart
- Server RAM/uptime monitor

### Phase 5 — Polish
- Pick Random (prefers unsolved problems)
- Quick account switcher (multi-profile, shared-lab-PC friendly)
- Practice streak (consecutive days with an accepted submission)
- Clone problem (statement + samples + testcase files)
- Autosave code drafts (practice mode only, per problem+language)

### Proctor mode — server-authoritative freeze/resume
- Existing camera/mic/tab-switch/window-blur detection, now backed by a `contest_locks` table
- On the 3rd violation: the student's editor freezes **and the server itself rejects further Run/Submit calls** — refreshing the page or tampering with the client cannot bypass it
- Admin "Allow to Continue" button clears the freeze and pushes a live WebSocket update straight to the student's screen

### Quiz / Assessment system
- Full MCQ quiz builder (per-question points, PIN protection, optional proctoring toggle)
- Reuses the exact same proctoring engine, lock/unlock flow, and WebSocket pattern as coding contests — via parallel `quiz_*` tables so nothing here can affect the working contest code
- Auto-grades on submit, per-question results breakdown, live admin monitor with the same frozen-student panel

## Notes
- All new tables are additive; existing tables only gained new columns (with safe migrations for existing databases)
- `node_modules` excluded from this archive — run `npm install` in both `backend/` and `frontend/` before starting
