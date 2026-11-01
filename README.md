# ⚖️ LocalJudge

Offline, LAN-based competitive programming judge and classroom assessment platform. One professor's laptop hosts the server, students connect from any browser on the same Wi-Fi/LAN — **no internet required**. Real code compilation, timed contests, MCQ quizzes, and server-enforced proctoring.

📸 **Screenshots:** add images to `docs/screenshots/` and link them here

---

## ✨ Features

- **Real Code Judge** — Submissions are actually compiled and executed, with time limits and memory tracking, and return real verdicts (AC / WA / RE / TLE / CE)
- **5 Languages** — C, C++, Java, Python, JavaScript (via real `g++`, `javac`, `python3`, `node`)
- **Monaco Code Editor** — Same editor as VS Code, bundled locally so it works with zero internet
- **Contests** — Timed contests with live leaderboards, optional 4–8 digit PIN, and weighted points per problem
- **Judge Rating** — Rank-based rating computed when a contest ends, with a full rating-history audit trail
- **Quiz / Assessment System** — MCQ builder with per-question points, PIN protection, auto-grading, and a results breakdown
- **Proctor Mode** — Camera, mic, tab-switch, and window-blur detection. On the 3rd violation the editor freezes **and the server rejects further Run/Submit calls**, so refreshing or tampering with the client cannot bypass it
- **Live Admin Monitoring** — Real-time violation feed, frozen-student panel, and an "Allow to Continue" button that pushes an update over WebSocket
- **Admin Console** — Platform stats, verdict and language charts, 24-hour velocity chart, problem editor, test case uploader, user management
- **HOD Master Passkey** — Correct passkey at registration grants instant admin access; otherwise the request goes to an approval queue
- **LAN Diagnostic** — Shows the host IP to give students, compiler availability, RAM, and uptime
- **CSV Exports** — Detailed submission log and per-student gradebook, both global and per-contest
- **Document Import** — Import problems and quizzes from DOCX / PDF files
- **Student Extras** — Practice streaks, activity heatmap, pick-random problem, autosaved drafts, discussions, published solutions, quick account switcher
- **Dark / Light Mode** — Persistent theme preference
- **Single-Process Deploy** — One Node server serves both the API and the built frontend

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, Monaco Editor, Axios, Recharts, React Router |
| Backend | Node.js (22.5+), Express 5, WebSocket (`ws`), `child_process` |
| Database | SQLite (built-in `node:sqlite`, single file, zero setup) |
| Auth | JWT, bcryptjs |
| Judge | Sandboxed subprocess execution with timeout + `/proc` memory tracking |
| Uploads / Import | Multer, adm-zip, mammoth (DOCX), pdf-parse (PDF) |
| Security | Self-signed HTTPS (required for camera/mic in browsers) |
| Network | Host laptop + Wi-Fi / LAN |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 22.5+** (needed for built-in `node:sqlite`)
- Compilers / runtimes for the languages you want to support:
  - C / C++ → `g++`
  - Java → `javac` and `java` (JDK)
  - Python → `python3`
  - JavaScript → `node`

> You can check what is detected on the host in **Admin → LAN Diagnostic** after starting.

### Installation

```bash
git clone https://github.com/your-username/LocalJudge.git
cd LocalJudge
```

### Configuration

```bash
cd backend
cp .env.example .env
```

Open `.env` and set a strong secret:

```env
PORT=4000
HOST=0.0.0.0
JWT_SECRET=change-this-to-a-long-random-string
```

> **Important:** never commit `.env`. Always set your own `JWT_SECRET` before real use.

### Run (one command)

```bash
bash start.sh
```

This installs dependencies on first run, builds the frontend, and starts the server.

Or manually:

```bash
cd backend && npm install
cd ../frontend && npm install && npm run build
cd ../backend && node server.js
```

The server prints the LAN URLs, for example:

```
https://192.168.1.10:4000
```

Give this URL to students. Because the certificate is self-signed, the browser shows a warning the first time — click **Advanced → Proceed**. This is expected on a trusted classroom LAN.

### First Login

The database is created automatically and starts empty. **The first account you register becomes the admin.** After that, set a HOD Master Passkey from **Admin → HOD Settings** if you want instant-admin registration for other professors.

### Dev Mode (hot reload)

```bash
# Terminal 1 - backend
cd backend && node server.js

# Terminal 2 - frontend
cd frontend && npm run dev
```

Frontend → `http://localhost:5173` (proxies `/api`, `/uploads`, `/ws` to the backend)
Backend → `https://localhost:4000`

### Optional: Demo Data

```bash
cd backend && node seed-demo-data.js
```

Creates demo accounts and sample problems for testing. Remove or change these accounts before any real use.

---

## 📁 Project Structure

```
LocalJudge/
├── frontend/                  # React + Vite frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Landing.jsx        # Public landing page
│   │   │   ├── Login.jsx / Register.jsx
│   │   │   ├── Dashboard.jsx      # Student stats, streaks
│   │   │   ├── ProblemsList.jsx   # Filter / search / random pick
│   │   │   ├── ProblemDetail.jsx  # Statement + Monaco editor ⭐
│   │   │   ├── Contests.jsx / ContestDetail.jsx
│   │   │   ├── Quizzes.jsx / QuizTake.jsx
│   │   │   ├── SubmissionHistory.jsx
│   │   │   ├── Leaderboard.jsx / Profile.jsx / Reports.jsx
│   │   │   └── admin/             # Admin console
│   │   │       ├── AdminDashboard.jsx
│   │   │       ├── AddProblem.jsx / UploadTestCases.jsx
│   │   │       ├── ContestManagement.jsx / ContestMonitor.jsx
│   │   │       ├── QuizManagement.jsx / QuizMonitor.jsx
│   │   │       ├── UserManagement.jsx
│   │   │       ├── LanDiagnostic.jsx
│   │   │       └── HodSettings.jsx
│   │   ├── components/            # AppLayout, ProctoringModals, guards, UI
│   │   ├── context/               # Auth context
│   │   ├── hooks/ api/ lib/
│   └── vite.config.js
│
├── backend/                   # Express backend
│   ├── server.js              # Entry point (HTTPS + static frontend)
│   ├── ws.js                  # WebSocket server (live proctoring updates)
│   ├── certs.js               # Self-signed certificate generation
│   ├── db/db.js               # SQLite schema + safe migrations
│   ├── middleware/auth.js     # JWT middleware
│   ├── judge/
│   │   ├── judge.js           # Compile / run / compare / verdict ⭐
│   │   └── queue.js           # Concurrency-limited judge queue
│   ├── routes/                # auth, problems, submissions, contests, quiz,
│   │                          # users, stats, system, export, import, ...
│   ├── services/documentImport.js
│   ├── seed-demo-data.js
│   └── .env.example
│
├── start.sh                   # One-command launcher
├── TESTING.md
├── LICENSE
└── README.md
```

---

## ⚙️ How the Judge Works

1. Student submits code → server checks the **proctoring lock** (frozen students are rejected server-side)
2. Code is written to a **fresh temp sandbox directory**
3. Compiled (C, C++, Java) or interpreted (Python, JavaScript) with a real toolchain
4. Each test case input is fed through **stdin**
5. The process is **killed at the time limit**; memory is tracked via `/proc/<pid>/status`
6. Output is compared against the expected `.out` file
7. Verdict is stored: **Accepted, Wrong Answer, Runtime Error, Time Limit Exceeded, Compilation Error**
8. Leaderboards, history, and the live admin feed update

Test cases are uploaded as zipped `.in` / `.out` pairs from **Admin → Upload Test Cases**.

---

## 🔌 API Reference

All endpoints are under `/api` and use a JWT in the `Authorization: Bearer <token>` header, except register and login.

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account (optional HOD passkey) |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Get current user |

### Problems

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/problems` | List / filter problems |
| GET | `/api/problems/:id` | Problem details |
| POST | `/api/problems` | Create problem (admin) |
| PUT | `/api/problems/:id` | Update problem (admin) |
| DELETE | `/api/problems/:id` | Delete problem (admin) |
| POST | `/api/problems/:id/testcases` | Upload zipped test cases (admin) |
| POST | `/api/problems/:id/clone` | Clone problem (admin) |

### Submissions

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/submissions/run` | Run code on sample input |
| POST | `/api/submissions` | Submit for a real verdict |
| GET | `/api/submissions` | Submission history |
| GET | `/api/submissions/:id` | Single submission |
| GET | `/api/submissions/queue-status` | Judge queue status |

### Contests

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/contests` | List contests |
| POST | `/api/contests` | Create contest (admin) |
| POST | `/api/contests/:id/join` | Join (PIN verified server-side) |
| GET | `/api/contests/:id/leaderboard` | Live leaderboard |
| GET | `/api/contests/:id/lock-status` | Student freeze status |
| POST | `/api/contests/:id/unlock/:userId` | Allow to Continue (admin) |
| GET | `/api/contests/:id/monitor` | Live monitor (admin) |
| POST | `/api/contests/:id/end` | End contest and compute ratings (admin) |

### Quizzes

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/quizzes` | List quizzes |
| POST | `/api/quizzes` | Create quiz (admin) |
| POST | `/api/quizzes/:id/join` | Join quiz |
| POST | `/api/quizzes/:id/answer` | Save an answer |
| POST | `/api/quizzes/:id/submit` | Submit and auto-grade |
| GET | `/api/quizzes/:id/results` | Per-question results |
| GET | `/api/quizzes/:id/monitor` | Live monitor (admin) |
| POST | `/api/quizzes/:id/unlock/:userId` | Allow to Continue (admin) |

### Admin, System, and Export

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users` | List users (admin) |
| POST | `/api/users/:id/approve-admin` | Approve admin request |
| POST | `/api/users/:id/reset-password` | Reset password (admin) |
| GET | `/api/stats/admin` | Admin dashboard stats |
| GET | `/api/system/diagnostics` | Host IP, compilers, RAM, uptime |
| GET | `/api/system/velocity` | 24-hour AC vs non-AC velocity |
| GET | `/api/export/submissions.csv` | Detailed submission log |
| GET | `/api/export/gradebook.csv` | Per-student gradebook |
| POST | `/api/import/problem` | Import problem from DOCX / PDF |
| POST | `/api/import/quiz` | Import quiz from DOCX / PDF |

### Example Request

```http
POST /api/submissions
Authorization: Bearer <token>

{
  "problem_id": 1,
  "language": "cpp",
  "code": "#include <iostream>\nint main(){ int a,b; std::cin>>a>>b; std::cout<<a+b; }"
}
```

> Field names may differ slightly — check `backend/routes/submissions.js` for the exact request shape.

---

## 🗄️ Database

SQLite stored in a single file (`backend/localjudge.db`), created automatically on first run.

Main tables: `users`, `problems`, `samples`, `testcases`, `submissions`, `contests`, `contest_problems`, `contest_participants`, `contest_locks`, `violations`, `rating_history`, `quizzes`, `quiz_questions`, `quiz_participants`, `quiz_answers`, `quiz_violations`, `quiz_locks`, `discussions`, `solutions`, `settings`.

To back up, copy the `.db` file. To reset, delete it and restart the server.

---

## ⚙️ Environment Variables

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | ✅ | Secret used to sign login tokens — set a long random string |
| `PORT` | — | Server port (default: `4000`) |
| `HOST` | — | Bind address (default: `0.0.0.0`) |
| `DISABLE_HTTPS` | — | Set to `1` to use plain HTTP (camera/mic proctoring will not work on a LAN IP) |

---

## 🔒 Security

- Passwords hashed with bcrypt
- JWT-based sessions with admin / student role checks
- Contest and quiz PINs verified **server-side**
- Proctoring freeze enforced **server-side** via `contest_locks` / `quiz_locks`
- HOD master passkey stored **hashed**, never in plaintext
- HTTPS with a self-signed certificate (needed for camera and mic access)
- Secrets, certificates, and the database are excluded from the repo via `.gitignore`

> ⚠️ **Not hardened for the public internet.** The judge runs student code as subprocesses and trusts a closed classroom LAN. Do **not** expose LocalJudge publicly without proper sandboxing (containers, seccomp, cgroups).

---

## 🧪 Testing

See [TESTING.md](TESTING.md) for a step-by-step manual test plan covering the judge, contests, admin panel, and proctoring.

---

## ⚠️ Known Limitations

- Test cases must be uploaded manually as zipped `.in` / `.out` pairs (no generator yet)
- Judge sandboxing is process-level only
- Frontend bundle is not code-split
- Live submission feed uses polling instead of push

---

## 🗺️ Future Scope

- Container / seccomp-based sandboxing
- Test case generator and special-judge checkers
- Plagiarism detection
- Team contests and more languages
- Proctoring snapshots as evidence

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
