# 測試站通知自動重試

採用 Supabase 官方的 [pg_cron + pg_net + Vault](https://supabase.com/docs/guides/functions/schedule-functions) 方式，每分鐘執行一次。既有 worker 僅領取到期 pending/failed，最多 5 次；sending 過期轉 uncertain，必須人工核對，不會自動重送。每輪最多 10 件，租約與 SKIP LOCKED 避免與人工處理重複領取。

## 部署

1. 套用 `20260919000003_scheduled_delivery.sql`。migration 建立 Vault 隨機專用 token，不含服務金鑰，也不會立即開啟排程。
2. `npx supabase functions deploy scheduled-delivery --no-verify-jwt`。JWT 驗證由專用的 Vault token 驗證替代；此 endpoint 不接受一般會員或管理員 JWT。
3. 確認 Edge secrets 中 `MITAKE_MODE=mock`、`ECPAY_INVOICE_ENABLED=false`。排程遇到實際供應商設定會回 409，避免測試站發出真實通知。停用中的真實發票工作仍遵循 5 次上限；模擬發票由既有後台功能建立。
4. 透過 SQL Editor 或受信任部署連線執行 `select public.configure_delivery_schedule('https://dznzipfuqtpkvklmlywt.supabase.co');`。重複執行更新同一排程。
5. 執行 `supabase/tests/scheduled_delivery_acceptance.sql`；此測試全部 rollback，不發出 HTTP。
6. 至少等待下一個分鐘刻度，查 `cron.job_run_details` 最近 `enso-delivery-retry` 紀錄及 `net._http_response` 回傳。Cron SQL success 只表示 HTTP 已入列，必須看 HTTP status=200 與 JSON processed/results 才是 worker 實際執行。

## 遠端驗收與維運

遠端實際重試測試需建立隔離的 paid 測試訂單和 due failed buyer_sms（有效虛擬手機），記下 fixture 工作 ID。等待排程後確認該 ID 的 attempts 增加、status=succeeded，sms_log 的 delivery_job_id 相同且 is_simulated=true。不能僅以本機測試或 cron SQL succeeded 宣稱遠端重試成功。

錯誤憑證驗收：POST 此 endpoint 不帶 token 或带 64 字元錯誤 token，必須回 401，且不領取任何工作。有效 token 只能由 Vault/cron 使用，不要貼至終端或聊天室。

停用：`select cron.unschedule('enso-delivery-retry');`，再啟用時重新呼叫 configure 函式。HTTP 409 表示 simulation 設定不符；503 表示 Vault/資料庫/worker 暫時不可用。回應不含底層錯誤、token 或個资。

本機測試：`npm test -- src/test/scheduledDelivery.test.ts src/test/delivery.test.ts src/test/deliveryReconciliation.test.ts`。本文件沒有宣稱遠端排程已部署或已驗收。
