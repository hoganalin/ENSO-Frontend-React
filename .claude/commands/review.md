對本次 session 所有修改的檔案進行程式碼審查。以繁體中文回覆。

## 執行步驟

1. 執行 `git diff --name-only` 取得本次修改的檔案清單
2. 逐一讀取每個 .ts / .tsx / .js / .jsx 檔案
3. 依照以下清單逐項檢查，發現問題立即修正

---

## 檢查清單

### 殘留 Import
- 找出所有 import 語句，確認每個匯入的識別符在檔案中確實有被使用
- 特別注意：重構後遺留的 import、複製貼上帶來的多餘 import

### 棄用 API
- 對照 `package.json` 中的套件版本，確認使用的 API 未被棄用
- 重點確認：
  - Recharts v3：`Cell` 元件已棄用
  - React Router v7：`useHistory` 已改為 `useNavigate`
  - 其他套件如有棄用警告一併回報

### Directive 衝突（React / Next.js）
- `'use client'` 的檔案不能有 async server component 模式
- `'use client'` 的檔案不能直接使用 `cookies()` / `headers()` 等 server-only API
- Server component 不能 import client-only 套件

### TypeScript
- 執行 `npx tsc --noEmit 2>&1 | head -30` 確認無型別錯誤
- 回報所有 error（warning 可忽略）

### 測試
- 執行 `npm test` 確認現有測試全數通過
- 若有新增的函式或元件但缺少對應測試，列出建議補測的項目

---

## 回報格式

針對每個有問題的檔案，以以下格式回報並修正：

**檔案：** `src/components/Foo.tsx`
- 問題 1：殘留 import `useState`（未使用）→ 已移除
- 問題 2：...

若所有檔案皆無問題，回覆：「✅ 審查完成，無發現問題。」
