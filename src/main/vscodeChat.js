/*
 * M2_LOG
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

// ============================================================
// M2_LOG - VS Code AI (Copilot) chat integration
//
// Opens a NEW VS Code chat session preloaded with the current LOG attached as
// a file, and leaves the input box empty so the user types their own question.
// Mirrors the approach used in M2_GIT_DIFF: the LOG text is written to a temp
// file and attached via `code chat --add-file`; the log content NEVER touches
// the command line, so there is no shell-injection surface.
// ============================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

// Append a line to the chat debug log (best-effort). Used for both successful
// launches and failure paths so issues like "AI button does nothing when the
// app is launched from Explorer" are diagnosable from
// %TEMP%\m2log-chat-debug.log.
function appendChatDebug(text) {
  try {
    fs.appendFileSync(
      path.join(os.tmpdir(), 'm2log-chat-debug.log'),
      `[${new Date().toISOString()}] ${text}\n\n`
    );
  } catch {
    /* best-effort */
  }
}

// Resolve the VS Code launcher once. We FIRST try PATH (fast path: works when
// the app is started from a terminal that has VS Code's bin on PATH, e.g.
// `npm start` from the integrated terminal). When that fails we probe the
// well-known install locations - this is the case when the app is launched from
// Explorer (e.g. double-clicking M2_LOG.cmd): the inherited PATH often does NOT
// include VS Code's bin even though VS Code is installed, so `where code.cmd`
// finds nothing and the AI button would otherwise silently do nothing. Returns
// the launcher path/command, or null when VS Code truly cannot be found.
let _codeCmd;
function resolveCodeCommand() {
  if (_codeCmd !== undefined) return _codeCmd;

  // 1) PATH-based lookup.
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('where', ['code.cmd'], { windowsHide: true })
        .toString()
        .trim()
        .split(/\r?\n/)[0];
      if (out) {
        _codeCmd = out;
        return _codeCmd;
      }
    } else {
      execFileSync('which', ['code'], { windowsHide: true });
      _codeCmd = 'code';
      return _codeCmd;
    }
  } catch {
    /* fall through to known-location probing */
  }

  // 2) Known install locations (stable + Insiders), used when PATH lookup fails.
  const candidates = [];
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA;
    const pf = process.env.ProgramFiles;
    const pf86 = process.env['ProgramFiles(x86)'];
    if (local) {
      candidates.push(path.join(local, 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'));
      candidates.push(
        path.join(local, 'Programs', 'Microsoft VS Code Insiders', 'bin', 'code-insiders.cmd')
      );
    }
    if (pf) {
      candidates.push(path.join(pf, 'Microsoft VS Code', 'bin', 'code.cmd'));
      candidates.push(path.join(pf, 'Microsoft VS Code Insiders', 'bin', 'code-insiders.cmd'));
    }
    if (pf86) {
      candidates.push(path.join(pf86, 'Microsoft VS Code', 'bin', 'code.cmd'));
    }
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/usr/local/bin/code',
      '/opt/homebrew/bin/code',
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
    );
  } else {
    candidates.push('/usr/bin/code', '/usr/local/bin/code', '/snap/bin/code');
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        _codeCmd = candidate;
        return _codeCmd;
      }
    } catch {
      /* ignore and try the next candidate */
    }
  }

  _codeCmd = null;
  return _codeCmd;
}

// ---- Windows UAC integrity detection ---------------------------------------
// A normal-integrity process cannot deliver a `code chat` request to an ELEVATED
// VS Code (Windows blocks access to the higher-integrity IPC pipe), so the AI
// button silently does nothing. We detect that exact situation and surface an
// actionable message instead of failing quietly.

// Whether THIS process (M2_LOG) is elevated (High integrity). Cached - a
// process's integrity level never changes during its lifetime. Locale-safe: we
// match the High Mandatory Level SID, not a translated label.
let _selfElevated;
function isSelfElevated() {
  if (_selfElevated !== undefined) return _selfElevated;
  if (process.platform !== 'win32') {
    _selfElevated = true;
    return _selfElevated;
  }
  try {
    const out = execFileSync('whoami', ['/groups'], { windowsHide: true }).toString();
    _selfElevated = /S-1-16-12288/.test(out); // High Mandatory Level SID
  } catch (e) {
    appendChatDebug('isSelfElevated: whoami failed: ' + e.message);
    _selfElevated = true; // can't tell -> don't block the user
  }
  return _selfElevated;
}

// Whether a running VS Code (Code.exe) is elevated. Detected by trying to read
// each process's module path: a normal-integrity caller is denied access to an
// elevated process's path. Only meaningful when WE are not elevated. Result is
// cached briefly so rapid AI clicks don't each spawn PowerShell.
let _vscodeElevatedCache = { at: 0, value: false };
function isRunningVSCodeElevated() {
  if (process.platform !== 'win32') return false;
  const now = Date.now();
  if (now - _vscodeElevatedCache.at < 15000) return _vscodeElevatedCache.value;
  let value = false;
  try {
    // Definitive check: read each Code.exe's TOKEN integrity level via Win32.
    // A normal-integrity caller is DENIED access to an elevated process's token
    // (rid -1), while an elevated process reports the High RID (12288). Reading
    // the image .Path is NOT reliable here - it is allowed across integrity
    // levels for the same user, so it never throws and misses the mismatch.
    const psScript = [
      "$ErrorActionPreference='SilentlyContinue'",
      "$ProgressPreference='SilentlyContinue'",
      "Add-Type -TypeDefinition @'",
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class M2Integ {',
      '  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(int a, bool i, int pid);',
      '  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr h);',
      '  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr p, int a, out IntPtr t);',
      '  [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetTokenInformation(IntPtr t, int c, IntPtr info, int len, out int ret);',
      '  public static int Level(int pid) {',
      '    IntPtr p = OpenProcess(0x1000, false, pid);',
      '    if (p == IntPtr.Zero) return -2;',
      '    IntPtr tok;',
      '    if (!OpenProcessToken(p, 0x0008, out tok)) { CloseHandle(p); return -1; }',
      '    int len = 0; GetTokenInformation(tok, 25, IntPtr.Zero, 0, out len);',
      '    int rid = -3;',
      '    if (len > 0) {',
      '      IntPtr buf = Marshal.AllocHGlobal(len);',
      '      if (GetTokenInformation(tok, 25, buf, len, out len)) {',
      '        IntPtr sid = Marshal.ReadIntPtr(buf);',
      '        byte count = Marshal.ReadByte(sid, 1);',
      '        rid = Marshal.ReadInt32(sid, 8 + (count - 1) * 4);',
      '      }',
      '      Marshal.FreeHGlobal(buf);',
      '    }',
      '    CloseHandle(tok); CloseHandle(p);',
      '    return rid;',
      '  }',
      '}',
      "'@ -ErrorAction SilentlyContinue",
      '$ps = Get-Process -Name Code -ErrorAction SilentlyContinue',
      "if (-not $ps) { Write-Output 'NORMAL'; exit 0 }",
      '$elevated = $false',
      'foreach ($p in $ps) { $lvl = [M2Integ]::Level($p.Id); if ($lvl -eq -1 -or $lvl -ge 12288) { $elevated = $true } }',
      "Write-Output ($(if ($elevated) { 'ELEVATED' } else { 'NORMAL' }))",
    ].join('\n');
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 8000 }
    ).toString();
    value = /ELEVATED/.test(out);
  } catch (e) {
    appendChatDebug('isRunningVSCodeElevated: failed: ' + e.message);
    value = false; // can't tell -> don't block
  }
  _vscodeElevatedCache = { at: now, value };
  return value;
}

// Remove our own stale chat-context temp files/folders. `code chat --add-file`
// reads the file lazily - only when the user submits their first message - so we
// must NOT delete it right after spawn. Instead we sweep entries older than 6
// hours on each open, which is long enough for any realistic chat session.
function sweepStaleChatTemps() {
  const dir = os.tmpdir();
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    // Legacy flat temp files and the current per-session subfolders.
    if (!/^m2log-chat-[0-9a-f]+(\.txt)?$/i.test(name)) continue;
    const full = path.join(dir, name);
    try {
      if (fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}

// Sanitize a LOG name into a safe on-disk file name. The temp file is named after
// the real LOG so VS Code shows the actual name on the attachment chip (and seeds
// the conversation title from it). Strips path separators / illegal characters and
// control chars but KEEPS Unicode letters (incl. CJK); guarantees a sensible extension.
function sanitizeFileName(name) {
  let s = String(name == null ? '' : name).trim();
  s = s.replace(/[\\/:*?"<>|]+/g, '_').replace(/[\u0000-\u001F]+/g, '_').trim();
  if (!s) s = 'log';
  if (!/\.[A-Za-z0-9]{1,8}$/.test(s)) s += '.txt';
  return s.slice(0, 120);
}

// Build the context document attached to the chat: a short header naming the
// LOG, followed by its full content verbatim.
function buildLogChatContext(name, text) {
  const header = [
    `# LOG file: ${name || '(unnamed)'}`,
    '# Source: M2_LOG analysis viewer',
    '# The full log content is below. Ask anything about it (errors, timing, sequence, root cause).',
    '',
    '',
  ].join('\n');
  return header + String(text == null ? '' : text);
}

// Open a VS Code chat session preloaded with the LOG as an attached file and a
// fixed analysis prompt. The `code chat` CLI is prompt-driven ("Pass in a
// prompt to run in a chat session") - WITHOUT a prompt it does nothing: it
// exits 0 and opens no view, so `--maximize` on its own is a silent no-op (this
// is why the AI button appeared to do nothing). We REUSE the running VS Code
// window (`-r`) instead of forcing a new empty one (`-n`): a brand-new window
// is not ready in time, so the chat request and `--add-file` attachment get
// dropped. `--mode ask` keeps the session read-only (no edits / no commands).
// The prompt is a FIXED, trusted constant - no LOG text or file name is ever
// interpolated - so there is no shell-injection surface despite shell:true
// (needed for the code.cmd shim on Windows). The LOG text only ever lives in
// the temp file.
const LOG_ANALYSIS_PROMPT =
  'Analyze the attached LOG file: identify errors, warnings, abnormal timestamps and ordering, and infer the most likely root cause.';

async function openInVSCodeChat(payload) {
  const { name, text, dir } = payload || {};
  if (text == null || String(text) === '') {
    return { ok: false, error: 'NO_LOG' };
  }

  const codeCmd = resolveCodeCommand();
  if (!codeCmd) {
    appendChatDebug(
      'VSCODE_NOT_FOUND - code.cmd not on PATH and not at any known install ' +
        `location.\nPATH=${process.env.PATH || ''}`
    );
    return { ok: false, error: 'VSCODE_NOT_FOUND' };
  }

  // Windows UAC: a normal-integrity M2_LOG cannot reach an ELEVATED VS Code, so
  // the chat request would be silently dropped. Detect that mismatch and tell the
  // user to launch M2_LOG as administrator (e.g. via M2_LOG_Admin.cmd).
  const selfElevated = isSelfElevated();
  const vscodeElevated = selfElevated ? false : isRunningVSCodeElevated();
  if (!selfElevated && vscodeElevated) {
    appendChatDebug(
      'INTEGRITY_MISMATCH - M2_LOG is normal integrity but a running VS Code is elevated.'
    );
    return { ok: false, error: 'INTEGRITY_MISMATCH' };
  }

  sweepStaleChatTemps();

  // Write the context into a per-session temp folder, with the file named after
  // the real LOG so the attachment chip shows the actual name.
  const context = buildLogChatContext(name, text);
  const sessionDir = path.join(os.tmpdir(), `m2log-chat-${crypto.randomBytes(8).toString('hex')}`);
  const tmpFile = path.join(sessionDir, sanitizeFileName(name));
  try {
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(tmpFile, context, 'utf8');
  } catch (e) {
    return { ok: false, error: 'Failed to prepare chat context: ' + e.message };
  }

  const cwd = dir && fs.existsSync(dir) ? dir : undefined;

  return await new Promise((resolve) => {
    let child;
    let settled = false;
    let stderr = '';
    let stdout = '';
    const done = (res) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };

    // `code chat` needs a prompt to actually open a session, so we pass the
    // fixed LOG_ANALYSIS_PROMPT (and `--mode ask` to keep it read-only). Only
    // the trusted code path, our temp path, and that fixed prompt are
    // interpolated - no user/LOG content - so there is no injection surface
    // despite shell:true.
    const cmdLine = `"${codeCmd}" chat -r --mode ask --add-file "${tmpFile}" --maximize "${LOG_ANALYSIS_PROMPT}"`;
    try {
      child = spawn(cmdLine, { cwd, windowsHide: true, shell: true });
    } catch (e) {
      done({ ok: false, error: 'Failed to launch VS Code: ' + e.message });
      return;
    }
    if (child.stdout) child.stdout.on('data', (d) => (stdout += d.toString()));
    if (child.stderr) child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (e) => done({ ok: false, error: 'Failed to launch VS Code: ' + e.message }));
    child.on('close', (code) => {
      appendChatDebug(
        `exit=${code}\ncmd=${cmdLine}\nstdout=${stdout.trim()}\nstderr=${stderr.trim()}`
      );
      if (code === 0 || code == null) done({ ok: true });
      else done({ ok: false, error: (stderr || stdout || `code chat exited ${code}`).trim() });
    });
    // When no VS Code is running yet, `code chat -r` launches a fresh instance and
    // the wrapper stays attached - it never "closes" quickly. Treat that as a
    // successful launch after a short grace period so the UI is not held hostage.
    setTimeout(() => done({ ok: true }), 5000);
  });
}

module.exports = { openInVSCodeChat, resolveCodeCommand };
