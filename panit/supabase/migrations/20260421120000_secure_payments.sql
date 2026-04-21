-- Secure payments ledger + webhook idempotency (Razorpay / NowPayments)
-- Run after init migration.

-- Subscription / entitlements label (updated only via verified webhooks)
alter table public.profiles
  add column if not exists plan text not null default 'free';

-- Immutable audit log of provider webhooks (replay protection)
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('razorpay', 'nowpayments')),
  event_id text not null,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

create index if not exists webhook_events_provider_idx on public.webhook_events (provider, created_at desc);

-- Transaction log (user-facing fields + internal reconciliation)
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('razorpay', 'nowpayments')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'success', 'failed')),
  amount integer not null check (amount > 0),
  currency text not null default 'INR',
  transaction_id text unique,
  provider_order_id text not null,
  credits_granted integer not null default 0 check (credits_granted >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_order_id)
);

create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_transaction_id_idx on public.payments (transaction_id)
  where transaction_id is not null;

alter table public.webhook_events enable row level security;
alter table public.payments enable row level security;

-- No client writes to webhook_events or payments
create policy "payments_select_own"
  on public.payments for select
  using (auth.uid() = user_id);

-- Service role bypasses RLS; authenticated users only read own payments
