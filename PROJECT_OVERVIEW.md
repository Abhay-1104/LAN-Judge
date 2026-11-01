# LocalJudge — What is this thing?

Hey! So this is **LocalJudge** — basically a LeetCode/Codeforces clone that runs entirely offline on a local network. I built it for a specific real problem: college computer labs that don't have internet access, but still want to run coding contests and let students practice problems like they would on a real judge.

## The core idea

One professor's laptop *is* the server. Students on the same WiFi/LAN just open a browser and go to `http://<laptop-ip>:4000` — no installs, no accounts on some third-party site, no internet needed once it's set up. Everything — the database, the code editor, the thing that actually compiles and runs your code — lives on that one machine.

## What makes it "real" and not a mockup

This is the part I'm most proud of: when a student submits code, it's **actually compiled and executed**. Not simulated, not faked.

- C++ gets compiled with `g++` and run as a real binary
- Python runs through the real `python3` interpreter
- Java gets compiled with `javac` and run with `java`
- JavaScript runs through `node`

Each submission gets its own temp sandbox, gets fed the test case input on stdin, gets killed if it blows past the time limit, and its memory usage gets tracked while it runs. The output gets compared against the expected answer, and you get a real verdict: Accepted, Wrong Answer, Runtime Error, Time Limit Exceeded, or Compilation Error — exactly like a real judge.

## What it looks like from each side

**As a student**, you get:
- A dashboard with your stats, streaks, and any live contest countdown
- A problems list you can filter by difficulty/tags and search
- A problem page with the statement on one side and a real Monaco code editor (the same editor VS Code uses) on the other — run your code against sample input, or submit for the real verdict
- Contests with live leaderboards and timers
- Your full submission history and a GitHub-style activity heatmap on your profile

**As the professor (admin)**, you get:
- A dashboard with platform-wide stats and charts (submissions by verdict, language usage, etc.)
- A problem editor to write statements, set difficulty/tags/time limits, and add sample I/O
- A test case uploader — you zip up your `.in`/`.out` files and drop them in
- Contest creation — pick problems, set a start/end time, and it handles the rest
- User management — promote students to admin, reset passwords, deactivate accounts

## How it's built

- **Backend**: Node.js + Express, with SQLite as the database (just a single file — no separate database server to install, which matters a lot for "runs on one random laptop" use cases)
- **Frontend**: React + Vite + Tailwind CSS, styled as a dark, minimal, premium-feeling dashboard
- **Code editor**: Monaco, bundled locally into the app instead of loaded from a CDN — important, since the whole point is this thing works with zero internet
- **The judge**: a Node module that shells out to real compilers/interpreters, tracks timing and memory via `/proc/<pid>/status`, and diffs output against expected results

The whole frontend gets built into static files, and the same Express server that runs the API also serves those files — so there's genuinely just one address and one process to run. No juggling multiple servers.

## Why SQLite and not Postgres/MySQL?

Because the entire pitch is "professor plugs in a laptop and it just works." Asking someone to install and configure a whole database server on a lab machine (that might get wiped every semester) defeats the purpose. SQLite is just a file — easy to back up, easy to reset, zero setup.

## The honest caveats

- It's not hardened against actively malicious code — it trusts that this is a closed classroom LAN, not the open internet. I wouldn't expose it publicly as-is.
- Test cases have to be uploaded manually as zipped `.in`/`.out` pairs — there's no test case generator built in.
- It's a real, working app, but it was built fast and solo, so there's room to harden things further (proper sandboxing, code-split the frontend bundle, etc.) if it ever needs to scale past "one lab, one semester."

## Why I think it's a fun project

It's not just a CRUD app with a nice UI — the interesting engineering problem was the judge itself: safely running arbitrary student code, enforcing limits, and getting a trustworthy verdict back, all without any of the usual cloud infrastructure a real judge like Codeforces would use. Doing that reliably on a single offline machine was the actual challenge.
