-- Shareable content: opaque slug, view counts, atomic view increments (service role only).

create or replace function public.gen_share_slug()
returns text
language sql
as $$
  select encode(gen_random_bytes(12), 'hex');
$$;

alter table public.generations
  add column if not exists share_slug text,
  add column if not exists share_view_count integer not null default 0 check (share_view_count >= 0);

update public.generations
  set share_slug = public.gen_share_slug()
  where share_slug is null;

alter table public.generations
  alter column share_slug set not null,
  alter column share_slug set default public.gen_share_slug();

create unique index if not exists generations_share_slug_uidx on public.generations (share_slug);

-- Atomically increment views for public generations; token is share_slug (24 hex) or legacy UUID.
create or replace function public.increment_share_public_view(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    return jsonb_build_object('ok', false);
  end if;

  if lower(p_token) ~ '^[a-f0-9]{24}$' then
    update public.generations g
    set share_view_count = g.share_view_count + 1
    where g.share_slug = lower(p_token) and g.is_public = true
    returning g.id, g.share_view_count into v_id, v_count;
  elsif p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    update public.generations g
    set share_view_count = g.share_view_count + 1
    where g.id = p_token::uuid and g.is_public = true
    returning g.id, g.share_view_count into v_id, v_count;
  else
    return jsonb_build_object('ok', false);
  end if;

  if v_id is null then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'viewCount', v_count,
    'generationId', v_id
  );
end;
$$;

revoke all on function public.increment_share_public_view(text) from public;
grant execute on function public.increment_share_public_view(text) to service_role;
