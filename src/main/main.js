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
const fs = require('fs');
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const { registerIpc } = require('./ipc');

let mainWindow = null;

// A file/folder passed on the command line (e.g. from the Explorer right-click
// "Analyze with M2 LOG" menu). The renderer pulls it once after boot via
// 'app:getInitialTarget'; pushing on did-finish-load races with the async boot.
let initialTarget = null;

// Pick the first existing path from argv and tag it as a file or directory.
// argv layout differs when packaged (exe first) vs dev (electron + ".").
function parseTargetFromArgv(argv) {
  const args = (argv || []).slice(app.isPackaged ? 1 : 2);
  for (const a of args) {
    try {
      if (a && fs.existsSync(a)) {
        return { path: a, isDir: fs.statSync(a).isDirectory() };
      }
    } catch (e) {
      /* ignore non-path args */
    }
  }
  return null;
}

// Background color shown the instant the window appears (before the renderer
// paints). Cached from the user's last theme so dark-theme users don't get a
// white flash. Falls back to the default "Daylight" light background.
function startupBackground() {
  try {
    const p = path.join(app.getPath('userData'), 'startup.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j && typeof j.bg === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(j.bg)) return j.bg;
  } catch (e) {
    /* no cache yet - use default */
  }
  return '#f4f4f4';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: true,
    backgroundColor: startupBackground(),
    title: 'M2 LOG v' + app.getVersion(),
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single instance: a second launch (e.g. another Explorer right-click) forwards
// its path to the already-running window instead of opening a duplicate app.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_evt, argv) => {
    const target = parseTargetFromArgv(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (target && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('app:openTarget', target);
      }
    }
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.m2station.m2log');
    Menu.setApplicationMenu(null);
    initialTarget = parseTargetFromArgv(process.argv);
    registerIpc();
    // Hand the CLI path to the renderer once, when it asks after boot.
    ipcMain.handle('app:getInitialTarget', () => {
      const t = initialTarget;
      initialTarget = null;
      return t;
    });
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
