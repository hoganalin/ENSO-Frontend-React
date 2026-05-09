---
paths:
  - "src/services/**"
---

# API / Services 規則

- 前台公開請求使用 `api` instance，後台管理請求使用 `adminApi` instance
- API 函式命名：`{動作}{資源}Api`，例如 `getProductApi`, `addCartApi`
- 所有 API 函式都 import `{ api, API_PATH }` 或 `{ adminApi, API_PATH }` from `./api`
- 端點路徑格式：`` `/api/${API_PATH}/resource` ``
- POST/PUT 請求 body 必須包在 `{ data: { ... } }` 中（六角學院 API 規範）
- 不要在 service 層處理錯誤，讓呼叫端（component 或 thunk）處理
- 新增 service 檔案時，一個資源一個檔案（product.ts, cart.ts, coupon.ts）
