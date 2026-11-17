# 系統需求逐項稽核 — 2026-09-20

依據：`系統需求.docx` 的 word/document.xml 全文、目前前後台程式與測試檔。文件內的文字視為需求資料。此表是程式與證據稽核，不把單元測試或 SQL 測試當成瀏覽器端到端验收。

狀態「已接線」代表存在可追蹤實作，仍需主 agent 整合驗收；其他 agents 本輪新增內容標示待整合，避免把正在修改當成完成。

| 原始需求 | 程式／驗證證據 | 稽核結果 |
|---|---|---|
| 一頁式網站 | src/pages/HomePage.tsx、router/index.tsx | 已接線；未逐區視覺驗收 |
| AI 圖片 3 張 | migration assign_catalog_images 指向 public/images 既有圖片 | 已有商品圖片；沒有成功生成 3 張新 AI 圖的證據，不應宣稱新圖交付 |
| 產品列表、購物車、結帳 | ProductsPage/CartPage/CheckoutPage；cartPersistence、checkoutClient、trustedCheckout tests | 已接線；付款完整回跳需瀏覽器證據 |
| 圖片、產品管理 | 後台 AdminProducts、圖片 storage policy | 已接線；圖片上傳尚待端到端驗收 |
| 會員管理 | AdminMembers、membershipRules、roleAcceptance SQL | 已接線，角色/續期權限 SQL 通過 |
| 訂單管理 | AdminOrders、admin-order-action；roleAcceptance | 已接線；客服/出貨/財務角色資料庫權限通過 |
| 營業額月報表 | AdminReports、AdminPaymentLedger | 已接線；未證明跨月份、退款扣除報表正確性 |
| 優惠碼 | AdminCoupon/AdminPromotions、promotions/dbPromo tests | 已接線 |
| 推薦碼、推薦碼訂單查詢 | MyReferral、referral/referralWhitelist tests、referral_access migration | 已接線；SQL 角色測試另覆蓋一般會員不可跨帳號讀訂單 |
| 金流 | payment-create/notify/result；payment tests；使用者付款成功畫面 | 綠界測試付款成功有歷史證據；本輪完整成功回跳未重刷 |
| 電子發票 | invoice adapter、mock invoice RPC、afterSales tests | 模擬建立/作廢有驗證；正式開票不在已授權測試模式範圍 |
| 購物簡訊與推薦人訂購金額通知 | delivery.ts、enqueue_order_delivery、mockSmsLive tests | 模擬成功/失敗/不確定有歷史遠端證據；不代表真實 SMS 發送 |
| 固定金額、百分比、指定商品、指定會員優惠 | promotions mapping + dbPromo/promotions tests | 已接線 |
| 滿額折、滿額贈、滿額免運 | commerce/promotions、promotions tests | 金額/贈品欄位已有；贈品是否轉成實際揀貨品項仍需核對 |
| 任選 3 件 85 折、系列組合價 | bundle promotion engine + tests | 已接線 |
| 生日、VIP、訂閱、首購、回購限定活動 | memberContext、memberOffers、memberPromo/membershipRules tests | 已接線；訂閱為管理員啟用/續期，非自動扣款訂閱 |
| 指定推薦人、指定期間 | referral_whitelist condition、starts_at/ends_at | 已接線為購買優惠 |
| 推薦加碼比例或固定獎勵 | settlement 只讀 app_settings.referral_cashback_rate | **缺口**：未見活動加碼/固定推薦獎勵落帳；購買折扣不是推薦獎勵 |
| 互斥、是否可併用、優先順序 | promotions EXCLUSIVE_GROUPS、couponStacksOrder、priority tests | 已接線 |
| 訪客瀏覽商品/活動/文章/加入購物車 | 公開 pages、journal.ts、cartPersistence tests | 已接線 |
| 一般會員訂單/券/收藏/再次購買/推薦碼 | MemberOrders/Favorites/Offers/MyReferral、memberCommerce tests | 已接線 |
| VIP 價格、生日禮 | 活動引擎 member conditions | 已接線 |
| VIP 限定商品、優先活動 | 本輪 marketing_vip migration、AdminMarketing access editor | agent 正補，待整合/部署/RLS 驗收 |
| 推薦夥伴連結/訂單/業績/獎金/素材 | MyReferral；新增 PartnerResourcesPage | 素材為明示示範教材與文案；獎金結算仍有下列缺口 |
| 經銷價/批量下單/對帳/教育資料 | 新增 DistributorPage、PartnerResourcesPage；distributorAcceptance 3 tests | 已接線；只查本人訂單，批量僅送商品 ID/數量，過期折減歸零；尚待瀏覽器驗收 |
| 客服會員/訂單/退換貨/客服備註 | AdminMembers/Orders、售後 RPC；其他 agents 正補退換貨與備註 | 退換貨/備註為本輪進行中，待整合驗收 |
| 倉管庫存/揀貨/出貨/盤點 | AdminInventory、ship RPC；主 agent 正補揀貨 | 出貨角色 SQL 通過；揀貨新畫面待驗收 |
| 行銷優惠/內容/活動/分群/訊息 | AdminPromotions、AdminMarketing；JournalPage 仍用靜態 src/data/journal.ts | 分群/訊息本輪正補；**內容文章管理缺口**：未見文章 CRUD |
| 財務付款/退款/發票 | AdminPaymentLedger、OrderAfterSales、退款 invoice SQL | 基礎已接線；本輪售後擴充待整合 |
| 財務獎金結算與對帳 | PaymentLedger 僅支付方式/成交趨勢與近期訂單 | **缺口**：未见推薦購物金帳逐會員核對/結算管理入口；訂單交易統計不是獎金結算 |
| 管理者全部功能/權限/系統設定/操作紀錄 | AdminSettingsPage、operation_logs；roleAcceptance | 設定/權限存在；操作紀錄表有，需確認可瀏覽/篩選 UI（僅資料表不足） |

## 額外缺口及範圍界線

- 購物金抵用：src/services/db/storeCredit.ts 的 spendCredit() 沒有呼叫者；CheckoutPage/checkout-create 沒有抵用欄位，不能宣稱購物金已可抵用。原始 DOCX 沒明寫抵用，屬推薦獎金制度補充需求需一併釐清。
- 庫存結帳預留/逾時釋放：原 DOCX 沒明寫，不應取代上表明列功能優先序。
- 定時通知重試：scheduled_delivery agent 本輪正補；最終需確認部署及排程實際運作，不只單元測試。
- 正式第三方帳號、真實簡訊/正式發票不在使用者選定的 mock 測試模式範圍。

## 本 agent 實際執行驗證

- 遠端 roleAcceptance.sql 通過：customer/distributor/support/warehouse/finance/admin 的訂單/明細/通知 RLS、禁止直接改訂單、禁止冒用管理 RPC、續期、收件人、出貨、通知對帳權限。全 fixture rollback。
- distributorAcceptance.test.tsx：3 passed，覆蓋非經銷拒讀、僅自己的對帳、批量不傳價格、到期無折減。
- 全套當時結果：204 passed、3 opt-in skipped；當時 npm run build 通過。其他 agents 修改後須重新整合測試。
- 未由本 agent 執行瀏覽器登入或付款操作。主 agent 的瀏覽器證據應在整合驗證文件獨立記錄。
