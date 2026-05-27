@echo off
setlocal
echo === vlmocr-pipe install ===
echo.

:: Check prerequisites
where node >nul 2>&1 || (echo Error: Node.js is required. Install from https://nodejs.org && exit /b 1)
where python >nul 2>&1 || (echo Error: Python 3 is required. && exit /b 1)

:: Install web dependencies
echo [1/3] Installing web dependencies...
cd apps\web
call npm install --silent 2>nul

:: Verify better-sqlite3 native module loads against the current Node ABI.
node -e "require('better-sqlite3')" >nul 2>&1
if errorlevel 1 (
  echo       better-sqlite3 ABI mismatch detected - rebuilding...
  call npm rebuild better-sqlite3 --build-from-source >nul 2>&1
  node -e "require('better-sqlite3')" >nul 2>&1
  if errorlevel 1 (
    echo       rebuild failed - wiping node_modules and reinstalling...
    if exist node_modules rmdir /s /q node_modules
    if exist package-lock.json del /q package-lock.json
    call npm install --silent 2>nul
  )
  node -e "require('better-sqlite3')" >nul 2>&1
  if errorlevel 1 (
    echo.
    echo Error: better-sqlite3 still won't load. You likely need build tools:
    echo   Install Visual Studio Build Tools ^(Desktop development with C++ workload^)
    exit /b 1
  )
)
cd ..\..

:: Install worker dependencies
echo [2/3] Installing worker dependencies...
cd apps\worker
python -m pip install -r requirements.txt -q 2>nul
cd ..\..

:: Create data directories
if not exist "apps\web\data\storage" mkdir "apps\web\data\storage"

:: Initialize the SQLite schema so the worker can't race ahead of the web app
:: and open an empty DB ("no such table: jobs"). Idempotent.
echo [3/3] Initializing database...
cd apps\web
node -e "const Database=require('better-sqlite3');const fs=require('fs');const path=require('path');fs.mkdirSync(path.join('data','storage'),{recursive:true});const db=new Database(path.join('data','ocr.db'));db.exec(fs.readFileSync(path.join('src','lib','db','schema.sql'),'utf-8'));const migrations=[\"ALTER TABLE jobs ADD COLUMN model_config TEXT NOT NULL DEFAULT '{}'\",'ALTER TABLE jobs ADD COLUMN failed_count INTEGER NOT NULL DEFAULT 0','ALTER TABLE jobs ADD COLUMN total_input_tokens INTEGER NOT NULL DEFAULT 0','ALTER TABLE jobs ADD COLUMN total_output_tokens INTEGER NOT NULL DEFAULT 0','ALTER TABLE jobs ADD COLUMN total_cost REAL NOT NULL DEFAULT 0','ALTER TABLE eval_models ADD COLUMN input_cost_per_1m REAL NOT NULL DEFAULT 0','ALTER TABLE eval_models ADD COLUMN output_cost_per_1m REAL NOT NULL DEFAULT 0','ALTER TABLE eval_models ADD COLUMN tokens_per_image INTEGER NOT NULL DEFAULT 1000'];for(const m of migrations){try{db.exec(m);}catch(_){}}db.exec(fs.readFileSync(path.join('src','lib','db','seed.sql'),'utf-8'));db.close();"
if errorlevel 1 echo       Warning: schema init failed; web app will retry on first request.
cd ..\..

echo.
echo Install complete. Run start.bat to launch.
