@echo off
REM ============================================================
REM  M2 LOG - launcher
REM  Installs Node.js (if missing) and dependencies, then starts.
REM ============================================================
setlocal enableextensions
cd /d "%~dp0"

call :ensure_node
if errorlevel 1 (
    echo [ERROR] Node.js is required but could not be installed automatically.
    echo         Install it from https://nodejs.org/ then run this again.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [INFO] Installing dependencies - first run only, downloading Electron, please wait ...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        echo.
        pause
        exit /b 1
    )
)

echo [INFO] Starting M2 LOG ...
set "ELECTRON=node_modules\electron\dist\electron.exe"
if exist "%ELECTRON%" (
    REM Launch the Electron GUI exe directly and detached, so the launcher
    REM console window closes instead of lingering for the app's lifetime.
    start "" "%ELECTRON%" "%~dp0."
) else (
    REM Fallback: electron binary not found yet (e.g. install still settling)
    REM -- run via npm, which keeps a console window open.
    call npm start
)
endlocal
exit /b 0

REM ============================================================
REM  Subroutine: ensure Node.js exists, auto-install if missing
REM ============================================================
:ensure_node
where node >nul 2>nul
if not errorlevel 1 (
    for /f "delims=" %%v in ('node --version') do echo [INFO] Node.js %%v detected.
    exit /b 0
)

echo [INFO] Node.js not found. Trying automatic install via winget ...
where winget >nul 2>nul
if errorlevel 1 (
    echo [ERROR] winget (App Installer) is not available; cannot auto-install Node.js.
    exit /b 1
)

winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements
REM Refresh PATH for the current session so node/npm become visible.
set "PATH=%PATH%;%ProgramFiles%\nodejs\;%ProgramFiles(x86)%\nodejs\;%LOCALAPPDATA%\Programs\nodejs\"

where node >nul 2>nul
if errorlevel 1 (
    echo [WARN] Node.js installed but not visible in this session.
    echo        Please close this window and run the launcher again.
    exit /b 1
)
for /f "delims=" %%v in ('node --version') do echo [INFO] Node.js %%v installed.
exit /b 0
