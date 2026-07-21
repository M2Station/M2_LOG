' ============================================================
' M2_LOG - hidden launcher
' Starts Electron with NO console window. Used by the dev right-click menu (and
' the .cmd launchers) so the app appears without a flashing/persistent command
' prompt. Installed builds launch M2_LOG.exe directly and do not need this.
'
' Usage (from the repo root):
'   wscript.exe //nologo run-hidden.vbs [path]
' ============================================================
Option Explicit

Dim shell, fso, scriptDir, electronCmd, pathArg

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Directory this script lives in (the app root).
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Local Electron launcher installed by `npm install`.
electronCmd = fso.BuildPath(scriptDir, "node_modules\.bin\electron.cmd")

' Optional first argument: a file or folder to open in LOG ANALYSIS.
pathArg = ""
If WScript.Arguments.Count > 0 Then
  pathArg = " """ & WScript.Arguments(0) & """"
End If

' Run electron in the app dir with the window hidden (0) and do not wait.
shell.CurrentDirectory = scriptDir
shell.Run """" & electronCmd & """ ." & pathArg, 0, False
