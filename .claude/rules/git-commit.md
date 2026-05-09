---
paths: []
---

# Git Commit 規則

- Commit message 格式：`type: 描述`（英文，首字母小寫）
- 常用 type：
  - `feat` — 新功能
  - `fix` — Bug 修復
  - `refactor` — 重構（不改變行為）
  - `style` — 樣式修改（CSS/SCSS）
  - `docs` — 文件更新
  - `test` — 測試相關
  - `chore` — 建置、設定、依賴更新
- 禁止 commit 的檔案：`.env`, `*.local`, `node_modules/`, `.next/`
- 每次 commit 前確認無 lint 錯誤：`npm run lint`
- 功能性修改 commit 前執行測試：`npm test`
