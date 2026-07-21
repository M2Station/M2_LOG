; ============================================================
; M2_LOG - custom NSIS hooks for electron-builder
;
;   customInstall   : after the files are copied, (re)register the Explorer
;                     right-click "Analyze with M2 LOG" menu so it points at the
;                     freshly INSTALLED M2_LOG.exe. The helper removes any
;                     previous entry (a dev checkout or an older install at a
;                     different location) first, guaranteeing the menu never
;                     targets a stale path.
;   customUnInstall : remove the right-click menu registry keys.
;
; This file is intentionally PURE ASCII. The Chinese menu label is produced
; from Unicode code points inside context-menu.ps1, so no non-ASCII bytes ever
; live in this .nsh (avoids mojibake).
; ============================================================

!macro customInstall
  DetailPrint "Registering the M2_LOG Explorer right-click menu..."
  ; context-menu.ps1 ships next to the exe (extraFiles). It deletes any existing
  ; M2_LOG menu keys, then writes new ones pointing at -Launcher / -Icon.
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\context-menu.ps1" -Launcher "$INSTDIR\M2_LOG.exe" -Icon "$INSTDIR\M2_LOG.exe"'
  Pop $0
  DetailPrint "Context-menu registration exit code: $0"
!macroend

!macro customUnInstall
  DetailPrint "Removing the M2_LOG Explorer right-click menu..."
  ; Delete the HKCU keys directly. Key paths are ASCII, so this is encoding safe
  ; and does not depend on the helper script still being present.
  DeleteRegKey HKCU "Software\Classes\*\shell\M2_LOG"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\M2_LOG"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\M2_LOG"
!macroend
