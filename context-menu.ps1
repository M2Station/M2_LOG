#
# M2_LOG
# Copyright (c) 2026 OA Hsiao
# SPDX-License-Identifier: MIT
#
# This source code is licensed under the MIT License found in the
# LICENSE file in the root directory of this source tree.
#

# ============================================================
# M2_LOG - Windows Explorer right-click menu installer
#
# Adds HKCU (current-user, no admin) context-menu entries so that
# right-clicking a FILE, a FOLDER, or the empty space inside a folder
# launches M2_LOG and opens the selected path directly in LOG ANALYSIS.
#
#   Install (dev) :  powershell -ExecutionPolicy Bypass -File context-menu.ps1
#   Install (app) :  ... -File context-menu.ps1 -Launcher "C:\path\M2_LOG.exe"
#   Remove        :  ... -File context-menu.ps1 -Uninstall
#
# The NSIS installer calls this on install with -Launcher pointing at the
# freshly installed exe. Any previous entry (a dev checkout or an older
# install at a different location) is ALWAYS removed first, so the menu never
# targets a stale path. For manual use just double-click
# INSTALL_CONTEXT_MENU.cmd / UNINSTALL_CONTEXT_MENU.cmd.
#
# This file is PURE ASCII on purpose: the Chinese menu label is built from
# Unicode code points so no console code page / editor encoding can mangle it.
# ============================================================
[CmdletBinding()]
param(
  [switch]$Uninstall,
  # Program to launch. Auto-detected when omitted:
  #   - M2_LOG.exe     next to this script (installed app), or
  #   - run-hidden.vbs next to this script (dev checkout).
  [string]$Launcher,
  # Menu icon (.ico / .exe). Defaults to build\icon.ico beside this script
  # (dev checkout) or the launcher exe (installed app).
  [string]$Icon
)

$ErrorActionPreference = 'Stop'

$appDir  = $PSScriptRoot
$keyName = 'M2_LOG'

# Auto-detect the launcher when not supplied.
if (-not $Launcher) {
  $exe = Join-Path $appDir 'M2_LOG.exe'
  $vbs = Join-Path $appDir 'run-hidden.vbs'
  if     (Test-Path $exe) { $Launcher = $exe }   # installed app
  elseif (Test-Path $vbs) { $Launcher = $vbs }   # dev checkout
  else                    { $Launcher = $vbs }   # report the missing vbs below
}
if (-not $Icon) {
  $ico = Join-Path $appDir 'build\icon.ico'
  if     (Test-Path $ico)                       { $Icon = $ico }
  elseif ($Launcher.ToLower().EndsWith('.exe')) { $Icon = $Launcher }
}

# Menu label: Traditional Chinese "Analyze with M2 LOG", built from Unicode
# code points so this file stays pure ASCII and the text is never mangled by
# the console code page / file encoding when the value is written.
#   0x4F7F 0x7528 = "use"      0x5206 0x6790 = "analyze"
$label = (-join ([char]0x4F7F, [char]0x7528)) + ' M2 LOG ' + (-join ([char]0x5206, [char]0x6790))

# Three entry points (all under HKCU, so no admin rights are needed). The keys
# are RELATIVE to HKEY_CURRENT_USER and driven through the .NET registry API on
# purpose: the '*' all-files class would be misread as a WILDCARD by the
# PowerShell registry provider (Test-Path / New-Item / Remove-Item), so those
# cmdlets are avoided here.
#   *\shell                    -> right-click ON any file     (%1 = file path)
#   Directory\shell            -> right-click ON a folder      (%1 = folder path)
#   Directory\Background\shell -> right-click INSIDE a folder  (%V = folder path)
$targets = @(
  @{ Key = "Software\Classes\*\shell\$keyName";                    Param = '%1' },
  @{ Key = "Software\Classes\Directory\shell\$keyName";            Param = '%1' },
  @{ Key = "Software\Classes\Directory\Background\shell\$keyName"; Param = '%V' }
)

$hkcu = [Microsoft.Win32.Registry]::CurrentUser

# Always remove any existing entry FIRST (a dev checkout or a previous install)
# so the menu can never keep pointing at a stale path.
foreach ($t in $targets) {
  try { $hkcu.DeleteSubKeyTree($t.Key, $false) } catch { }
}

if ($Uninstall) {
  Write-Host 'Removed the M2_LOG right-click menu.'
  return
}

if (-not (Test-Path -LiteralPath $Launcher)) {
  throw "Launcher not found: $Launcher"
}

# A .vbs launcher is run through wscript (no console window); an .exe is
# launched directly (a packaged Electron app is already a windowed process).
$isVbs = $Launcher.ToLower().EndsWith('.vbs')

foreach ($t in $targets) {
  if ($isVbs) {
    $cmd = 'wscript.exe //nologo "{0}" "{1}"' -f $Launcher, $t.Param
  } else {
    $cmd = '"{0}" "{1}"' -f $Launcher, $t.Param
  }

  $key = $hkcu.CreateSubKey($t.Key)
  $key.SetValue('', $label)
  if ($Icon -and (Test-Path -LiteralPath $Icon)) { $key.SetValue('Icon', $Icon) }
  $sub = $key.CreateSubKey('command')
  $sub.SetValue('', $cmd)
  $sub.Close()
  $key.Close()
}

Write-Host "Installed the M2_LOG right-click menu -> $Launcher"
Write-Host 'Right-click any file or folder to analyze it. On Windows 11, click "Show more options" first.'
