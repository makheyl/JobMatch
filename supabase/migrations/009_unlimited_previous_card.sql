-- JobMatch 009: Unlimited previous-card return for Discover Passed & Undo buttons.

create or replace function public.undo_swipe() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.swipes;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into s
    from public.swipes
   where user_id = uid
     and dir <> 'removed'
     and not exists (select 1 from public.applications a where a.user_id = uid and a.job_id = swipes.job_id)
   order by created_at desc
   limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;
  delete from public.swipes where user_id = uid and job_id = s.job_id;
  if s.dir = 'star' then perform app.refund_star(uid); end if;
  return jsonb_build_object(
    'ok', true,
    'job_id', s.job_id,
    'dir', s.dir,
    'stars_left', app.stars_left(uid),
    'job', app.job_card(uid, s.job_id)
  );
end $$;

create or replace function public.requeue_passed_jobs() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  delete from public.swipes
   where user_id = uid
     and dir = 'left'
     and not exists (select 1 from public.applications a where a.user_id = uid and a.job_id = swipes.job_id);
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'count', n);
end $$;

revoke all on function public.undo_swipe() from public, anon, authenticated;
grant execute on function public.undo_swipe() to authenticated;
revoke all on function public.requeue_passed_jobs() from public, anon, authenticated;
grant execute on function public.requeue_passed_jobs() to authenticated;

notify pgrst, 'reload schema';
