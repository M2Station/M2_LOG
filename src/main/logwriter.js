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
const archiver = require('archiver');
const { shell } = require('electron');
const {
  isEnglishName,
  abbreviate,
  dateStamp,
  timeStamp4,
  uniqueDir,
  buildHeader,
  sanitizeType,
} = require('./utils');
const { defaultOutputDir } = require('./paths');

/** Zip the given files into one archive. entries = [{ abs, name }] -> Promise<zipPath>. */
function createZip(zipPath, entries) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(zipPath));
    output.on('error', reject);
    archive.on('error', reject);
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') reject(err);
    });

    archive.pipe(output);
    entries.forEach((e) => archive.file(e.abs, { name: e.name }));
    archive.finalize();
  });
}

/**
 * Create the output folder and write UEFI / SAM logs, info.json and a zip.
 * Returns { ok, targetDir, folderName, zip, files } or { ok:false, error }.
 */
async function exportLog(payload = {}) {
  const {
    experimentName = '',
    date = '',
    tester = '',
    testCase = '',
    notes = '',
    outputBase = '',
    customFields = [],
    logs = [],
    abbrevLen,
    typeLen,
  } = payload;

  if (!isEnglishName(experimentName)) {
    return { ok: false, error: 'Experiment name must be English.' };
  }

  const cleanCustom = Array.isArray(customFields)
    ? customFields
        .map((f) => ({ label: String(f.label || '').trim(), value: String(f.value || '').trim() }))
        .filter((f) => f.label || f.value)
    : [];

  const baseDir = outputBase && outputBase.trim() ? outputBase.trim() : defaultOutputDir();
  const now = new Date();
  const nameMax = Math.min(40, Math.max(1, parseInt(abbrevLen, 10) || 30));
  const folderName = `${dateStamp(now)}_${timeStamp4(now)}_${abbreviate(experimentName, nameMax)}`;
  const targetDir = uniqueDir(baseDir, folderName);

  fs.mkdirSync(targetDir, { recursive: true });

  const written = [];

  const cleanLogs = Array.isArray(logs)
    ? logs
        .map((l) => ({ type: String((l && l.type) || '').trim(), content: String((l && l.content) || '') }))
        .filter((l) => l.content.trim())
    : [];

  const meta = {
    experimentName,
    date,
    tester,
    testCase,
    notes,
    customFields: cleanCustom,
    logTypes: cleanLogs.map((l) => l.type || 'LOG'),
    createdAt: now.toISOString(),
  };

  const metaPath = path.join(targetDir, 'info.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  written.push(metaPath);

  // Each LOG entry -> <TYPE>/<TYPE>.log, with the info header on top.
  const usedNames = new Set();
  for (const log of cleanLogs) {
    const base = sanitizeType(log.type, typeLen);
    let name = base;
    let i = 2;
    while (usedNames.has(name)) {
      name = `${base}_${i}`;
      i += 1;
    }
    usedNames.add(name);
    const dir = path.join(targetDir, name);
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, `${name}.log`);
    fs.writeFileSync(p, buildHeader(meta, log.type || name) + log.content, 'utf8');
    written.push(p);
  }

  const zipName = `${path.basename(targetDir)}.zip`;
  const zipPath = path.join(targetDir, zipName);
  const zipEntries = written.map((abs) => ({
    abs,
    name: path.relative(targetDir, abs).split(path.sep).join('/'),
  }));
  await createZip(zipPath, zipEntries);
  written.push(zipPath);

  return {
    ok: true,
    targetDir,
    folderName: path.basename(targetDir),
    zip: zipPath,
    files: written,
  };
}

/**
 * Export ONLY one LOG (the active tab) as a single .log file carrying the
 * experiment-field header on top. Honors the custom Output Root when one is
 * set, otherwise falls back to the default LOG_OUTPUT folder.
 * Returns { ok, single, targetDir, filePath, fileName, files } or { ok:false, error }.
 */
async function exportSingleLog(payload = {}) {
  const {
    experimentName = '',
    date = '',
    tester = '',
    testCase = '',
    notes = '',
    outputBase = '',
    customFields = [],
    log = {},
    abbrevLen,
    typeLen,
  } = payload;

  if (!isEnglishName(experimentName)) {
    return { ok: false, error: 'Experiment name must be English.' };
  }

  const content = String((log && log.content) || '');
  if (!content.trim()) {
    return { ok: false, error: 'LOG is empty.' };
  }
  const type = String((log && log.type) || 'LOG').trim() || 'LOG';
  const typeName = sanitizeType(type, typeLen);

  const cleanCustom = Array.isArray(customFields)
    ? customFields
        .map((f) => ({ label: String(f.label || '').trim(), value: String(f.value || '').trim() }))
        .filter((f) => f.label || f.value)
    : [];

  // Single-LOG output: a dedicated folder under the chosen Output Root (or the
  // default LOG_OUTPUT when none is set), with the one .log file inside.
  const baseDir = outputBase && outputBase.trim() ? outputBase.trim() : defaultOutputDir();
  const now = new Date();
  const nameMax = Math.min(40, Math.max(1, parseInt(abbrevLen, 10) || 30));
  const folderName = `${dateStamp(now)}_${timeStamp4(now)}_${abbreviate(experimentName, nameMax)}_${typeName}`;
  const targetDir = uniqueDir(baseDir, folderName);
  fs.mkdirSync(targetDir, { recursive: true });

  const meta = {
    experimentName,
    date,
    tester,
    testCase,
    notes,
    customFields: cleanCustom,
    logTypes: [type],
    createdAt: now.toISOString(),
  };

  const fileName = `${typeName}.log`;
  const filePath = path.join(targetDir, fileName);
  fs.writeFileSync(filePath, buildHeader(meta, type) + content, 'utf8');

  return {
    ok: true,
    single: true,
    targetDir,
    folderName: path.basename(targetDir),
    filePath,
    fileName,
    files: [filePath],
  };
}

/** Open a folder in the OS file manager. Falls back to the default output dir. */
function openFolder(targetPath) {
  let target = targetPath && String(targetPath).trim() ? targetPath : defaultOutputDir();
  if (!fs.existsSync(target)) {
    fs.mkdirSync(defaultOutputDir(), { recursive: true });
    target = defaultOutputDir();
  }
  shell.openPath(target);
  return { ok: true, path: target };
}

module.exports = { exportLog, exportSingleLog, openFolder };
