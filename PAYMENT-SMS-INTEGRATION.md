# ENSO 支付 + 簡訊集成指南

## 📌 概述

本文檔說明如何集成：
- **ECPay 綠界金流**（支付）- 1.8% 手續費（業界最便宜）
- **三竹 Mitake 簡訊**（通知）- 0.7 元/則（全台最低價）

## 🎯 整體流程

```
結帳 → 建立訂單 (pending) → 導向 ECPay 支付
   ↓
ECPay 支付成功 → 驗證簽章 → 完成訂單
   ↓
發放購物金（給推薦人）→ 發簡訊通知推薦人
```

## ✅ 已完成的部分

### 1. 核心模塊
- ✅ `src/services/payment/ecpay.ts` - ECPay API 客戶端
- ✅ `src/services/sms/mitake.ts` - 三竹簡訊客戶端
- ✅ `src/services/payment/index.ts` - 整合層
- ✅ `src/pages/PaymentPage.tsx` - 支付頁面

### 2. 數據庫
- ✅ `supabase/003-extend-sms-log.sql` - SMS 日誌擴展（Mitake ID、錯誤信息）

### 3. 環境配置
- ✅ `.env.example` - 環境變數範本

## 🚀 使用步驟

### 第 1 步：環境配置

複製 `.env.example` 到 `.env.local` 並填入真實資訊：

```bash
cp .env.example .env.local
```

編輯 `.env.local`：

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-key

# ECPay（測試帳號預設可用）
VITE_ECPAY_MERCHANT_ID=2000132
VITE_ECPAY_HASH_KEY=ejCk326UnaZLtqKGEqNSAqVHWN7Fh4P7
VITE_ECPAY_HASH_IV=XUIkCcrwf6Pz7IKU5M3P5Q
VITE_ECPAY_IS_PRODUCTION=false  # 測試環境

# 三竹 Mitake（需自行申請帳號）
VITE_MITAKE_USERNAME=your-username
VITE_MITAKE_PASSWORD=your-password
```

### 第 2 步：更新數據庫

在 Supabase SQL Editor 執行：

```sql
-- 執行 supabase/003-extend-sms-log.sql
ALTER TABLE sms_log
ADD COLUMN IF NOT EXISTS mitake_msgid TEXT,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS payment_reference_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sms_log_mitake_msgid ON sms_log(mitake_msgid);
CREATE INDEX IF NOT EXISTS idx_sms_log_payment_ref ON sms_log(payment_reference_id);
```

### 第 3 步：修改結帳組件（Checkout.tsx）

在結帳提交時調用支付初始化：

```tsx
import { initializePayment } from "@/services/payment";

// 在結帳提交處理器中
const handleCheckoutSubmit = async () => {
  // 1. 先調用 placeOrder 建立訂單（pending）
  const order = await db.checkout.placeOrder({
    buyerId: profile.id,
    items: cartItems,
    memberTier: profile.member_tier,
    couponCode,
    recipient,
  });

  // 2. 初始化支付流程
  const paymentForm = await initializePayment(
    order.id,
    order.total,
    "ENSO 線香購物",
    {
      returnUrl: `${window.location.origin}/payment/success/${order.id}`,
      notifyUrl: `${import.meta.env.VITE_ECPAY_NOTIFY_URL}`,
    }
  );

  // 3. 顯示支付表單或重定向
  // 方案 A: 在新視窗中顯示 ECPay 表單
  const form = new DOMParser().parseFromString(paymentForm.formHtml, "text/html");
  document.body.appendChild(form.body.firstChild);
  form.querySelector("form")?.submit();

  // 方案 B: 導向支付頁面（推薦）
  navigate(`/payment/${order.id}`, { state: { formData: paymentForm.formData } });
};
```

### 第 4 步：添加支付頁面路由（Router.tsx）

```tsx
import PaymentPage from "@/pages/PaymentPage";

export const router = createBrowserRouter([
  // ... 其他路由
  {
    path: "/payment/:orderId",
    element: <PaymentPage />,
  },
  {
    path: "/payment/success/:orderId",
    element: <PaymentSuccessPage />,
  },
]);
```

### 第 5 步：測試支付流程

#### 使用 ECPay 測試帳號

- **商店 ID**: 2000132
- **支付網址**: https://payment-stage.ecpay.com.tw/（測試環境）
- **測試卡號**: 4111-1111-1111-1111（Visa）
- **測試信用卡有效期**: 任意未來日期
- **測試 CVV**: 任意 3 位數字

#### 測試簡訊（需三竹帳號）

```tsx
import { sendTestSms } from "@/services/payment";

// 在管理後台或開發工具中測試
const result = await sendTestSms(
  "0912345678",
  "這是測試簡訊。您推薦的訂單已完成，獲得購物金 NT$100。"
);

console.log("簡訊結果:", result);
// { success: true, msgid: "xxx", statusCode: "0" }
```

## 🔧 進階設定

### 自訂支付方式

在 `initializePayment` 中指定 `paymentMethod`：

```tsx
const paymentForm = await initializePayment(order.id, order.total, "商品名稱", {
  // 只提供信用卡支付
  paymentMethod: "Credit",
});
```

支援的方式：
- `ALL` - 提供所有方式（預設）
- `Credit` - 信用卡
- `WebATM` - 網路 ATM
- `CVS` - 便利店繳費
- `BARCODE` - 超商條碼

### 自訂簡訊內容

修改 `src/services/payment/index.ts` 中的 `handlePaymentSuccess` 函數：

```tsx
const message = `
恭喜！訂單 ${result.order.order_no} 已完成。
📦 購買內容：${result.order.items.map(i => i.title).join(", ")}
💰 訂單金額：NT$${result.order.subtotal.toLocaleString()}
🎁 推薦獎勵：NT$${result.creditIssued.toLocaleString()} 購物金
📱 本簡訊由三竹資訊提供
`.trim();
```

### 簡訊額度管理

三竹簡訊需要預先儲值。在管理後台顯示餘額：

```tsx
// src/pages/AdminSmsBalance.tsx
import { getMitakeSmsClient } from "@/services/sms/mitake";

export async function checkSmsBalance() {
  const client = getMitakeSmsClient();
  // 三竹 API 不直接提供餘額查詢，需自行實作
  // 建議在 Supabase 中維護一個 sms_balance 表
}
```

## 🐛 常見問題

### 1. ECPay 測試環境一直失敗

**症狀**: 支付後收不到回調

**解決方案**:
- 確認 `VITE_ECPAY_IS_PRODUCTION=false`
- 檢查簽章（HashKey/HashIV）是否正確
- 確認金額是整數（轉為 Math.round）

### 2. 簡訊沒有發送

**症狀**: SMS 日誌顯示 status="failed"

**解決方案**:
- 檢查 Mitake 帳號餘額
- 檢查電話號碼格式（應為 09XXXXXXXX）
- 檢查簡訊內容長度（<= 160 字）
- 查看 error_message 欄位了解具體錯誤

### 3. 支付成功但訂單未完成

**症狀**: ECPay 顯示成功，但 orders 表仍為 pending

**解決方案**:
- 檢查 Supabase 權限（RLS 策略）
- 查看瀏覽器 console 錯誤日誌
- 檢查 completeOrder 是否正常執行
- 確認 Supabase 與前端的連接

## 📊 監控 & 日誌

### SMS 日誌查詢

```sql
-- 查看今天的簡訊
SELECT * FROM sms_log
WHERE DATE(created_at) = TODAY()
ORDER BY created_at DESC;

-- 查看失敗的簡訊
SELECT * FROM sms_log
WHERE status = 'failed'
ORDER BY created_at DESC;

-- 查看特定電話的簡訊記錄
SELECT * FROM sms_log
WHERE to_phone = '0912345678'
ORDER BY created_at DESC;
```

### 支付交易查詢

```sql
-- 查看今天的訂單
SELECT id, order_no, status, total, created_at
FROM orders
WHERE DATE(created_at) = TODAY()
ORDER BY created_at DESC;

-- 查看完成且有推薦獎勵的訂單
SELECT o.*, sc.amount as credit_amount
FROM orders o
LEFT JOIN store_credit_ledger sc ON o.id = sc.order_id
WHERE o.status = 'completed' AND o.referrer_id IS NOT NULL
ORDER BY o.created_at DESC;
```

## 🚨 上線前檢查清單

- [ ] ECPay 商家帳號已申請（測試帳號可先用）
- [ ] Mitake 簡訊帳號已申請並儲值
- [ ] `.env.local` 已填入正確的金鑰
- [ ] Supabase 數據庫已執行遷移 SQL
- [ ] 結帳流程已集成支付初始化
- [ ] 支付頁面已新增到路由
- [ ] 支付成功/失敗頁面已實作
- [ ] Webhook 端點已實作（後端）
- [ ] SMS 日誌已測試
- [ ] 支付測試 10 筆以上訂單
- [ ] 簡訊發送測試成功

## 📞 支持聯繫

- **ECPay 客服**: https://www.ecpay.com.tw/
- **三竹 Mitake**: https://sms.mitake.com.tw/
- **Supabase 文檔**: https://supabase.com/docs

---

**最後更新**: 2026-09-07
**集成狀態**: ✅ 完成
