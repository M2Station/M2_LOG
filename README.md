# M2 LOG Tool

實驗 LOG 收集與輸出的 **Electron 桌面 App**。左邊填寫實驗欄位，右邊可新增多個 **LOG 種類**（UEFI / SAM / 自訂）貼上內容，按「輸出」即自動建立目錄並寫入對應檔案，並可一鍵開啟檔案總管。另有「LOG 分析」分頁可瀏覽與檢視已輸出的 LOG。

## 功能

- **實驗欄位**：名稱、日期、測試人員、測試項目、備註 + 可新增 / 移除的自訂欄位
  - 自訂欄位右側有 **⬇ 按鈕**：一鍵帶入「下載資料夾」中最新下載的檔名（Teams / 瀏覽器皆可）
- **動態 LOG 種類**：用 `+` 新增任意數量的 LOG，每個都有可編輯的種類名稱（不再侷限 UEFI / SAM），含行數 / 字元計數
- **輸出**：自動建立 `<輸出根目錄>/<YYYYMMDD>_<HHmm>_<縮寫>/`，內含：
  - `info.json`：實驗欄位（含自訂欄位與 LOG 種類清單）
  - 每個有內容的 LOG → `<種類>/<種類>.log`（實驗資訊崁在最上面）
  - `<資料夾名稱>.zip`：同目錄下的完整壓縮檔
- **實驗名稱必須是英文**，會自動轉大寫、空白換 `_` 當資料夾名縮寫（長度可在設定調整，預設 30）
- **LOG 分析分頁**：預設開在輸出目錄，可改選其他資料夾，瀏覽檔案樹並檢視 LOG 內容（可複製）
- **設定（⚙）**：調整資料夾名稱縮寫長度（1–40）
- 左右面板中間可拖曳調整寬度；輸出後表單 / 自訂欄位 / LOG 不會被清空（localStorage 記憶）；`Ctrl + Enter` 快速輸出；中 / 英雙語

## 啟動

最簡單：雙擊 **`M2_LOG.cmd`**（第一次會自動安裝 Node.js 與相依套件、下載 Electron，然後啟動）。

或手動：

```powershell
npm install
npm start
```

## 輸出結構範例

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

## 設定

- 預設輸出到 App 同層的 `LOG_OUTPUT/`（開發時為專案根目錄；安裝後為 EXE 同層）。可在「輸出根目錄」欄位填絕對路徑（例如 `D:\Logs`），或用 Browse 選擇。
- 資料夾名稱縮寫長度：點右上角 ⚙ 設定（範圍 1–40，預設 30）。

## 打包安裝檔

使用 [electron-builder](https://www.electron.build/) 產生 Windows NSIS 安裝檔：

```powershell
npm install
npm run dist
```

產生 `dist\M2_LOG Setup <版本>.exe`。`npm run pack` 則只產生未封裝的 `dist\win-unpacked\`（測試用）。

## 專案結構

```
src/
  main/      Electron 主行程（main / ipc / utils / paths / logwriter）
  preload/   contextBridge 橋接（window.m2log）
  renderer/  index.html、css/styles.css、js/app.js、i18n/{en,zh}.json
M2_LOG.cmd   啟動器（自動裝 Node 與相依套件，然後 npm start）
package.json electron + electron-builder
```

## 安全

- 採 `contextIsolation: true`、`nodeIntegration: false`，renderer 只透過 preload 暴露的有限 API 與主行程溝通。
- LOG 種類名稱會先消毒再當資料夾名，避免路徑穿越。
