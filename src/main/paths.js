/*
 * M2_LOG
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

const path = require('path');
const { app } = require('electron');

/**
 * Base directory used as the writable root for output.
 * - Packaged: the folder that contains the installed M2_LOG.exe
 *   (per-user install under %LOCALAPPDATA%\Programs\M2_LOG is writable).
 * - Dev: the project root.
 */
function appBaseDir() {
  if (app.isPackaged) return path.dirname(process.execPath);
  return path.join(__dirname, '..', '..');
}

/** Default output root: <appBaseDir>\LOG_OUTPUT */
function defaultOutputDir() {
  return path.join(appBaseDir(), 'LOG_OUTPUT');
}

module.exports = { appBaseDir, defaultOutputDir };
