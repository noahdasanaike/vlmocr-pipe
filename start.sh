#!/bin/bash
set -e

echo "=== vlmocr-pipe ==="
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is required. Install from https://nodejs.org"; exit 1; }
command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1 || { echo "Error: Python 3 is required."; exit 1; }

PYTHON=$(command -v python3 || command -v python)

# Install web dependencies
echo "[1/4] Installing web dependencies..."
cd apps/web
npm install --silent 2>/dev/null

# Verify better-sqlite3 native module loads against the current Node ABI.
# A Node upgrade after install leaves the .node binary compiled for the old
# ABI (NODE_MODULE_VERSION mismatch / ERR_DLOPEN_FAILED). Self-heal by
# rebuilding, then fall back to a clean reinstall.
if ! node -e "require('better-sqlite3')" >/dev/null 2>&1; then
  echo "      better-sqlite3 ABI mismatch detected — rebuilding..."
  if ! npm rebuild better-sqlite3 --build-from-source >/dev/null 2>&1 \
       || ! node -e "require('better-sqlite3')" >/dev/null 2>&1; then
    echo "      rebuild failed — wiping node_modules and reinstalling..."
    rm -rf node_modules package-lock.json
    npm install --silent 2>/dev/null
  fi
  if ! node -e "require('better-sqlite3')" >/dev/null 2>&1; then
    echo ""
    echo "Error: better-sqlite3 still won't load. You likely need build tools:"
    echo "  macOS:   xcode-select --install"
    echo "  Linux:   install build-essential and python3"
    exit 1
  fi
fi
cd ../..

# Install worker dependencies
echo "[2/4] Installing worker dependencies..."
cd apps/worker
$PYTHON -m pip install -r requirements.txt -q 2>/dev/null
cd ../..

# Create data directories
mkdir -p apps/web/data/storage

# Initialize the SQLite schema before the worker starts, otherwise the worker
# can open an empty DB and crash with "no such table: jobs".
echo "[3/4] Initializing database..."
cd apps/web
node -e "
  const Database = require('better-sqlite3');
  const fs = require('fs');
  const path = require('path');
  fs.mkdirSync(path.join('data', 'storage'), { recursive: true });
  const db = new Database(path.join('data', 'ocr.db'));
  db.exec(fs.readFileSync(path.join('src','lib','db','schema.sql'), 'utf-8'));
  db.exec(fs.readFileSync(path.join('src','lib','db','seed.sql'), 'utf-8'));
  db.close();
" 2>/dev/null || echo "      Warning: schema init failed; web app will retry on first request."
cd ../..

echo "[4/4] Starting services..."
echo ""
echo "  Web UI:  http://localhost:3000"
echo "  Worker:  running in background"
echo ""
echo "  Press Ctrl+C to stop both services."
echo ""

# Start both processes
cd apps/web && npm run dev &
WEB_PID=$!

cd apps/worker && $PYTHON main.py &
WORKER_PID=$!

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $WEB_PID 2>/dev/null
  kill $WORKER_PID 2>/dev/null
  wait $WEB_PID 2>/dev/null
  wait $WORKER_PID 2>/dev/null
  echo "Done."
}

trap cleanup EXIT INT TERM

wait
