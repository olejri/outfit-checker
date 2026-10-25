-- Outfit folders ("Party", "Work"...) and outfit preview pictures.
-- An outfit can be in any number of folders. Folders are private to their owner,
-- like everything else, and are never part of a shared outfit link.
-- Idempotent: safe to run more than once.

create table if not exists public.outfit_folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);
-- One "Party" per person, whatever the capitalisation.
create unique index if not exists outfit_folders_user_name_idx on public.outfit_folders (user_id, lower(name));

create table if not exists public.outfit_folder_items (
  folder_id uuid not null references public.outfit_folders (id) on delete cascade,
  outfit_id uuid not null references public.outfits (id) on delete cascade,
  added_at  timestamptz not null default now(),
  primary key (folder_id, outfit_id)
);
create index if not exists outfit_folder_items_outfit_idx on public.outfit_folder_items (outfit_id);

alter table public.outfit_folders      enable row level security;
alter table public.outfit_folder_items enable row level security;

drop policy if exists "outfit_folders: owner all" on public.outfit_folders;
create policy "outfit_folders: owner all" on public.outfit_folders
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Only your own outfits can go into your own folders.
drop policy if exists "outfit_folder_items: owner all" on public.outfit_folder_items;
create policy "outfit_folder_items: owner all" on public.outfit_folder_items
  for all to authenticated
  using (exists (select 1 from public.outfit_folders f
                 where f.id = folder_id and f.user_id = (select auth.uid())))
  with check (
    exists (select 1 from public.outfit_folders f
            where f.id = folder_id and f.user_id = (select auth.uid()))
    and exists (select 1 from public.outfits o
                where o.id = outfit_id and o.user_id = (select auth.uid()))
  );

-- Preview picture of the outfit on the model, made in the browser. thumb_path is in
-- the private "wardrobe" bucket (<user id>/outfits/...); thumb_key says what it was
-- made from, so the app can tell when the outfit has changed and redraw it.
alter table public.outfits add column if not exists thumb_path text;
alter table public.outfits add column if not exists thumb_key  text;
