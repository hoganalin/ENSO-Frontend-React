# CLAUDE.md

## 專案概述

ENSO Incense — 線香品牌電商前台，使用 Next.js 16 (App Router) + React 19 + Redux Toolkit + Bootstrap 5 + TypeScript，串接六角學院 EC API、ECPay 金流、Anthropic AI Agent，並整合 Upstash Redis 持久化。

採用「Enso Kyoto」日式視覺系統（atoms：Asanoha 麻葉、Seigaiha 青海波、Enso 圓相、Kanji Divider、Vertical Kanji、Seal、SmokeLayer）。

## 常用指令

```bash
npm run dev          # 啟動 Next.js dev server (localhost:3000)
npm run build        # 生產環境建置
npm run start        # 啟動生產環境伺服器
npm run lint         # ESLint 檢查
npm test             # 執行 Vitest 測試
```

## 關鍵規則

- 所有前台頁面在 `src/app/(frontend)/` 下，共用 FrontendShell（Header + Footer + Breadcrumb + Toast + AOS）
- 需要互動的元件必須加 `"use client"`（hooks、Redux、瀏覽器 API、事件處理）
- API 層使用兩個 Axios instance：`api`（前台公開）和 `adminApi`（帶 token 認證）
- AI Agent 透過 `/api/agent` Route Handler 代打 Anthropic（API key 留 server）
- 環境變數使用 `NEXT_PUBLIC_` 前綴；server-only secret（如 `ANTHROPIC_API_KEY`、`UPSTASH_*`）不加前綴
- 視覺 atoms 集中在 `src/components/atoms/`，由 `index.ts` 統一 re-export
- 視覺 tokens 定義於 `src/assets/scss/_tokens-enso-kyoto.scss`
- 功能開發使用 docs/plans/ 記錄計畫；完成後移至 docs/plans/archive/

## 目錄速覽

```
src/
├── app/(frontend)/      前台路由（page / about / product / cart / checkout
│                         / payment/mock / journal / stores / contact / faq
│                         / login / register）
├── app/api/             Route Handlers (agent / events / candidate-cases)
├── app/playground/      AI Prompt Playground + Eval Suite (/playground/eval)
├── components/atoms/    Enso Kyoto 視覺 atoms
├── components/About/    GardenParallaxSection（影片背景）
├── components/ShoppingAgent/
├── components/Playground/  PromptPlayground / PromptColumn / ResultCard
├── components/Eval/        EvalSuite / EvalScoreboard / EvalCaseCard
├── services/agent/      AI agents (xiaoguan / xiaohe / xiaoxiang) + tools
├── slice/               cart / message / auth / agent / theme
├── data/journal.ts      Journal 靜態資料
└── assets/scss/         _home _about _journal _login _tokens-enso-kyoto
                          _atoms-enso-kyoto _direction-accent _extras-enso ...
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
- 無殘留的未使用 import
- 無衝突的 directive（同一個元件不可同時有 `'use client'` 與 async server component 模式）
- 使用第三方套件前，先確認 `package.json` 中的版本，避免使用已棄用的 API
- 路徑別名 `@` 對應 `src/`（tsconfig.json + next.config.ts）
- 影片/圖片背景請放 `public/videos/` 或 `public/images/`，於 SCSS 用絕對路徑 `/videos/...` `/images/...`
- 桌機可用 `background-attachment: fixed` 做視差，但 mobile 必須 fallback 為 `scroll`（iOS 不支援）

## Environment

- 執行環境：Windows（PowerShell）／WSL 皆可
- 啟動 dev server：`npm run dev`（**不要**加 `--host`。Next.js 的 CLI 沒有 `--host` flag——這是 Vite 的慣例。Next.js 預設就 bind 到 `0.0.0.0`，本機與跨網路 host 都能存取）
- 需要換 port：`npm run dev -- --port 3001`（port 用 `--port`，不是 `--host`）
- 路由 manifest 異常或新增頁面後 dev server 沒重編：先 Ctrl+C，刪 `.next`，再 `npm run dev`

## Session Management

- 接近用量限制時，主動說明目前進度並列出剩餘步驟，讓下個 session 能無縫接續
- 長任務優先完成核心功能，enhancement 留到確認核心可運作後再做
- 只在 session 開頭讀取一次 `SESSION_START_SKILL.md`，不要每次對話重複執行

## Skill System — 自動觸發規則

執行任何任務前，依照以下規則自動讀取對應 skill：

| 當你要... | 請先讀取 |
|---|---|
| **每次 session 開始** | .claude/skills/SESSION_START_SKILL.md |
| 任務涉及多個獨立模組或超過 5 個檔案 | .claude/skills/PARALLEL_AGENT_SKILL.md |
| 建立新元件或頁面 | .claude/skills/COMPONENT_SKILL.md |
| 修改或新增樣式 | .claude/skills/UI_SKILL.md |
| 新增 Redux slice | .claude/skills/REDUX_SKILL.md |
| 新增 API 函式 | .claude/skills/API_SKILL.md |
| 建立表單元件 | .claude/skills/FORM_SKILL.md |
| 撰寫測試 | .claude/skills/TEST_SKILL.md |

不確定要讀哪個時，讀取全部再決定。
