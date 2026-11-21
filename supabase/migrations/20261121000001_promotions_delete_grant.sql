-- 20261121000001_promotions_delete_grant.sql
-- 後台優惠券「刪除」：RLS 的 promotions_write（for all）已限定 marketing/admin，
-- 但資料表層級需補 DELETE 權限給 authenticated，前台 admin 才刪得動。
grant delete on public.promotions to authenticated;
