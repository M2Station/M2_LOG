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

REM Verify the Electron binary actually downloaded. Its postinstall download can
REM be skipped or blocked (offline, proxy, or npm "ignore-scripts"), leaving a
REM half-installed node_modules\electron that crashes at launch with
REM "Electron failed to install correctly". Repair it before starting.
set "ELECTRON=node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON%" call :repair_electron

echo [INFO] Starting M2 LOG ...
if exist "%ELECTRON%" (
    REM Launch the Electron GUI exe directly and detached, so the launcher
    REM console window closes instead of lingering for the app's lifetime.
    start "" "%ELECTRON%" "%~dp0."
) else (
    echo [ERROR] Electron is still not installed correctly.
    echo         Fix it manually from this folder, then run again:
    echo             rmdir /s /q node_modules\electron
    echo             npm install
    echo             node node_modules\electron\install.js
    echo.
    pause
    exit /b 1
)
endlocal
exit /b 0

REM ============================================================
REM  Subroutine: repair a missing / half-installed Electron binary
REM ============================================================
:repair_electron
echo [WARN] Electron binary not found - attempting automatic repair ...
REM Run Electron's own downloader directly first. This also works when npm
REM lifecycle scripts are disabled (npm config ignore-scripts=true), which is
REM the most common reason the binary never downloaded.
if exist "node_modules\electron\install.js" (
    echo [INFO] Downloading the Electron binary ...
    node "node_modules\electron\install.js"
)
if exist "%ELECTRON%" exit /b 0
REM install.js (via the "extract-zip" package) can silently fail to unpack the
REM binary - antivirus, locked files, or long paths leave dist with only a
REM "locales" folder yet exit 0. The valid binary zip is still in Electron's
REM download cache, so extract it directly with .NET (reliable on Windows).
echo [INFO] Repairing from the Electron download cache ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\repair-electron.ps1"
if exist "%ELECTRON%" exit /b 0
REM Still missing - clean reinstall, then download again as a safety net.
echo [INFO] Reinstalling dependencies ...
if exist "node_modules\electron" rmdir /s /q "node_modules\electron"
call npm install
if not exist "%ELECTRON%" if exist "node_modules\electron\install.js" node "node_modules\electron\install.js"
REM Final attempt: extract the freshly downloaded zip directly from the cache.
if not exist "%ELECTRON%" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\repair-electron.ps1"
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
    echo [ERROR] winget ^(App Installer^) is not available; cannot auto-install Node.js.
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
