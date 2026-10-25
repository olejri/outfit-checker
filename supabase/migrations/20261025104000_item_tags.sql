-- Adds tags to clothing items (e.g. summer, winter, work, test).
-- Idempotent: safe on databases where this was already run by hand.
alter table public.items add column if not exists tags text[] not null default '{}';
create index if not exists items_tags_idx on public.items using gin (tags);

-- Shared outfits also return tags.
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
        'image_path', i.image_path, 'color', i.color, 'tags', i.tags))
      from public.outfit_items oi
      join public.items i on i.id = oi.item_id
      where oi.outfit_id = o.id), '[]'::jsonb)
  )
  from public.outfits o
  where o.share_token = token and o.is_public
$$;
