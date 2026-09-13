# ⚡ ECPay + Mitake 快速開始（5 分鐘）

## 🎯 目標
在 5 分鐘內讓支付和簡訊功能可用。

## ✅ 檢查清單

### Step 1️⃣ 環境配置（1 分鐘）
```bash
# 複製環境變數範本
cp .env.example .env.local

# 編輯 .env.local，填入以下內容（測試帳號可直接用）:
VITE_ECPAY_MERCHANT_ID=2000132
VITE_ECPAY_HASH_KEY=ejCk326UnaZLtqKGEqNSAqVHWN7Fh4P7
VITE_ECPAY_HASH_IV=XUIkCcrwf6Pz7IKU5M3P5Q
VITE_ECPAY_IS_PRODUCTION=false
```

### Step 2️⃣ Supabase 遷移（1 分鐘）
1. 開啟 Supabase Dashboard → SQL Editor
2. 複製執行：`supabase/003-extend-sms-log.sql` 的內容
3. ✅ 完成

### Step 3️⃣ 申請 Mitake 帳號（2 分鐘）
1. 造訪 https://sms.mitake.com.tw/
2. 註冊帳號 → 儲值 NT$100（約可發 140+ 則簡訊）
3. 取得 username 和 password
4. 填入 `.env.local`：
   ```
   VITE_MITAKE_USERNAME=your-username
   VITE_MITAKE_PASSWORD=your-password
   ```

### Step 4️⃣ 集成到結帳流程（1 分鐘）
在 `src/pages/Checkout.tsx` 中，修改提交處理：

```tsx
import { initializePayment } from "@/services/payment";

// 在結帳提交時
const handleSubmit = async () => {
  // ... 其他結帳邏輯
  
  // 1. 建立訂單
  const order = await db.checkout.placeOrder({...});
  
  // 2. 初始化支付
  const paymentForm = await initializePayment(order.id, order.total, "ENSO 線香購物");
  
  // 3. 導向支付頁面
  navigate(`/payment/${order.id}`);
};
```

### Step 5️⃣ 新增路由（30 秒）
在 `src/router/index.ts` 中添加：

```tsx
import PaymentPage from "@/pages/PaymentPage";

{
  path: "/payment/:orderId",
  element: <PaymentPage />,
}
```

## 🧪 測試支付流程

1. 啟動開發伺服器：`npm run dev`
2. 進入購物流程 → 完成結帳
3. 系統導向 ECPay 支付頁面
4. 使用測試卡號：`4111-1111-1111-1111`
5. 輸入任意未來日期和 3 位 CVV
6. 點擊「確認付款」
7. ✅ 返回成功頁面
8. ✅ 檢查簡訊日誌

## 📱 測試簡訊發送

```tsx
// 在瀏覽器 console 中執行
import { sendTestSms } from "@/services/payment";

await sendTestSms("09XXXXXXXX", "測試簡訊內容");
```

## 🚀 部署到 Vercel

```bash
git add .
git commit -m "feat: add ECPay + Mitake payment integration"
git push origin main

# Vercel 自動部署，環境變數在 Vercel Dashboard 中設定
```

## ⚠️ 常見坑點

| 問題 | 解決方案 |
|------|---------|
| 支付後頁面空白 | 檢查 console 錯誤，確認金鑰是否正確 |
| 簡訊沒收到 | 檢查 Mitake 帳戶餘額，確認電話號碼格式 |
| CORS 錯誤 | 後端需配置 CORS，允許來自前端的請求 |
| 簽章驗證失敗 | 確認 HashKey 和 HashIV 沒有多餘空格 |

## 📞 需要幫助？

- 💳 ECPay 問題: https://www.ecpay.com.tw/
- 📱 Mitake 問題: https://sms.mitake.com.tw/
- 📚 詳細指南: 見 `PAYMENT-SMS-INTEGRATION.md`

---

**祝你集成順利！** 🎊
