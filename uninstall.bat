@echo off
setlocal
echo === vlmocr-pipe uninstall ===
echo.
echo This will remove:
echo   - apps\web\node_modules
echo   - apps\web\package-lock.json
echo   - apps\web\.next
echo.
echo Your data ^(SQLite DB + uploaded files in apps\web\data\^) is preserved
echo by default. Pass --purge to also delete it.
echo.

set PURGE=0
set YES=0
for %%a in (%*) do (
  if /I "%%a"=="--purge" set PURGE=1
  if /I "%%a"=="-p"      set PURGE=1
  if /I "%%a"=="--yes"   set YES=1
  if /I "%%a"=="-y"      set YES=1
)

if "%YES%"=="0" (
  set /p ANS="Proceed? [y/N] "
  if /I not "%ANS%"=="y" if /I not "%ANS%"=="yes" (
    echo Aborted.
    exit /b 0
  )
)

if exist apps\web\node_modules rmdir /s /q apps\web\node_modules
if exist apps\web\package-lock.json del /q apps\web\package-lock.json
if exist apps\web\.next rmdir /s /q apps\web\.next
echo Removed web build artifacts.

if "%PURGE%"=="1" (
  if exist apps\web\data rmdir /s /q apps\web\data
  echo Removed apps\web\data ^(database + uploads^).
)

echo.
echo Uninstall complete. Run install.bat to reinstall.
