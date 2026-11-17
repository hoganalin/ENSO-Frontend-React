# Hosted 付款回跳 HTTP 驗收

2026-09-30（台北時間）對現有 Supabase hosted `payment-result` 完成實際 HTTP 測試。

## 結果

| 情境 | 實際結果 |
| --- | --- |
| 公開 ECPay stage key 合法簽章、匹配交易與金額 | 303，Location 為 `http://localhost:5174/payment/{資料庫訂單 UUID}` |
| 錯誤簽章 | 400，沒有 Location |
| 合法簽章但金額不符 | 400，沒有 Location |
| 合法簽章但交易不存在 | 400，沒有 Location |
| 合法簽章但商店代號不符 | 400，沒有 Location |
| GET | 405 |
| 成功回跳是否直接改為已付款 | 訂單與交易都維持 pending，結算仍須 payment-notify |
| 自建 fixture 清理 | 使用者與訂單剩餘數 0，交易隨同刪除 |

## 重跑

在前台專案根目錄執行 `node scripts/payment-return-live.mjs`。需已登入、linked 的 Supabase CLI。腳本使用公开的 stage 簽章資料，建立獨立 synthetic 使用者／pending 訂單／交易，finally 清理自身資料，不接觸 browser-fixtures。輸出存於 ignored `tmp/payment-return-live-result.json`。

本項證明已部署 HTTP handler 的簽章檢查、資料庫對應與 303 回跳協定正常。沒有呼叫 ECPay 收銀台或 payment-notify，沒有實際刷卡，也未覆蓋瀏覽器在綠界付款完成後的整段導頁；那一段仍應另行瀏覽器驗收。
