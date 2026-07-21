@echo off
REM ============================================================
REM M2_LOG - install the Explorer right-click "Analyze with M2 LOG" menu.
REM Adds current-user (HKCU) entries for files and folders - no admin needed.
REM Double-click this file to install, then right-click any file/folder.
REM ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0context-menu.ps1"
echo.
pause
