'use strict';

const fs = require('fs');
const path = require('path');

/** Experiment name must be English (letters/digits/space/_/-, at least one letter). */
function isEnglishName(name) {
  if (!name || typeof name !== 'string') return false;
  const s = name.trim();
  return /^[A-Za-z0-9 _-]+$/.test(s) && /[A-Za-z]/.test(s);
}

/** Build an uppercase, underscore-joined folder abbreviation (default max 30 chars, no padding). */
function abbreviate(name, max = 30) {
  // Spaces / punctuation -> underscore, uppercase, collapse and trim underscores.
  let s = String(name || '')
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
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
  let s = String(type || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '');
  if (!s) s = 'LOG';
  const cap = Math.min(100, Math.max(1, parseInt(max, 10) || 40));
  return s.slice(0, cap);
}

module.exports = {
  isEnglishName,
  abbreviate,
  dateStamp,
  timeStamp4,
  uniqueDir,
  buildHeader,
  sanitizeType,
};
