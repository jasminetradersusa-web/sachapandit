-- Optional structured fields for voice pipeline (tone, suggested voice style)
alter table public.generations
  add column if not exists generation_meta jsonb not null default '{}'::jsonb;
