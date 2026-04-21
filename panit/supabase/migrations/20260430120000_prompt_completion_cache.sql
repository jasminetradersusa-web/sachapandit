-- Server-side OpenAI output cache: exact match on prompt_hash (trim + lowercase prompt).

create table if not exists public.prompt_completion_cache (
  prompt_hash text primary key,
  prompt text not null,
  response_text text not null,
  tone text not null,
  suggested_voice_style text not null
    check (suggested_voice_style in (
      'warm_narrator',
      'calm_reflective',
      'soft_whisper',
      'clear_storyteller'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prompt_completion_cache_updated_idx
  on public.prompt_completion_cache (updated_at desc);

alter table public.prompt_completion_cache enable row level security;

-- No policies: anon/authenticated cannot read/write; Route Handlers use service role only.
