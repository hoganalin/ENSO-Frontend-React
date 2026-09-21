-- Use the curated ENSO category artwork already shipped with the frontend.
update public.products
set image_url = case title
  when '芽莊沈香 · 臥香' then '/images/冥想香氣.png'
  when '老山檀香 · 線香' then '/images/放鬆紓壓.png'
  when '和敬 · 香道禮盒' then '/images/空間淨化.png'
end,
images_url = case title
  when '芽莊沈香 · 臥香' then jsonb_build_array('/images/冥想香氣.png')
  when '老山檀香 · 線香' then jsonb_build_array('/images/放鬆紓壓.png')
  when '和敬 · 香道禮盒' then jsonb_build_array('/images/空間淨化.png')
end
where title in ('芽莊沈香 · 臥香', '老山檀香 · 線香', '和敬 · 香道禮盒');
