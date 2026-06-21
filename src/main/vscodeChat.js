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

// Open a NEW VS Code chat session preloaded with the LOG as an attached file,
// then WAIT for the user to type their own prompt. `code chat -n -m agent
// --add-file <file>` (no prompt argument) opens a fresh agent-mode session with
// the file attached and an empty input box. Every command-line token is
// constant/whitelisted or our crypto-random temp path, so there is no
// shell-injection surface despite shell:true (needed to launch the code.cmd
// batch shim on Windows). The LOG text only ever lives inside the temp file.
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
      // generated temp path are interpolated - no user content. No prompt
      // argument, so the session waits for the user to type.
      const cmdLine = `"${codeCmd}" chat -n -m agent --add-file "${tmpFile}"`;
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
