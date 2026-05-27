#!/bin/bash
set -e

# Run install (idempotent — fast on subsequent runs)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/install.sh"

PYTHON=$(command -v python3 || command -v python)

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
