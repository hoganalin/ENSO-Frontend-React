# 2026-09-20 整合驗證

## 已部署到測試 Supabase

- 20260919000006–000008：VIP/分群站內訊息、客服備註與揀貨、同品項換貨。
- 20260920000002–000005：購物金對帳、文章管理、推薦活動加碼、訂單贈品。
- admin-order-action、checkout-create 已重新部署。

## 已實際執行

遠端 transaction rollback 驗收全部 PASS：marketing_vip_acceptance、exchange_shipments、order_operations_notes、creditAuditAcceptance、journal_acceptance、referral_reward_campaigns、order_gifts。

驗證範圍包含角色權限、顧客資料隔離、付款重播、部分退款回沖、贈品快照、出貨庫存不足原子回滾及重複出貨。

實際自然排程驗收 `scheduled-delivery-live.mjs` PASS：run b14fa72d-c6e9-4623-9d2a-abdddd9978b8；failed attempts=1 經 cron 變為 succeeded attempts=2；有 HTTP 回應對應 job、唯一一筆模擬 SMS 紀錄；cleanup PASS。未真實發送 SMS。

瀏覽器實際使用獨立 QA 帳號：客服登入、搜尋自己的 QA fixture 訂單並成功儲存內部備註；倉管登入、可讀備註但不可修改收件人，確認揀貨後顯示完成時間。僅操作 QA-mu8j9wt8，沒有修改使用者真實訂單。

## 尚待完成

- 2026-09-29 前台完整測試 226 passed / 3 opt-in skipped；付款算術補測另 23 passed。後台 build 通過。
- 其餘角色瀏覽器驗收與 QA fixtures 清理。
- 月報部分退款淨額已修，node --test tests/refundReport.test.mjs 通過部分/全額/失敗/跨月退款。
- 三張 AI 新圖已生成並於 2026-09-29 接入三筆示範商品，見 2026-09-29-catalog-images.md。
- 完整付款成功自動回跳尚未本輪重新走綠界測試頁。

此文件記錄具體已執行證據，不代表整個原始需求已完成。正式金流、真實 SMS 與正式電子發票不在使用者選定的測試模式範圍。

## 2026-09-29 相容性修正

- subtotal 維持折前商品金額，付款驗算 gross - discount + shipping，避免舊折扣訂單重複扣折；000006 僅修正註解，payment-create 已重新部署。
- 推薦函式保留交易鎖、金額檢查、付款重播及活動加碼。新增000002_net_referral_rewards修正以total-shipping_fee計算折後商品回饋。遠端tier_cashback_acceptance與referral_reward_campaigns均PASS。
- 修正 AdminCreditLog/AdminReports 的不存在 Supabase client import。
