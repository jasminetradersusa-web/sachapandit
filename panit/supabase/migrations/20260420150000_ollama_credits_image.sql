-- Ollama stack: generation images, free-tier daily credits (3/day UTC), credit consume RPC
-- Run after prior migrations.

alter table public.generations
  add column if not exists image_storage_path text;

create index if not exists generations_user_prompt_hash_idx
  on public.generations (user_id, prompt_hash)
  where prompt_hash is not null;

alter table public.profiles
  add column if not exists daily_credits_reset_on date;

-- New signups: 3 starter credits (one-time; free tier also refreshes daily via RPC)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, credits, daily_credits_reset_on)
  values (NEW.id, 3, (timezone('utc', now()))::date)
  on conflict (id) do nothing;
  return NEW;
end;
$$;

/**
 * Free plan: reset credits to 3 at the start of each UTC day (before deduct).
 * Paid / supporter: no daily reset — only deduct from balance.
 * Returns true if one credit was consumed.
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

/** Undo one credit after a failed generation attempt (server must only call on genuine failure). */
create or replace function public.refund_generation_credit()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;
  update public.profiles
  set credits = credits + 1, updated_at = now()
  where id = uid;
end;
$$;

revoke all on function public.refund_generation_credit() from public;
grant execute on function public.refund_generation_credit() to authenticated;
grant execute on function public.refund_generation_credit() to service_role;

-- Private bucket for symbolic images (signed URLs on share pages)
insert into storage.buckets (id, name, public)
values ('images', 'images', false)
on conflict (id) do nothing;

create policy "images_select_own"
  on storage.objects for select
  using (bucket_id = 'images' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "images_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'images' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "images_update_own"
  on storage.objects for update
  using (bucket_id = 'images' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "images_delete_own"
  on storage.objects for delete
  using (bucket_id = 'images' and auth.uid()::text = (storage.foldername(name))[1]);
