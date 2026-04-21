-- Public share links as first-class rows (optional parallel to generations.share_slug).

create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.generations (id) on delete cascade,
  public_id text not null,
  views integer not null default 0 check (views >= 0),
  created_at timestamptz not null default now(),
  constraint shares_public_id_key unique (public_id)
);

-- UNIQUE (public_id) already indexes public_id; index for listing shares by generation.
create index if not exists shares_generation_id_idx on public.shares (generation_id);

-- Opaque link token (24 hex), same family as gen_share_slug / share_slug.
alter table public.shares
  alter column public_id set default encode(gen_random_bytes(12), 'hex');

alter table public.shares enable row level security;

-- No anon access; public pages resolve shares via service role on the server.
create policy "shares_select_own"
  on public.shares for select
  to authenticated
  using (
    exists (
      select 1
      from public.generations g
      where g.id = shares.generation_id
        and g.user_id = auth.uid()
    )
  );

create policy "shares_insert_own_generation"
  on public.shares for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.generations g
      where g.id = generation_id
        and g.user_id = auth.uid()
    )
  );

create policy "shares_delete_own"
  on public.shares for delete
  to authenticated
  using (
    exists (
      select 1
      from public.generations g
      where g.id = shares.generation_id
        and g.user_id = auth.uid()
    )
  );

-- View counts: no client UPDATE; use service_role or a security definer RPC later.

revoke all on table public.shares from anon;
grant select, insert, delete on table public.shares to authenticated;
