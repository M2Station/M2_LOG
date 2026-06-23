@echo off
REM ============================================================
REM  M2 LOG - launch AS ADMINISTRATOR
REM  Use this launcher when your VS Code runs as Administrator.
REM  Windows blocks a normal-integrity app from talking to an
REM  elevated VS Code, so the in-app "AI" button silently does
REM  nothing. Running M2_LOG elevated (same level as VS Code)
REM  fixes that. This script self-elevates via UAC if needed.
REM
REM  (If your VS Code runs at NORMAL level, just use M2_LOG.cmd.)
REM ============================================================
setlocal enableextensions

REM The "__elevated" arg is passed by the relaunch below so we never loop.
if "%~1"=="__elevated" goto run

REM net session succeeds only when already elevated.
net session >nul 2>&1
if %errorlevel% equ 0 goto run

echo [INFO] Requesting administrator privileges to match an elevated VS Code ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '__elevated' -Verb RunAs"
exit /b 0

:run
REM Elevated from here - hand off to the normal launcher (runs elevated).
call "%~dp0M2_LOG.cmd"
exit /b 0
