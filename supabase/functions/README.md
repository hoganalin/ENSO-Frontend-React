# Supabase Edge Functions —— 金流 / 發票 / 簡訊

```
瀏覽器                     Edge Function（Deno）              第三方
────────                  ────────────────────               ──────
src/services/payment       payment-create  ──簽章─────────▶  綠界 AIO 付款頁
  /client.ts        ──▶    （驗身分、從 DB 重算金額）
                                                             綠界（付款完成）
                           payment-notify  ◀──ReturnURL───   ↓
                           （驗簽 → 完成訂單 → 發購物金
                             → 三竹簡訊 → 開發票）
```

**金鑰只存在 Edge Function 這一層。** 瀏覽器端一個都拿不到，也不需要。

## 目前的真實狀態（請先看這段）

| 元件 | 狀態 | 驗證方式 |
|---|---|---|
| `_shared/ecpay.ts` 簽章／驗簽 | **已完成** | 與綠界官方 SDK `ecpay_aio_nodejs@1.2.2` 逐字元比對一致（`deno test`） |
| `_shared/ecpay.ts` 表單組裝 | **已完成** | 單元測試涵蓋欄位、型別、金額驗證 |
| `_shared/mitake.ts` | **程式完成，未實打** | 號碼正規化與回應解析有測試；真正發送需要三竹帳號與點數 |
| `_shared/invoice.ts` | **骨架** | 未接通。所有不確定處標 `TODO(invoice-api)`，未設 `ECPAY_INVOICE_ENABLED=true` 時會直接 throw |
| `payment-create` | **程式完成，未端到端測試** | `deno check` 通過；沒有測試商店代號無法實際跑 |
| `payment-notify` | **程式完成，未端到端測試** | `deno check` 通過；冪等邏輯的 DB 約束已在 PostgreSQL 16 實測 |
| `005-payment-invoice.sql` | **已完成** | 在 PostgreSQL 16 上對著 schema.sql + 001~004 實跑，且重複執行無誤 |

「未端到端測試」的意思就是字面上的意思：**沒有任何一筆真實付款走過這條路。**
要驗證，必須先申請綠界測試商店、把 secrets 設好，再用綠界的測試卡跑一次。

## 檔案

```
supabase/functions/
├── _shared/
│   ├── cors.ts           CORS 標頭（payment-notify 不用，S2S 不受 CORS 約束）
│   ├── response.ts       統一回應格式 + 綠界要求的 `1|OK` 純文字回覆
│   ├── supabaseAdmin.ts  service_role client（繞過 RLS）與身分驗證
│   ├── ecpay.ts          CheckMacValue 產生／驗證、表單組裝、回調解析
│   ├── ecpay.test.ts     ⭐ 與綠界官方 SDK 對比簽章的測試
│   ├── mitake.ts         三竹簡訊
│   ├── mitake.test.ts
│   └── invoice.ts        綠界電子發票 B2C（骨架）
├── payment-create/index.ts   POST { orderId } → 已簽章的綠界表單欄位
└── payment-notify/index.ts   綠界 ReturnURL 回調 = 訂單完成的唯一真實來源
```

## 需要的 Supabase secrets

```bash
# ── 綠界金流（必要）────────────────────────────────
supabase secrets set ECPAY_MERCHANT_ID=2000132
supabase secrets set ECPAY_HASH_KEY=ejCk326UnaZLtqKGEqNSAqVHWN7Fh4P7
supabase secrets set ECPAY_HASH_IV=XUIkCcrwf6Pz7IKU5M3P5Q
supabase secrets set ECPAY_IS_PRODUCTION=false      # 正式收款才改 true

# ── 前端網址（選填但建議）──────────────────────────
supabase secrets set SITE_URL=https://enso.example.com
supabase secrets set ALLOWED_ORIGINS=https://enso.example.com,http://localhost:5173

# ── 綠界回調網址（選填）────────────────────────────
# 不設就自動用 ${SUPABASE_URL}/functions/v1/payment-notify。
# 只有在用自訂網域、或本機用 ngrok 測試時才需要覆寫。
supabase secrets set ECPAY_RETURN_URL=https://<你的專案>.supabase.co/functions/v1/payment-notify
# 付款完成後要把使用者 POST 回哪一頁（沒設就顯示綠界自己的結果頁）
supabase secrets set ECPAY_ORDER_RESULT_URL=https://enso.example.com/payment/result

# ── 三竹簡訊（必要，否則推薦通知只會寫進 sms_log 的 failed）──
supabase secrets set MITAKE_USERNAME=xxx
supabase secrets set MITAKE_PASSWORD=xxx
# 若三竹給的端點與預設不同，可覆寫（預設 https://smsapi.mitake.com.tw/api/mtk/SmSend）
supabase secrets set MITAKE_API_URL=...

# ── 電子發票（尚未接通，全部選填）──────────────────
supabase secrets set ECPAY_INVOICE_MERCHANT_ID=...
supabase secrets set ECPAY_INVOICE_HASH_KEY=...        # 32 碼
supabase secrets set ECPAY_INVOICE_HASH_IV=...         # 16 碼
supabase secrets set ECPAY_INVOICE_IS_PRODUCTION=false
supabase secrets set ECPAY_INVOICE_ENABLED=true        # ⚠️ 只有在確認完 TODO(invoice-api) 後才設
```

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 是 Edge Runtime
**自動注入**的保留名稱，不要（也不能）用 `supabase secrets set` 設定。

驗證目前設了哪些：`supabase secrets list`。

## 本機開發

```bash
# 1. 資料庫 migration（005 必須先跑）
#    Supabase Dashboard → SQL Editor 貼上 supabase/migrations/005-payment-invoice.sql

# 2. 本機起函式（讀 supabase/.env.local 當環境變數）
supabase functions serve --env-file supabase/.env.local

# 3. 綠界回調要能從外網打進來 → 開一條 tunnel
ngrok http 54321
#    然後把 ECPAY_RETURN_URL 設成
#    https://<ngrok-id>.ngrok-free.app/functions/v1/payment-notify

# 4. 單元測試（需要安裝 deno；以下是實際驗證過的指令）
#    --allow-write 與 --node-modules-dir=auto 是必要的：ecpay.test.ts 會抓
#    npm 上的綠界官方 SDK 來對比簽章，deno 需要把它落地到 node_modules。
deno test --allow-net --allow-env --allow-read --allow-write \
  --node-modules-dir=auto supabase/functions/_shared/
deno check --node-modules-dir=auto \
  supabase/functions/payment-create/index.ts supabase/functions/payment-notify/index.ts
deno lint supabase/functions/
```

`supabase/.env.local` 不要進版控（`.gitignore` 已包含 `.env*`，請確認）。

## 部署

```bash
supabase functions deploy payment-create
# ⚠️ payment-notify 必須關掉 JWT 驗證：綠界不會帶 Supabase 的 JWT。
supabase functions deploy payment-notify --no-verify-jwt
```

也可以寫進 `supabase/config.toml`（這樣就不用每次記得加參數）：

```toml
[functions.payment-notify]
verify_jwt = false
```

`payment-notify` 是**公開端點**。它的防線只有兩道：CheckMacValue 驗簽、
以及金額必須等於 DB 裡的金額。這兩段程式碼不要為了方便而放寬。

## 人類必須自己去設定的東西

### 1. 綠界金流（https://vendor.ecpay.com.tw）

1. 申請商店代號，取得 **MerchantID / HashKey / HashIV**（測試與正式是兩組）。
2. 廠商後台 → 系統開發管理 → **系統設定**：填入
   - Server 端回傳付款完成網址（背景回調）：`https://<專案>.supabase.co/functions/v1/payment-notify`
   - Client 端回傳付款完成網址：前端的結果頁（可留空）
   這是「預設值」；我們送出的表單裡的 `ReturnURL` 會覆蓋它，但後台也填好比較不容易出事。
3. 回調網址**必須是公開可連線的 https**。localhost 絕對收不到回調 —— 本機一定要用 ngrok。
4. 用綠界的測試卡號跑一次（測試環境卡號：4311-9522-2222-2222 / 12月任意年 / 222），
   然後檢查：`payment_transactions.status = 'paid'`、`orders.status = 'completed'`、
   `store_credit_ledger` 有一筆 earn、`sms_log` 有一筆紀錄。

### 2. 三竹簡訊（https://sms.mitake.com.tw）

1. 申請帳號並**儲值**（沒點數會回 `statuscode` 錯誤碼，不會拋錯）。
2. 確認帳號有沒有開「**IP 白名單限制**」。
   ⚠️ Supabase Edge Function **沒有固定出口 IP**，若三竹端鎖了 IP，簡訊會全部失敗。
   請向三竹確認能否關閉限制，或改走有固定 IP 的中繼。這一點沒確認就別當作已完成。
3. 跟三竹確認 API 端點與參數名稱（我們預設
   `https://smsapi.mitake.com.tw/api/mtk/SmSend?CharsetURL=UTF8`，
   欄位 `username/password/dstaddr/smbody`）。不同版本的文件有差異。

### 3. 電子發票（尚未接通）

1. 向綠界申請**電子發票商店代號**（與金流的商店代號是不同的帳號），
   並在財政部完成字軌配號 —— 沒有字軌，API 一定回失敗。
2. 打開 `_shared/invoice.ts`，逐一確認 `TODO(invoice-api)`：
   端點路徑、`RqHeader` 形狀、開票欄位名稱、`Items` 陣列欄位、回應欄位名稱。
3. 與會計確認兩件會計政策問題：
   - **運費要不要開進發票**（目前實作把差額當成一個「運費」品項）
   - 折扣後的發票金額怎麼呈現
4. 確認完才設 `ECPAY_INVOICE_ENABLED=true`。在那之前，`invoices` 表會留下
   `status='pending'` + 原因，付款流程不受影響。

#### 另一條路：讓綠界在付款時直接開票

綠界 AIO CheckOut 支援 `InvoiceMark=Y`，在付款表單裡帶上發票欄位，
付款成功時綠界自動開票，**完全不需要 `invoice.ts` 這支 API**。
這組欄位名稱有官方 SDK 的參數定義檔（`ecpay_aio_nodejs` 的 `ECpayPayment.xml`）
可以核對，可信度比自己猜 B2C API 高很多：

```
InvoiceMark=Y 時必填（可為空字串）：
RelateNumber, CustomerID, CustomerIdentifier, CustomerName*, CustomerAddr*,
CustomerPhone, CustomerEmail*, ClearanceMark, TaxType, CarruerType, CarruerNum,
Donation, LoveCode, Print, InvoiceItemName*, InvoiceItemCount, InvoiceItemWord*,
InvoiceItemPrice, InvoiceItemTaxType, InvoiceRemark*, DelayDay, InvType
（* = 該欄位的值要先自己做一次 UrlEncode 再加入表單）
（注意綠界的拼字是 Carruer，不是 Carrier；多品項用 `|` 分隔）
```

建議正式上線前先評估這條路。若採用，`invoice.ts` 可整份刪除。

## 還沒補的洞（誠實清單）

1. **訂單金額仍由瀏覽器寫進 DB。**
   `orders` 的 insert policy 只檢查 `buyer_id = auth.uid()`，不檢查金額，
   所以瀏覽器可以 insert 一張 `total = 1` 的訂單。
   `payment-create` 會拿 `order_items` 對 `products.price` 重算、驗算術恆等式並擋下來，
   但**折扣金額（discount）無法在伺服器端重算**（要重算就得把 `domain/promotions.ts`
   整套移植成 Deno 版）。目前只能檢查 `0 ≤ discount ≤ subtotal`。
   根治方式：訂單改由 Edge Function 建立，或加 DB trigger 重算。
2. **退款／發票作廢流程沒做。** `invoices.status` 留了 `voided`，但沒有程式會寫入。
   `src/services/db/storeCredit.ts` 的 `reverseCreditForOrder()` 也還沒有任何
   伺服器端的觸發點。
3. **`referrer_tier_snapshot` 存錯人。**
   `src/services/db/checkout.ts` 的 `placeOrder()` 寫入這個欄位時查的是
   「買家」的 `member_tier`，不是推薦人的。`payment-notify` 刻意沿用同一份快照，
   好讓兩條路徑結果一致 —— 修的時候要兩邊一起修。
4. **ATM／超商付款的「取號」通知沒處理。** 目前只處理付款完成的回調；
   ATM 虛擬帳號與超商繳費代碼是走 `PaymentInfoURL`，還沒有對應的函式。
5. **簡訊送達狀態沒回收。** `sms_log.mitake_msgid` 有存，但沒有查詢送達狀態的排程，
   也沒有接三竹的 callback。
