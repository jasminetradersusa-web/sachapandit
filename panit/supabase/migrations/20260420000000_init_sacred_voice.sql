-- Sacred Voice: profiles, generations, payments, RLS, credit RPC, storage policies
-- Run in Supabase SQL editor or via CLI after project creation.

-- Profiles (credits balance; 1 credit = 1 narrative+voice generation)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  credits integer not null default 0 check (credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  prompt text not null,
  narrative text not null,
  disclaimer_ack boolean not null default true,
  audio_storage_path text,
  voice_id text,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists generations_user_id_idx on public.generations (user_id);
create index if not exists generations_created_at_idx on public.generations (created_at desc);

-- Payment records; credits applied only via verified webhook (service role)
create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  razorpay_order_id text not null unique,
  razorpay_payment_id text,
  amount_paise integer not null check (amount_paise > 0),
  credits_purchased integer not null check (credits_purchased > 0),
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'refunded')),
  idempotency_key text unique,
  raw_webhook jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_orders_user_id_idx on public.payment_orders (user_id);

-- New user: profile + starter credits (tunable)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, credits)
  values (NEW.id, 2)
  on conflict (id) do nothing;
  return NEW;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Atomically consume one credit for the authenticated user (server calls with user JWT)
create or replace function public.consume_one_credit()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then
    return false;
  end if;
  update public.profiles
  set credits = credits - 1, updated_at = now()
  where id = uid and credits >= 1;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.consume_one_credit() from public;
grant execute on function public.consume_one_credit() to authenticated;
grant execute on function public.consume_one_credit() to service_role;

alter table public.profiles enable row level security;
alter table public.generations enable row level security;
alter table public.payment_orders enable row level security;

-- Profiles: users read/update own row only (no arbitrary credit writes from client)
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- No UPDATE policy: credits change only via security-definer RPC (consume) or service_role (webhook)

-- Generations
create policy "generations_select_own"
  on public.generations for select
  using (auth.uid() = user_id);

create policy "generations_select_public"
  on public.generations for select
  using (is_public = true);

create policy "generations_insert_own"
  on public.generations for insert
  with check (auth.uid() = user_id);

create policy "generations_update_own"
  on public.generations for update
  using (auth.uid() = user_id);

create policy "generations_delete_own"
  on public.generations for delete
  using (auth.uid() = user_id);

-- Payment orders: read own; no client insert/update (API uses service role for webhook)
create policy "payment_orders_select_own"
  on public.payment_orders for select
  using (auth.uid() = user_id);

-- Storage bucket: create in Dashboard as "audio" (private). Paths: {user_id}/{generation_id}.mp3
-- After bucket exists, run:
insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;

create policy "audio_select_own"
  on storage.objects for select
  using (bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "audio_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "audio_update_own"
  on storage.objects for update
  using (bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "audio_delete_own"
  on storage.objects for delete
  using (bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]);

-- Optional: allow signed URLs generated server-side (service role) — no extra policy needed
