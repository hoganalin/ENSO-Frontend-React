# 更新日誌

## 2026-09-16 購物流程修正（本機驗證完成，尚未部署）

- 商品與購物車改讀 Supabase；本機只保存商品 ID 與數量，價格重新查詢。
- 結帳加入收件人姓名、信箱、手機與地址；直接開啟／重新整理結帳頁會先等待購物車載入。
- checkout-create 依登入者、商品價格與會員資料重新計算活動；服務端 RPC 原子建立訂單與明細，支援同一請求重試。
- migration 007 限制瀏覽器直接建單及修改可信訂單金額／付款狀態；payment-create 僅接受 server-v1 訂單。
- 新增我的訂單、付款頁、付款失敗重試，取消正式路由上的模擬付款。
- 驗證：15 個測試檔共 110 項通過；TypeScript/Vite build 通過（既有 Sass 棄用與 bundle 大小警告仍在）。
- 本機 PGlite 執行 schema、migration 001–007 與重跑 007，驗證建單、防重複、交易回滾與權限限制；不代表已驗證線上 Supabase RLS／JWT／Edge runtime。
- Playwright 以攔截 API 的測試資料驗證結帳重新整理、送出 payload、清空購物車、付款失敗重試；檢查 320／768／1024／1440 寬度表單，截圖保存在專案外 ENSO-verification-2026-09-16。

### 部署前仍需處理

1. 在測試 Supabase 環境依序套用既有 migration 與 007，再部署 checkout-create、更新 payment-create，最後發布前台，避免新舊建單契約混用。
2. 驗證實際 JWT、RLS、Edge runtime、綠界測試交易與回呼；本次未發送真實付款或簡訊，也未部署線上資料庫。
3. 新可信訂單的付款／出貨／退款狀態不能再由瀏覽器直接更新。需補齊後台授權的伺服器操作流程；舊訂單被新付款入口拒絕，需確認重建／遷移方案。
4. payment-notify 仍有先標記交易再更新訂單／購物金的重試缺口；發票、通知、角色權限、庫存保留及完整需求驗收尚未完成。

此紀錄僅表示本階段程式碼及本機檢查完成，不代表系統已全面符合《系統需求.docx》。

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

## 2026-09-20
新增部分退款累計額度、按比例購物金回沖與獨立退貨驗收入庫。會員退款 UI 含歷史、重試 key；14 項退款及付款頁測試通過。
