@echo off
REM ============================================================
REM M2_LOG - remove the Explorer right-click "Analyze with M2 LOG" menu.
REM Double-click this file to uninstall.
REM ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0context-menu.ps1" -Uninstall
echo.
pause
