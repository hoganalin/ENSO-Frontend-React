---
paths: []
---

# 安全性規則

- 永遠不要在程式碼中硬編碼 API key、token 或密碼，使用環境變數
- 使用者輸入必須驗證後才能使用（react-hook-form validation）
- 避免使用 `dangerouslySetInnerHTML`，如必要確保已消毒
- Token 儲存：localStorage + cookie 雙重保存（配合現有架構）
- adminApi interceptor 處理 401/403 自動清除 token 並導向登入
- 不要在前端暴露後台 API 端點給未認證使用者
- 表單提交使用 `e.preventDefault()` 防止預設行為
- CORS 由後端 API 控制，前端不需額外設定
