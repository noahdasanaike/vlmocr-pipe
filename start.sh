#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Run install (idempotent — fast on subsequent runs)
bash "$SCRIPT_DIR/install.sh"

# ---------------------------------------------------------------------------
# Resolve the Python that install.sh placed inside the venv.
# install.sh writes a small env file so we never touch system Python here.
# ---------------------------------------------------------------------------
ENV_FILE="$SCRIPT_DIR/apps/worker/.venv/vlmocr-env.sh"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: Python environment not found. Run ./install.sh first."
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"
PYTHON="$VLMOCR_PYTHON"

if [ ! -x "$PYTHON" ]; then
  echo "Error: venv Python not found at $PYTHON — re-run ./install.sh."
  exit 1
fi

echo ""
echo "Starting services..."
echo ""
echo "  Web UI:  http://localhost:3000"
echo "  Worker:  running in background"
echo "  Python:  $PYTHON"
echo ""
echo "  Press Ctrl+C to stop both services."
echo ""

# Start both processes
cd "$SCRIPT_DIR/apps/web" && npm run dev &
WEB_PID=$!

cd "$SCRIPT_DIR/apps/worker" && "$PYTHON" main.py &
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
