-- POST /api/share/view: atomic increment of shares.views by public_id only (service_role).

create or replace function public.increment_share_views_by_public_id(p_public_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_public_id is null or length(trim(p_public_id)) = 0 then
    return jsonb_build_object('ok', false);
  end if;

  if not (lower(trim(p_public_id)) ~ '^[a-f0-9]{12}$') then
    return jsonb_build_object('ok', false);
  end if;

  update public.shares s
  set views = s.views + 1
  where s.public_id = lower(trim(p_public_id))
    and exists (
      select 1 from public.generations g
      where g.id = s.generation_id and g.is_public = true
    )
  returning s.views into v_count;

  if v_count is null then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object('ok', true, 'viewCount', v_count);
end;
$$;

revoke all on function public.increment_share_views_by_public_id(text) from public;
revoke all on function public.increment_share_views_by_public_id(text) from anon;
revoke all on function public.increment_share_views_by_public_id(text) from authenticated;
grant execute on function public.increment_share_views_by_public_id(text) to service_role;
