@echo off
setlocal

:: Run install (idempotent - fast on subsequent runs)
call "%~dp0install.bat"
if errorlevel 1 exit /b 1

echo.
echo Starting services...
echo.
echo   Web UI:  http://localhost:3000
echo   Worker:  running in background
echo.
echo   Press Ctrl+C to stop.
echo.

:: Start both processes
start "vlmocr-pipe worker" /B python "%~dp0apps\worker\main.py"
cd /d "%~dp0apps\web" && npm run dev
