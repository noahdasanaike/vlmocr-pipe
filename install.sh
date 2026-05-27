#!/bin/bash
set -e

echo "=== vlmocr-pipe install ==="
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is required. Install from https://nodejs.org"; exit 1; }

# Find a Python that actually works (skip the Windows Store stub, which is
# on PATH but exits non-zero without doing anything).
PYTHON=""
for cand in python3 python; do
  if command -v "$cand" >/dev/null 2>&1 && "$cand" -c "import sys" >/dev/null 2>&1; then
    PYTHON="$cand"
    break
  fi
done
[ -n "$PYTHON" ] || { echo "Error: Python 3 is required."; exit 1; }

# Install web dependencies
echo "[1/3] Installing web dependencies..."
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
echo "[2/3] Installing worker dependencies..."
cd apps/worker
$PYTHON -m pip install -r requirements.txt -q 2>/dev/null
cd ../..

# Create data directories
mkdir -p apps/web/data/storage

# Initialize the SQLite schema so the worker can't race ahead of the web app
# and open an empty DB ("no such table: jobs"). Idempotent.
echo "[3/3] Initializing database..."
cd apps/web
node -e "
  const Database = require('better-sqlite3');
  const fs = require('fs');
  const path = require('path');
  fs.mkdirSync(path.join('data', 'storage'), { recursive: true });
  const db = new Database(path.join('data', 'ocr.db'));
  db.exec(fs.readFileSync(path.join('src','lib','db','schema.sql'), 'utf-8'));
  // Mirror runtime migrations in src/lib/db/index.ts so old DBs gain columns
  // that seed.sql references. Each ALTER is idempotent via try/catch.
  const migrations = [
    \"ALTER TABLE jobs ADD COLUMN model_config TEXT NOT NULL DEFAULT '{}'\",
    'ALTER TABLE jobs ADD COLUMN failed_count INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE jobs ADD COLUMN total_input_tokens INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE jobs ADD COLUMN total_output_tokens INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE jobs ADD COLUMN total_cost REAL NOT NULL DEFAULT 0',
    'ALTER TABLE eval_models ADD COLUMN input_cost_per_1m REAL NOT NULL DEFAULT 0',
    'ALTER TABLE eval_models ADD COLUMN output_cost_per_1m REAL NOT NULL DEFAULT 0',
    'ALTER TABLE eval_models ADD COLUMN tokens_per_image INTEGER NOT NULL DEFAULT 1000',
  ];
  for (const m of migrations) { try { db.exec(m); } catch (_) { /* column exists */ } }
  db.exec(fs.readFileSync(path.join('src','lib','db','seed.sql'), 'utf-8'));
  db.close();
" || echo "      Warning: schema init failed; web app will retry on first request."
cd ../..

echo ""
echo "Install complete. Run ./start.sh to launch."
