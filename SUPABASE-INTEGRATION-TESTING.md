# ENSO Supabase 整合測試指南

## 📋 前置條件

✅ **已驗證項目**：
- Supabase 連接配置在 `.env.local`
- 前端代碼修復已部署（6 項修復）
- 開發服務器運行在 `http://localhost:5173`

⚠️ **待完成項目**：
- ❌ 添加 `referrer_tier_snapshot` 欄位到 orders 表
- ❌ 驗證 RLS 策略
- ❌ 完整端到端測試

---

## 🔧 第一步：添加數據庫遷移

### 方式 1：使用 Supabase CLI（推薦）

```bash
# 1. 安裝 Supabase CLI（若未安裝）
npm install -g supabase

# 2. 鏈接到你的 Supabase 項目
supabase link --project-ref cbhumsmscrqcrxwkepll

# 3. 執行遷移
supabase db push
```

### 方式 2：手動執行 SQL（快速）

1. 打開 [Supabase Dashboard](https://app.supabase.com)
2. 進入 **SQL Editor**
3. 新建查詢，複製以下內容：

```sql
-- 添加 referrer_tier_snapshot 欄位
ALTER TABLE public.orders
ADD COLUMN referrer_tier_snapshot member_tier DEFAULT NULL;

-- 創建索引
CREATE INDEX IF NOT EXISTS idx_orders_referrer_tier_snapshot 
  ON public.orders(referrer_tier_snapshot);

-- 添加文檔
COMMENT ON COLUMN public.orders.referrer_tier_snapshot IS 
  'Snapshot of referrer member tier at time of order completion (normal/silver/gold)';
```

4. 執行查詢 ✓

### 驗證遷移成功

在 SQL Editor 執行：

```sql
-- 檢查欄位是否存在
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders' and column_name = 'referrer_tier_snapshot';
```

應該看到：
```
column_name              | data_type | is_nullable
referrer_tier_snapshot   | member_tier | YES
```

---

## 🧪 第二步：認證流程測試

### 測試場景 1：用戶註冊與登錄

**操作步驟**：
1. 打開 `http://localhost:5173`
2. 點擊「註冊」
3. 填入以下信息：
   - 郵箱：`test-buyer@example.com`
   - 密碼：`Test123!@#`
   - 名稱：`Test Buyer`
4. 提交表單

**預期結果**：
- ✅ 用戶在 Supabase `auth.users` 中創建
- ✅ 自動在 `profiles` 表創建對應記錄
- ✅ 生成唯一的推薦碼（如 `ENSO-ABC12`）
- ✅ 重定向到首頁並顯示已登錄狀態

**驗證**（在 Supabase Dashboard）：
```sql
SELECT id, email, created_at FROM auth.users 
WHERE email = 'test-buyer@example.com';

SELECT id, name, referral_code, member_tier 
FROM public.profiles 
WHERE name = 'Test Buyer';
```

---

### 測試場景 2：推薦人綁定

**操作步驟**：
1. 先創建推薦人帳號：`referrer@example.com`（password: `Ref123!@#`）
2. 登出
3. 使用推薦碼註冊新用戶：
   - 郵箱：`test-referred@example.com`
   - 推薦碼：（從推薦人獲取的 `ENSO-xxx`）
4. 提交

**預期結果**：
- ✅ 新用戶的 `referrer_id` 正確指向推薦人
- ✅ 推薦人可以在後台看到被推薦人的訂單

**驗證**：
```sql
SELECT p1.name as buyer, p2.name as referrer, p1.referrer_id
FROM public.profiles p1
LEFT JOIN public.profiles p2 ON p1.referrer_id = p2.id
WHERE p1.name = 'Test Referred';
```

---

## 💳 第三步：支付流程與積分計算測試

### 測試場景 3：完成訂單與積分發放（冪等性）

**準備工作**：
1. 以買家身份登錄：`test-buyer@example.com`
2. 添加商品到購物車
3. 進入結帳頁面

**操作步驟**：
1. 填入收貨信息
2. 確認訂單（小計 ≥ 1000 元）
3. 進入支付模式（使用 Mock Payment）
4. 點擊「確認支付」

**第一次支付 - 預期結果**：
- ✅ 訂單狀態變更為 `paid` → `completed`
- ✅ 在 `store_credit_ledger` 中創建一條 `earn` 記錄
- ✅ 積分金額 = 訂單小計 × 10%
- ✅ 失效日期 = 今天 + 1 年
- ✅ 響應包含 `isIdempotent: false`（首次發放）

**驗證**（在 Supabase Dashboard）：
```sql
-- 檢查訂單
SELECT id, order_no, status, subtotal, completed_at 
FROM public.orders 
WHERE buyer_id = (SELECT id FROM auth.users WHERE email = 'test-buyer@example.com')
ORDER BY created_at DESC LIMIT 1;

-- 檢查積分
SELECT id, type, amount, expires_at 
FROM public.store_credit_ledger 
WHERE member_id = (SELECT id FROM auth.users WHERE email = 'test-buyer@example.com')
ORDER BY created_at DESC LIMIT 1;
```

**第二次重複請求 - 測試冪等性**：
1. 打開開發者工具 (F12)
2. 切換到「Network」或「Console」標籤
3. 重複相同的支付請求（刷新頁面或重新發送請求）

**冪等性測試 - 預期結果**：
- ✅ 響應包含 `isIdempotent: true`（重複檢測）
- ✅ **不創建新的積分記錄**（仍只有 1 條）
- ✅ 用戶界面不顯示重複積分

**驗證**：
```sql
-- 應該只有 1 條 earn 記錄，沒有重複
SELECT COUNT(*) as credit_count, SUM(amount) as total_earned
FROM public.store_credit_ledger 
WHERE member_id = (SELECT id FROM auth.users WHERE email = 'test-buyer@example.com')
AND type = 'earn';
-- 預期：count = 1
```

---

### 測試場景 4：推薦人積分計算（層級快照）

**準備工作**：
1. 推薦人帳號：`referrer@example.com`（成員等級：`normal`）
2. 被推薦人帳號：`referred@example.com`
3. 被推薦人下訂單，小計 5000 元

**操作步驟**：
1. 以被推薦人身份登錄
2. 完成訂單（金額 5000 元）
3. 觀察推薦人的積分

**預期結果**：
- ✅ 在 `orders` 表中：
  - `referrer_id` = 推薦人 ID
  - `referrer_tier_snapshot` = `'normal'`（購買時的層級）
- ✅ 在 `store_credit_ledger` 中：
  - 推薦人獲得積分 = 5000 × 10% = 500 元
  - 積分類型 = `earn`
  - 對應訂單 = 這筆訂單的 ID
- ✅ 如果推薦人是銀/金卡：應獲得更高百分比（待配置）

**驗證**：
```sql
-- 檢查訂單的層級快照
SELECT id, order_no, referrer_id, referrer_tier_snapshot, subtotal
FROM public.orders 
WHERE order_no = 'ENSO-...' (填入訂單號);

-- 檢查推薦人獲得的積分
SELECT id, member_id, type, amount, order_id
FROM public.store_credit_ledger 
WHERE member_id = (SELECT id FROM auth.users WHERE email = 'referrer@example.com')
AND order_id = (SELECT id FROM public.orders WHERE order_no = 'ENSO-...');
```

---

## 🔐 第四步：安全性測試（RLS）

### 測試場景 5：行級安全性（Row Level Security）

**測試 5a：用戶只能看到自己的訂單**

使用 Supabase 的 SQL 編輯器，以不同用戶角色測試：

```sql
-- 切換為 test-buyer@example.com 的身份
-- （在 Supabase SQL Editor 中無法直接切換，但可以用 supabase CLI 測試）

-- 模擬 test-buyer 查詢
SELECT * FROM public.orders WHERE buyer_id = auth.uid();
-- 應該只看到這個用戶的訂單

-- 模擬試圖訪問其他用戶的訂單（應被拒絕）
SELECT * FROM public.orders WHERE buyer_id = 'someone-else-id';
-- 應該返回空結果或被拒絕
```

**測試 5b：推薦人可以看到被推薦人的訂單**

```sql
-- 金/銀卡推薦人應能看到被推薦人訂單
SELECT * FROM public.orders 
WHERE EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = orders.buyer_id AND p.referrer_id = auth.uid()
);
```

**測試 5c：職員可以看到所有訂單**

```sql
-- 管理/支援人員應能看到所有訂單
SELECT * FROM public.orders;
-- (若角色設為 'admin' 或 'support')
```

---

## 📊 第五步：時區與過期日期測試

### 測試場景 6：UTC 時區與積分過期

**操作步驟**：
1. 以用戶身份登錄
2. 完成一筆訂單（獲得購物金）
3. 檢查過期日期

**預期結果**：
- ✅ `expires_at` 日期格式：`YYYY-MM-DD HH:MM:SS UTC`
- ✅ 日期應為當前日期 + 1 年
- ✅ 日期不受時區影響（永遠是 UTC）

**驗證**：
```sql
SELECT id, amount, created_at, expires_at,
       (expires_at - created_at) as validity_period
FROM public.store_credit_ledger 
WHERE member_id = auth.uid() AND type = 'earn'
ORDER BY created_at DESC LIMIT 1;

-- 預期 validity_period 應接近 365 天
```

---

## 🚨 常見問題排查

### 問題 1：遷移執行失敗

**症狀**：`ERROR: column "referrer_tier_snapshot" already exists`

**解決**：
```sql
-- 檢查欄位是否真的存在
\d public.orders

-- 如果存在，跳過遷移；如果不存在，檢查 member_tier 類型
SELECT typname FROM pg_type WHERE typname = 'member_tier';
```

### 問題 2：登錄後 RLS 拒絕訪問

**症狀**：`ERROR: new row violates row-level security policy`

**解決**：
1. 確認用戶已成功認證（JWT token 有效）
2. 在 Supabase Dashboard 檢查 RLS 策略是否被意外禁用
3. 運行：
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables 
   WHERE schemaname = 'public';
   -- 所有表的 rowsecurity 應為 true
   ```

### 問題 3：積分沒有被發放

**症狀**：訂單完成，但 `store_credit_ledger` 中沒有新記錄

**解決**：
1. 檢查訂單狀態是否真的變更為 `completed`
2. 檢查推薦人 ID 是否正確（不能為 NULL）
3. 檢查 `app_settings` 中的 `referral_cashback_rate` 設置
4. 查看瀏覽器控制台是否有錯誤信息

---

## ✅ 完整測試檢查清單

- [ ] **遷移已執行** - `referrer_tier_snapshot` 欄位存在
- [ ] **用戶註冊成功** - 新用戶在 `auth.users` 和 `profiles` 中
- [ ] **推薦碼生成** - 每個用戶有唯一的推薦碼
- [ ] **推薦人綁定** - 被推薦人的 `referrer_id` 正確
- [ ] **首次支付** - 訂單完成，積分發放一次
- [ ] **冪等性檢測** - 重複請求不發放重複積分
- [ ] **層級快照** - `referrer_tier_snapshot` 被正確保存
- [ ] **RLS 生效** - 用戶只能看到授權的數據
- [ ] **UTC 時區** - 過期日期為 UTC 且正確
- [ ] **錯誤恢復** - 支付失敗時有補償邏輯

---

## 🎯 下一步

1. ✅ 執行上述所有測試
2. 📝 記錄任何問題或異常
3. 🔄 修復發現的問題
4. 📊 準備完整的測試報告
5. 🚀 部署到生產環境

