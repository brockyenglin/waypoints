insert into public.layers (id, title, category, kind, texture, opacity, caption, freshness, source) values
('leaf-area', 'Leaf area index', 'Habitat', 'overlay', 'textures/layer-leaf-area.png', 0.9, 'Leaf area index · NASA MODIS, monthly (2026-06) · via NASA Earth Observations', 'NASA · 2026-06', 'NASA'),
('vegetation', 'Vegetation (NDVI)', 'Habitat', 'overlay', 'textures/layer-vegetation.png', 0.85, 'Vegetation index · NASA MODIS, monthly (2026-06) · via NASA Earth Observations', 'NASA · 2026-06', 'NASA'),
('fires', 'Active fires', 'Conditions', 'overlay', 'textures/layer-fires.png', 0.9, 'Active fires · NASA MODIS, monthly (2026-07) · via NASA Earth Observations', 'NASA · 2026-07', 'NASA'),
('cloud-fraction', 'Cloud fraction', 'Conditions', 'overlay', 'textures/layer-cloud-fraction.png', 0.9, 'Cloud fraction · NASA MODIS, monthly (2026-07) · via NASA Earth Observations', 'NASA · 2026-07', 'NASA'),
('temperature', 'Land surface temp', 'Conditions', 'overlay', 'textures/layer-temperature.png', 0.9, 'Daytime land surface temperature · NASA MODIS, monthly (2026-07) · via NASA Earth Observations', 'NASA · 2026-07', 'NASA'),
('rainfall', 'Rainfall', 'Conditions', 'overlay', 'textures/layer-rainfall.png', 0.9, 'Monthly rainfall · NASA GPM IMERG (2026-07) · via NASA Earth Observations', 'NASA · 2026-07', 'NASA'),
('snow', 'Snow cover', 'Conditions', 'overlay', 'textures/layer-snow.png', 0.9, 'Snow cover · NASA MODIS, monthly (2026-07) · via NASA Earth Observations', 'NASA · 2026-07', 'NASA'),
('chlorophyll', 'Ocean chlorophyll', 'Ocean', 'overlay', 'textures/layer-chlorophyll.png', 0.9, 'Chlorophyll concentration · NASA MODIS Aqua, monthly (2026-05) · via NASA Earth Observations', 'NASA · 2026-05', 'NASA'),
('sst', 'Sea surface temp', 'Ocean', 'overlay', 'textures/layer-sst.png', 0.9, 'Sea surface temperature · NASA MODIS Aqua, monthly (2026-05) · via NASA Earth Observations', 'NASA · 2026-05', 'NASA')
on conflict (id) do update set caption = excluded.caption, freshness = excluded.freshness, updated_at = now();
