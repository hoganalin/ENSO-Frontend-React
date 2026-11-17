# 售後測試模式實作

- admin-order-action 的 refund / void_invoice 限 finance 或 admin，且必須設定 AFTER_SALES_MODE=mock。
- mock adapter 不使用 fetch；成功、失敗、結果待對帳可模擬。操作參考號明確帶 MOCK 前綴。
- 000015 migration 增加 order ID 綁定、成功終態重送冪等、全額退款限制、推薦購物金回沖與操作稽核。
- 後台訂單視窗可查看退款申請、模擬三種結果、模擬已開立發票作廢。
- 未實作部分退款、退回物流/驗收入庫、真實供應商退款/作廢。

驗證：afterSales.test.ts 5 tests passed；後台 npm run build 通過（既有 CSS import 與 bundle 大小警告）。
尚未執行 SQL integration、部署 migration / function、瀏覽器多角色驗收。不能宣稱已完成端到端驗證。
