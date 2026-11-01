#!/usr/bin/env bash
# LocalJudge one-command launcher.
# Builds the frontend (first run only) and starts the single server that
# serves the whole app — students then connect over the LAN.

set -e
cd "$(dirname "$0")"

echo "== LocalJudge =="

if [ ! -d "backend/node_modules" ]; then
  echo "Installing backend dependencies (first run only)..."
  (cd backend && npm install)
fi

if [ ! -d "frontend/node_modules" ]; then
  echo "Installing frontend dependencies (first run only)..."
  (cd frontend && npm install)
fi

if [ ! -d "frontend/dist" ]; then
  echo "Building frontend for production..."
  (cd frontend && npm run build)
fi

if [ ! -f "backend/localjudge.db" ]; then
  echo "First run: the database will be created automatically and start empty."
  echo "Register the first account in the app to become the initial admin."
fi

echo ""
echo "Starting LocalJudge server..."
echo "Find your machine's LAN IP with: ip addr  (or ifconfig / ipconfig)"
echo "Students should open: http://<your-ip>:4000"
echo ""

cd backend && node server.js
