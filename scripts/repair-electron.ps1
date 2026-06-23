# ============================================================
#  repair-electron.ps1
#  Last-resort repair for a half-installed Electron binary.
#
#  Electron's own installer (node_modules\electron\install.js, which
#  relies on the "extract-zip" package) can silently fail to unpack the
#  binary on some Windows machines - antivirus / Defender real-time
#  scanning, locked files, or long-path quirks leave node_modules\electron\
#  dist with only a "locales" folder and no electron.exe, yet exit 0.
#
#  The full binary zip is, however, already sitting in Electron's download
#  cache and is valid. This script finds that cached zip and extracts it
#  with .NET's ZipFile, which is reliable on Windows, then writes the
#  path.txt marker so Electron considers itself correctly installed.
#
#  Exit code 0 = electron.exe is present afterwards, non-zero = could not
#  repair (e.g. no cached zip found).
# ============================================================
$ErrorActionPreference = 'Stop'

# Repo root = parent of this script's folder.
$root        = Split-Path -Parent $PSScriptRoot
$electronDir = Join-Path $root 'node_modules\electron'
$distDir     = Join-Path $electronDir 'dist'
$exePath     = Join-Path $distDir 'electron.exe'

if (-not (Test-Path $electronDir)) {
    Write-Host '[repair] node_modules\electron is missing - run npm install first.'
    exit 1
}

# Already fine? Nothing to do.
if (Test-Path $exePath) { exit 0 }

# Required Electron version (e.g. 31.7.7).
try {
    $version = (Get-Content (Join-Path $electronDir 'package.json') -Raw | ConvertFrom-Json).version
} catch {
    Write-Host "[repair] Could not read Electron version: $_"
    exit 1
}

# Map the process architecture to Electron's zip naming.
switch ($env:PROCESSOR_ARCHITECTURE) {
    'AMD64' { $arch = 'x64' }
    'ARM64' { $arch = 'arm64' }
    'x86'   { $arch = 'ia32' }
    default { $arch = 'x64' }
}

$zipName = "electron-v$version-win32-$arch.zip"
Write-Host "[repair] Looking for cached binary: $zipName"

# Candidate cache roots (custom overrides first, then the defaults).
$cacheRoots = @(
    $env:electron_config_cache,
    $env:ELECTRON_CACHE,
    (Join-Path $env:LOCALAPPDATA 'electron\Cache'),
    (Join-Path $env:USERPROFILE '.electron'),
    (Join-Path $env:USERPROFILE '.cache\electron')
) | Where-Object { $_ -and (Test-Path $_) }

$zip = $null
foreach ($cr in $cacheRoots) {
    $found = Get-ChildItem -Path $cr -Recurse -File -Filter $zipName -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { $zip = $found.FullName; break }
}

if (-not $zip) {
    Write-Host '[repair] No cached Electron zip found - cannot repair from cache.'
    exit 1
}

Write-Host "[repair] Extracting $zip"
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Validate the zip actually contains electron.exe before touching dist.
try {
    $archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
    $hasExe  = @($archive.Entries | Where-Object { $_.Name -eq 'electron.exe' }).Count -gt 0
    $archive.Dispose()
} catch {
    Write-Host "[repair] Cached zip is unreadable: $_"
    exit 1
}
if (-not $hasExe) {
    Write-Host '[repair] Cached zip does not contain electron.exe.'
    exit 1
}

# Clean any partial extraction, then unpack fresh.
if (Test-Path $distDir) { Remove-Item $distDir -Recurse -Force }
New-Item -ItemType Directory -Path $distDir | Out-Null
[System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $distDir)

# Electron expects electron.d.ts one level up from dist.
$srcTypeDef = Join-Path $distDir 'electron.d.ts'
if (Test-Path $srcTypeDef) {
    Move-Item -Force $srcTypeDef (Join-Path $electronDir 'electron.d.ts')
}

# Write the path.txt marker that install.js normally creates.
Set-Content -Path (Join-Path $electronDir 'path.txt') -Value 'electron.exe' -NoNewline

if (Test-Path $exePath) {
    Write-Host '[repair] Success - electron.exe is now in place.'
    exit 0
}

Write-Host '[repair] Extraction completed but electron.exe is still missing.'
exit 1
