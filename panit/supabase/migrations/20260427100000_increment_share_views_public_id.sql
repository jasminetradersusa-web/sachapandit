-- Extend view counter: 12-hex shares.public_id (in addition to 24-hex share_slug and UUID).

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

  -- shares.public_id (e.g. randomBytes(6).toString("hex"))
  if lower(p_token) ~ '^[a-f0-9]{12}$' then
    update public.shares s
    set views = s.views + 1
    where s.public_id = lower(p_token)
      and exists (
        select 1 from public.generations g
        where g.id = s.generation_id and g.is_public = true
      )
    returning s.generation_id, s.views into v_id, v_count;
  elsif lower(p_token) ~ '^[a-f0-9]{24}$' then
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
revoke all on function public.increment_share_public_view(text) from anon;
revoke all on function public.increment_share_public_view(text) from authenticated;
grant execute on function public.increment_share_public_view(text) to service_role;
