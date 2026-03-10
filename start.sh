#!/bin/bash
set -e

echo "=== vlmocr-pipe ==="
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is required. Install from https://nodejs.org"; exit 1; }
command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1 || { echo "Error: Python 3 is required."; exit 1; }

PYTHON=$(command -v python3 || command -v python)

# Install web dependencies
echo "[1/3] Installing web dependencies..."
cd apps/web
npm install --silent 2>/dev/null
cd ../..

# Install worker dependencies
echo "[2/3] Installing worker dependencies..."
cd apps/worker
$PYTHON -m pip install -r requirements.txt -q 2>/dev/null
cd ../..

# Create data directories
mkdir -p apps/web/data/storage

echo "[3/3] Starting services..."
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
