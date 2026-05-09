# ENSO-Frontend-React

ENSO 線香品牌前台的純 **React + Vite 7 + react-router 7 + TypeScript** 版本。

> 本專案是 ENSO Next.js 版的純前端改寫版，用於展示「純 React 開發能力」與「完整 full-stack AI Builder demo」並列。

## Tech Stack

- **React 19** + **TypeScript**
- **Vite 7**
- **react-router 7**（取代 Next App Router，CSR-only）
- **Redux Toolkit** + react-redux
- **Tailwind CSS v4**（透過 `@tailwindcss/vite` plugin）
- **Bootstrap 5** + Bootstrap Icons + SCSS
- **react-helmet-async**（取代 Next `generateMetadata` 動態 title）
- **Vitest** + Testing Library

## 與 Next.js 版本的差異

| 面向 | Next 版 | React 版（此 repo） |
|---|---|---|
| 路由 | App Router (RSC + route groups + dynamic segments) | react-router 7 `createBrowserRouter`（CSR-only） |
| API | `app/api/{agent,events,candidate-cases}/route.ts` | 拔除全部，agent 預設 `MockAgentAdapter` |
| Playground / Eval | `/playground`、`/playground/eval`（依賴後端 events / candidate-cases） | **整頁拔除**（請見 Next 版本） |
| Metadata | `generateMetadata` / `generateStaticParams` | `react-helmet-async` 動態設 `<title>` |
| 樣式 | `@tailwindcss/postcss` + postcss.config | `@tailwindcss/vite` plugin |
| 環境變數 | `NEXT_PUBLIC_*` | `VITE_*` |
| Bootstrap JS lazy load | `BootstrapClient` "use client" 元件 | `main.tsx` 直接 dynamic import |

## Getting Started

```bash
npm install
cp .env.example .env.local   # 編輯後填上 EC API base
npm run dev                  # http://localhost:5173
```

## Scripts

- `npm run dev` — Vite dev server（HMR）
- `npm run build` — `tsc -b && vite build`
- `npm run preview` — 在 `dist/` 上跑 production preview
- `npm run test` — Vitest 一次跑完
- `npm run lint` — ESLint

## 路由

```
/                        Home
/about                   品牌故事
/product                 商品列表
/product/:id             單一商品
/journal                 香誌列表
/journal/:id             香誌文章
/stores                  實體店面
/cart                    購物車
/checkout                結帳
/checkout-success[/:orderId]  下單成功
/payment/mock/:orderId   模擬付款
/login  /register  /faq  /contact
/*                       404
```

## 已知限制

- **無 SSR / SSG**：純 CSR，初始畫面靠 JS bundle hydrate；SEO 動態頁僅靠 react-helmet-async 在客端設 title。
- **無後端 AI agent**：ChatWidget 預設走 `MockAgentAdapter`（離線回應）。要接真實 Anthropic API，將 `.env.local` 的 `VITE_AGENT_PROVIDER=direct` + 設定 `VITE_ANTHROPIC_API_KEY`，但 ⚠️ key 會 bundle 到 client，僅限 local dev。
- **Eval / Playground**：整頁拔除（這兩頁需要後端 events / candidate-cases store，請見 Next 版）。
