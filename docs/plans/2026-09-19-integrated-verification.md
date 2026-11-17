# ENSO 測試模式整合驗證（2026-09-19）

本輪已實作並部署到 Supabase 專案 dznzipfuqtpkvklmlywt，前後台網頁仍為本機程式。

## 完成項目

- 訂閱有效期、管理員續期（request ID 冪等）、經銷商折減與 trusted checkout 整合；後台會員設定入口。
- 模擬簡訊 success / failed / uncertain，手機正規化、內容、模擬標記、工作 ID；財務/管理員人工對帳、稽核與最多五次嘗試。
- 會員訂單明細頁全額退款申請；後台模擬退款三種結果，成功後購物金一次回沖。
- 後台建立模擬發票及作廢。模擬作廢禁止修改實際供應商發票。
- 付款頁商品照片、數量、小計；切換訂單不再沿用舊商品。
- checkout-success 讀取真實訂單狀態，移除路由對假訂單成功畫面的使用。
- payment-result 接收綠界簽章 POST、核對交易及金額，再以 303 GET 返回訂單頁。結算仍由 payment-notify 處理。

## 部署

新增 migrations 20260918000003、20260918000014、20260918000015、20260919000001、20260919000002 已套用。
000001 修正遠端整合測試發現的 user_role enum 與空字串 coalesce 型別錯誤。
六個函式：checkout-create、payment-create、payment-result、payment-notify、delivery-process、admin-order-action 已部署。
設定：AFTER_SALES_MODE=mock、MITAKE_MODE=mock、MITAKE_MOCK_RESULT=success、SITE_URL=http://localhost:5174。
回跳網址適用這台電腦；手機或其他主機不能使用 localhost 回到此網站。

## 實際驗證證據

- `npm test -- --pool=threads --maxWorkers=2`：187 passed，3 個 opt-in 遠端測試預設 skipped。
- opt-in `mockSmsLive.test.ts`：3 passed。實際呼叫 delivery worker 並寫入遠端 Supabase，確認 success/failed/uncertain、0912345678、NT$1,000、is_simulated。未呼叫簡訊供應商，fixture 訂單、工作、紀錄、使用者於 afterAll 清除。
- `supabase/tests/commerce_acceptance.sql`：遠端 PostgreSQL 通過續期冪等、到期折減歸零、未授權拒絕、退款與購物金回沖冪等、模擬發票建立/作廢、禁止假作廢真發票、簡訊對帳稽核及五次上限。整個 transaction rollback。
- `supabase db lint --linked --level error`：No schema errors found（mock invoice migration 之後執行）。
- 未登入 POST checkout-create、payment-create、delivery-process、admin-order-action 均 401；payment-result 假簽章 400。
- 前台 `npm run build`：通過；後台 `npm run build`：通過。仍有 Bootstrap Sass、CSS import 順序及 bundle 大小警告。
- 瀏覽器 http://localhost:5174/orders 可載入並顯示未登入提示；沒有已登入的多角色瀏覽器驗收。
- 只做了目前 src/dist 常見 secret 模式掃描（無匹配）與 tracked env 檢查（僅 .env.example），不能等同完整 Git history 安全稽核。

## 尚未完成／未驗證

- 自動定時重試排程未建立；目前付款通知觸發工作或後台手動執行重試。
- 真實綠界付款完成後的完整瀏覽器回跳尚未重刷測試；僅 handler 測試與遠端無效簽章拒絕驗證。
- 全角色登入操作、畫面尺寸、實際會員退款到財務處理的瀏覽器端到端驗收未完成。
- 部分退款、退貨物流／驗收入庫未實作。現行申請 RPC 仍容許較小金額，但新前台只送全額，complete_refund 明確拒絕部分退款。
- 庫存於出貨扣除，尚無結帳保留／逾時釋放；已出貨退款不自動回補庫存。
- 真實簡訊、正式金流／電子發票帳號與正式站部署不在本次測試模式完成範圍。

## 重現

前台：npm run dev -- --port 5174 --strictPort。
會員：我的訂單 → 訂單明細與退款 → 申請全額退款。
後台：訂單 → 退款與發票測試；通知工作 → 對帳；會員 → 訂閱設定。
遠端 SMS 測試需 ENSO_LIVE_SMS_TEST=1、ENSO_TEST_URL、ENSO_TEST_SERVICE_KEY，密鑰只透過程序環境提供，勿提交或貼入聊天。
