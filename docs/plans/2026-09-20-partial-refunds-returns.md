# 部分退款與退貨驗收（測試模式）

- 退款每次用 UUID request key；同 key 及相同內容重送回傳原申請。所有非 rejected 申請合計不得超過訂單總額，並鎖定訂單防止併發超額。
- 成功退款逐筆累計；未達全額保留原出貨狀態，達全額設 refunded。購物金按累計退款比例向下取整，僅追加差額 reverse，最後全退回沖完整原額。
- uncertain 不允許直接 rejected 釋放額度，財務須先模擬對帳為成功或明確失敗。已成功不可改寫；failed 可重試或拒絕。
- 退貨驗收與退款獨立，限 warehouse/admin。訂單須有 shipped_at，每件累計驗收不超過原件數。receipt UUID 避免重複加庫存，保留 inventory_logs 和 operation_logs。
- 會員訂單顯示退款歷史與可申請金額；後台售後顯示退貨件數與驗收入庫表單。

驗證：前台 build、後台 build 通過；paymentPage + refundRequest 共 14 tests 通過。資料庫驗收腳本 supabase/tests/partial_refunds_returns.sql 使用 BEGIN/ROLLBACK，需整合環境執行；本分工未部署。

適用範圍：測試金流；不會呼叫真實退款或簡訊供應商。部分退款的電子發票折讓尚未串接供應商；既有模擬整張作廢按原功能提供。

## 同品項換貨重寄
20260919000008_exchange_shipments.sql 新增驗收 receipt 對應的換貨出貨紀錄。每份驗收紀錄的換貨合計不得超過已收件數，出貨檢查並扣庫存；重送同 UUID 不重扣。後台填新物流單號，會員訂單可查看。

測試模式規則：退款與換貨採整張訂單互斥。已換貨訂單不接受新的退款申請；有非拒絕退款申請不能換貨，避免雙重補償。此版僅同品項，跨商品／價差需求走退貨退款後重新購買。

前後台 build 通過；付款頁＋售後會員 UI 共 15 項 tests 通過。SQL 回滾驗收 supabase/tests/exchange_shipments.sql 已提供主 agent 整合，涵蓋角色、缺貨、驗收額度、冪等及退款互斥。
