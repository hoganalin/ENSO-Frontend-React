# ENSO 前台 · Supabase 遷移完成指南

## ✅ 已完成的遷移

### 1. 登入組件 (Login.tsx)
- ✅ 已從課程 API 遷移到 Supabase Auth
- ✅ 使用 `db.auth.signIn(email, password)`
- ✅ 自動獲取用戶 profile（包含 role、member_tier、referral_code）
- ✅ 支持 ?redirect= URL 參數
- ✅ Redux state 更新 + localStorage 同步

### 2. 結帳組件 (Checkout.tsx)
- ✅ 已創建新的 Supabase 版本
- ✅ 使用 `db.checkout.placeOrder()` 建立訂單
- ✅ 自動計算小計 + 運費 = 合計
- ✅ 建立成功後清空購物車並導向支付頁面

### 3. 支付模擬 (PaymentMock.tsx)
- ✅ 已更新為使用 `db.checkout.completeOrder()`
- ✅ 完成訂單時觸發購物金發放 + SMS 紀錄
- ✅ 成功後導向產品頁

## 📋 完整端對端測試檢查清單

### 第一步：確認 Supabase 設定

```bash
# 1. 確認 .env.local 中有正確的 Supabase 憑證
cat .env.local | grep VITE_SUPABASE

# 應該看到：
# VITE_SUPABASE_URL=https://xxxxx.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJxxxx...
```

### 第二步：確認演示帳號

Supabase 認證應有 4 個帳號：
- ✅ hoganalin@gmail.com (金牌/admin)
- ✅ user1@test.com (銀牌/distributor，推薦人)
- ✅ user2@test.com (普通會員，被推薦人)
- ✅ user3@test.com (普通會員)

### 第三步：運行開發服務器

```bash
npm run dev
# 應該在 http://localhost:5173 啟動
```

### 第四步：執行測試場景

#### 場景 1：會員登入與推薦碼檢查
1. 瀏覽 http://localhost:5173
2. 點擊「登入」
3. 輸入 user1@test.com / 密碼
4. 驗證登入成功（看到歡迎提示）
5. 打開瀏覽器開發者工具 → Application → localStorage
6. 檢查 "auth" key 包含：
   ```json
   {
     "user": {
       "email": "user1@test.com",
       "id": "uuid",
       "profile": {
         "id": "uuid",
         "name": "",
         "role": "distributor",
         "member_tier": "silver",
         "referral_code": "ENSO-xxxxx"
       }
     },
     "isAuthenticated": true
   }
   ```

#### 場景 2：查看推薦碼（/referral 頁面）
1. 登入 user1@test.com（銀牌會員）
2. 瀏覽 http://localhost:5173/referral
3. 應看到：
   - 📌 推薦碼：ENSO-xxxxx
   - 👥 下線會員列表
   - 💰 購物金餘額
   - 📊 交易紀錄

#### 場景 3：購物 → 結帳 → 完成訂單 → 驗證購物金發放

**步驟 A：購物**
1. 登出 user1，登入 user2@test.com（被推薦人）
2. 瀏覽 /product
3. 將「芽莊沈香 ¥1280」加入購物車（數量 1）
4. 進入購物車頁面

**步驟 B：結帳**
1. 點擊「結帳」按鈕
2. 驗證訂單摘要顯示：
   - 小計：¥1280
   - 運費：¥100
   - 合計：¥1380
3. 點擊「前往支付」
4. 應導向支付頁面

**步驟 C：完成支付**
1. 在支付頁面點擊「模擬支付成功」
2. 驗證提示：「付款成功，訂單已完成，購物金已發放」
3. 導向產品頁面

**步驟 D：驗證購物金發放給推薦人**
1. 登出 user2
2. 登入 user1@test.com（推薦人，user2 的上線）
3. 進入 /referral 頁面
4. 應在「購物金交易」中看到：
   - 日期：今天
   - 類型：**earn**（收入）
   - 金額：¥128（1280 的 10%）
   - 狀態：正常（無過期標記）
   - 過期時間：1 年後

#### 場景 4：驗證購物金計算（10% 比例）

計算公式：
```
購物金 = 訂單小計 × 10%
例：¥1280 × 10% = ¥128
```

驗證：
1. 重複場景 3，不同商品和數量
2. 計算期望的購物金金額
3. 進入推薦頁面確認金額正確

#### 場景 5：驗證 RLS 行級安全

**5a. Normal 會員無法看到別人的訂單**
1. 登入 user3@test.com（普通會員）
2. 進入管理頁面或嘗試查看訂單列表
3. 應只看到自己的訂單，看不到 user2 的訂單

**5b. Silver/Gold 會員只能看下線訂單**
1. 登入 user1@test.com（銀牌/有下線）
2. 進入推薦頁面的「交易紀錄」
3. 應只看到 user2（自己推薦的人）的訂單，看不到其他人的

### 第五步：Supabase 數據驗證

在 Supabase SQL Editor 中運行以下查詢：

#### 檢查訂單是否正確建立
```sql
SELECT 
  id, 
  order_no, 
  buyer_id, 
  referrer_id, 
  subtotal, 
  total, 
  status, 
  created_at
FROM orders
WHERE status = 'completed'
ORDER BY created_at DESC
LIMIT 5;
```

預期結果：
- ✅ order_no 格式為 ENSO-xxxxxxxx
- ✅ buyer_id 是登入用戶的 UUID
- ✅ referrer_id 是推薦人的 UUID
- ✅ subtotal + shipping_fee = total
- ✅ status = 'completed'

#### 檢查購物金記錄
```sql
SELECT 
  id,
  member_id,
  type,
  amount,
  order_id,
  expires_at,
  created_at
FROM store_credit_ledger
WHERE type = 'earn'
ORDER BY created_at DESC
LIMIT 10;
```

預期結果：
- ✅ type = 'earn'（收入）
- ✅ amount = 訂單小計 × 10%
- ✅ expires_at = created_at + 1 年
- ✅ member_id 是推薦人的 UUID

#### 檢查會員關係
```sql
SELECT 
  id,
  name,
  role,
  member_tier,
  referrer_id,
  referral_code,
  created_at
FROM profiles
WHERE role IN ('customer', 'distributor')
ORDER BY created_at DESC
LIMIT 10;
```

預期結果：
- ✅ user1：role = 'distributor'，member_tier = 'silver'
- ✅ user2：referrer_id = user1 的 UUID
- ✅ 每人都有唯一的 referral_code（ENSO-xxxxx）

## 🔧 故障排除

### 問題：登入失敗「無法取得使用者資訊」

**原因**：profile 記錄缺失或未正確建立

**解決**：
```sql
-- 手動插入 profile（如果缺失）
INSERT INTO profiles(id, name, phone, role, member_tier, referral_code)
SELECT 
  auth.users.id,
  auth.users.email,
  NULL,
  'customer',
  'normal',
  'ENSO-' || upper(substr(md5(auth.users.id::text), 1, 5))
FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles);
```

### 問題：購物金未發放

**原因**：
1. referrer_id 未正確綁定
2. 推薦人不是 normal tier
3. 訂單未標記為 completed

**解決**：
1. 檢查 user2 的 referrer_id 是否正確：
   ```sql
   SELECT referrer_id FROM profiles WHERE id = 'user2-uuid';
   ```

2. 檢查推薦人是否是 normal tier：
   ```sql
   SELECT member_tier FROM profiles WHERE id = 'user1-uuid';
   ```

3. 確認訂單已完成：
   ```sql
   SELECT status FROM orders WHERE id = 'order-uuid';
   ```

### 問題：TypeScript 編譯錯誤

**可能的錯誤**：
- `Cannot find module '../services/db'`
- `Property 'profile' does not exist on type`

**解決**：
```bash
# 清除 TypeScript 緩存
rm -rf dist/ .next/ node_modules/.vite

# 重新安裝依賴
npm install

# 重新啟動開發服務器
npm run dev
```

## 📊 測試結果報告

完成所有測試後，記錄以下內容：

| 測試項目 | 狀態 | 備註 |
|---------|------|------|
| 登入功能 | ✅ / ❌ | |
| 推薦碼顯示 | ✅ / ❌ | |
| 購物流程 | ✅ / ❌ | |
| 結帳功能 | ✅ / ❌ | |
| 支付模擬 | ✅ / ❌ | |
| 購物金發放 | ✅ / ❌ | |
| 推薦頁面 | ✅ / ❌ | |
| RLS 安全性 | ✅ / ❌ | |

## 🎯 下一步

- [ ] 連接真實支付網關（Stripe / 支付寶）
- [ ] 實現購物金提現功能
- [ ] 添加退貨流程
- [ ] 實現 SMS 通知
- [ ] 設置後台管理系統（/admin）

## 📞 技術支援

如遇問題，檢查以下日誌：

1. **瀏覽器控制台** (F12 → Console)
   - 查找紅色錯誤信息

2. **Supabase 日誌**
   - 進入 Supabase 儀表板 → Logs → Edge Functions

3. **網絡請求** (F12 → Network)
   - 檢查 POST /rest/v1/orders 是否返回 200

---

**遷移日期**：2026-09-03  
**版本**：v2.0 (Supabase)
