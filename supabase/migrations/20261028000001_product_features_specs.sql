-- Queen Maeve catalog: products use 產品特色 / 產品規格 / 產品描述 structure.
-- features: 產品特色 (free text, newline-separated bullets)
-- specs:    產品規格 (jsonb array of {label, value})
-- 產品描述 continues to use the existing products.content column.
alter table public.products add column if not exists features text;
alter table public.products add column if not exists specs jsonb not null default '[]';
