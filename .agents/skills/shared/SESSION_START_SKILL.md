# SESSION_START_SKILL — Session 開場環境檢查

## 觸發時機

每次 session 開始時，或用戶說「開始」、「我們來做...」之前，主動執行此 skill。

---

## 步驟一：讀取專案基本資訊

1. 讀取 `package.json`，記錄以下資訊：
   - `dependencies` 與 `devDependencies` 中的主要套件版本
   - 可用的 `scripts`（dev、build、test 等）
2. 讀取 `CLAUDE.md`，確認目前專案架構、規則與 skill 系統設定。

---

## 步驟二：環境快速診斷

執行以下指令並記錄結果：

```bash
# 確認 Node 版本
node -v

# 確認 npm 版本
npm -v

# 確認 git 狀態（是否有未提交變更）
git status --short

# 確認遠端是否設定（避免 deploy 失敗）
git remote -v
```

---

## 步驟三：Build 健康檢查

執行 TypeScript 型別檢查（不產出檔案）：

```bash
npx tsc --noEmit 2>&1 | head -20
```

若有錯誤：
- 列出所有錯誤
- 詢問用戶：「發現 X 個 TypeScript 錯誤，是否先修復再繼續？」

---

## 步驟四：回報摘要

以簡短格式回報：

```
環境檢查完成：
- Node: vX.X.X
- 主要套件：React vX, Next.js vX, Vite vX（依實際情況）
- Git：X 個未提交變更 / 無變更
- TypeScript：✅ 無錯誤 / ⚠️ X 個錯誤
```

若一切正常，直接說：「環境正常，可以開始。」並等待用戶指示。

---

## 注意事項

- 只在 session **開頭**執行一次，不要每次對話都重複
- 若用戶明確說「跳過檢查」，直接進入任務
- WSL 環境下啟動 dev server 請加 `--host` flag（`npm run dev -- --host`）
