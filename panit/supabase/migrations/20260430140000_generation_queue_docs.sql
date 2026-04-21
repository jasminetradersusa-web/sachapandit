-- generation_queue (logical core columns for async batch processing):
--   id uuid PK
--   prompt text — validated story seed
--   status text — pending | processing | completed | failed
--
-- Production columns also include user_id, prompt_hash, fingerprint, generation_id, error,
-- result, timestamps — required for auth, deduplication, worker idempotency, and UI polling.

comment on table public.generation_queue is
  'Async narrative jobs: enqueue via /api/generate; process via /api/worker (claim_generation_queue_batch + SKIP LOCKED).';
