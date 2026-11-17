# SMS 模擬與人工對帳驗證（2026-09-18）

## 已實作
- MITAKE_MODE=mock：不讀取供應商帳密，不呼叫 SMS API。
- MITAKE_MOCK_RESULT=success / failed / uncertain：分別成功、可重試失敗、待人工對帳。
- sms_log 儲存 is_simulated、delivery_job_id、收件人正規化手機及內容。
- delivery-process reconcile：僅 finance/admin 可用。操作者由認證取得，客戶端不可指定。
- reconcile_delivery_job RPC 僅 service_role 可呼叫，再驗證操作者角色；資料列鎖防止重複對帳。
- 對帳需核對紀錄；確認已送出需供應商單號；確認未送出可重排，保留 5 次嘗試上限。
- 發票確認成功需先有 issued 發票紀錄。
- delivery_reconciliations 保留操作者、時間、證據、原狀態和結果。
- 後台通知頁增加對帳表單；原有處理按鈕可執行到期失敗工作或已重排工作。

## 實際執行驗證
- npm test -- src/test/delivery.test.ts src/test/deliveryReconciliation.test.ts：18 / 18 通過。
- 涵蓋 mock 三種結果、電話格式與內容、零 provider 呼叫、失效 lease、紀錄寫入失敗、未登入/無權限、缺少證據、操作者偽造、資料庫衝突、舊 requeue 操作拒絕。
- 後台 npm run build：成功；既有 CSS @import 順序與 chunk 大小警告仍在。

## 驗證邊界與部署順序
本次未部署、未發送真簡訊。RPC SQL 尚未在 PostgreSQL 執行驗證；UI 尚未在瀏覽器互動驗收。自動定時排程尚未新增；工作由付款事件或管理員處理按鈕啟動。

先套用 20260918000014_delivery_reconciliation.sql，再部署 delivery-process 與任何 import delivery.ts 的函式（例如 payment-notify）。若舊版本 14 已部署，需將變更轉成新的 migration，不能依赖修改舊檔重跑。
