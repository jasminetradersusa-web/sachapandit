-- Security hardening: profiles self-insert cannot mint credits/plan; lock down view RPC.

-- Profiles: only allow initial row with zero credits and free plan (real grants via trigger/webhooks/RPC).
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (
    auth.uid() = id
    and coalesce(credits, 0) = 0
    and coalesce(plan, 'free') = 'free'
  );

-- View counter RPC: only service_role may execute (explicit for anon/authenticated).
revoke all on function public.increment_share_public_view(text) from public;
revoke all on function public.increment_share_public_view(text) from anon;
revoke all on function public.increment_share_public_view(text) from authenticated;
grant execute on function public.increment_share_public_view(text) to service_role;
