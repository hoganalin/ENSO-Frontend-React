# 更新日誌

## [0.4.0] - 2026-05-10

### Changed
- **Next.js 16 → Vite 7 + React Router 7 遷移**：拔除 `app/`、Route Handler、`'use client'`、`NEXT_PUBLIC_` 前綴等 Next 專屬概念
- 路由：以 `createBrowserRouter`（`src/router/index.tsx`）集中註冊；`FrontendShell` 改名為 `FrontendLayout`（`src/layouts/`）
- 頁面：所有頁面從 `src/app/(frontend)/.../page.tsx` 改為 `src/pages/XxxPage.tsx`
- 環境變數前綴：`NEXT_PUBLIC_*` → `VITE_*`（`src/services/api.ts` 啟動時硬性檢查）
- AI Agent provider：`server` 模式（透過 `/api/agent` Route Handler）已**拔除**，僅保留 `mock` 與 `direct`（`getAgentAdapter()`）
- Page title：以輕量 `usePageTitle` hook 取代 `react-helmet-async`（後者尚不支援 React 19）
- 新增：`ScrollRestoration`（react-router 7 內建，路由切換自動回頂）
- 新增：自訂 `favicon.svg`
- 修正：`PaymentMock` `useEffect` 依賴

### Removed
- `/playground` Prompt Playground 與 `/playground/eval` Eval Suite（原依賴 Next Route Handler 的 server provider）
- `/api/events`、`/api/candidate-cases`、Upstash Redis 持久化（純 SPA 不再有 server，agent events 改為純 client log）
- `react-helmet-async`（無 React 19 支援）
- 環境變數 `ANTHROPIC_API_KEY` / `UPSTASH_*` / `KV_*`（純 SPA 沒有 server-only secret）

### Brand
- 將 KYOTO/Kyoto 字樣從 Footer / Home hero / page titles / contact email 中移除（commit `219be13`）

## [0.3.1] - 2026-05-05（Next.js 版）

### Added
- **AI Agent 持久化**：`/api/events`、`/api/candidate-cases` 改走 Upstash Redis（LIST 結構，append/range/set），dev 沒設 env 自動 fallback 到本機 JSON
- **首頁 / 庭園影片背景**：`public/videos/山水.mp4`、`public/images/incene-bg.png`、`public/images/incene-breath-bg.png`
- **本機假金流**：新增 `/payment/mock/[orderId]` 路由與 `PaymentMock.tsx`，demo 不依賴 ECPay 跳轉

### Changed
- 商品卡片內容置中、行動版購物車版面修正
- `data/agent-events.json` 從 git 移除（已加入 .gitignore，避免 lambda image 帶入舊資料）

## [0.3.0] - 2026-04-28（Next.js 版）

### Added
- **Enso Kyoto 視覺系統**：`src/components/atoms/`（Asanoha、Seigaiha、EnsoCircle、KanjiDivider、VerticalKanji、Seal、SmokeLayer）
- **新頁面**：`/journal`（列表 + 詳情）、`/stores`
- **靜態資料**：`src/data/journal.ts`
- **新 slice**：`themeSlice.ts`、`agentSlice.ts`
- **新 SCSS**：`_tokens-enso-kyoto.scss`、`_atoms-enso-kyoto.scss`、`_journal.scss`、`_login.scss`、`_direction-accent.scss`、`_extras-enso.scss`
- **About 頁**：新增 `GardenParallaxSection`，背景改為影片 `/videos/山水.mp4`（autoplay + muted + loop + playsInline）
- **首頁 Philosophy / CTA 區**：背景圖 + 桌機視差滾動
- **AI Shopping Agent**：multi-agent (小禾／小香／小管)、3 種 provider、`/api/agent` Route Handler、Prompt Playground、Eval Suite

### Changed
- 大量更新前台元件樣式以對齊 Enso Kyoto 設計語彙

## [0.2.0] - 2026-04-05（Vite → Next.js）

### Changed
- 從 Vite + React Router 遷移至 Next.js 16 (App Router)
- 環境變數前綴從 `VITE_` 改為 `NEXT_PUBLIC_`
- 新增 `src/app/` 目錄（App Router pages + layouts）
- 新增 `providers.tsx`（Redux Provider）、`bootstrap-client.tsx`（Bootstrap JS 動態載入）
- 新增 `authSlice.ts`（認證狀態管理）

> 此版本後續於 0.4.0 反向遷移回 Vite + React Router。

## [0.1.0] - 2026-03-29

### Added
- 專案初始化：Vite + React + TypeScript
- Redux Toolkit 狀態管理（cart, message slices）
- Axios API 層（api, product, cart services）
- 前台頁面：首頁、商品列表、商品詳情、購物車、結帳、結帳成功
- 認證：登入、註冊
- 其他頁面：品牌故事、聯絡我們、FAQ、404
- UI：Bootstrap 5 + 自訂 SCSS、AOS 動畫、Swiper 輪播
- Toast 通知系統
- 搜尋功能（前端 filter）
- 優惠券功能
