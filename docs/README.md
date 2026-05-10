# ENSO Incense — 線香品牌電商前台

ENSO Incense 是一個線香品牌的電商前台應用，使用 **Vite 7 + React 19 + react-router 7** 建構為純前端 SPA，串接六角學院 EC Course API 作為後端服務，並內嵌 Anthropic Messages API 驅動的 multi-agent shopping assistant。

## 技術棧

| 類別 | 技術 |
|---|---|
| 建置工具 | Vite 7（`@vitejs/plugin-react` + `@tailwindcss/vite`）|
| 前端框架 | React 19 |
| 路由 | react-router 7（`createBrowserRouter` data router）|
| 語言 | TypeScript 5.9 |
| 狀態管理 | Redux Toolkit 2 + react-redux 9 |
| 表單處理 | react-hook-form 7 |
| CSS 框架 | Bootstrap 5 + SCSS（sass-embedded modern-compiler）+ Tailwind CSS v4 |
| HTTP 客戶端 | Axios 1 |
| 動畫 | AOS（scroll animations）、Swiper 12（carousels）|
| UI 輔助 | sweetalert2、react-loader-spinner、bootstrap-icons、Font Awesome（CDN）|
| AI | Anthropic Messages API（fetch + 自訂 protocol，純 client）|
| 測試 | Vitest 4 + Testing Library (React) + jsdom |
| Lint | ESLint 9（flat config）+ simple-import-sort |

## 快速開始

```bash
# 1. 安裝依賴
npm install

# 2. 設定環境變數（複製範本後填入）
cp .env.example .env.local
# 至少需設 VITE_API_BASE 與 VITE_API_PATH，AI agent 預設走 mock 不必設

# 3. 啟動 dev server
npm run dev

# 4. 開啟瀏覽器
# http://localhost:5173
```

## 常用指令

| 指令 | 說明 |
|---|---|
| `npm run dev` | 啟動 Vite dev server（預設 5173）|
| `npm run build` | `tsc -b && vite build`，產物在 `dist/` |
| `npm run preview` | 預覽 production build |
| `npm run lint` | ESLint 檢查 |
| `npm test` | 執行 Vitest（一次性） |
| `npx vitest` | Vitest watch 模式 |

## 文件索引

| 文件 | 說明 |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 架構、目錄結構、資料流 |
| [AGENT.md](./AGENT.md) | AI Shopping Agent 架構、provider、環境變數 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 開發規範、命名規則、計畫歸檔流程 |
| [FEATURES.md](./FEATURES.md) | 功能列表與完成狀態 |
| [TESTING.md](./TESTING.md) | 測試規範與指南 |
| [CHANGELOG.md](./CHANGELOG.md) | 更新日誌 |
| [plans/](./plans/) | 開發計畫目錄 |
