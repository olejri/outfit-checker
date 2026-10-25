-- Extra photos of an item taken from other sides, used to texture the 3D garment
-- from every angle. Maps a side to a storage path, e.g.
--   {"front": "<uid>/a.png", "back": "<uid>/b.png", "left": "...", "right": "..."}
-- Older items have '{}' and keep using image_path alone.
-- Idempotent: safe to run more than once.
alter table public.items add column if not exists views jsonb not null default '{}'::jsonb;

-- Shared outfits also return the extra photos.
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
        'image_path', i.image_path, 'color', i.color, 'tags', i.tags, 'views', i.views))
      from public.outfit_items oi
      join public.items i on i.id = oi.item_id
      where oi.outfit_id = o.id), '[]'::jsonb)
  )
  from public.outfits o
  where o.share_token = token and o.is_public
$$;

-- ...and anyone with the share link may read those photos too.
create or replace function public.is_shared_image(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.items i
    join public.outfit_items oi on oi.item_id = i.id
    join public.outfits o on o.id = oi.outfit_id
    where o.is_public
      and (i.image_path = path
           or exists (select 1 from jsonb_each_text(i.views) v where v.value = path))
  )
$$;
