# 補齊資料庫：待執行的 23 支 migration

## 為什麼需要這個資料夾

線上 Supabase 專案目前只跑過 `schema.sql` + `20260917000001`～`000006`。
實測比對確認：**12 張表 / 1 個 view / 25 條 RLS**，與只跑前 7 個檔案的結果完全一致。

`20260917000007` 之後的 **23 支 migration 從未執行**。程式碼早已依賴它們，
所以目前前後台有大量頁面會直接壞掉（下單防竄改、出貨、退款、換貨、
訂閱、行銷、香誌文章、贈品、對帳……）。

跑完之後：**28 張表 / 1 個 view / 43 條 RLS / 75 個函式**。

## 怎麼執行

到 Supabase Dashboard → SQL Editor，依序把 `01.sql` → `07.sql`
整段貼上按 Run。**一次一個檔案**，看到 Success 再貼下一個。

| 檔案 | 內容 |
|---|---|
| 01 | 下單金額防竄改、付款結算原子化、配送派工 |
| 02 | 訂單操作紀錄、庫存調整、推薦可見度、訂閱／經銷／退款、示範商品與圖片、會員等級規則 |
| 03 | 配送對帳、退款發票操作、會員角色型別修正、模擬發票 |
| 04 | **選用**：定期配送排程（見下方說明） |
| 05 | 部分退款與退貨、行銷活動與 VIP、訂單備註與揀貨 |
| 06 | 換貨出貨、購物金對帳、香誌文章、推薦獎勵活動 |
| 07 | 訂單贈品 |

### 04.sql 需要先啟用三個擴充套件

`pg_cron`、`pg_net`、`supabase_vault`。到 Database → Extensions 搜尋並啟用，
再跑 04。**不跑 04 只會少掉「定期配送自動排程」，其他功能完全不受影響**，
所以可以留到最後再處理。

### 出錯了可以直接重跑

每支 migration 都自帶 `begin/commit`，且全部改成可重複執行
（`if not exists` / `drop ... if exists` / `create or replace`）。
修正後原樣重貼即可，不會因為「物件已存在」而卡住。

## 驗證方式

在 PostgreSQL 16.13 上重現線上狀態（schema + 001～006 → 12 表 / 1 view / 25 RLS，
與線上截圖一致），再套用 01～07：

- 第一次執行：除 04（本機無 pg_cron）外全部 exit 0
- 第二次重跑同一批：結果相同，無「已存在」錯誤
- 最終表清單與「從零跑完 29 支 migration」的結果**逐項相同**

執行完成後可用這段確認：

```sql
select
  (select count(*) from information_schema.tables
     where table_schema='public' and table_type='BASE TABLE') as tables,   -- 應為 28
  (select count(*) from pg_policies where schemaname='public') as policies, -- 應為 43
  (select count(*) from information_schema.routines
     where routine_schema='public') as functions;                          -- 應為 75（含 04 則 78）
```
