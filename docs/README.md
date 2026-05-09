# ENSO Incense — 線香品牌電商前台

ENSO Incense 是一個線香品牌的電商前台應用，使用 Next.js 16 (App Router) 建構，串接六角學院 EC Course API 作為後端服務。

## 技術棧

| 類別 | 技術 |
|---|---|
| 框架 | Next.js 16 (App Router) + React 19 |
| 語言 | TypeScript 5 |
| 狀態管理 | Redux Toolkit + react-redux |
| 表單處理 | react-hook-form 7 |
| CSS 框架 | Bootstrap 5 + SCSS (sass-embedded) + Tailwind CSS v4 |
| HTTP 客戶端 | Axios |
| 動畫 | AOS (scroll animations), Swiper (carousels) |
| UI 輔助 | sweetalert2, react-loader-spinner, bootstrap-icons, Font Awesome (CDN) |
| AI | Anthropic Messages API（fetch + 自訂 protocol，走 `/api/agent` Route Handler）|
| 持久化 | Upstash Redis（dev fallback 為 `data/*.json`）|
| 測試 | Vitest 3 + Testing Library (React) |
| Lint | ESLint 9 (flat config) + simple-import-sort |

## 快速開始

```bash
# 1. 安裝依賴
npm install

# 2. 設定環境變數：
cp .env.example .env.local
# 然後依 .env.example 的說明填入必要值（EC API + 可選的 Anthropic key）

# 3. 啟動開發伺服器
npm run dev

# 4. 開啟瀏覽器
# http://localhost:3000
```

## 常用指令

| 指令 | 說明 |
|---|---|
| `npm run dev` | 啟動 Next.js dev server |
| `npm run build` | 生產環境建置 |
| `npm run start` | 啟動生產環境伺服器 |
| `npm run lint` | ESLint 檢查 |
| `npm test` | 執行 Vitest 測試 |

## 文件索引

| 文件 | 說明 |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 架構、目錄結構、資料流 |
| [AGENT.md](./AGENT.md) | AI Shopping Agent 架構、三種 provider、環境變數 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 開發規範、命名規則 |
| [FEATURES.md](./FEATURES.md) | 功能列表與完成狀態 |
| [TESTING.md](./TESTING.md) | 測試規範與指南 |
| [CHANGELOG.md](./CHANGELOG.md) | 更新日誌 |
| [plans/](./plans/) | 開發計畫目錄 |
