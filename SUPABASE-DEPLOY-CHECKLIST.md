# Supabase 與第三方測試部署清單

目前工作站沒有 Supabase CLI，且專案環境沒有部署 project ref、service-role key、綠界或三竹 secrets，因此本文件只提供可審核的部署順序；不在沒有這些資料時猜測或執行線上變更。

## 1. 連結測試專案

```powershell
supabase login
supabase link --project-ref <TEST_PROJECT_REF>
supabase db push
```

Migration 必須一次套用 007–013。`db push` 後確認 `supabase_migrations.schema_migrations` 已包含每一支，並在測試帳號驗證：訪客不能建單／改價；客服只能改收件資料；倉管可調庫存與出貨；財務可處理退款／通知；管理員可處理全部。

## 2. 設定 Edge secrets（只在 Supabase Dashboard 或 CLI secret store）

```powershell
supabase secrets set ECPAY_MERCHANT_ID=<test>
supabase secrets set ECPAY_HASH_KEY=<test>
supabase secrets set ECPAY_HASH_IV=<test>
supabase secrets set ECPAY_IS_PRODUCTION=false
supabase secrets set MITAKE_USERNAME=<test>
supabase secrets set MITAKE_PASSWORD=<test>
supabase secrets set ECPAY_INVOICE_ENABLED=false
```

只有取得綠界發票商店代號、16-byte AES HashKey/HashIV、字軌與紙本寄送政策並完成測試後，才設定 `ECPAY_INVOICE_ENABLED=true`。三竹與綠界均先用測試帳號；不要把 secrets 寫入 `.env` 或前端 bundle。

## 3. 部署函式

```powershell
supabase functions deploy checkout-create
supabase functions deploy payment-create
supabase functions deploy payment-notify --no-verify-jwt
supabase functions deploy admin-order-action
supabase functions deploy delivery-process
```

## TapPay 金流（信用卡 + LINE Pay）

> 2026-11 導入 TapPay 取代綠界。信用卡同步結算；LINE Pay 走 payment_url 轉導 + webhook 非同步查證結算。

Secrets（Dashboard 或 CLI；Partner Key 僅後端，勿進 git/前端）：
```powershell
supabase secrets set TAPPAY_PARTNER_KEY=<partner_key>
supabase secrets set TAPPAY_MERCHANT_ID=queen285_GP_POS_3           # 信用卡收單商店
supabase secrets set TAPPAY_MERCHANT_ID_LINEPAY=queen285_LINEPAY    # LINE Pay 收單商店
supabase secrets set TAPPAY_ENV=sandbox                            # sandbox | production
supabase secrets set SITE_URL=http://localhost:5173                # LINE Pay 轉導；正式改正式網域
```

部署：
```powershell
supabase functions deploy checkout-create
supabase functions deploy tappay-pay
supabase functions deploy tappay-notify --no-verify-jwt   # webhook 必加，否則 TapPay 回呼被擋 401
```

- 前端 `.env.local`：`VITE_TAPPAY_APP_ID` / `VITE_TAPPAY_APP_KEY` / `VITE_TAPPAY_ENV`（sandbox|production）。
- TapPay 後台「應用程式 → Web Domain Name」需加入網域（本機測試加 `localhost`）。
- 正式上線：換正式 App Key、`TAPPAY_ENV=production`、Merchant ID 改為業主真正的收單商店、`SITE_URL` 改正式網域。


綠界 ReturnURL 指向 `payment-notify`。通知 worker 可由受保護的管理員操作觸發；若要排程，使用 Supabase Cron/外部排程呼叫 `delivery-process`，不得把 service-role key 放前端。

## 4. 測試交易與對帳

1. 前台測試帳號完成下單，確認訂單狀態由 pending → paid → shipped → completed。
2. 在綠界測試環境完成付款，確認回呼重送不重複購物金。
3. 驗證買家簡訊、推薦人簡訊、發票工作均入列且可成功／失敗／uncertain 對帳。
4. 建立退款申請；財務先在綠界完成退款，再以後台寫入 provider reference 與結果。`uncertain` 不可直接重送。
5. 以每種角色各執行允許及禁止操作，記錄結果與時間。

## 5. 正式環境門檻

測試交易、發票號碼、簡訊 msgid、退款 provider reference 與角色驗收全部留存後，才建立 production Supabase link、切換正式 secrets、設定 `ECPAY_IS_PRODUCTION=true`，並再次執行 pre-demo-check。正式部署仍需人工確認第三方帳號與付款政策。
