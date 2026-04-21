-- Credit system: balances on public.profiles (one row per auth.users.id).
-- Default 3 credits for new users; /api/generate uses consume_generation_credit() only (no direct credit writes).

alter table public.profiles
  alter column credits set default 3;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, credits, plan, daily_credits_reset_on)
  values (
    NEW.id,
    3,
    'free',
    (timezone('utc', now()))::date
  )
  on conflict (id) do nothing;
  return NEW;
end;
$$;

/**
 * Free plan: each new UTC calendar day, refill credits to 3 before spending.
 * Then deduct 1 if balance >= 1.
 * Supporter (plan <> 'free'): no daily refill; deduct from purchased balance only.
 * Returns true only when one credit was consumed (caller must refund on generation failure).
 */
create or replace function public.consume_generation_credit()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := (timezone('utc', now()))::date;
  v_plan text;
  reset_on date;
begin
  if uid is null then
    return false;
  end if;

  select coalesce(plan, 'free'), daily_credits_reset_on
  into v_plan, reset_on
  from public.profiles
  where id = uid
  for update;

  if not found then
    return false;
  end if;

  if v_plan = 'free' then
    if reset_on is null or reset_on < today then
      update public.profiles
      set
        credits = 3,
        daily_credits_reset_on = today,
        updated_at = now()
      where id = uid;
    end if;
  end if;

  update public.profiles
  set credits = credits - 1, updated_at = now()
  where id = uid and credits >= 1;

  return found;
end;
$$;

revoke all on function public.consume_generation_credit() from public;
grant execute on function public.consume_generation_credit() to authenticated;
grant execute on function public.consume_generation_credit() to service_role;
