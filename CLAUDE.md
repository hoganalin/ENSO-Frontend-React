# CLAUDE.md

## 專案概述

ENSO Incense — 線香品牌電商前台，使用 **Vite 7 + React 19 + react-router 7 + Redux Toolkit + Bootstrap 5 + Tailwind v4 + TypeScript** 的純 SPA。串接六角學院 EC Course API 作為後端、ECPay 金流（mock 流程）、Anthropic Messages API（AI Shopping Agent）。

> 此專案已從 Next.js 16 (App Router) 遷移至 Vite + React Router SPA，請忽略歷史紀錄中提到的 `app/`、Route Handler、`'use client'`、`NEXT_PUBLIC_` 等概念。

採用「Enso Kyoto」日式視覺系統（atoms：Asanoha 麻葉、Seigaiha 青海波、Enso 圓相、Kanji Divider、Vertical Kanji、Seal、SmokeLayer）。

## 常用指令

```bash
npm run dev          # 啟動 Vite dev server (預設 http://localhost:5173)
npm run build        # tsc -b && vite build （先 type-check 再打包至 dist/）
npm run preview      # 預覽 production build
npm run lint         # ESLint 9 (flat config) 檢查
npm test             # 執行 Vitest（vitest run）
```

## 關鍵規則

- 路由集中在 `src/router/index.tsx`，使用 `createBrowserRouter`；所有頁面共用 `FrontendLayout`（Header + Footer + Breadcrumb + Toast + ChatWidget + AOS + ScrollRestoration）
- 頁面元件放 `src/pages/`、共用元件放 `src/components/`、layout 放 `src/layouts/`、舊式 view 殘留可放 `src/views/`
- API 層使用兩個 Axios instance：`api`（前台公開）與 `adminApi`（自動帶 token 認證）
- Token 採 localStorage `auth` + cookie `hexToken` 雙來源：`adminApi` request interceptor 注入；response interceptor 在 401/403 清除並導回 `/login`
- AI Agent 走 `getAgentAdapter()`（`src/services/agent/index.ts`），目前支援 **mock**（預設）與 **direct**（client 直打 Anthropic，僅限 local dev；key 會 bundle 到 client，不可部署 production）。原 Next 版的 `server` provider 已拔除
- 環境變數一律 `import.meta.env.VITE_*`；沒有 server-only secret 概念（純 SPA）
- 視覺 atoms 集中在 `src/components/atoms/`，由 `index.ts` 統一 re-export
- 視覺 tokens 定義於 `src/assets/scss/_tokens-enso-kyoto.scss`；direction / accent 透過 `<html data-direction data-accent>` 控制（見 `FrontendLayout`）
- 功能開發使用 `docs/plans/` 記錄計畫；完成後移至 `docs/plans/archive/`

## 目錄速覽

```
src/
├── main.tsx                     入口，掛 RouterProvider + Redux Provider
├── router/index.tsx             createBrowserRouter 集中註冊
├── layouts/FrontendLayout.tsx   共用骨架（Header/Footer/Breadcrumb/Toast/ChatWidget）
├── pages/                       Page components（HomePage, AboutPage, ProductsPage, ...）
├── views/frontend/Home.tsx      Home 內容主體（被 HomePage 引用）
├── components/                  共用元件
│   ├── atoms/                   Enso Kyoto 視覺 atoms
│   ├── About/GardenParallaxSection.tsx
│   └── ShoppingAgent/           ChatWidget / ChatPanel / Message / MemoryPanel
├── services/                    API + 業務服務
│   ├── api.ts                   api / adminApi 雙 instance
│   ├── product.ts cart.ts coupon.ts
│   └── agent/                   AI Agents (xiaohe / xiaoxiang / xiaoguan) + tools
├── slice/                       Redux: cart / message / auth / agent / theme
├── store/store.ts               configureStore + RootState / AppDispatch
├── hooks/                       useChatAgent / useMessage / usePageTitle
├── data/journal.ts              Journal 靜態資料
├── types/                       agent / agent-events / candidate-case / product
├── test/                        Vitest setup + cartSlice.test.ts
└── assets/scss/                 _home _about _journal _login _tokens-enso-kyoto
                                  _atoms-enso-kyoto _direction-accent _extras-enso ...

public/
├── videos/  images/             SCSS 以絕對路徑 /videos/... /images/... 引用
└── favicon.svg

index.html                       <div id="root"> + Google Fonts + Font Awesome CDN
vite.config.ts                   plugins: [react(), tailwindcss()]，alias `@` → src/
                                  + Vitest 配置 (jsdom + setup.ts)
```

## 詳細文件

- ./docs/README.md — 項目介紹與快速開始
- ./docs/ARCHITECTURE.md — 架構、目錄結構、資料流
- ./docs/DEVELOPMENT.md — 開發規範、命名規則
- ./docs/FEATURES.md — 功能列表與完成狀態
- ./docs/AGENT.md — AI Shopping Agent 設計
- ./docs/TESTING.md — 測試規範與指南
- ./docs/CHANGELOG.md — 更新日誌

## 必要遵守項目

- 修改元件或 slice 後執行 `npm test`，確認測試通過
- 無殘留的未使用 import（ESLint 會擋）
- 互動元件不需 `'use client'` directive（純 CSR，不存在 server component）
- 使用第三方套件前，先確認 `package.json` 中的版本，避免使用已棄用的 API
- 路徑別名 `@` 對應 `src/`（同步維護於 `tsconfig.json` 與 `vite.config.ts`）
- 影片/圖片背景請放 `public/videos/` 或 `public/images/`，於 SCSS 用絕對路徑 `/videos/...` `/images/...`
- 桌機可用 `background-attachment: fixed` 做視差，但 mobile 必須 fallback 為 `scroll`（iOS 不支援）

## Environment

- 執行環境：Windows（PowerShell）／WSL 皆可
- 啟動 dev server：`npm run dev`，預設 `http://localhost:5173`
- 換 port：`npm run dev -- --port 3001`
- 對外暴露（同 LAN 連入手機測試）：`npm run dev -- --host`（Vite 預設只 bind localhost）
- dev server 行為異常：先 Ctrl+C，刪 `node_modules/.vite` 快取，再 `npm run dev`
- Node 環境變數：使用 `import.meta.env.VITE_*`（client 端）；沒有 server-only env 的概念

## Session Management

- 接近用量限制時，主動說明目前進度並列出剩餘步驟，讓下個 session 能無縫接續
- 長任務優先完成核心功能，enhancement 留到確認核心可運作後再做

## Skill System — 自動觸發規則

執行任務前，依規則自動讀取對應 skill（檔案實際路徑為 `.claude/skills/project/`）：

| 當你要... | 請先讀取 |
|---|---|
| 建立新元件或頁面 | .claude/skills/project/COMPONENT_SKILL.md |
| 修改或新增樣式 | .claude/skills/project/UI_SKILL.md |
| 新增 Redux slice | .claude/skills/project/REDUX_SKILL.md |
| 新增 API 函式 | .claude/skills/project/API_SKILL.md |

不確定要讀哪個時，讀取全部再決定。

## Spec-Driven Development (Spectra / OpenSpec)

This project uses [Spectra](https://spectra.5xcamp.us/) with the **OpenSpec** format. All living specs live in `openspec/` at the project root.

- **Before implementing a feature**, read the relevant spec in `openspec/specs/`
- **To propose a change**, create `openspec/changes/<name>/proposal.md` (copy `_template/proposal.md`)
- **After implementing**, update the relevant spec and move the change folder to `openspec/archive/`
- Open Spectra desktop app and point it at this project root to get the GUI overview

### Spec coverage

| Spec | File |
|------|------|
| Product catalog domain | `openspec/specs/domain/products.md` |
| Cart domain | `openspec/specs/domain/cart.md` |
| Order domain (frontend) | `openspec/specs/domain/orders.md` |
| Member & Supabase auth | `openspec/specs/domain/members.md` |
| checkout-create API contract | `openspec/specs/api/checkout-create.md` |
| payment-create API contract | `openspec/specs/api/payment-create.md` |
| payment-notify webhook | `openspec/specs/api/payment-notify.md` |
| Checkout UX flow | `openspec/specs/features/checkout-flow.md` |
| Member auth UX flow | `openspec/specs/features/member-auth.md` |
