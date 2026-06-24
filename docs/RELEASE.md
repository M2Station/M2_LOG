# 發版流程 / Release Process

M2_LOG 的正式發版流程。`main` 為受保護分支,所有發版都必須走 PR,並在合併後對**合併 commit** 打 tag 來觸發自動建置與發佈。

> Verified 2026-06-24,最新發佈版本 `v0.0.7`。

---

## 前置條件 / Prerequisites

- [GitHub CLI](https://cli.github.com/) `gh`(已登入:`gh auth status`)
- `git`、Node.js / npm
- 對 repo 有 push 權限,並能合併 PR

---

## `main` 分支保護 / Branch protection

直接 push 到 `main` 會被拒絕。發版必須透過 PR,且需通過 **4 項必要檢查**:

| Check | Workflow |
|-------|----------|
| `build-windows` | Build |
| `code-quality` | Quality |
| `self-test` | Self-Test |
| `Analyze` (CodeQL) | CodeQL |

---

## 版號規則 / Versioning

採用語意化版號 `MAJOR.MINOR.PATCH`。當只說 **`RELEASE`**(不給版號)時的預設行為:

| 指令 | 由 `0.0.7` 推算 | 說明 |
|------|----------------|------|
| `RELEASE` | `0.0.8` | 預設:**patch +1** |
| `RELEASE minor` | `0.1.0` | minor +1,patch 歸零 |
| `RELEASE major` | `1.0.0` | major +1,其餘歸零 |
| `RELEASE X.Y.Z` | `X.Y.Z` | 指定版號 |

> 若指定版號**跳號**(例如 `0.0.5 → 0.0.7`),請先確認是否刻意跳過。

---

## 發版步驟 / Steps to cut a release `vX.Y.Z`

### 1. 同步 `main` 並開發版分支

```powershell
git checkout main
git pull origin main --ff-only
git checkout -b chore/release-vX.Y.Z
```

### 2. 更新版號(兩個檔案)

- `package.json` → `version`
- `package-lock.json` → **兩處**:頂層 `version` 與 `packages[""].version`

> ⚠️ 兩個檔案的版號必須一致,否則 `npm ci`(CI 使用)會失敗。

### 3. 跑自我測試

```powershell
npm test
```

### 4. 提交並推送分支

```powershell
git commit -am "chore: release vX.Y.Z"
git push -u origin chore/release-vX.Y.Z
```

### 5. 開 PR 並等待檢查通過

```powershell
gh pr create --base main --title "chore: release vX.Y.Z" --body "Release vX.Y.Z"

# 查看檢查狀態(避免使用 --watch 的全螢幕 TUI)
gh pr view <PR> --json statusCheckRollup
```

Windows 建置會下載 Electron(約 2 分鐘),CodeQL 需要數分鐘。

### 6. 合併 PR

```powershell
gh pr merge <PR> --merge --delete-branch
git checkout main
git pull origin main --ff-only
```

### 7. 對合併 commit 打 tag 並推送

```powershell
git tag -a vX.Y.Z -m "M2_LOG vX.Y.Z"
git push origin vX.Y.Z
```

推送 tag 會觸發 [`.github/workflows/release.yml`](../.github/workflows/release.yml)。

### 8. 驗證發佈結果

```powershell
gh release view vX.Y.Z --json name,tagName,url,assets
```

應包含三個安裝檔(見下方)。

---

## 雙架構建置 / Dual-arch build (x64 + ARM64)

`package.json` 的 build 設定:

```jsonc
"win": {
  "target": [{ "target": "nsis", "arch": ["x64", "arm64"] }],
  "artifactName": "${productName}-${version}-${arch}.${ext}"
}
```

electron-builder 會產生 **三個** `.exe`,release workflow 會全部上傳:

| 檔案 | 架構 | 約略大小 |
|------|------|---------|
| `M2_LOG-<ver>-x64.exe` | x64 | ~76 MB |
| `M2_LOG-<ver>-arm64.exe` | ARM64 | ~80 MB |
| `M2_LOG-<ver>.exe` | 合併(兩架構) | ~155 MB |

本機建置指令:

```powershell
npm run dist          # x64 + ARM64
npm run dist:x64      # 只建 x64
npm run dist:arm64    # 只建 ARM64
```

---

## 注意事項 / Gotchas

- **Tag 打在合併 commit 上**(與 `v0.0.1`–`v0.0.7` 慣例一致),不是 PR 分支的 commit。
- PR **合併後**再 push 到該分支的 commit **不會**進到 `main`(會變成孤兒 commit)。
- `gh pr checks --watch` / `gh run watch` 會開啟全螢幕 TUI;改用 `--json ... | ConvertFrom-Json`,或將輸出導到 `| Out-String`。
- 目前 release workflow 使用的 actions 仍針對 Node.js 20(已被 GitHub 標記棄用,執行時自動改用 Node 24);未來可升級到 v5 版 actions 消除警告。
