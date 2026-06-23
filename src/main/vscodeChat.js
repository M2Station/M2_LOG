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

// Resolve the VS Code launcher once. On Windows the `code` shim is `code.cmd`;
// `where` returns its full path. Returns null when VS Code is not installed /
// not on PATH so callers can surface a friendly message.
let _codeCmd;
function resolveCodeCommand() {
  if (_codeCmd !== undefined) return _codeCmd;
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('where', ['code.cmd'], { windowsHide: true })
        .toString()
        .trim()
        .split(/\r?\n/)[0];
      _codeCmd = out || null;
    } else {
      execFileSync('which', ['code'], { windowsHide: true });
      _codeCmd = 'code';
    }
  } catch {
    _codeCmd = null;
  }
  return _codeCmd;
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
// the conversation title from it). Strips path separators / illegal characters
// and any non-ASCII, guarantees a sensible extension.
function sanitizeFileName(name) {
  let s = String(name == null ? '' : name).trim();
  s = s.replace(/[\\/:*?"<>|]+/g, '_').replace(/[^\x20-\x7E]+/g, '_').trim();
  if (!s) s = 'log';
  if (!/\.[A-Za-z0-9]{1,8}$/.test(s)) s += '.txt';
  return s.slice(0, 120);
}

// Sanitize a LOG name for safe inclusion in the shell command line (the prompt).
// Allows only an alphanumeric/space/._- whitelist, so there is no quoting or
// injection surface even though the command is launched via cmd.exe (shell:true).
function sanitizeForPrompt(name) {
  const s = String(name == null ? '' : name).replace(/[^A-Za-z0-9 ._-]+/g, '_').trim();
  return (s || 'log').slice(0, 120);
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

// Open a VS Code chat session preloaded with the LOG as an attached file and
// kick it off with an English analysis prompt that names the LOG (so the chat
// title is seeded from the file name). We REUSE the running VS Code window (`-r`)
// instead of forcing a new empty one (`-n`): a brand-new window is not ready in
// time, so the chat request and `--add-file` attachment get dropped. We also do
// NOT pass `-m agent`: relying on the CLI default matches the form proven to
// attach reliably. The prompt is ASCII-only because cmd.exe (shell:true, needed
// for the code.cmd shim) mangles non-ASCII argv into '?'. Every command-line
// token is either trusted/whitelisted or our crypto-random temp path, so there
// is no shell-injection surface. The LOG text only ever lives in the temp file.
async function openInVSCodeChat(payload) {
  const { name, text, dir } = payload || {};
  if (text == null || String(text) === '') {
    return { ok: false, error: 'NO_LOG' };
  }

  const codeCmd = resolveCodeCommand();
  if (!codeCmd) return { ok: false, error: 'VSCODE_NOT_FOUND' };

  sweepStaleChatTemps();

  // Write the context into a per-session temp folder, with the file named after
  // the real LOG so the attachment chip + chat title reflect the actual name.
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
  const prompt =
    `Analyze the LOG file '${sanitizeForPrompt(name)}': identify errors, warnings, ` +
    'abnormal timestamps and ordering, and infer the likely root cause.';

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

    // Matches the proven-working form: `code chat -r --add-file <file> "<prompt>"`.
    // Only the trusted resolved code path, our temp path, and a whitelisted
    // prompt are interpolated - no raw user content - so there is no injection
    // surface despite shell:true.
    const cmdLine = `"${codeCmd}" chat -r --add-file "${tmpFile}" "${prompt}"`;
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
      try {
        fs.appendFileSync(
          path.join(os.tmpdir(), 'm2log-chat-debug.log'),
          `[${new Date().toISOString()}] exit=${code}\ncmd=${cmdLine}\n` +
            `stdout=${stdout.trim()}\nstderr=${stderr.trim()}\n\n`
        );
      } catch {
        /* best-effort */
      }
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
