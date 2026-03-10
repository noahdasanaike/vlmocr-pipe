@echo off
echo === vlmocr-pipe ===
echo.

:: Check prerequisites
where node >nul 2>&1 || (echo Error: Node.js is required. Install from https://nodejs.org && exit /b 1)
where python >nul 2>&1 || (echo Error: Python 3 is required. && exit /b 1)

:: Install web dependencies
echo [1/3] Installing web dependencies...
cd apps\web
call npm install --silent 2>nul
cd ..\..

:: Install worker dependencies
echo [2/3] Installing worker dependencies...
cd apps\worker
python -m pip install -r requirements.txt -q 2>nul
cd ..\..

:: Create data directories
if not exist "apps\web\data\storage" mkdir "apps\web\data\storage"

echo [3/3] Starting services...
echo.
echo   Web UI:  http://localhost:3000
echo   Worker:  running in background
echo.
echo   Press Ctrl+C to stop.
echo.

:: Start both processes
start "vlmocr-pipe worker" /B python apps\worker\main.py
cd apps\web && npm run dev
