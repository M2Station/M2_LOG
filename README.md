<!--
 M2_LOG
 Copyright (c) 2026 OA Hsiao
 SPDX-License-Identifier: MIT
-->

# M2 LOG

> **🌐 Language / 語言:** **English** · [繁體中文](#m2-log--繁體中文)

<a id="english"></a>

An **Electron desktop app** for collecting and exporting experiment LOGs. Fill in the
experiment fields on the left, add any number of **LOG types** (UEFI / SAM / custom) on the
right and paste their content, then hit **Export** — the app creates a timestamped folder,
writes one file per LOG (with the experiment header embedded), and zips the whole thing.
A separate **LOG Analysis** tab lets you browse and read exported LOGs with syntax
highlighting, search, bookmarks and an AI hand-off.

---

## ✨ Features

### Experiment capture
- **Multi-experiment tabs** — work on several experiments at once; add / close tabs (at least one stays open).
- **Experiment fields** — Name, Date (with a "now" refresh button), Tester, Test Case, Notes.
- **Experiment name must be English** — auto-uppercased, spaces become `_`, and used as the output folder abbreviation (length configurable, default 30).
- **Custom fields** — add / remove your own fields. Each has a **⬇ grab button** that fills in the most recently downloaded file name (Teams / browser downloads folder).

### LOG types & export
- **Dynamic LOG types** — use `+` to add any number of LOGs, each with an editable type name (not limited to UEFI / SAM) and a live line / character counter.
- **Export** — creates `<output-root>/<YYYYMMDD>_<HHmm>_<ABBR>/` containing:
  - `info.json` — all experiment fields (custom fields + LOG type list).
  - `<type>/<type>.log` for every non-empty LOG, with the experiment info embedded at the top.
  - `<folder>.zip` — a full archive of the same folder.
- **Export this LOG** — export only the current LOG (header included).
- **Configurable output root** — leave empty for the app-level `LOG_OUTPUT/`, or enter an absolute path (e.g. `D:\Logs`) / pick one via **Browse**.
- **Reset**, **Next experiment** (clears the name and LOGs but keeps shared fields) and **Copy Summary** (experiment fields → clipboard).
- `Ctrl + Enter` to export quickly.

### LOG Analysis
- Opens on the output folder by default; browse any folder's file tree and read LOG content (copyable).
- **Type-to-filter** the file list.
- **Syntax highlighting** driven by `highlight/*.json` rules (Auto / Off), with **error / warning markers** and prev / next jump.
- **Find** (F3 / Shift+F3), **bookmarks** (Ctrl+F2 add/remove, F2 / Shift+F2 navigate), **level markers** (version, boot point, memory bucket, power sequence, UEFI_SSH), **word wrap** and **zoom** (Ctrl + / Ctrl -).
- **AI** — open a new VS Code AI (Copilot) chat with the current LOG attached.

### Look & feel
- **Settings (⚙)** — folder-name length (1–40), file-name length (1–100), and **theme**.
- **Themes** — Daylight (Light), Low Key (Dark), VS Code (Dark), Army, Army (Dark).
- **Bilingual** EN / 中 interface; the **app version** shows in the window title.
- Draggable splitter between panels; form / custom fields / LOGs persist via `localStorage` (not cleared after export).

---

## 🚀 Getting started

Easiest: double-click **`M2_LOG.cmd`** (the first run auto-installs Node.js and dependencies,
downloads Electron, then launches).

Or manually:

```powershell
npm install
npm start
```

> **AI button & VS Code elevation (Windows):** the **AI** action reaches a running VS Code
> through its CLI, which Windows only permits between processes at the **same UAC level**.
> If your VS Code runs **as Administrator**, start M2_LOG with **`M2_LOG_Admin.cmd`** (it
> self-elevates via UAC) so the AI button can connect; otherwise the AI button shows a hint
> and does nothing. If VS Code runs normally, plain **`M2_LOG.cmd`** works.
> **Installed build:** the `.cmd` launchers are source-only — if you use the installer, run
> the **M2_LOG** shortcut **as Administrator** (right-click → *Run as administrator*) to match
> an elevated VS Code.

---

## 📂 Output layout example

Experiment name `Boot Stress Test` (abbreviation `BOOT_STRESS_TEST`), LOG types UEFI / SAM:

```
LOG_OUTPUT/
└─ 20260618_1430_BOOT_STRESS_TEST/
   ├─ info.json
   ├─ 20260618_1430_BOOT_STRESS_TEST.zip   ← full archive of this folder
   ├─ UEFI/
   │  └─ UEFI.log   ← experiment info embedded at the top
   └─ SAM/
      └─ SAM.log    ← experiment info embedded at the top
```

---

## ⚙️ Configuration

- Output defaults to `LOG_OUTPUT/` next to the app (project root in development; next to the EXE once installed). Set an absolute path in the **Output Root** field, or use **Browse**.
- Folder / file name abbreviation lengths: open ⚙ Settings.

---

## 📦 Build the installer

Uses [electron-builder](https://www.electron.build/) to produce a Windows NSIS installer:

```powershell
npm install
npm run dist
```

Produces `dist\M2_LOG Setup <version>.exe`. `npm run pack` builds only the unpacked
`dist\win-unpacked\` (for testing). `npm test` runs the static self-tests.

---

## 🗂️ Project structure

```
src/
  main/      Electron main process (main / ipc / utils / paths / logwriter / vscodeChat)
  preload/   contextBridge bridge (window.m2log)
  renderer/  index.html, css/styles.css, js/{app,themes}.js, i18n/{en,zh}.json
highlight/   INTEL_UEFI.json / RUST_SAM.json highlight rules
test/        selftest.test.js (static guards)
scripts/     make-icon.mjs (dependency-free icon generator)
.github/     CI workflows (quality / build / release / selftest / codeql) + dependabot
M2_LOG.cmd   launcher (auto-installs Node + deps, then npm start)
M2_LOG_Admin.cmd  same launcher, self-elevated (for an Administrator VS Code; needed by the AI button)
package.json electron + electron-builder
```

---

## 🔒 Security

- Runs with `contextIsolation: true` and `nodeIntegration: false`; the renderer talks to the main process only through the limited API exposed by preload.
- LOG type names are sanitized before being used as folder names to prevent path traversal.

---

## 📄 License

[MIT](LICENSE) © 2026 OA Hsiao

<br>

---

<br>

# M2 LOG · 繁體中文

> **🌐 Language / 語言:** [English](#m2-log) · **繁體中文**

實驗 LOG 收集與輸出的 **Electron 桌面 App**。左邊填寫實驗欄位，右邊可新增多個 **LOG 種類**
（UEFI / SAM / 自訂）貼上內容，按「輸出」即自動建立目錄並寫入對應檔案（實驗資訊崁在最上面），
並產生壓縮檔。另有「LOG 分析」分頁可瀏覽與檢視已輸出的 LOG，支援語法高亮、搜尋、書籤與 AI 接力。

---

## ✨ 功能

### 實驗輸入
- **多實驗分頁** — 同時處理多個實驗；可新增 / 關閉分頁（至少保留一個）。
- **實驗欄位** — 名稱、日期（含「現在時間」更新鈕）、測試人員、測試項目、備註。
- **實驗名稱必須是英文** — 自動轉大寫、空白換 `_`，並當作輸出資料夾縮寫（長度可在設定調整，預設 30）。
- **自訂欄位** — 可新增 / 移除。每個右側有 **⬇ 按鈕**：一鍵帶入「下載資料夾」中最新下載的檔名（Teams / 瀏覽器皆可）。

### LOG 種類與輸出
- **動態 LOG 種類** — 用 `+` 新增任意數量的 LOG，每個都有可編輯的種類名稱（不再侷限 UEFI / SAM），含行數 / 字元即時計數。
- **輸出** — 自動建立 `<輸出根目錄>/<YYYYMMDD>_<HHmm>_<縮寫>/`，內含：
  - `info.json`：實驗欄位（含自訂欄位與 LOG 種類清單）。
  - 每個有內容的 LOG → `<種類>/<種類>.log`（實驗資訊崁在最上面）。
  - `<資料夾名稱>.zip`：同目錄下的完整壓縮檔。
- **輸出此 LOG** — 只輸出目前這個 LOG（含實驗標頭）。
- **可設定輸出根目錄** — 留空＝App 同層的 `LOG_OUTPUT/`，或填絕對路徑（例如 `D:\Logs`）／用 **Browse** 選擇。
- **重設**、**下一個實驗**（清空名稱與 LOG，但保留共用欄位）與 **複製摘要**（實驗欄位 → 剪貼簿）。
- `Ctrl + Enter` 快速輸出。

### LOG 分析
- 預設開在輸出目錄；可瀏覽任意資料夾的檔案樹並檢視 LOG 內容（可複製）。
- **輸入即時過濾** 檔案清單。
- **語法高亮**：由 `highlight/*.json` 規則驅動（Auto / Off），含 **錯誤 / 警告標記** 與上一個 / 下一個跳轉。
- **尋找**（F3 / Shift+F3）、**書籤**（Ctrl+F2 新增/移除、F2 / Shift+F2 導覽）、**等級標記**（版本、開機點、Memory Bucket、PowerSequence、UEFI_SSH）、**自動換行** 與 **縮放**（Ctrl + / Ctrl -）。
- **AI** — 開啟新的 VS Code AI（Copilot）對話並附上目前的 LOG。

### 外觀
- **設定（⚙）** — 資料夾名稱長度（1–40）、檔名長度（1–100）與 **佈景主題**。
- **佈景主題** — Daylight（淺色）、Low Key（深色）、VS Code（深色）、Army、Army（深色）。
- **中 / 英雙語** 介面；**App 版本** 顯示在視窗標題列。
- 左右面板中間可拖曳調整寬度；表單 / 自訂欄位 / LOG 透過 `localStorage` 記憶（輸出後不會被清空）。

---

## 🚀 啟動

最簡單：雙擊 **`M2_LOG.cmd`**（第一次會自動安裝 Node.js 與相依套件、下載 Electron，然後啟動）。

或手動：

```powershell
npm install
npm start
```

> **AI 按鈕與 VS Code 權限（Windows）：** 「AI」功能透過 VS Code 的 CLI 連到執行中的 VS Code，
> 而 Windows 只允許**相同 UAC 權限等級**的程序互通。若你的 VS Code 以**系統管理員**執行，請改用
> **`M2_LOG_Admin.cmd`**（會經由 UAC 自動提權）啟動 M2_LOG，AI 按鈕才能連上；否則 AI 按鈕會顯示
> 提示而不會動作。若 VS Code 以一般權限執行，直接用 **`M2_LOG.cmd`** 即可。
> **安裝版：** `.cmd` 啟動器只用於原始碼；若使用安裝檔，請對 **M2_LOG** 捷徑按右鍵
> →「以系統管理員身分執行」，以配合系統管理員權限的 VS Code。

---

## 📂 輸出結構範例

實驗名稱 `Boot Stress Test`（縮寫 `BOOT_STRESS_TEST`），LOG 種類 UEFI / SAM：

```
LOG_OUTPUT/
└─ 20260618_1430_BOOT_STRESS_TEST/
   ├─ info.json
   ├─ 20260618_1430_BOOT_STRESS_TEST.zip   ← 同目錄內的完整壓縮檔
   ├─ UEFI/
   │  └─ UEFI.log   ← 最上面崁入實驗資訊
   └─ SAM/
      └─ SAM.log    ← 最上面崁入實驗資訊
```

---

## ⚙️ 設定

- 預設輸出到 App 同層的 `LOG_OUTPUT/`（開發時為專案根目錄；安裝後為 EXE 同層）。可在「輸出根目錄」欄位填絕對路徑，或用 Browse 選擇。
- 資料夾 / 檔名縮寫長度：點右上角 ⚙ 設定。

---

## 📦 打包安裝檔

使用 [electron-builder](https://www.electron.build/) 產生 Windows NSIS 安裝檔：

```powershell
npm install
npm run dist
```

產生 `dist\M2_LOG Setup <版本>.exe`。`npm run pack` 則只產生未封裝的 `dist\win-unpacked\`（測試用）。`npm test` 執行靜態自我測試。

---

## 🗂️ 專案結構

```
src/
  main/      Electron 主行程（main / ipc / utils / paths / logwriter / vscodeChat）
  preload/   contextBridge 橋接（window.m2log）
  renderer/  index.html、css/styles.css、js/{app,themes}.js、i18n/{en,zh}.json
highlight/   INTEL_UEFI.json / RUST_SAM.json 高亮規則
test/        selftest.test.js（靜態檢查）
scripts/     make-icon.mjs（零相依圖示產生器）
.github/     CI 工作流程（quality / build / release / selftest / codeql）＋ dependabot
M2_LOG.cmd   啟動器（自動裝 Node 與相依套件，然後 npm start）
M2_LOG_Admin.cmd  同上但自動提權（VS Code 以系統管理員執行時，AI 按鈕需要）
package.json electron + electron-builder
```

---

## 🔒 安全

- 採 `contextIsolation: true`、`nodeIntegration: false`，renderer 只透過 preload 暴露的有限 API 與主行程溝通。
- LOG 種類名稱會先消毒再當資料夾名，避免路徑穿越。

---

## 📄 授權

[MIT](LICENSE) © 2026 OA Hsiao
