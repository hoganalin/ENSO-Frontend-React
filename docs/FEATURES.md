# 功能清單

## 狀態說明

- ✅ 已完成
- 🔧 開發中
- ⬜ 未開始

---

## 前台功能

### 首頁 ✅

| 功能 | 狀態 | 說明 |
|---|---|---|
| Hero 影片 | ✅ | 全幅背景 WebM 影片，自動播放、靜音、循環 |
| 探索香氣世界 | ✅ | 三張卡片：冥想香氣、放鬆舒壓、空間淨化（AOS fade-up）|
| 精選線香輪播 | ✅ | Swiper 自動輪播，顯示「線香」分類商品，RWD breakpoints (1/2/3 slides) |
| 品牌故事區塊 | ✅ | 左側文案 + 右側 2x2 特色卡片（天然原料、手工製作、永續包裝、全台配送）|
| Philosophy（禪）| ✅ | 「香を聞く / 時を聞く / 己を聞く」背景圖 `/images/incene-bg.png` + 桌機視差 |
| CTA（一支香，一段呼吸）| ✅ | 背景圖 `/images/incene-breath-bg.png` + 桌機視差 + Seal「香」印章 |
| 顧客心聲 | ✅ | 三則顧客評價卡片，含頭像、姓名、身份 |

**行為描述**：首頁載入時 fetch「線香」分類商品，若無資料 fallback 至全部商品。精選線香 Swiper 每 3 秒自動切換，支援點擊分頁。點擊「詳細介紹」導向 `/product/:id`。

### 商品列表 ✅

| 功能 | 狀態 | 說明 |
|---|---|---|
| 分類篩選 | ✅ | 桌面版：水平 nav pills；手機版：select dropdown |
| 商品搜尋 | ✅ | Header 搜尋框 → URL query `?search=xxx` → 前端 filter |
| 商品卡片 | ✅ | 圖片 + 分類 + 標題 + 描述 + 價格 + 加入購物車按鈕 |
| 分頁 | ✅ | API 伺服器端分頁，Pagination 元件顯示頁碼 |
| 加入購物車 | ✅ | 點擊 + 按鈕，loading spinner 反饋，成功 toast 通知 |

**行為描述**：頁面載入時 fetch 全部商品取得分類列表。切換分類時重新 fetch 第 1 頁。搜尋為前端 filter（title + category 匹配）。AOS fade-up 動畫延遲依卡片位置遞增。

### 商品詳情 ✅

| 功能 | 狀態 | 說明 |
|---|---|---|
| 主圖 + 副圖 | ✅ | 主圖大圖 + 底部副圖縮圖列 |
| 香調資訊 | ✅ | Aroma Notes 卡片：前調 / 中調 / 基調 |
| 產品規格 | ✅ | 燃燒時間、香煙特性、每盒數量、庫存數量 |
| 數量選擇 | ✅ | +/- 按鈕，最小值 1，支援手動輸入 |
| 加入購物車 | ✅ | dispatch `createAsyncAddCart`，成功 toast 通知 |
| 香氣體驗 | ✅ | content 描述 + 適合場景列表 + 4 張體驗卡片 |
| 使用方式 | ✅ | 3 步驟圖文：點燃、吹熄、放入香插 + 注意事項 |
| 免運提示 | ✅ | 滿 NT$800 免運費，2-3 個工作天到貨 |

**行為描述**：URL param `id` → fetch 單一商品。庫存 < 5 顯示紅色警示；null 顯示「缺貨」。英文副標 fallback 為 "Premium Incense Series"。

### 購物車 ✅

| 功能 | 狀態 | 說明 |
|---|---|---|
| 商品列表 | ✅ | 圖片 + 名稱 + 數量增減 + 小計 |
| 數量增減 | ✅ | +/- 按鈕，最小值 1，操作時 loading spinner |
| 刪除單項 | ✅ | X 按鈕移除，loading 狀態 |
| 清空全部 | ✅ | 「清空全部」按鈕 |
| 優惠券 | ✅ | 輸入優惠碼 → `applyCouponApi` → 重新 fetch 購物車 |
| 結帳進度條 | ✅ | 3 步驟：確認購物車 → 填寫資料 → 完成訂購 |
| 結帳導航 | ✅ | 空購物車時按鈕 disabled；有商品時導向 `/checkout` |

**行為描述**：所有購物車操作透過 Redux async thunks，完成後自動 dispatch `createAsyncGetCart` 同步最新狀態。Toast 通知成功/失敗。

### 結帳 ✅

| 功能 | 狀態 | 說明 |
|---|---|---|
| 收件人表單 | ✅ | Email、姓名、電話、地址、付款方式、備註 |
| 表單驗證 | ✅ | react-hook-form：email 格式、必填、電話長度 8-10 碼純數字 |
| 訂單摘要 | ✅ | 右側顯示購物車商品 + 小計 + 運費 + 總計 |
| 運費邏輯 | ✅ | 滿 NT$800 免運，否則加 NT$50 |
| 提交訂單 | ✅ | `createOrderApi` → 取得 orderId → 導向 `/payment/mock/:orderId` → `/checkout-success/:orderId` |
| 假金流頁 | ✅ | `/payment/mock/:orderId` (PaymentMock 元件)，demo 用，跳過 ECPay 真實跳轉 |

### 認證 ✅

| 功能 | 狀態 | 說明 |
|---|---|---|
| 登入 | ✅ | Email + 密碼，POST `/admin/signin`，token 存 localStorage + cookie |
| 登出 | ✅ | SweetAlert2 確認 → 清除所有認證資料 |
| Auth 恢復 | ✅ | `FrontendLayout` 載入時從 localStorage 恢復登入狀態 → dispatch `restoreAuth` |
| 註冊 | ✅ | 註冊表單頁面 |

### 其他頁面 ✅

| 功能 | 狀態 | 說明 |
|---|---|---|
| 品牌故事 (About) | ✅ | 含 GardenParallaxSection（和敬清寂枯山水區，背景影片 `/videos/山水.mp4` autoplay+loop+muted）|
| 聯絡我們 (Contact) | ✅ | 表單：姓名、Email、主題、訊息 |
| 常見問題 (FAQ) | ✅ | 手風琴式 Q&A |
| 旅程誌 (Journal) | ✅ | 列表頁 + 動態 `:id` 詳情頁，內容來自 `src/data/journal.ts` |
| 門市資訊 (Stores) | ✅ | 靜態門市介紹頁 |
| 404 頁面 | ✅ | NotFoundPage（router `*` 路徑）|

### Enso Kyoto 視覺系統 ✅

| 元件 / Token | 狀態 | 說明 |
|---|---|---|
| Asanoha 麻葉 | ✅ | SVG atom，幾何重複圖案 |
| Seigaiha 青海波 | ✅ | SVG atom，海浪同心圓 |
| EnsoCircle 圓相 | ✅ | 一筆圓相，可配置 size / stroke |
| KanjiDivider | ✅ | 漢字 + 細線分隔（首頁 Philosophy 用）|
| VerticalKanji | ✅ | 直書漢字 |
| Seal 印章 | ✅ | 紅底白字方塊（CTA 用）|
| SmokeLayer | ✅ | 煙霧裝飾層 |
| Tokens | ✅ | `_tokens-enso-kyoto.scss` 統一定義 enso-ink / enso-fg / enso-gold / serif-jp 等 |
| Theme Slice | ✅ | `themeSlice.ts` 管理 direction / accent / brushIntensity，寫入 `<html>` data attr |

### 共用功能 ✅

| 功能 | 狀態 | 說明 |
|---|---|---|
| Toast 通知 | ✅ | Redux messageSlice，3 秒自動消失 |
| Header | ✅ | Logo、導航、搜尋、購物車 badge（即時數量）、登入/登出 |
| Breadcrumb | ✅ | 根據路由自動產生 |
| AOS 動畫 | ✅ | 全域初始化，路由切換時 refresh |
| ScrollRestoration | ✅ | react-router 7 內建，路由切換自動回頂 |
| 頁面標題 | ✅ | `usePageTitle(title)` hook，set/restore document.title（取代原 react-helmet-async）|
| RWD | ✅ | Bootstrap 5 grid，行動版漢堡選單 |

### AI Shopping Agent ✅

| 功能 | 狀態 | 說明 |
|---|---|---|
| ChatWidget | ✅ | 右下角浮動按鈕 + 可收合對話面板 |
| Multi-agent 協作 | ✅ | 小禾（購物）／小香（香氛）／小管（訂單）三位 agent 互相 handoff |
| Router（意圖分類） | ✅ | 關鍵字分類決定 handoff；同分時保留當前 agent，防震盪 |
| Tool Use | ✅ | 10 個 tool schemas（搜尋、加購、知識查詢、訂單狀態 …），完整 tool-use loop + MAX_TURNS 保護 |
| Provider 切換 | ✅ | `mock`（離線預設）/ `direct`（client 直打 Anthropic，僅 local dev），透過 `VITE_AGENT_PROVIDER` 切換 |
| 主題色切換 | ✅ | panel / 頭像 / bubble 邊框依當前 agent 換色（emerald / rose / blue）|
| Handoff UI | ✅ | 切 agent 時顯示 system chip「🪷 小香 接手，原因：…」|

> **歷史變更**：原 Next.js 版的 `server` provider（透過 `/api/agent` Route Handler 代打）以及 Prompt Playground / Eval Suite 在遷移到 Vite SPA 後已移除。詳見 [AGENT.md](./AGENT.md)。
