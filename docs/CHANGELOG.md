# 更新日誌

## [0.3.1] - 2026-05-05

### Added
- **AI Agent 持久化**：`/api/events`、`/api/candidate-cases` 改走 Upstash Redis（LIST 結構，append/range/set），dev 沒設 env 自動 fallback 到本機 JSON（commit `d19f777`、`a43bff9`）
- **首頁 / 庭園影片背景**：`public/videos/山水.mp4`、`public/images/incene-bg.png`、`public/images/incene-breath-bg.png`
- **本機假金流**：新增 `/payment/mock/[orderId]` 路由與 `PaymentMock.tsx`，demo 不依賴 ECPay 跳轉

### Changed
- 商品卡片內容置中、行動版購物車版面修正（commit `c1fd218`）
- `data/agent-events.json` 從 git 移除（已加入 .gitignore，避免 lambda image 帶入舊資料；commit `1d92eff`）

## [0.3.0] - 2026-04-28

### Added
- **Enso Kyoto 視覺系統**：新增 `src/components/atoms/`（Asanoha、Seigaiha、EnsoCircle、KanjiDivider、VerticalKanji、Seal、SmokeLayer）
- **新頁面**：`/journal` 旅程誌列表 + `/journal/[id]` 詳情；`/stores` 門市資訊
- **靜態資料**：`src/data/journal.ts`
- **新 slice**：`themeSlice.ts`（主題狀態）、`agentSlice.ts`（AI 對話狀態）
- **新 SCSS**：`_tokens-enso-kyoto.scss`、`_atoms-enso-kyoto.scss`、`_journal.scss`、`_login.scss`、`_direction-accent.scss`、`_extras-enso.scss`
- **About 頁**：新增 `GardenParallaxSection`（和敬清寂），背景改為影片 `/videos/山水.mp4`（autoplay + muted + loop + playsInline）
- **首頁 Philosophy 區**：背景圖 `incene-bg.png` + 桌機視差滾動
- **首頁 CTA 區**：背景圖 `incene-breath-bg.png` + 桌機視差滾動
- **AI Shopping Agent 全套**：multi-agent (小禾／小香／小管)、3 種 provider（mock / server / direct）、`/api/agent` Route Handler、Prompt Playground、Eval Suite

### Changed
- 大量更新前台元件樣式以對齊 Enso Kyoto 設計語彙
- README / CLAUDE.md / docs 全面更新至 Next.js 16 架構

## [0.2.0] - 2026-04-05

### Changed
- 從 Vite + React Router (Hash Router) 遷移至 Next.js 16 (App Router)
- 環境變數前綴從 `VITE_` 改為 `NEXT_PUBLIC_`
- 新增 `src/app/` 目錄結構（App Router pages + layouts）
- 新增 `providers.tsx`（Redux Provider）、`bootstrap-client.tsx`（Bootstrap JS 動態載入）
- 新增 `authSlice.ts`（認證狀態管理）

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
