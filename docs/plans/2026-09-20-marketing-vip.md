# 行銷分群、會員訊息及 VIP 使用權限

原始《系統需求.docx》要求「行銷人員：優惠、內容、活動、會員分群、訊息」與「VIP 會員：VIP 折扣、生日禮、限定商品、優先活動」。沿用既有 normal/silver/gold 等級，gold 對應 VIP 金卡。訊息採站內信，沒有發送真實 SMS。

## 完成範圍

- 後台 `#/admin/marketing` 僅行銷與管理員可進入。選全部/一般/銀卡/金卡/尚未購買/已購買分群，預覽會員，再輸入標題內容發佈站內訊息。分群不包含工作人員；已購買定義為 paid/shipped/completed。
- 發佈以唯一 request ID 冪等，同一內容重試不重複建立。相同 ID 修改內容會被拒絕。分群收件名單在發佈時重新計算並保存個別收件項目，會員於「優惠與活動」查看；RLS 僅允許讀自己的訊息。
- 商品可以設定永久 VIP 限定、一般開放時間與 VIP 提早開放時間。前台明示限制，checkout-create 依資料庫會員等級檢核，order_items insert trigger 再次檢核當時等級與商品設定。使用者傳入金卡或商品價格無法繞過。
- 優惠活動可以設定 VIP 提前使用時間。既有優惠碼、首購等條件仍然生效；普通會員在一般開始時間才可用，結束時間不延長。
- Migration：`20260919000006_marketing_vip.sql`。需部署更新的 checkout-create。無其他新增 Edge Function。

## 驗證

`vipAccess.test.ts` 包含非VIP拒絕、VIP允許、提早窗口、開放邊界、結束時間與其他優惠資格。新增 9 項，與 trustedCheckout/memberCommerce 合計 38 項通過。

`supabase/tests/marketing_vip_acceptance.sql` 是 rollback 資料庫驗收：會員分群、一般會員禁止發佈與查分群、重試不重複、RLS 僅看本人訊息、直接資料庫新增品項仍受 VIP 限制。測試訊息全部 rollback，不發 SMS。此文件不表示遠端驗收已執行。

後台 production build 通過；有既有 CSS import 順序及 bundle 大小提示。全套整合結果由主 agent 統一記錄。
