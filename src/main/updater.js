/*
 * M2_LOG
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

// Lightweight self-updater. Checks the GitHub Releases API for a newer version,
// downloads the matching Windows NSIS installer, launches it, then deletes the
// downloaded file once the installer exits. No external dependency: uses Node's
// built-in https module (all network I/O stays in the main process).

const fs = require('fs');
const https = require('https');
const path = require('path');
const { spawn } = require('child_process');
const { app } = require('electron');

const REPO = 'M2Station/M2_LOG';
const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const UA = 'M2_LOG-Updater';
const MAX_REDIRECTS = 5;

/** Guard against HTTP(S) downgrade: we execute what we download, so require TLS. */
function assertHttps(url) {
  if (!/^https:\/\//i.test(String(url || ''))) throw new Error('Refusing non-HTTPS URL');
}

/** GET a URL and parse the JSON body, following redirects. */
function httpsGetJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    assertHttps(url);
    const req = https.get(
      url,
      { headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' } },
      (res) => {
        const { statusCode = 0, headers } = res;
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          res.resume();
          if (redirects >= MAX_REDIRECTS) return reject(new Error('Too many redirects'));
          return resolve(httpsGetJson(headers.location, redirects + 1));
        }
        if (statusCode !== 200) {
          res.resume();
          return reject(new Error(`GitHub API returned HTTP ${statusCode}`));
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid JSON from GitHub'));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Request timed out')));
  });
}

/** Parse a semantic version (leading "v" optional) into [major, minor, patch]. */
function parseVersion(v) {
  const m = String(v || '')
    .trim()
    .replace(/^v/i, '')
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** True when `latest` is a strictly higher semantic version than `current`. */
function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

/** Pick the release asset that matches the current CPU architecture. */
function pickAsset(assets) {
  if (!Array.isArray(assets)) return null;
  const exe = assets.filter((a) => a && /\.exe$/i.test(a.name || ''));
  if (!exe.length) return null;
  const arch = process.arch; // 'x64' | 'arm64' on Windows
  const archMatch = exe.find((a) => new RegExp(`-${arch}\\.exe$`, 'i').test(a.name));
  // Fall back to the combined (no arch suffix) installer, then anything.
  const universal = exe.find((a) => !/-(x64|arm64|ia32)\.exe$/i.test(a.name));
  return archMatch || universal || exe[0];
}

/** Query GitHub for the latest release and compare it with the running app. */
async function checkForUpdate() {
  const current = app.getVersion();
  const rel = await httpsGetJson(API_LATEST);
  const latest = String((rel && (rel.tag_name || rel.name)) || '').replace(/^v/i, '');
  if (!latest) throw new Error('No published release found');
  const asset = pickAsset(rel.assets);
  return {
    updateAvailable: isNewer(latest, current),
    currentVersion: current,
    latestVersion: latest,
    notes: String((rel && rel.body) || '').slice(0, 4000),
    releaseUrl: (rel && rel.html_url) || '',
    isPackaged: app.isPackaged,
    asset: asset
      ? { name: asset.name, url: asset.browser_download_url, size: asset.size }
      : null,
  };
}

/** Strip a download name down to a safe file name we build the temp path from. */
function sanitizeFileName(name) {
  const base = path.basename(String(name || ''));
  const safe = base.replace(/[^A-Za-z0-9._-]/g, '_');
  return /\.exe$/i.test(safe) ? safe : 'M2_LOG-setup.exe';
}

/** Stream a URL to `dest`, following redirects and reporting byte progress. */
function downloadFile(url, dest, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    assertHttps(url);
    const req = https.get(
      url,
      { headers: { 'User-Agent': UA, Accept: 'application/octet-stream' } },
      (res) => {
        const { statusCode = 0, headers } = res;
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          res.resume();
          if (redirects >= MAX_REDIRECTS) return reject(new Error('Too many redirects'));
          return resolve(downloadFile(headers.location, dest, onProgress, redirects + 1));
        }
        if (statusCode !== 200) {
          res.resume();
          return reject(new Error(`Download failed: HTTP ${statusCode}`));
        }
        const total = Number(headers['content-length'] || 0);
        let received = 0;
        const out = fs.createWriteStream(dest);
        const fail = (err) => {
          out.destroy();
          fs.unlink(dest, () => {});
          reject(err);
        };
        res.on('data', (chunk) => {
          received += chunk.length;
          if (onProgress) onProgress(received, total);
        });
        res.on('error', fail);
        out.on('error', fail);
        out.on('finish', () => out.close(() => resolve(dest)));
        res.pipe(out);
      }
    );
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('Download timed out')));
  });
}

/** Download the chosen asset to the OS temp folder, reporting progress to `win`. */
async function downloadUpdate(win, asset) {
  if (!asset || !asset.url) throw new Error('No installer asset to download');
  const dir = path.join(app.getPath('temp'), 'M2_LOG-update');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, sanitizeFileName(asset.name));
  let lastPct = -1;
  await downloadFile(asset.url, dest, (received, total) => {
    if (!win || win.isDestroyed()) return;
    const pct = total > 0 ? Math.floor((received / total) * 100) : 0;
    if (pct !== lastPct) {
      lastPct = pct;
      win.webContents.send('update:progress', { received, total, pct });
    }
  });
  return dest;
}

/** Quote a string for a PowerShell single-quoted literal. */
function quotePS(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

/**
 * Launch the downloaded installer, then delete the file once it exits. The
 * helper runs detached (via PowerShell Start-Process -Wait) so it outlives this
 * app: the NSIS installer needs M2_LOG closed to replace its files, so we quit
 * shortly after handing off. The per-user installer needs no elevation.
 */
function installUpdate(filePath) {
  const file = path.resolve(String(filePath || ''));
  if (!file || !fs.existsSync(file)) throw new Error('Installer not found');
  const psCmd =
    `Start-Process -FilePath ${quotePS(file)} -Wait; ` +
    `Remove-Item -LiteralPath ${quotePS(file)} -Force -ErrorAction SilentlyContinue`;
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psCmd],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();
  // Give the handoff a moment, then quit so the installer can replace files.
  setTimeout(() => app.quit(), 800);
  return { ok: true };
}

module.exports = { checkForUpdate, downloadUpdate, installUpdate, isNewer, parseVersion, pickAsset };
