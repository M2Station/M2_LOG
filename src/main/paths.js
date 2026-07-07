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
const { app } = require('electron');

/**
 * Base directory used as the read root for bundled resources (e.g. highlight
 * rules) and as the preferred output root.
 * - Packaged: the folder that contains the installed M2_LOG.exe.
 * - Dev: the project root.
 */
function appBaseDir() {
  if (app.isPackaged) return path.dirname(process.execPath);
  return path.join(__dirname, '..', '..');
}

/** True if `dir` can be created and written to (Windows ACLs need a real probe). */
function canWrite(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.m2log-write-test-${process.pid}-${Date.now()}.tmp`);
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
    return true;
  } catch (e) {
    return false;
  }
}

let cachedOutputDir = null;

/**
 * Default output root for exports and the LOG Analysis view.
 * Prefers <appBaseDir>\LOG_OUTPUT (portable / per-user install). When the app
 * is installed to a protected location (e.g. C:\Program Files) that folder is
 * not writable, so we fall back to <Documents>\M2_LOG\LOG_OUTPUT.
 */
function defaultOutputDir() {
  if (cachedOutputDir) return cachedOutputDir;
  const primary = path.join(appBaseDir(), 'LOG_OUTPUT');
  if (!app.isPackaged || canWrite(primary)) {
    cachedOutputDir = primary;
  } else {
    cachedOutputDir = path.join(app.getPath('documents'), 'M2_LOG', 'LOG_OUTPUT');
  }
  return cachedOutputDir;
}

module.exports = { appBaseDir, defaultOutputDir };
