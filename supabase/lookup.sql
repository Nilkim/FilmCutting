-- =====================================================================
-- Customer Order Lookup RPC
-- =====================================================================
-- Purpose: Allow anonymous customers to look up their own orders by phone
--          number. The `orders` table RLS blocks anon SELECT entirely,
--          so we expose a SECURITY DEFINER function that filters by phone.
--
-- HOW TO APPLY:
--   1. Open Supabase Dashboard -> SQL Editor.
--   2. Paste the entire contents of this file.
--   3. Click "Run".
--   4. Verify in "Database -> Functions" that
--      `list_orders_by_phone(text)` appears and execute grants include
--      `anon` and `authenticated`.
--
-- Notes:
--   - Input phone is normalized (non-digits stripped) before matching,
--     so callers may send either "01012345678" or "010-1234-5678".
--   - Returns at most 50 most recent orders.
-- =====================================================================

create or replace function public.list_orders_by_phone(p_phone text)
returns table (
  order_code text,
  created_at timestamptz,
  film_snapshot jsonb,
  unit_count integer,
  total_price integer,
  status text,
  shapes_json jsonb,
  film_id uuid
)
language sql
security definer
set search_path = public
as $$
  select order_code, created_at, film_snapshot, unit_count, total_price, status, shapes_json, film_id
  from public.orders
  where phone = regexp_replace(p_phone, '\D', '', 'g')
  order by created_at desc
  limit 50;
$$;

grant execute on function public.list_orders_by_phone(text) to anon, authenticated;
