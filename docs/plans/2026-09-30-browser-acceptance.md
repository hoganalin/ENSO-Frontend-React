# 2026-09-30 瀏覽器驗收

使用既有獨立 QA 帳號，正常 Supabase 登入，不使用 demo token。

- 財務：登入成功，月報成功讀取毛額/退款/淨額及日期口徑，購物金帳本讀取成功。未對真實會員執行對帳寫入。
- 管理員：登入成功，操作紀錄顯示先前 QA 揀貨紀錄；香誌編輯表單可載入；會員分群預覽可返回符合資格會員。未發送站內訊息。
- 經銷商：登入成功，會員中心經銷入口可用；經銷頁顯示三筆商品新圖片、未啟用訂閱時0%折減、本人空訂單對帳。未提交新訂單。
- 客服/倉管/一般會員先前驗收證據見2026-09-20-integrated-verification.md。

hosted付款回跳HTTP測試見2026-09-30-payment-return-live.md：合法簽章303，無效請求拒絕，不自行結算。尚未重新走完整綠界收銀台瀏覽器流程。

## 清理

已登出前後台QA帳號。browser-fixtures.mjs cleanup --apply exit0；清除manifest指定六帳號及唯一QA訂單，包含客服備註與揀貨紀錄。未清理其他使用者資料。

## 驗證界線

此次為瀏覽器畫面與讀取驗收，不能等同每個新增功能完整寫入端到端測試。行銷角色已補上真實登入與草稿寫入驗收，詳見下節。正式SMS/發票/金流不在測試模式範圍。

## 補充：行銷與手機介面實測

- 使用獨立 Supabase 行銷 QA 帳號正常登入，香誌草稿儲存成功；未發布文章。
- 直接進入財務報表顯示「沒有此頁權限」，返回後台首頁正常。
- 390px viewport 下行銷頁面無水平溢出（clientWidth/scrollWidth 均385）。截圖 tmp/marketing-mobile-verified.png。
- 前台商品初始顯示「商品載入中…」，完成後呈現三筆商品與圖片；避免載入期間誤顯示找不到商品，失敗提供重試，過期回應不覆蓋最新查詢。
- 空購物車顯示提示與「前往選購商品」連結，結帳按鈕停用。390px viewport 下 clientWidth/scrollWidth 均375，無水平溢出。截圖 tmp/cart-mobile-verified.png。
- 行銷帳號正常登出後，marketing-browser-fixture.mjs cleanup --apply exit0：清除唯一 QA 草稿、其一筆操作紀錄與 QA 帳號。
- 前台完整測試：30 files passed / 1 skipped，241 tests passed / 3 skipped；前台 build exit0。後台 build 由行銷介面代理驗證成功。
- 建置仍有既有 Sass 棄用與 bundle 大小警告，不影響此次建置成功。

以上只代表列出的實測範圍，尚不代表全部頁面及所有手機尺寸皆完成驗收。完整綠界收銀台至付款回跳瀏覽器流程仍待重新驗證；正式簡訊與正式發票未啟用，符合目前測試模式。
