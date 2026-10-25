-- Outfit Checker schema. Applied automatically by .github/workflows/supabase-migrations.yml.
-- Every statement is idempotent, so it is safe on a database that was set up by hand.
-- Manual setup: SQL Editor -> New query -> paste each file in supabase/migrations in order -> Run.
-- Everything is private to its owner. An outfit becomes viewable by anyone with its
-- share link only when the owner turns sharing on.

-- Clothing items -----------------------------------------------------------
create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default '',
  category    text not null check (category in
                ('tops', 'bottoms', 'outerwear', 'dresses', 'shoes', 'hats', 'accessories')),
  image_path  text not null,           -- path inside the "wardrobe" storage bucket
  color       text not null default '#888888', -- dominant colour, used on the 3D garment
  tags        text[] not null default '{}',     -- e.g. summer, winter, work
  created_at  timestamptz not null default now()
);
create index if not exists items_user_idx on public.items (user_id, category);
-- Tags were added later; these two lines also upgrade older projects.
alter table public.items add column if not exists tags text[] not null default '{}';
create index if not exists items_tags_idx on public.items using gin (tags);

-- Outfits -------------------------------------------------------------------
create table if not exists public.outfits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default 'Untitled outfit',
  is_public   boolean not null default false,
  share_token uuid not null unique default gen_random_uuid(),
  avatar      jsonb not null default '{}'::jsonb, -- skin tone etc.
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists outfits_user_idx on public.outfits (user_id);

create table if not exists public.outfit_items (
  outfit_id uuid not null references public.outfits (id) on delete cascade,
  item_id   uuid not null references public.items (id) on delete cascade,
  primary key (outfit_id, item_id)
);
create index if not exists outfit_items_item_idx on public.outfit_items (item_id);

-- Row level security: owners only --------------------------------------------
alter table public.items        enable row level security;
alter table public.outfits      enable row level security;
alter table public.outfit_items enable row level security;

drop policy if exists "items: owner all" on public.items;
create policy "items: owner all" on public.items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "outfits: owner all" on public.outfits;
create policy "outfits: owner all" on public.outfits
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "outfit_items: owner all" on public.outfit_items;
create policy "outfit_items: owner all" on public.outfit_items
  for all to authenticated
  using (exists (select 1 from public.outfits o
                 where o.id = outfit_id and o.user_id = (select auth.uid())))
  with check (
    exists (select 1 from public.outfits o
            where o.id = outfit_id and o.user_id = (select auth.uid()))
    and exists (select 1 from public.items i
                where i.id = item_id and i.user_id = (select auth.uid()))
  );

-- Shared outfits are read through this function, by share token only, so public
-- outfits cannot be listed or guessed.
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
revoke all on function public.get_shared_outfit(uuid) from public;
grant execute on function public.get_shared_outfit(uuid) to anon, authenticated;

-- Storage: private bucket, one folder per user --------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wardrobe', 'wardrobe', false, 5242880, array['image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "wardrobe: owner read"   on storage.objects;
drop policy if exists "wardrobe: owner insert" on storage.objects;
drop policy if exists "wardrobe: owner delete" on storage.objects;
drop policy if exists "wardrobe: shared read"  on storage.objects;

create policy "wardrobe: owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "wardrobe: owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "wardrobe: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Images that belong to an item in a shared outfit can be read by anyone, so the
-- share page can show them. File names are random UUIDs.
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
    where i.image_path = path and o.is_public
  )
$$;
revoke all on function public.is_shared_image(text) from public;
grant execute on function public.is_shared_image(text) to anon, authenticated;

create policy "wardrobe: shared read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'wardrobe' and public.is_shared_image(name));
