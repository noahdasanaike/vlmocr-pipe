#!/bin/bash
set -e

# Run install (idempotent — fast on subsequent runs)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/install.sh"

# Find a Python that actually runs (skip the Windows Store stub on PATH).
PYTHON=""
for cand in python3 python; do
  if command -v "$cand" >/dev/null 2>&1 && "$cand" -c "import sys" >/dev/null 2>&1; then
    PYTHON="$cand"
    break
  fi
done
[ -n "$PYTHON" ] || { echo "Error: Python 3 is required."; exit 1; }

echo ""
echo "Starting services..."
echo ""
echo "  Web UI:  http://localhost:3000"
echo "  Worker:  running in background"
echo ""
echo "  Press Ctrl+C to stop both services."
echo ""

# Start both processes
cd "$SCRIPT_DIR/apps/web" && npm run dev &
WEB_PID=$!

cd "$SCRIPT_DIR/apps/worker" && $PYTHON main.py &
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
