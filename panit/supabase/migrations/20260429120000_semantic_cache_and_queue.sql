-- Semantic story cache (pgvector), generation queue, prompt_hash on generations, worker RPCs.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- generations: prompt fingerprint + optional embedding (analytics / future use)
-- ---------------------------------------------------------------------------
alter table public.generations
  add column if not exists prompt_hash text,
  add column if not exists prompt_embedding vector(1536);

create index if not exists generations_prompt_hash_idx
  on public.generations (prompt_hash)
  where prompt_hash is not null;

-- ---------------------------------------------------------------------------
-- Global semantic cache: exact hash + vector similarity (service_role only)
-- ---------------------------------------------------------------------------
create table if not exists public.semantic_story_cache (
  prompt_hash text primary key,
  embedding vector(1536) not null,
  story jsonb not null,
  audio_storage_path text,
  hit_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add after you have rows, e.g. ivfflat or hnsw on `embedding` for fast ANN search.

alter table public.semantic_story_cache enable row level security;

-- ---------------------------------------------------------------------------
-- Async generation queue
-- ---------------------------------------------------------------------------
create table if not exists public.generation_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  prompt text not null,
  prompt_hash text not null,
  fingerprint text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  generation_id uuid references public.generations (id) on delete set null,
  error text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists generation_queue_status_created_idx
  on public.generation_queue (status, created_at asc);

create index if not exists generation_queue_user_id_idx
  on public.generation_queue (user_id);

alter table public.generation_queue enable row level security;

create policy "generation_queue_select_own"
  on public.generation_queue for select
  using (auth.uid() = user_id);

create policy "generation_queue_insert_own"
  on public.generation_queue for insert
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Worker: consume credit on behalf of user (service_role only)
-- ---------------------------------------------------------------------------
create or replace function public.consume_one_credit_for_user(target_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.profiles
  set credits = credits - 1, updated_at = now()
  where id = target_user and credits >= 1;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.consume_one_credit_for_user(uuid) from public;
grant execute on function public.consume_one_credit_for_user(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Semantic: vector match (cosine distance `<=>`; lower = more similar)
-- ---------------------------------------------------------------------------
create or replace function public.match_semantic_story_cache(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  prompt_hash text,
  story jsonb,
  audio_storage_path text,
  distance float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.prompt_hash,
    s.story,
    s.audio_storage_path,
    (s.embedding <=> query_embedding)::float as distance
  from public.semantic_story_cache s
  where s.embedding is not null
    and (s.embedding <=> query_embedding) < match_threshold
  order by s.embedding <=> query_embedding
  limit greatest(1, least(match_count, 10));
$$;

revoke all on function public.match_semantic_story_cache(vector, float, int) from public;
grant execute on function public.match_semantic_story_cache(vector, float, int) to service_role;

create or replace function public.upsert_semantic_story_cache(
  p_prompt_hash text,
  p_embedding vector(1536),
  p_story jsonb,
  p_audio_storage_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.semantic_story_cache (
    prompt_hash, embedding, story, audio_storage_path, hit_count, updated_at
  )
  values (p_prompt_hash, p_embedding, p_story, p_audio_storage_path, 0, now())
  on conflict (prompt_hash) do update set
    embedding = excluded.embedding,
    story = excluded.story,
    audio_storage_path = case
      when excluded.audio_storage_path is not null
      then excluded.audio_storage_path
      else public.semantic_story_cache.audio_storage_path
    end,
    updated_at = now();
end;
$$;

revoke all on function public.upsert_semantic_story_cache(text, vector, jsonb, text) from public;
grant execute on function public.upsert_semantic_story_cache(text, vector, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- Claim pending jobs (batch worker)
-- ---------------------------------------------------------------------------
create or replace function public.claim_generation_queue_batch(batch_size int)
returns setof public.generation_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  lim int := greatest(1, least(coalesce(batch_size, 5), 25));
begin
  return query
  with cte as (
    select q.id
    from public.generation_queue q
    where q.status = 'pending'
    order by q.created_at asc
    limit lim
    for update skip locked
  )
  update public.generation_queue gq
  set
    status = 'processing',
    started_at = coalesce(gq.started_at, now()),
    updated_at = now()
  from cte
  where gq.id = cte.id
  returning gq.*;
end;
$$;

revoke all on function public.claim_generation_queue_batch(int) from public;
grant execute on function public.claim_generation_queue_batch(int) to service_role;

-- Optional: store embedding on generation row (service_role only; avoids vector in user JWT path)
create or replace function public.set_generation_prompt_embedding(
  p_id uuid,
  p_embedding vector(1536)
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.generations
  set prompt_embedding = p_embedding
  where id = p_id;
$$;

revoke all on function public.set_generation_prompt_embedding(uuid, vector) from public;
grant execute on function public.set_generation_prompt_embedding(uuid, vector) to service_role;
