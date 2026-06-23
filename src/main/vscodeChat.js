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

// Remove our own stale chat-context temp files. `code chat --add-file` reads the
// file lazily - only when the user submits their first message - so we must NOT
// delete it right after spawn. Instead we sweep files older than 6 hours on each
// open, which is long enough for any realistic chat session.
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
    if (!/^m2log-chat-[0-9a-f]+\.txt$/i.test(name)) continue;
    const full = path.join(dir, name);
    try {
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    } catch {
      /* best-effort cleanup */
    }
  }
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

// Constant kickoff prompt submitted to the chat session. The VS Code `code chat`
// CLI only actually OPENS a chat session when a prompt is supplied - with no
// prompt it just opens a window and nothing happens. Kept ASCII-only: the
// command is launched through cmd.exe (shell:true, needed for the code.cmd shim)
// which mangles non-ASCII argv into '?' under the OEM code page. This string is
// a fixed, whitelisted constant containing NO log or user content, so it adds no
// shell-injection surface.
const DEFAULT_CHAT_PROMPT =
  'Analyze the attached LOG file: identify errors, warnings, abnormal timestamps and ordering, and infer the likely root cause.';

// Open a VS Code chat session preloaded with the LOG as an attached file and
// kick it off with a constant analysis prompt. We REUSE the running VS Code
// window (`-r`) instead of forcing a new empty one (`-n`): a brand-new window is
// not ready in time, so the chat request and `--add-file` attachment get dropped
// - reuse is reliable and still starts a fresh chat conversation. Every
// command-line token is constant/whitelisted or our crypto-random temp path, so
// there is no shell-injection surface despite shell:true (needed to launch the
// code.cmd batch shim on Windows). The LOG text only ever lives in the temp file.
async function openInVSCodeChat(payload) {
  const { name, text, dir } = payload || {};
  if (text == null || String(text) === '') {
    return { ok: false, error: 'NO_LOG' };
  }

  const codeCmd = resolveCodeCommand();
  if (!codeCmd) return { ok: false, error: 'VSCODE_NOT_FOUND' };

  sweepStaleChatTemps();

  const context = buildLogChatContext(name, text);
  const tmpFile = path.join(os.tmpdir(), `m2log-chat-${crypto.randomBytes(8).toString('hex')}.txt`);
  try {
    fs.writeFileSync(tmpFile, context, 'utf8');
  } catch (e) {
    return { ok: false, error: 'Failed to prepare chat context: ' + e.message };
  }

  const cwd = dir && fs.existsSync(dir) ? dir : undefined;

  return await new Promise((resolve) => {
    let child;
    try {
      // Constant command string: only the trusted resolved code path and our
      // generated temp path are interpolated - no user content. The trailing
      // prompt is a fixed ASCII constant, required for the chat session to
      // actually open and start the AI. `-r` reuses the running window so the
      // attachment lands reliably.
      const cmdLine = `"${codeCmd}" chat -r -m agent --add-file "${tmpFile}" "${DEFAULT_CHAT_PROMPT}"`;
      child = spawn(cmdLine, { cwd, windowsHide: true, shell: true });
    } catch (e) {
      resolve({ ok: false, error: 'Failed to launch VS Code: ' + e.message });
      return;
    }
    child.on('error', (e) => {
      resolve({ ok: false, error: 'Failed to launch VS Code: ' + e.message });
    });
    child.on('spawn', () => {
      resolve({ ok: true });
    });
  });
}

module.exports = { openInVSCodeChat, resolveCodeCommand };
