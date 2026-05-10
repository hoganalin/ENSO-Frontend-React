# 架構文件

## 目錄結構

```
ENSO-main-React/
├── index.html                          Vite 進入 HTML（<div id="root"> + Google Fonts + FA CDN）
├── vite.config.ts                      plugins=[react(), tailwindcss()]，alias `@`→src/
│                                        + Vitest 配置（jsdom + setup.ts）
├── tsconfig.json                       TS path alias `@/*` → src/*
├── src/
│   ├── main.tsx                        入口：createRoot + StrictMode + <Provider> + <RouterProvider>
│   ├── router/index.tsx                createBrowserRouter，所有路由集中註冊
│   ├── layouts/
│   │   └── FrontendLayout.tsx          外殼 layout（<Outlet/>）：AOS init、auth restore、theme attrs、
│   │                                    ScrollRestoration、Header/Breadcrumb/MessageToast/Footer/ChatWidget
│   ├── pages/                          Page components（<200 行，組裝 components/）
│   │   ├── HomePage.tsx                /
│   │   ├── AboutPage.tsx               /about
│   │   ├── ProductsPage.tsx            /product
│   │   ├── SingleProductPage.tsx       /product/:id
│   │   ├── CartPage.tsx                /cart
│   │   ├── CheckoutPage.tsx            /checkout
│   │   ├── CheckoutSuccessPage.tsx     /checkout-success(/:orderId)
│   │   ├── PaymentMockPage.tsx         /payment/mock/:orderId（demo 假金流）
│   │   ├── JournalPage.tsx             /journal
│   │   ├── JournalArticlePage.tsx      /journal/:id
│   │   ├── StoresPage.tsx              /stores
│   │   ├── ContactPage.tsx             /contact
│   │   ├── FaqPage.tsx                 /faq
│   │   ├── LoginPage.tsx               /login
│   │   ├── RegisterPage.tsx            /register
│   │   └── NotFoundPage.tsx            * (404)
│   │
│   ├── views/frontend/
│   │   └── Home.tsx                    Home 主體（被 HomePage 引用）：Hero 影片、探索香氣、精選線香、
│   │                                    品牌故事、Philosophy、CTA、顧客心聲
│   │
│   ├── components/                     共用 UI 元件
│   │   ├── atoms/                      Enso Kyoto 視覺 atoms（由 index.ts re-export）
│   │   │   ├── Asanoha.tsx             麻葉紋 SVG
│   │   │   ├── Seigaiha.tsx            青海波紋 SVG
│   │   │   ├── EnsoCircle.tsx          圓相筆觸
│   │   │   ├── KanjiDivider.tsx        漢字分隔
│   │   │   ├── VerticalKanji.tsx       直書漢字
│   │   │   ├── Seal.tsx                印章方塊
│   │   │   └── SmokeLayer.tsx          煙霧裝飾
│   │   ├── About/GardenParallaxSection.tsx   和敬清寂枯山水（背景影片 /videos/山水.mp4）
│   │   ├── ShoppingAgent/              ChatWidget / ChatPanel / Message / MemoryPanel
│   │   ├── Header.tsx Footer.tsx Breadcrumb.tsx MessageToast.tsx Pagination.tsx
│   │   ├── About.tsx Cart.tsx Checkout.tsx CheckoutSuccess.tsx PaymentMock.tsx
│   │   ├── Contact.tsx FAQ.tsx Login.tsx Register.tsx
│   │   ├── Product.tsx SingleProduct.tsx
│   │   └── NotFound.tsx
│   │
│   ├── services/                       API + 業務服務
│   │   ├── api.ts                      api / adminApi 雙 Axios instance + interceptors
│   │   ├── product.ts                  getProductApi / getAllProductsApi / getSingleProductApi /
│   │   │                                getAdminProductsApi
│   │   ├── cart.ts                     getCartApi / addCartApi / updateCartApi /
│   │   │                                deleteSingleCartApi / deleteAllCartApi / createOrderApi
│   │   ├── coupon.ts                   applyCouponApi
│   │   └── agent/                      AI Shopping Agent
│   │       ├── index.ts                getAgentAdapter() 單一切換點
│   │       ├── adapter.ts              AgentAdapter interface + AgentCallContext
│   │       ├── mockAdapter.ts          離線 mock（預設）
│   │       ├── anthropicAdapter.ts     direct mode（client 直打 Anthropic）
│   │       ├── anthropicProtocol.ts    純 function：model id、訊息轉換、response parser
│   │       ├── router.ts               意圖分類 → handoff 決策
│   │       ├── tools.ts                10 個 tool schemas
│   │       ├── toolExecutor.ts         執行 tool 並回傳 mock data
│   │       ├── systemPrompt.ts         共用 system prompt 片段
│   │       ├── memory.ts sessionId.ts eventLogger.ts
│   │       ├── agents/
│   │       │   ├── index.ts            AGENT_REGISTRY、DEFAULT_AGENT_ID、getAgent、getToolsForAgent
│   │       │   ├── xiaohe.ts           小禾（購物助手）
│   │       │   ├── xiaoxiang.ts        小香（香氛知識）
│   │       │   └── xiaoguan.ts         小管（訂單會員）
│   │       └── knowledge/passages.ts retrieval.ts
│   │
│   ├── slice/                          Redux Toolkit slices
│   │   ├── cartSlice.ts                購物車 + async thunks
│   │   ├── messageSlice.ts             Toast 通知 + auto-dismiss
│   │   ├── authSlice.ts                認證（loginSuccess / logout / restoreAuth）
│   │   ├── agentSlice.ts               AI agent 對話狀態（messages、handoff、theme）
│   │   └── themeSlice.ts               視覺主題（direction / accent / brushIntensity）
│   │
│   ├── store/store.ts                  configureStore + RootState / AppDispatch
│   ├── hooks/
│   │   ├── useChatAgent.ts             Agent 對話 hook
│   │   ├── useMessage.tsx              showSuccess / showError → dispatch toast
│   │   └── usePageTitle.ts             設定 document.title（取代原 react-helmet-async）
│   ├── data/journal.ts                 Journal 靜態資料
│   ├── types/                          agent / agent-events / candidate-case / product
│   ├── constants/paymentMethods.ts
│   ├── test/
│   │   ├── setup.ts                    @testing-library/jest-dom
│   │   └── cartSlice.test.ts
│   ├── assets/
│   │   ├── all.scss                    SCSS 進入點
│   │   ├── _variables.scss             Bootstrap 主題變數覆寫
│   │   ├── _variables-dark.scss
│   │   ├── helpers/
│   │   ├── swiper.scss
│   │   ├── utils/
│   │   │   ├── filter.ts               currency() — 千分位格式化
│   │   │   └── validation.ts           emailValidation
│   │   └── scss/                       元件樣式（_home _about _journal _login
│   │                                    _tokens-enso-kyoto _atoms-enso-kyoto
│   │                                    _direction-accent _extras-enso ...）
│   ├── global.d.ts vite-env.d.ts
│   └── styles/globals.css index.css    Tailwind base + 全域樣式
│
├── public/
│   ├── favicon.svg
│   ├── images/                         （SCSS 以 /images/... 引用）
│   └── videos/                         （SCSS 以 /videos/... 引用）
└── docs/                               本資料夾（文件）
```

## 啟動流程

```
1. vite dev → 載入 index.html
2. /src/main.tsx
   ├── 載入全域樣式：globals.css / index.css / all.scss / swiper.scss
   │   + swiper css / aos css / bootstrap-icons css
   ├── createRoot(#root)
   └── <StrictMode>
         └── <Provider store={store}>
               └── <RouterProvider router={router} />
3. 動態 import bootstrap/dist/js/bootstrap.bundle.min.js（client 才需要 Collapse/Modal JS）
4. router 解析路徑 → 進入 FrontendLayout
   FrontendLayout (src/layouts/FrontendLayout.tsx)
     ├── useEffect: AOS.init({ duration:800, once:true })
     ├── useEffect: 從 localStorage("auth") 還原 → dispatch(restoreAuth)
     ├── useEffect: 路由變動時 AOS.refresh()
     ├── useEffect: 將 theme 寫進 <html data-direction data-accent data-no-paper data-no-smoke>
     │              + CSS var --brush-intensity
     ├── <ScrollRestoration />（react-router 7 內建）
     ├── <MessageToast /> <Header /> <Breadcrumb />
     ├── <main><Outlet /></main>
     └── <Footer /> <ChatWidget />
5. 對應 PageComponent（src/pages/*）渲染內容
```

## 路由總覽

| 路徑 | 頁面元件 | 說明 |
|---|---|---|
| `/` | HomePage → Home | 首頁：Hero 影片、探索香氣、精選線香、品牌故事、Philosophy、CTA、顧客心聲 |
| `/product` | ProductsPage | 商品列表：分類篩選、搜尋、分頁 |
| `/product/:id` | SingleProductPage | 商品詳情 |
| `/cart` | CartPage | 購物車 |
| `/checkout` | CheckoutPage | 結帳：表單 + 訂單摘要 |
| `/checkout-success` / `/checkout-success/:orderId` | CheckoutSuccessPage | 結帳完成 |
| `/payment/mock/:orderId` | PaymentMockPage | 本機假金流頁（demo 用，跳過 ECPay）|
| `/about` | AboutPage | 品牌故事（含 GardenParallaxSection 影片）|
| `/contact` | ContactPage | 聯絡我們 |
| `/faq` | FaqPage | 常見問題 |
| `/journal` | JournalPage | 旅程誌列表 |
| `/journal/:id` | JournalArticlePage | 旅程誌詳情 |
| `/stores` | StoresPage | 門市資訊 |
| `/login` | LoginPage | 登入 |
| `/register` | RegisterPage | 註冊 |
| `*` | NotFoundPage | 404 |

所有路由共用 `FrontendLayout`（`createBrowserRouter` 的 root `element`），底下以 `children` 掛載各頁。

## API 層架構

### Axios Instances（src/services/api.ts）

**`api`** — 前台公開請求（不帶認證）
- 用於商品查詢、購物車操作、優惠券、建立訂單

**`adminApi`** — 後台管理請求
- Request interceptor：依序從 `localStorage.auth` → `document.cookie.hexToken` 取 token，注入 `Authorization` header（直接放 token，無 Bearer 前綴）
- Response interceptor：401/403 時 `alert` 提示 → 清除 cookie + localStorage → `window.location.href = "/login"`

### 端點清單

| 服務 | 函式 | HTTP | 端點 | 認證 |
|---|---|---|---|---|
| product | `getProductApi(page, category)` | GET | `/api/{path}/products?page&category` | 否 |
| product | `getAllProductsApi()` | GET | `/api/{path}/products/all` | 否 |
| product | `getSingleProductApi(id)` | GET | `/api/{path}/product/{id}` | 否 |
| product | `getAdminProductsApi()` | GET | `/api/{path}/admin/products` | 是 |
| cart | `getCartApi()` | GET | `/api/{path}/cart` | 否 |
| cart | `addCartApi({product_id, qty})` | POST | `/api/{path}/cart` | 否 |
| cart | `updateCartApi(id, {product_id, qty})` | PUT | `/api/{path}/cart/{id}` | 否 |
| cart | `deleteSingleCartApi(id)` | DELETE | `/api/{path}/cart/{id}` | 否 |
| cart | `deleteAllCartApi()` | DELETE | `/api/{path}/carts` | 否 |
| cart | `createOrderApi(data)` | POST | `/api/{path}/order` | 否 |
| coupon | `applyCouponApi(code)` | POST | `/api/{path}/coupon` | 否 |
| auth | Login（在 Login 元件內呼叫） | POST | `/admin/signin` | 否（取得 token） |

POST/PUT body 規範：六角學院 API 要求 body 必須包在 `{ data: { ... } }`（見 cart.ts、coupon.ts）。

Base URL / Path 來自 `VITE_API_BASE` 與 `VITE_API_PATH`（在 `api.ts` 啟動時硬性檢查，缺值即丟錯）。

## Redux 資料流

### Store 結構（src/store/store.ts）

```typescript
{
  cart:    { carts: CartItem[]; total: number; final_total: number },
  message: { messages: { id, type, title, text }[] },
  auth:    { token: string | null; user: { email, ... } | null; isAuthenticated: boolean },
  agent:   { isOpen, status, currentAgentId, messages, activeToolCall, error },
  theme:   { direction, accent, noPaper, noSmoke, brushIntensity }
}
```

匯出型別 `RootState`、`AppDispatch`，元件中以 `useDispatch<AppDispatch>()` / `useSelector<RootState, T>` 取用。

### Async Thunks 流程

**購物車寫入 → 自動同步**：所有寫入操作完成後 dispatch `createAsyncGetCart` 重新拉取最新 cart：

```
createAsyncAddCart        → addCartApi        → createAsyncGetCart → getCartApi → updateCart
createAsyncUpdateCart     → updateCartApi     → createAsyncGetCart → ...
createAsyncDeleteSingleCart → deleteSingleCartApi → createAsyncGetCart → ...
createAsyncDeleteAllCart  → deleteAllCartApi  → createAsyncGetCart → ...
```

**Toast 通知**：`createAsyncAddMessage({ success, message })` → 立即 `addMessage` → `setTimeout(3000)` 自動 `removeMessage(id)`。

**認證**：
- 登入：`loginSuccess` → 寫入 Redux + localStorage（`auth` key）+ cookie（`hexToken`）
- 登出：`logout` → 清除三處
- 恢復：`FrontendLayout` mount 時讀 localStorage `auth` → dispatch `restoreAuth`

### Agent 對話流程

詳見 [AGENT.md](./AGENT.md)。重點：
- Adapter 由 `getAgentAdapter()` 依 `VITE_AGENT_PROVIDER` 決定（mock | direct）
- Router (`router.ts`) 用關鍵字分類意圖 → 決定是否 handoff，同分時保留當前 agent 防震盪
- Handoff 時 dispatch `handoffToAgent`，messages 中插入 system 訊息（顯示為藍色 chip）

## 認證機制

1. **登入流程**：POST `/admin/signin` with `{ username, password }` → 取得 `{ token, expired }` → 同時寫入 Redux + localStorage(`auth`) + cookie(`hexToken`)
2. **Token 注入**：`adminApi` request interceptor 依序 `localStorage.auth` → `cookie.hexToken`，注入 `Authorization` header（無 Bearer 前綴）
3. **Token 過期**：`adminApi` response interceptor 攔 401/403 → alert → 清三處 → `window.location.href = "/login"`
4. **Auth Restore**：`FrontendLayout` `useEffect` 從 localStorage 讀 auth → 有 token + user 才 `dispatch(restoreAuth)`；JSON 損毀則 `removeItem`

## 視覺主題（Enso Kyoto）

- Tokens：`src/assets/scss/_tokens-enso-kyoto.scss`（color / font / spacing）
- Atoms：`src/components/atoms/`，由 `index.ts` 統一 re-export
- Direction / Accent 切換：`themeSlice` 寫入 `<html data-direction data-accent>`，`_direction-accent.scss` 依屬性套色
- Brush intensity：`themeSlice.brushIntensity` 寫入 CSS var `--brush-intensity`（0–1）
- 背景影片：`public/videos/山水.mp4`（autoplay + muted + loop + playsInline，桌機背景視差）
- 桌機 `background-attachment: fixed`，mobile 必須 fallback 為 `scroll`（iOS 不支援）
