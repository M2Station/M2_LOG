/*
 * M2_LOG
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Minimal, explicit API exposed to the renderer. No Node access leaks.
contextBridge.exposeInMainWorld('m2log', {
  appVersion: () => ipcRenderer.invoke('app:version'),
  setStartupBg: (color) => ipcRenderer.invoke('app:setStartupBg', color),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: (asset) => ipcRenderer.invoke('update:download', asset),
  installUpdate: (filePath) => ipcRenderer.invoke('update:install', filePath),
  onUpdateProgress: (cb) => {
    const listener = (_e, data) => {
      try {
        cb(data);
      } catch (err) {
        /* ignore renderer callback errors */
      }
    };
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.removeListener('update:progress', listener);
  },
  exportLog: (payload) => ipcRenderer.invoke('log:export', payload),
  exportSingleLog: (payload) => ipcRenderer.invoke('log:exportSingle', payload),
  openFolder: (targetPath) => ipcRenderer.invoke('log:openFolder', targetPath),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openInVSCodeChat: (payload) => ipcRenderer.invoke('vscode:chat', payload),
  pickFolder: (defaultPath) => ipcRenderer.invoke('dialog:pickFolder', defaultPath),
  latestDownload: () => ipcRenderer.invoke('download:latest'),
  logRoot: () => ipcRenderer.invoke('fs:logRoot'),
  listDir: (dirPath) => ipcRenderer.invoke('fs:list', dirPath),
  readText: (filePath) => ipcRenderer.invoke('fs:readText', filePath),
  writeText: (payload) => ipcRenderer.invoke('fs:writeText', payload),
  loadHighlight: (type) => ipcRenderer.invoke('hl:load', type),
  listHighlights: () => ipcRenderer.invoke('hl:list'),
  loadI18n: (lang) => ipcRenderer.invoke('i18n:load', lang),
  // Explorer right-click "Analyze with M2 LOG": the path passed on the command
  // line (pulled once after boot), plus later right-clicks (second-instance).
  getInitialTarget: () => ipcRenderer.invoke('app:getInitialTarget'),
  onOpenTarget: (cb) => {
    const listener = (_e, target) => {
      try {
        cb(target);
      } catch (err) {
        /* ignore renderer callback errors */
      }
    };
    ipcRenderer.on('app:openTarget', listener);
    return () => ipcRenderer.removeListener('app:openTarget', listener);
  },
});
