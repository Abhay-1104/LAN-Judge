# Testing LocalJudge in VS Code

This walks through running the app from a fresh clone and manually verifying every major feature — judge, contests, admin panel, and proctoring — using nothing but VS Code's built-in terminal and browser tabs.

---

## 1. Open the project

File → Open Folder… → select the unzipped `localjudge` folder. You should see `backend/`, `frontend/`, `desktop-app/`, `start.sh`, and `README.md` in the Explorer sidebar.

Open a terminal: **Terminal → New Terminal** (or `` Ctrl+` ``).

---

## 2. Install and build

Run each line separately, waiting for it to finish before the next:

```
cd backend
npm install
cd ../frontend
npm install
npm run build
cd ../backend
node server.js
```

Wait for:

```
LocalJudge API running at https://0.0.0.0:4000
On your LAN, students can reach it at:
  https://<your-ip>:4000
```

**Leave this terminal running for the rest of testing.** Open a *second* VS Code terminal (`+` icon) for any other commands so you don't kill the server by accident.

---

## 3. First-time HTTPS warning

The app now runs on `https://` (needed for camera/mic proctoring to work at all). Open **https://localhost:4000** in a browser.

You'll see a **"Your connection is not private"** warning — this is expected, since it's a self-signed certificate, not a scam. Click **Advanced** → **Proceed to localhost (unsafe)**. You only need to do this once per browser.

If the landing page loads with the dark "Local Judge" hero section, the basic setup is working.

---

## 4. Test account registration and roles

The site starts completely empty — no demo accounts. Test the new registration flow:

| Check | How |
|---|---|
| First account becomes admin automatically | Register any account first — you should land straight on the Admin Dashboard |
| Plain student signup | Log out, register a second account leaving "Student" selected — should land on the regular Dashboard |
| Admin request goes to a pending queue | Log out, register a third account, click **Professor / Admin** before submitting — should land on an "Admin request submitted" page, *not* get admin access immediately |
| Approval workflow | Log back in as your first (admin) account → **Users** → you should see the pending request at the top with Approve/Reject buttons |
| Approval actually works | Click **Approve**, log out, log back in as that pending account — it should now land on the Admin Dashboard |

---

## 5. Test the student flow

Log in with the student account you created above (or the admin account works fine too if you only made one so far — just be aware the sidebar will show admin items as well).

| Check | How |
|---|---|
| Dashboard loads with stats | Should show solved count, accuracy, recent submissions |
| Problems list works | Filter by difficulty, search by title |
| Code editor loads | Open any problem — Monaco editor should render (not a blank box) |
| Run Code works | Paste a correct solution, click **Run Code**, see real output |
| Submit works | Click **Submit**, see a real verdict (Accepted/Wrong Answer/etc.) with runtime + memory |
| Submission history | Go to **Submissions**, confirm your test submission appears |
| Leaderboard loads | Should show ranked students |

A known-good test: open "Sum of Array," select Python 3, paste:
```python
n = int(input())
a = list(map(int, input().split()))
print(sum(a))
```
Click Submit → should say **Accepted**.

---

## 6. Test the admin flow

You should already be logged in as an admin from step 4.

| Check | How |
|---|---|
| Admin sidebar appears | Admin Dashboard, Add Problem, Contests, Users below Profile |
| Add Problem works | Fill the form, Save — should redirect to Upload Test Cases |
| Test case upload works | Zip a few `.in`/`.out` file pairs, upload, confirm they appear listed |
| User management works | Try the shield (promote/demote), ban, and reset-password icons on a test account |

---

## 7. Test contests (needs two browser identities)

Contests need a student and an admin interacting at the same time — use two separate browser contexts so their logins don't overwrite each other:

- **Window 1**: your normal browser window, logged in as admin
- **Window 2**: an **Incognito/Private window**, logged in as a student

Steps:
1. **Admin (Window 1)**: Contests → Create Contest → set a start time a minute in the past and an end time an hour ahead → pick 1-2 problems → Save.
2. **Student (Window 2)**: Contests → find your new contest (should show "Live") → Join Contest → click into a problem.
3. Notice the URL now has `?contestId=` in it — this is what activates proctoring.
4. **Admin (Window 1)**: Contests → click **Monitor** next to your live contest. You should see the student appear under "Students" within a few seconds (confirms the WebSocket connection works).

---

## 8. Test proctoring (camera/mic)

Still in the student's incognito window, from step 6:

1. When you open a contest problem, the browser will show a **native permission prompt**: "https://localhost:4000 wants to use your microphone / camera." Click **Allow**.
2. You should see a small **"⚠ Copy/paste disabled during test"** label next to the language dropdown — try pasting into the editor to confirm it's actually blocked.
3. To trigger a real violation, **cover your webcam** (a hand or sticky note works) or **stay quiet then say something loud** near your mic, and wait a couple seconds — the detection loop runs every ~2 seconds.
4. First violation → a **Warning** modal should pop up ("Warning 1 of 2"). Click **I Understand**.
5. Trigger a second violation the same way → second warning modal.
6. Trigger a third → the test should **auto-submit** and show a red **"Test Auto-Submitted"** modal, and the editor should lock (uneditable).
7. Switch back to the **admin window**, open **Monitor → Violation Feed** — you should see all three violations listed with timestamps, and under **Students** the same student should now show a red **"Auto-Submitted"** badge.

If camera/mic permission was denied or your machine has no camera, the voice/tab-switch/paste-blocking checks still work — only the camera-darkness check needs an actual camera.

---

## 9. Test "End Contest"

From the admin's **Monitor** page, click **End Contest**. Switch to the student's window (still on the problem page) — within a couple seconds a toast should appear saying the contest ended, and the current code gets submitted automatically.

---

## 10. Common issues while testing

| Symptom | Likely cause |
|---|---|
| Blank page at localhost:4000 | Frontend wasn't built — rerun `npm run build` inside `frontend/`, then restart `node server.js` |
| "This site can't be reached" | Server isn't actually running — check the terminal for errors, or a previous `node server.js` process is still occupying port 4000 |
| Camera/mic prompt never appears | You're on `http://` instead of `https://` — check the address bar |
| C++/Java submissions fail with a compiler error | `g++` / `javac` isn't installed or isn't on PATH — Python submissions will still work regardless |
| Monitor page shows 0 students despite one being connected | The student's browser tab was opened *before* the WebSocket reconnect logic ran — refresh the student's problem page |

---

## 11. Resetting between test runs

To start over with a completely empty database (no accounts, no problems, nothing):

```
cd backend
node -e "['','-shm','-wal'].forEach(ext => require('fs').rmSync('localjudge.db'+ext, {force:true}))"
```

Then restart `node server.js` — the first account you register again becomes the new admin.

If you'd rather load sample problems/students/submissions instead of starting empty, run `node seed-demo-data.js` after clearing the database and before starting the server.
