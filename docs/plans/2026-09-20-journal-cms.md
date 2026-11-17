# 香誌文章管理

新增後台 `#/admin/articles`：行銷與管理員可新增、編輯、儲存草稿、發布、下架（改為草稿）與刪除文章。包含標題、摘要、作者、封面、代表字、閱讀時間與正文。正文支援空白行分段、`## ` 小標及 `> ` 引言，全部以 React 文字節點呈現，不執行 HTML。

前台 `/journal` 合併資料庫已發布文章與原有靜態香誌；原有文章連結保留。新增文章採 UUID 固定連結，草稿、下架、刪除文章不會以靜態 fallback 洩漏。載入錯誤可重試，列表仍提供原有香誌閱讀。

`20260920000003_journal_articles.sql` 建立 journal_articles 及 RLS。公開查詢只能取得 published 且已到發布時間的文章；marketing/admin 才可寫入與閱讀草稿。資料庫記錄建立人、更新時間、發布時間與操作日誌。發布時間由 trigger 管理，修改為草稿會清除。

本機測試 `src/test/journalCms.test.tsx`：段落轉換、安全文字顯示、草稿/缺頁提示、錯誤後重試。
遠端資料庫驗收 `supabase/tests/journal_acceptance.sql`：實際切換 anon/authenticated 角色驗證 CRUD、草稿隱私、一般會員禁止寫入及下架。所有 fixture 與訊息 rollback。未在本子任務部署或執行遠端測試。
