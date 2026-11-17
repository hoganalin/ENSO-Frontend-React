# 付款回呼原子更新

## 問題與修正

舊回呼先把 payment_transactions 標為 paid，再更新訂單、發購物金。後兩步失敗時，重試會因交易已 paid 而略過，造成永久缺帳。

migration 008 新增 settle_ecpay_payment，由已驗簽的回呼呼叫。它鎖定訂單與交易，將付款、訂單、購物金放進同一筆 PostgreSQL 交易。settled_at 區分已完成的新流程與舊程式留下的半完成紀錄，後者可由有效回呼重送修復。

- 驗證交易存在、金額同時符合交易與訂單、付款流水號一致。
- 成功通知重送不重複發購物金；失敗通知不覆蓋已付款狀態。
- 保留已出貨狀態。已取消／退款訂單收到付款，或同訂單第二筆成功交易，記錄 settlement_outcome=review_required，交人工對帳。
- RPC 僅授權 service_role；瀏覽器不可呼叫。
- 回呼拒絕錯誤商店編號、不完整整數金額及正式環境的 SimulatePaid。
- 發票讀取收件手機時相容新表單的 tel 欄位。

## 驗證

本機 PGlite 已驗證 migration 008 重複套用、金額拒絕、刻意中斷購物金寫入的完整回滾、重試只發一次、舊半完成交易修復、銀卡不發購物金、取消訂單與重複扣款標記、保留出貨狀態、瀏覽器 RPC 權限拒絕。

腳本：專案外 ENSO-verification-2026-09-16/verify-payment-sql.mjs，傳入本專案絕對路徑即可執行。PGlite 未驗證多個獨立資料庫連線的並發；線上 Supabase/JWT/Edge 與綠界端到端仍需測試。

2026-09-17 確認結果：回呼入口 src/test/paymentNotify.test.ts 的 7 項測試全部通過；npm run build 通過。既有 Sass 棄用與 bundle 大小警告仍在。本輪未重跑上一階段的全部 110 項測試。

## 部署與剩餘工作

先部署 migration 008，再更新 payment-notify。此次僅修改本機，未部署或發出真實付款、簡訊。

移除依 order_no 猜測交易的舊救援路徑；缺少 payment_transactions 的歷史通知會拒絕，需人工核對後補齊交易，不能憑訂單號直接入帳。

簡訊／發票仍在資料庫交易提交後呼叫外部服務。中途崩潰的自動補送、外部服務冪等與後台對帳操作尚未完成，不宣稱完整付款流程已可上線。
