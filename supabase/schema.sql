-- ============================================================
-- Film Cutting — Supabase schema setup
-- Run in: Supabase Dashboard → SQL Editor → paste all → Run
-- Safe to re-run (idempotent where possible).
-- ============================================================

-- ----- Extensions -----
create extension if not exists "pgcrypto";  -- for gen_random_uuid()

-- ============================================================
-- 1) films table
-- ============================================================
create table if not exists public.films (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  color_hex           text not null,
  preview_image_url   text,
  price_per_500       integer not null check (price_per_500 >= 0),
  category            text,
  description         text,
  is_active           boolean not null default true,
  display_order       integer not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists films_active_order_idx
  on public.films (is_active, display_order);

-- ============================================================
-- 2) orders table
-- ============================================================
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  order_code      text not null unique,     -- {phone4}-{YYMMDD}-{seq3}
  customer_name   text not null,
  phone           text not null,            -- digits only (no hyphens)
  film_id         uuid references public.films(id) on delete set null,
  film_snapshot   jsonb not null,           -- {name, color_hex, price_per_500} at order time
  unit_count      integer not null check (unit_count > 0),   -- multiples of 0.5m
  total_price     integer not null check (total_price >= 0),
  shapes_json     jsonb not null,           -- raw shapes array for re-edit/restore
  dxf_file_path   text,                     -- path in storage bucket 'dxf-files'
  status          text not null default 'pending'
                  check (status in ('pending','completed','cancelled')),
  memo            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists orders_status_idx    on public.orders (status);
create index if not exists orders_created_idx   on public.orders (created_at desc);
create index if not exists orders_phone_idx     on public.orders (phone);

-- Trigger: keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ============================================================
-- 3) Daily sequence helper for order_code
--    Usage from client:  select public.next_order_seq('20260414');
-- ============================================================
create table if not exists public.order_daily_seq (
  day_key  text primary key,    -- 'YYMMDD'
  last_seq integer not null default 0
);

create or replace function public.next_order_seq(p_day text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_seq integer;
begin
  insert into public.order_daily_seq as s (day_key, last_seq)
    values (p_day, 1)
  on conflict (day_key) do update
    set last_seq = s.last_seq + 1
  returning last_seq into v_seq;
  return v_seq;
end $$;

-- allow anon + authenticated to call it (customers need it to submit orders)
grant execute on function public.next_order_seq(text) to anon, authenticated;

-- ============================================================
-- 4) Row Level Security (RLS)
--    Rule of thumb:
--      - anon  (customer, publishable key): can read active films, insert own order
--      - authenticated (admin only, single Auth user): full access
-- ============================================================
alter table public.films  enable row level security;
alter table public.orders enable row level security;
alter table public.order_daily_seq enable row level security;

-- films: public read of active films
drop policy if exists films_public_read on public.films;
create policy films_public_read
  on public.films for select
  to anon, authenticated
  using (is_active = true or auth.role() = 'authenticated');

-- films: admin full write
drop policy if exists films_admin_write on public.films;
create policy films_admin_write
  on public.films for all
  to authenticated
  using (true) with check (true);

-- orders: anon can insert (customer submits)
drop policy if exists orders_anon_insert on public.orders;
create policy orders_anon_insert
  on public.orders for insert
  to anon, authenticated
  with check (true);

-- orders: admin can read/update/delete
drop policy if exists orders_admin_select on public.orders;
create policy orders_admin_select
  on public.orders for select
  to authenticated using (true);

drop policy if exists orders_admin_update on public.orders;
create policy orders_admin_update
  on public.orders for update
  to authenticated using (true) with check (true);

drop policy if exists orders_admin_delete on public.orders;
create policy orders_admin_delete
  on public.orders for delete
  to authenticated using (true);

-- order_daily_seq: locked down — only RPC function (security definer) writes
-- No policies needed beyond RLS being on; function bypasses RLS.

-- ============================================================
-- 5) Storage buckets
--    Run these via Dashboard → Storage, OR via SQL below.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('film-previews', 'film-previews', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('dxf-files', 'dxf-files', false)
on conflict (id) do nothing;

-- Storage RLS policies
-- film-previews: public read, admin write
drop policy if exists "film_previews_public_read" on storage.objects;
create policy "film_previews_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'film-previews');

drop policy if exists "film_previews_admin_write" on storage.objects;
create policy "film_previews_admin_write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'film-previews');

drop policy if exists "film_previews_admin_update" on storage.objects;
create policy "film_previews_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'film-previews');

drop policy if exists "film_previews_admin_delete" on storage.objects;
create policy "film_previews_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'film-previews');

-- dxf-files: anon can upload (customer submits DXF with order),
--            only admin can read/download
drop policy if exists "dxf_anon_insert" on storage.objects;
create policy "dxf_anon_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'dxf-files');

drop policy if exists "dxf_admin_read" on storage.objects;
create policy "dxf_admin_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'dxf-files');

drop policy if exists "dxf_admin_delete" on storage.objects;
create policy "dxf_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'dxf-files');

-- ============================================================
-- 6) Seed existing mock films (optional — remove if starting empty)
-- ============================================================
insert into public.films (name, color_hex, price_per_500, display_order)
values
  ('솔리드 레드',        '#ef4444', 5000, 10),
  ('솔리드 블루',        '#3b82f6', 5000, 20),
  ('매트 블랙',          '#1f2937', 6000, 30),
  ('화이트 유광',        '#f8fafc', 4500, 40),
  ('우드 패턴(브라운)',  '#854d0e', 7000, 50)
on conflict do nothing;
