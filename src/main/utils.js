/*
 * M2_LOG
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * A usable experiment name. Any language is allowed (Unicode letters/digits,
 * including CJK) and written as UTF-8 on disk; the name is only rejected when it
 * is blank or contains a character that is illegal in a Windows file/folder name.
 */
function isValidName(name) {
  if (!name || typeof name !== 'string') return false;
  const s = name.trim();
  if (!s) return false;
  // Reject Windows-illegal path characters and control chars.
  if (/[<>:"/\\|?*\u0000-\u001F]/.test(s)) return false;
  // Require at least one letter or digit (Unicode-aware; includes CJK).
  return /[\p{L}\p{N}]/u.test(s);
}

/** Build an uppercase, underscore-joined folder abbreviation (default max 30 chars, no padding). */
function abbreviate(name, max = 30) {
  // Spaces / punctuation -> underscore; KEEP Unicode letters/digits (incl. CJK),
  // written as UTF-8 on disk. Uppercase (a no-op for CJK), collapse/trim underscores.
  let s = String(name || '')
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  if (!s) return 'EXPERIMENT';
  // No padding: keep short names short; cap long names, trimming a trailing underscore.
  if (s.length > max) s = s.slice(0, max).replace(/_+$/g, '');
  return s;
}

/** YYYYMMDD date code. */
function dateStamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** HHmm time code. */
function timeStamp4(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** Append -2 / -3 ... when the folder already exists, to avoid overwriting. */
function uniqueDir(baseDir, folderName) {
  let dir = path.join(baseDir, folderName);
  let i = 2;
  while (fs.existsSync(dir)) {
    dir = path.join(baseDir, `${folderName}-${i}`);
    i += 1;
  }
  return dir;
}

/** Build the info block embedded at the top of each LOG file. */
function buildHeader(meta, logType) {
  const rows = [
    ['Experiment', meta.experimentName],
    ['Date', meta.date],
    ['Tester', meta.tester],
    ['Test Case', meta.testCase],
  ];
  (meta.customFields || []).forEach((f) => {
    if (f && (f.label || f.value)) rows.push([f.label || '(field)', f.value || '']);
  });
  if (meta.notes && String(meta.notes).trim()) {
    // Prefix each non-empty Notes line with "- " so they read as a bullet list.
    const notes = String(meta.notes)
      .split(/\r?\n/)
      .map((line) => (line.trim() ? `- ${line.trim()}` : line))
      .join('\n');
    rows.push(['Notes', notes]);
  }
  rows.push(['Log Type', logType]);
  rows.push(['Created', meta.createdAt]);

  const width = rows.reduce((m, [k]) => Math.max(m, k.length), 0);
  const line = '='.repeat(60);
  const body = rows
    .map(([k, v]) => `  ${k.padEnd(width)} : ${String(v == null ? '' : v).replace(/\r?\n/g, ' ')}`)
    .join('\r\n');
  return [line, '  EXPERIMENT LOG', line, body, line, '', ''].join('\r\n');
}

/** Convert a user-entered LOG type into a safe folder/file name (no path traversal). */
function sanitizeType(type, max = 40) {
  // Keep Unicode letters/digits (incl. CJK) plus . _ - ; everything else -> _.
  let s = String(type || '')
    .trim()
    .toUpperCase()
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/^[._-]+|[._-]+$/g, '');
  if (!s) s = 'LOG';
  const cap = Math.min(100, Math.max(1, parseInt(max, 10) || 40));
  return s.slice(0, cap);
}

module.exports = {
  isValidName,
  abbreviate,
  dateStamp,
  timeStamp4,
  uniqueDir,
  buildHeader,
  sanitizeType,
};
