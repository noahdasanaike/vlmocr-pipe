@echo off
setlocal
echo === vlmocr-pipe ===
echo.

:: Check prerequisites
where node >nul 2>&1 || (echo Error: Node.js is required. Install from https://nodejs.org && exit /b 1)
where python >nul 2>&1 || (echo Error: Python 3 is required. && exit /b 1)

:: Install web dependencies
echo [1/4] Installing web dependencies...
cd apps\web
call npm install --silent 2>nul

:: Verify better-sqlite3 native module loads against the current Node ABI.
:: A Node upgrade after install leaves the .node binary compiled for the old
:: ABI (NODE_MODULE_VERSION mismatch / ERR_DLOPEN_FAILED). Self-heal by
:: rebuilding, then fall back to a clean reinstall.
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
    echo   Windows: npm install --global windows-build-tools  ^(or install Visual Studio Build Tools^)
    exit /b 1
  )
)
cd ..\..

:: Install worker dependencies
echo [2/4] Installing worker dependencies...
cd apps\worker
python -m pip install -r requirements.txt -q 2>nul
cd ..\..

:: Create data directories
if not exist "apps\web\data\storage" mkdir "apps\web\data\storage"

:: Initialize the SQLite schema before the worker starts, otherwise the worker
:: can open an empty DB and crash with "no such table: jobs".
echo [3/4] Initializing database...
cd apps\web
node -e "const Database=require('better-sqlite3');const fs=require('fs');const path=require('path');fs.mkdirSync(path.join('data','storage'),{recursive:true});const db=new Database(path.join('data','ocr.db'));db.exec(fs.readFileSync(path.join('src','lib','db','schema.sql'),'utf-8'));db.exec(fs.readFileSync(path.join('src','lib','db','seed.sql'),'utf-8'));db.close();" 2>nul
if errorlevel 1 echo       Warning: schema init failed; web app will retry on first request.
cd ..\..

echo [4/4] Starting services...
echo.
echo   Web UI:  http://localhost:3000
echo   Worker:  running in background
echo.
echo   Press Ctrl+C to stop.
echo.

:: Start both processes
start "vlmocr-pipe worker" /B python apps\worker\main.py
cd apps\web && npm run dev
