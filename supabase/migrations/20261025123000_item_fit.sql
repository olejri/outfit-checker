-- Per-item fit: how each side's photo is cropped, rotated and placed on the 3D
-- garment, plus garment shape (length, looseness, sleeves, neckline), e.g.
--   {"photos": {"front": {"rotate": 3, "crop": [0, 0.05, 1, 0.9], "offset": [0, 0.02], "scale": 1.1}},
--    "shape": {"length": 0.6, "sleeve": 1}, "source": "manual"}
-- Older items have '{}' and use the template defaults.
-- Idempotent: safe to run more than once.
alter table public.items add column if not exists fit jsonb not null default '{}'::jsonb;

-- Shared outfits also return the fit, so they look the same as in the owner's studio.
create or replace function public.get_shared_outfit(token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'name', o.name,
    'avatar', o.avatar,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'name', i.name, 'category', i.category,
        'image_path', i.image_path, 'color', i.color, 'tags', i.tags, 'views', i.views,
        'fit', i.fit))
      from public.outfit_items oi
      join public.items i on i.id = oi.item_id
      where oi.outfit_id = o.id), '[]'::jsonb)
  )
  from public.outfits o
  where o.share_token = token and o.is_public
$$;
