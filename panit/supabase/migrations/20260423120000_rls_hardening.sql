-- Sacred Voice: strict RLS — no anonymous access to app tables; users only see own rows.
-- Public share links are served via server-side service role (Next.js), not anon RLS policies.
-- Note: there is no public.users table; app user profile data lives in public.profiles (id = auth.users.id).

-- ---------------------------------------------------------------------------
-- Drop permissive read of "public" generations (anonymous could list shared IDs)
-- ---------------------------------------------------------------------------
drop policy if exists "generations_select_public" on public.generations;

-- ---------------------------------------------------------------------------
-- profiles ("users" from app perspective): read / insert self; no client UPDATE
-- (credits + plan must change only via security definer RPC / service_role webhooks)
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- payments: read own rows only (inserts/updates remain service_role in API routes)
-- ---------------------------------------------------------------------------
-- No INSERT/UPDATE/DELETE policies for authenticated => denied (webhooks use service role).

-- ---------------------------------------------------------------------------
-- webhook_events: RLS on with no policies => only service_role (bypass) can access
-- ---------------------------------------------------------------------------
-- (Already enabled in prior migration; do not add anon/authenticated policies.)

-- ---------------------------------------------------------------------------
-- Privileges: remove anonymous role access to sensitive tables
-- ---------------------------------------------------------------------------
revoke all on table public.profiles from anon;
revoke all on table public.generations from anon;
revoke all on table public.payment_orders from anon;
revoke all on table public.payments from anon;
revoke all on table public.webhook_events from anon;

-- Ensure authenticated can use tables subject to RLS policies (idempotent for most Supabase projects)
grant usage on schema public to authenticated;
grant select, insert on table public.profiles to authenticated;
grant select, insert, update, delete on table public.generations to authenticated;
grant select on table public.payment_orders to authenticated;
grant select on table public.payments to authenticated;
