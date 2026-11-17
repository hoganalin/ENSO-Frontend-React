-- Replace only the original demo artwork; preserve any merchant-uploaded images.
update public.products
set image_url = '/images/enso-sandalwood-ai.png', images_url = '["/images/enso-sandalwood-ai.png"]'::jsonb
where title = '老山檀香 · 線香' and image_url = '/images/放鬆紓壓.png';
update public.products
set image_url = '/images/enso-gift-ai.png', images_url = '["/images/enso-gift-ai.png"]'::jsonb
where title = '和敬 · 香道禮盒' and image_url = '/images/空間淨化.png';
update public.products
set image_url = '/images/enso-agarwood-ai.png', images_url = '["/images/enso-agarwood-ai.png"]'::jsonb
where title = '芽莊沈香 · 臥香' and image_url = '/images/冥想香氣.png';
