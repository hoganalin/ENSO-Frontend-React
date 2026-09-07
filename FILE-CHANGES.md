# 📝 文件修改詳細清單

## 已修改/新建的文件

### 1. src/components/Login.tsx ✏️ 已修改

**狀態**：從課程 API 遷移到 Supabase Auth

**主要變更**：

```diff
- import { adminApi } from "../api";              // ❌ 移除課程 API
+ import * as db from "../services/db";          // ✅ 添加 Supabase db

- const authResponse = await adminApi.post("/admin/signin", {
-   email: data.email,
-   password: data.password,
- });
+ const authResponse = await db.auth.signIn(data.email, data.password);  // ✅ 使用 Supabase

+ // ✅ 新增：自動獲取用戶 profile
+ const profile = await db.auth.getCurrentProfile();

+ // ✅ 新增：profile → localStorage 同步
+ localStorage.setItem("auth", JSON.stringify({
+   user: {
+     email: data.email,
+     id: authResponse.user?.id,
+     profile,  // 包含 role、member_tier、referral_code
+   },
+   isAuthenticated: true,
+ }));
```

**修改原因**：
- 整合 Supabase 認證系統
- 自動同步用戶角色和會員等級
- 獲取推薦碼以供後續推薦功能使用

**受影響的功能**：
- ✅ 用戶登入
- ✅ 身份驗證
- ✅ Redux 狀態更新

---

### 2. src/components/Checkout.tsx ✨ 新建文件

**狀態**：新建

**核心功能**：

```typescript
// ✅ 從 Redux 讀取購物車
const cartItems = useSelector((state: RootState) => state.cart.items);
const auth = useSelector((state: RootState) => state.auth);

// ✅ 計算訂單金額
const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
const shipping_fee = 100;
const total = subtotal + shipping_fee;

// ✅ 調用 Supabase placeOrder
const order = await db.checkout.placeOrder({
  items: cartItems.map(item => ({
    product_id: item.id,
    title: item.title,
    unit_price: item.price,
    qty: item.quantity,
  })),
  subtotal,
  discount: 0,
  shipping_fee,
  total,
});

// ✅ 清空購物車
dispatch(clearCart());

// ✅ 導向支付頁面
navigate("/payment", { state: { orderId: order.id } });
```

**修改原因**：
- 實現 Supabase 訂單系統
- 計算訂單金額
- 與支付流程整合

**受影響的功能**：
- ✅ 訂單建立
- ✅ 購物車管理
- ✅ 支付流程整合

---

### 3. src/components/PaymentMock.tsx ✏️ 已修改

**狀態**：已更新

**主要變更**：

```diff
+ import * as db from "../services/db";              // ✅ 添加 Supabase db

+ const orderId = (location.state as any)?.orderId;  // ✅ 從 state 讀取訂單 ID

  const handlePaymentSuccess = async () => {
-   // 之前可能沒有完整的訂單完成邏輯
+   // ✅ 調用完成訂單（觸發購物金發放和 SMS 紀錄）
+   await db.checkout.completeOrder(orderId);
  };
```

**修改原因**：
- 整合 Supabase 訂單完成流程
- 觸發購物金自動發放
- 記錄 SMS 日誌

**受影響的功能**：
- ✅ 訂單完成
- ✅ 購物金發放
- ✅ SMS 通知（模擬或真實）

---

## 現有文件（未修改）

這些文件已存在且無需修改：

### ✅ src/services/db/ 目錄（完整後端層）

```
src/services/db/
├── index.ts                  # 導出所有模塊
├── auth.ts                   # 認證服務
│   ├── signUp(params)        # 用戶註冊
│   ├── signIn(email, password) # 用戶登入
│   ├── getCurrentProfile()   # 獲取當前用戶
│   └── signOut()             # 登出
│
├── checkout.ts               # 訂單服務
│   ├── placeOrder(...)       # 建立訂單
│   └── completeOrder(id)     # 完成訂單
│
├── storeCredit.ts            # 購物金服務
│   ├── creditForCompletedOrder(...) # 計算購物金
│   └── getBalance(userId)    # 查詢餘額
│
├── referral.ts               # 推薦服務
│   ├── getMyReferralCode()   # 獲取自己的推薦碼
│   └── getReferralReport()   # 獲取推薦報告
│
├── products.ts               # 產品服務
│   └── getAll()              # 獲取所有產品
│
├── promotions.ts             # 活動服務
│   └── 推薦活動引擎
│
├── orders.ts                 # 訂單查詢服務
├── settings.ts               # 系統設定
├── sms.ts                    # SMS 服務
├── types.ts                  # TypeScript 類型定義
└── ...
```

### ✅ src/lib/supabase.ts

```typescript
// Supabase 客户端初始化
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
```

---

## 📊 修改統計

| 項目 | 數量 |
|------|------|
| 已修改文件 | 2 個 |
| 新建文件 | 1 個 |
| 未修改但相關文件 | 11 個 |
| 總代碼行數修改 | ~450 行 |
| 新增服務函數 | 0 個（已存在） |

---

## 🔄 數據流改動

### 登入流程（原 vs 新）

#### ❌ 原流程（課程 API）
```
用戶輸入帳號密碼
    ↓
POST /admin/signin (課程 API)
    ↓
返回 token + 基本信息
    ↓
存入 localStorage + Redux
    ↓
登入完成
```

#### ✅ 新流程（Supabase）
```
用戶輸入帳號密碼
    ↓
db.auth.signIn() (Supabase Auth)
    ↓
返回 user + session
    ↓
db.auth.getCurrentProfile() 自動獲取 profile
    ↓
profile 包含：
  - id (UUID)
  - name
  - role (customer/distributor/admin)
  - member_tier (normal/silver/gold)
  - referral_code (ENSO-xxxxx)
  - referrer_id (推薦人 UUID)
    ↓
存入 localStorage + Redux
    ↓
登入完成 ✅
```

### 訂單流程（新增）

```
用戶在購物車點擊「結帳」
    ↓
Checkout.tsx 讀取 Redux cart items
    ↓
計算：
  - subtotal = 商品總價
  - shipping_fee = 100
  - total = subtotal + shipping_fee
    ↓
db.checkout.placeOrder({
  items: [{product_id, title, unit_price, qty}, ...],
  subtotal,
  discount: 0,
  shipping_fee,
  total
})
    ↓
返回 order 對象（包含 order_no 和 id）
    ↓
清空 Redux cart
    ↓
導向 /payment 頁面（帶 orderId）
    ↓
─────────────────────────────
    ↓
用戶在支付頁點擊「模擬支付成功」
    ↓
db.checkout.completeOrder(orderId)
    ↓
後端邏輯：
  1. 訂單標記為 completed
  2. 觸發購物金發放給推薦人
     - 金額：subtotal × 10%
     - 只在推薦人 tier=normal 時發放
  3. 記錄 SMS 日誌
    ↓
返回成功消息
    ↓
導向 /product 頁面
    ↓
訂單完成 ✅
```

---

## 🧪 需要測試的部分

### 登入部分
- [ ] Supabase 認證
- [ ] profile 自動獲取
- [ ] localStorage 同步
- [ ] Redux 狀態更新

### 結帳部分
- [ ] 訂單建立
- [ ] 購物車清空
- [ ] 頁面導向

### 支付部分
- [ ] 訂單完成
- [ ] 購物金發放
- [ ] 推薦人查看購物金

---

## 📦 依賴項（已存在）

所有必要依賴已在 package.json 中：

- `@supabase/supabase-js` - Supabase 客户端
- `react-redux` - Redux 狀態管理
- `@reduxjs/toolkit` - Redux 工具
- `react-hook-form` - 表單驗證
- `sweetalert2` - 彈窗提示
- `react-router` - 路由

無需新增依賴。

---

## ✅ 驗證清單

完成遷移後，驗證以下項目：

- [ ] 文件正確複製到項目
- [ ] 沒有 TypeScript 編譯錯誤
- [ ] 沒有運行時警告
- [ ] 登入功能正常
- [ ] 訂單建立正常
- [ ] 購物金發放正常
- [ ] Redux 狀態更新正常

---

**遷移日期**：2026-09-03  
**版本**：v2.0 (Supabase)
