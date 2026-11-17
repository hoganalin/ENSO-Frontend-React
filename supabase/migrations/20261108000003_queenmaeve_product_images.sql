-- 20261108000003_queenmaeve_product_images.sql
-- 王后美芙商品主圖：圖片檔放在前端 public/products/，image_url 用網站根相對路徑。
-- 以關鍵字比對 title（避免全形括號差異）。秘境桃花貴人噴霧暫無圖，保留空白。

update public.products set image_url = '/products/no5-oil.png'          where title like 'NO5%';
update public.products set image_url = '/products/spray-wealth.jpg'     where title like '招財納福%';
update public.products set image_url = '/products/candle-blessing.png'  where title like '全能祈福%';
update public.products set image_url = '/products/candle-cleansing.png' where title like '淨化除穢%';
update public.products set image_url = '/products/hair-mask.png'        where title like '瞬效%';
update public.products set image_url = '/products/hair-serum.png'       where title like '奇蹟強健養髮%';
update public.products set image_url = '/products/hair-oil.png'         where title like '賦活瞬光%';
update public.products set image_url = '/products/shampoo-fr-rose.png'  where title like '%貴族薔薇%';
update public.products set image_url = '/products/shampoo-in-cedar.png' where title like '%黑雪松%';
update public.products set image_url = '/products/shampoo-jp-grape.png' where title like '%葡萄藤%';
