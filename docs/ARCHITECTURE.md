# 架構文件

## 目錄結構

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root Layout — 載入全域 CSS、Google Fonts、Font Awesome CDN、metadata、Providers
│   ├── providers.tsx             # Redux <Provider> (use client)
│   ├── bootstrap-client.tsx      # 動態載入 Bootstrap JS (use client)
│   ├── globals.css               # 全域 CSS (Tailwind base / Bootstrap reset 補強)
│   ├── not-found.tsx             # 全域 404 頁面
│   ├── api/                      # Route Handlers
│   │   ├── agent/route.ts        # POST /api/agent → 代打 Anthropic Messages API
│   │   ├── events/route.ts       # GET/POST /api/events → Upstash Redis（fallback fs）
│   │   └── candidate-cases/route.ts  # Eval candidate library，Upstash Redis（fallback fs）
│   ├── playground/
│   │   ├── page.tsx              # /playground → PromptPlayground（A/B prompt 比較）
│   │   └── eval/page.tsx         # /playground/eval → EvalSuite（regression test）
│   └── (frontend)/               # Route group — 所有前台頁面
│       ├── layout.tsx            # 前台 Layout → 委派給 FrontendShell
│       ├── frontend-shell.tsx    # 前台外殼 (use client)：Header/Footer/Breadcrumb/MessageToast/AOS/Auth restore
│       ├── page.tsx              # / → Home
│       ├── about/page.tsx        # /about → About
│       ├── cart/page.tsx         # /cart → Cart
│       ├── checkout/page.tsx     # /checkout → Checkout
│       ├── checkout-success/
│       │   └── [orderId]/page.tsx # /checkout-success/:orderId → CheckoutSuccess
│       ├── payment/mock/
│       │   └── [orderId]/page.tsx # /payment/mock/:orderId → PaymentMock（demo 用假金流）
│       ├── contact/page.tsx      # /contact → Contact
│       ├── faq/page.tsx          # /faq → FAQ
│       ├── login/page.tsx        # /login → Login
│       ├── product/page.tsx      # /product → Product list
│       ├── product/[id]/page.tsx # /product/:id → SingleProduct
│       ├── journal/page.tsx      # /journal → 旅程誌列表
│       ├── journal/[id]/page.tsx # /journal/:id → 旅程誌詳情
│       ├── stores/page.tsx       # /stores → 門市資訊
│       └── register/page.tsx     # /register → Register
│
├── components/                   # 共用 UI 元件
│   ├── atoms/                    # Enso Kyoto 視覺 atoms（由 index.ts re-export）
│   │   ├── Asanoha.tsx           # 麻葉紋 SVG
│   │   ├── Seigaiha.tsx          # 青海波紋 SVG
│   │   ├── EnsoCircle.tsx        # 圓相筆觸
│   │   ├── KanjiDivider.tsx      # 漢字分隔符
│   │   ├── VerticalKanji.tsx     # 直書漢字
│   │   ├── Seal.tsx              # 印章方塊
│   │   └── SmokeLayer.tsx        # 煙霧圖層
│   ├── About/
│   │   └── GardenParallaxSection.tsx # 和敬清寂枯山水區（背景影片 /videos/山水.mp4）
│   ├── ShoppingAgent/            # AI Chat Widget + agent UI（ChatWidget / ChatPanel / Message）
│   ├── Playground/               # /playground 用：PromptPlayground / PromptColumn / ResultCard
│   ├── Eval/                     # /playground/eval 用：EvalSuite / EvalScoreboard / EvalCaseCard
│   ├── Header.tsx                # 導航列：Logo、頁面連結、搜尋框、購物車 badge、登入/登出
│   ├── Footer.tsx                # 頁尾
│   ├── Breadcrumb.tsx            # 麵包屑導航
│   ├── MessageToast.tsx          # Toast 通知（從 Redux messages 渲染）
│   ├── Pagination.tsx            # 分頁元件
│   ├── About.tsx                 # 品牌故事頁面
│   ├── Cart.tsx                  # 購物車：商品列表、數量增減、優惠券、總計
│   ├── Checkout.tsx              # 結帳表單：收件人資訊 + 訂單摘要
│   ├── CheckoutSuccess.tsx       # 結帳成功頁面
│   ├── PaymentMock.tsx           # /payment/mock 頁的假金流 UI（demo 用）
│   ├── Contact.tsx               # 聯絡我們表單
│   ├── FAQ.tsx                   # 常見問題（手風琴）
│   ├── Login.tsx                 # 登入表單
│   ├── Register.tsx              # 註冊表單
│   ├── Product.tsx               # 商品列表：分類篩選、搜尋、分頁、加入購物車
│   ├── SingleProduct.tsx         # 商品詳情：圖片輪播、香調資訊、規格、使用方式
│   └── NotFound.tsx              # 404 元件
│
├── services/                     # API 層
│   ├── api.ts                    # Axios instances (api, adminApi) + interceptors
│   ├── product.ts                # 商品 API (getProductApi, getAllProductsApi, getSingleProductApi, getAdminProductsApi)
│   ├── cart.ts                   # 購物車 API (getCartApi, addCartApi, deleteSingleCartApi, deleteAllCartApi, updateCartApi, createOrderApi)
│   ├── coupon.ts                 # 優惠券 API (applyCouponApi)
│   └── agent/                    # AI Shopping Agent 邏輯（adapter / router / tools / agents / evals / knowledge）
│
├── slice/                        # Redux Toolkit slices
│   ├── cartSlice.ts              # 購物車 state + async thunks
│   ├── messageSlice.ts           # Toast 通知 state + auto-dismiss
│   ├── authSlice.ts              # 認證 state (login, logout, restore)
│   ├── agentSlice.ts             # AI agent 對話狀態
│   └── themeSlice.ts             # 主題（Enso Kyoto）狀態
│
├── data/
│   └── journal.ts                # 旅程誌靜態資料
│
├── store/
│   └── store.ts                  # Redux store (cart + message + auth + agent + theme reducers)
│
├── hooks/
│   └── useMessage.tsx            # showSuccess / showError → dispatch toast
│
├── types/
│   └── product.ts                # Product interface
│
├── views/frontend/
│   └── Home.tsx                  # 首頁元件 (use client)：Hero video、探索香氣、精選線香輪播、品牌故事、顧客心聲
│
├── assets/
│   ├── all.scss                  # SCSS 進入點
│   ├── _variables.scss           # Bootstrap 主題變數覆寫
│   ├── _variables-dark.scss      # 深色模式變數
│   ├── helpers/_variables.scss   # 輔助變數
│   ├── swiper.scss               # Swiper 樣式
│   ├── scss/                     # 元件 SCSS
│   │   ├── _about.scss
│   │   ├── _breadcrumb.scss
│   │   ├── _checkout.scss
│   │   ├── _custom.scss
│   │   ├── _footer.scss
│   │   ├── _header.scss
│   │   ├── _home.scss
│   │   ├── _journal.scss
│   │   ├── _login.scss
│   │   ├── _navbar.scss
│   │   ├── _product-card.scss
│   │   ├── _shared.scss
│   │   ├── _shopping-agent.scss
│   │   ├── _single-product.scss
│   │   ├── _toast.scss
│   │   ├── _tokens-enso-kyoto.scss   # Enso Kyoto 設計 tokens（color/font/spacing）
│   │   ├── _atoms-enso-kyoto.scss    # atoms 樣式
│   │   ├── _direction-accent.scss    # 方向強調
│   │   ├── _extras-enso.scss         # 額外裝飾樣式
│   │   └── _variables-custom.scss
│   └── utils/
│       ├── filter.ts             # currency() — 數字格式化為千分位
│       └── validation.ts         # emailValidation — react-hook-form email 驗證規則
│
├── images/                       # 靜態圖片 (logo, hero, icons)
│
public/
├── images/                       # 公開圖片
└── videos/                       # 公開影片 (hero.webm)
```

## 啟動流程

```
1. next dev
2. src/app/layout.tsx (Root Layout)
   ├── 載入全域 CSS: index.css, all.scss, swiper.scss, aos.css, bootstrap-icons.css
   ├── <Providers> (src/app/providers.tsx) — Redux <Provider store={store}>
   ├── <BootstrapClient> — 動態 import bootstrap JS
   └── {children}
3. src/app/(frontend)/layout.tsx (Frontend Layout)
   └── <FrontendShell> (src/app/(frontend)/frontend-shell.tsx)
       ├── useEffect: AOS.init + localStorage auth restore → dispatch(restoreAuth)
       ├── useEffect: AOS.refresh on pathname change
       ├── <MessageToast />
       ├── <Header />
       ├── <Breadcrumb />
       ├── <main>{children}</main>
       └── <Footer />
4. 各頁面的 page.tsx → 對應 components/ 或 views/ 的元件
```

## 路由總覽

| 路徑 | 頁面元件 | 說明 |
|---|---|---|
| `/` | Home | 首頁：Hero 影片、探索香氣、精選線香、品牌故事、顧客心聲 |
| `/product` | Product | 商品列表：分類篩選、搜尋、分頁 |
| `/product/:id` | SingleProduct | 商品詳情：圖片、香調、規格、加入購物車 |
| `/cart` | Cart | 購物車：增減數量、套用優惠券、結帳 |
| `/checkout` | Checkout | 結帳：收件人表單 + 訂單摘要 |
| `/checkout-success/:orderId` | CheckoutSuccess | 訂單完成確認 |
| `/payment/mock/:orderId` | PaymentMock | 本機假金流頁（demo 用，取代 ECPay 跳轉）|
| `/about` | About | 品牌故事（含 GardenParallaxSection 影片背景）|
| `/contact` | Contact | 聯絡我們表單 |
| `/faq` | FAQ | 常見問題 |
| `/journal` | Journal | 旅程誌列表 |
| `/journal/:id` | Journal Detail | 旅程誌詳情 |
| `/stores` | Stores | 門市資訊 |
| `/login` | Login | 登入 |
| `/register` | Register | 註冊 |
| `/playground` | PromptPlayground | AI Prompt A/B 比較工具（不套 FrontendShell）|
| `/playground/eval` | EvalSuite | AI Agent regression test 套件（不套 FrontendShell）|

所有前台路由都在 `(frontend)` route group 下，共用 FrontendShell（Header + Footer + Breadcrumb + Toast + AOS）。

## API 層架構

### Axios Instances

**`api`** — 前台公開請求（不帶認證）
- 用於商品查詢、購物車操作、優惠券、建立訂單

**`adminApi`** — 後台管理請求
- Request interceptor：從 `localStorage("auth")` 或 `document.cookie("hexToken")` 讀取 token，注入 `Authorization` header
- Response interceptor：401/403 時 alert 提示 + 清除 token + 導向 `/login`

### API 端點

| 服務 | 函式 | HTTP | 端點 | 認證 |
|---|---|---|---|---|
| product | `getProductApi(page, category)` | GET | `/api/{path}/products` | 否 |
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
| auth | Login (in Login.tsx) | POST | `/admin/signin` | 否 (取得 token) |

Base URL: `NEXT_PUBLIC_API_BASE` (預設 `https://ec-course-api.hexschool.io/v2`)
API Path: `NEXT_PUBLIC_API_PATH` (預設 `rogan`)

## Redux 資料流

### Store 結構

```typescript
{
  cart: {
    carts: CartItem[],    // 購物車項目
    total: number,         // 原價總計
    final_total: number    // 折扣後總計
  },
  message: {
    messages: Message[]    // Toast 通知佇列 { id, type, title, text }
  },
  auth: {
    token: string | null,
    user: { email: string } | null,
    isAuthenticated: boolean
  },
  agent: {
    // AI Shopping Agent 對話狀態（messages, currentAgent, handoffs, ...）
  },
  theme: {
    // 主題狀態（Enso Kyoto 視覺切換）
  }
}
```

### Async Thunks 流程

**購物車操作**：所有寫入操作（add/update/delete）完成後自動 dispatch `createAsyncGetCart` 重新同步 cart state。

```
createAsyncAddCart → addCartApi → createAsyncGetCart → getCartApi → updateCart
createAsyncUpdateCart → updateCartApi → createAsyncGetCart → ...
createAsyncDeleteSingleCart → deleteSingleCartApi → createAsyncGetCart → ...
createAsyncDeleteAllCart → deleteAllCartApi → createAsyncGetCart → ...
```

**Toast 通知**：`createAsyncAddMessage` dispatch `addMessage` 後 `setTimeout(3000)` 自動 dispatch `removeMessage`。

**認證**：
- 登入：`loginSuccess` → 寫入 Redux + localStorage + cookie
- 登出：`logout` → 清除 Redux + localStorage + cookie
- 恢復：頁面載入時 FrontendShell 從 localStorage 讀取並 dispatch `restoreAuth`

## 認證機制

1. **登入流程**：
   - POST `/admin/signin` with `{ username, password }`
   - 取得 `{ token, expired }`
   - 同時儲存至 Redux state、localStorage (`auth` key)、cookie (`hexToken`)
   
2. **Token 注入**：
   - `adminApi` request interceptor 依序檢查 localStorage → cookie 取得 token
   - 注入至 `Authorization` header（直接放 token 值，無 Bearer 前綴）

3. **Token 過期處理**：
   - `adminApi` response interceptor 攔截 401/403
   - alert 提示 → 清除 cookie → 導向 `/login`

4. **Auth Restore**：
   - FrontendShell `useEffect` 在 mount 時從 localStorage 讀取 auth 資料
   - 有效則 dispatch `restoreAuth` 恢復登入狀態
