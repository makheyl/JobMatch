-- JobMatch 002: server-side logic. Matching, plan rules and fairness masking live here, not in the browser.
-- Internal helpers are in schema app (not exposed). Everything callable from the site is in schema public.

-- =====================================================================
-- internal helpers
-- =====================================================================
create or replace function app.today() returns date language sql stable as $$ select (now() at time zone 'Asia/Manila')::date $$;

create or replace function app.plan_posts(p text) returns int language sql immutable as $$
  select case p when 'starter' then 2 when 'growth' then 10 else 1000000 end
$$;

create or replace function app.dist_km(a text, b text) returns numeric language sql stable set search_path = '' as $$
  select round((2 * 6371 * asin(sqrt(
           power(sin(radians(y.lat - x.lat) / 2), 2) +
           cos(radians(x.lat)) * cos(radians(y.lat)) * power(sin(radians(y.lng - x.lng) / 2), 2)
         )))::numeric, 1)
  from public.areas x, public.areas y where x.id = a and y.id = b
$$;

create or replace function app.notify(p_user uuid, p_type text, p_title text, p_body text, p_ref text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, title, body, ref) values (p_user, p_type, p_title, p_body, p_ref)
$$;

create or replace function app.stars_left(p_user uuid) returns int language sql stable security definer set search_path = '' as $$
  select case when sp.plan = 'pro' then 999
              else greatest(0, 3 - case when sp.stars_date = app.today() then sp.stars_used else 0 end) end
  from public.seeker_profiles sp where sp.user_id = p_user
$$;

create or replace function app.skill_bonus(p_user uuid, p_role text, p_skill text) returns int
language sql stable security definer set search_path = '' as $$
  select (
    coalesce((
      select sum(case t.type
                   when 'quiz' then round(30.0 * q.score / q.total)
                   when 'practice' then case when p.task_id is not null then 15 else 0 end
                   else case when p.task_id is not null then 10 else 0 end end)
      from public.roadmap_tasks t
      left join public.roadmap_progress p on p.task_id = t.id and p.user_id = p_user
      left join public.quiz_results q on q.task_id = t.id and q.user_id = p_user
      where t.role_id = p_role and t.skill = p_skill
    ), 0)
    + (select count(*) * 5 from public.roadmap_extra x where x.user_id = p_user and x.role_id = p_role and x.skill = p_skill and x.done)
  )::int
$$;

create or replace function app.skill_level(p_user uuid, p_skill text, p_role text) returns int
language sql stable security definer set search_path = '' as $$
  select least(100, coalesce((select level from public.seeker_skills where user_id = p_user and skill = p_skill), 0)
                    + case when p_role is null then 0 else app.skill_bonus(p_user, p_role, p_skill) end)
$$;

create or replace function app.readiness(p_user uuid, p_role text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'skills', coalesce(jsonb_agg(jsonb_build_object('name', rs.skill, 'weight', rs.weight, 'pct', app.skill_level(p_user, rs.skill, p_role)) order by rs.weight desc, rs.skill), '[]'::jsonb),
    'ready', coalesce(round(sum(rs.weight * app.skill_level(p_user, rs.skill, p_role))::numeric / nullif(sum(rs.weight), 0)), 0)::int
  )
  from public.role_skills rs where rs.role_id = p_role
$$;

create or replace function app.salary_for(p_role text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare n int; lo numeric; hi numeric; r public.career_roles;
begin
  select count(*), avg(salary_min), avg(salary_max) into n, lo, hi from public.jobs where role_id = p_role and status = 'published';
  select * into r from public.career_roles where id = p_role;
  if n >= 3 then
    return jsonb_build_object('min', round(lo / 500) * 500, 'max', round(hi / 500) * 500, 'source', 'Based on ' || n || ' live employer listings');
  end if;
  return jsonb_build_object('min', r.salary_min, 'max', r.salary_max, 'source', 'Estimated range from JobMatch career data');
end $$;

-- Match score: skills 55%, interests 15%, location 20%, pay 10%. Never uses age, gender or photos.
create or replace function app.match(p_user uuid, p_job uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  sp public.seeker_profiles; j public.jobs;
  sk numeric := 0; n int; s text; lvl int;
  have text[] := '{}'; missing text[] := '{}'; why text[] := '{}';
  d numeric; commute int; loc numeric; sal numeric; interest numeric; base numeric; adj numeric := 0;
  pos int; neg int; yes int; tot int;
begin
  select * into sp from public.seeker_profiles where user_id = p_user;
  select * into j from public.jobs where id = p_job;
  if sp.user_id is null or j.id is null then return null; end if;
  n := coalesce(array_length(j.skills, 1), 0);
  foreach s in array j.skills loop
    lvl := app.skill_level(p_user, s, j.role_id);
    sk := sk + least(1, lvl / 70.0);
    if lvl >= 40 then have := have || s; else missing := missing || s; end if;
  end loop;
  sk := case when n > 0 then sk / n else 0.5 end;
  interest := case when coalesce(array_length(sp.interests, 1), 0) = 0 then 0.5
                   when j.category = any (sp.interests) then 1 else 0.3 end;
  d := coalesce(app.dist_km(sp.area_id, j.area_id), 0);
  commute := coalesce(nullif(sp.commute_km, 0), 10);
  loc := case when d <= commute then 1 else greatest(0, 1 - (d - commute) / (commute * 1.5)) end;
  sal := case when sp.salary_min <= 0 or j.salary_max >= sp.salary_min then 1 else greatest(0, j.salary_max::numeric / sp.salary_min) end;
  base := 100 * (0.55 * sk + 0.15 * interest + 0.2 * loc + 0.1 * sal);
  -- re-rank by swipe behavior: own history in this category and similar users' reactions to this job
  select count(*) filter (where w.dir in ('right', 'star')), count(*) filter (where w.dir = 'left') into pos, neg
    from public.swipes w join public.jobs j2 on j2.id = w.job_id where w.user_id = p_user and j2.category = j.category;
  adj := greatest(-6, least(6, (pos - neg) * 2));
  select count(*) filter (where dir in ('right', 'star')), count(*) into yes, tot
    from public.swipes where job_id = p_job and user_id <> p_user and dir in ('left', 'right', 'star');
  if tot >= 3 then adj := adj + greatest(-4, least(4, (yes::numeric / tot - 0.5) * 8)); end if;
  if array_length(have, 1) > 0 then why := why || ('your skills (' || array_to_string(have[1:3], ', ') || ')'); end if;
  why := why || (d::text || ' km commute' || case when d <= commute then '' else ' (a bit beyond your ' || commute || ' km limit)' end);
  if sp.salary_min > 0 and j.salary_max >= sp.salary_min then why := why || ('pay meets your ₱' || to_char(sp.salary_min, 'FM999,999') || ' goal'); end if;
  if j.category = any (sp.interests) then why := why || ('your interest in ' || j.category); end if;
  return jsonb_build_object(
    'score', greatest(1, least(99, round(base + adj)))::int,
    'have', to_jsonb(have), 'missing', to_jsonb(missing), 'dist', d, 'why', to_jsonb(why),
    'parts', jsonb_build_object('skills', round(sk * 100), 'interest', round(interest * 100), 'location', round(loc * 100), 'salary', round(sal * 100)));
end $$;

create or replace function app.roadmap_json(p_user uuid, p_role text, p_pro boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  with rows as (
    select t.week, t.week_title as title, t.position, t.id::text as id, t.type, t.skill, t.text, t.course,
           (p.task_id is not null) as done,
           case when q.task_id is null then null else jsonb_build_object('score', q.score, 'total', q.total) end as quiz,
           false as adaptive
    from public.roadmap_tasks t
    left join public.roadmap_progress p on p.task_id = t.id and p.user_id = p_user
    left join public.quiz_results q on q.task_id = t.id and q.user_id = p_user
    where t.role_id = p_role
    union all
    select x.week, null::text, 100 + (row_number() over (order by x.created_at))::int, x.id::text, 'practice', x.skill, x.text, null::jsonb, x.done, null::jsonb, true
    from public.roadmap_extra x where x.user_id = p_user and x.role_id = p_role
  )
  select coalesce(jsonb_agg(jsonb_build_object('week', r.week, 'title', r.title, 'locked', (not p_pro and r.week > 1), 'tasks', r.tasks) order by r.week), '[]'::jsonb)
  from (
    select week, min(title) as title,
           case when not p_pro and week > 1 then '[]'::jsonb
                else jsonb_agg(jsonb_build_object('id', id, 'type', type, 'skill', skill, 'text', text, 'course', course, 'done', done, 'quiz', quiz, 'adaptive', adaptive) order by position) end as tasks
    from rows group by week
  ) r
$$;

create or replace function app.is_pro(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select plan = 'pro' from public.seeker_profiles where user_id = p_user), false)
$$;

create or replace function app.mask_name(p_name text, p_show boolean) returns text language sql immutable as $$
  select case when p_show or position(' ' in trim(p_name)) = 0 then trim(p_name)
              else split_part(trim(p_name), ' ', 1) || ' ' || left((regexp_match(trim(p_name), '(\S+)$'))[1], 1) || '.' end
$$;

create or replace function app.require_admin() returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

create or replace function app.audit(p_action text, p_target text, p_detail jsonb default '{}') returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor, action, target, detail) values (auth.uid(), p_action, p_target, p_detail)
$$;

-- =====================================================================
-- session, onboarding
-- =====================================================================
create or replace function public.me() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); pr public.profiles; sp public.seeker_profiles; em public.employers;
        skills jsonb; unread int; msgs int;
begin
  if uid is null then return null; end if;
  select * into pr from public.profiles where id = uid;
  if pr.id is null then return null; end if;
  -- lazy plan housekeeping (live billing webhooks replace this)
  update public.seeker_profiles
     set plan_renews_at = case when auto_renew then plan_renews_at + (case plan_period when 'monthly' then interval '30 days' else interval '365 days' end) else null end,
         plan = case when auto_renew then plan else 'free' end,
         plan_period = case when auto_renew then plan_period else null end
   where user_id = uid and plan = 'pro' and plan_renews_at < now();
  update public.employers set plan = 'starter', plan_renews_at = null where user_id = uid and plan <> 'starter' and plan_renews_at < now();
  select * into sp from public.seeker_profiles where user_id = uid;
  select * into em from public.employers where user_id = uid;
  select coalesce(jsonb_agg(jsonb_build_object('name', skill, 'level', level) order by skill), '[]'::jsonb) into skills from public.seeker_skills where user_id = uid;
  select count(*) into unread from public.notifications where user_id = uid and not read;
  select count(*) into msgs from public.messages m join public.conversations c on c.id = m.conversation_id
    where m.sender_id <> uid and m.read_at is null and (c.seeker_id = uid or c.employer_id = uid);
  return jsonb_build_object(
    'id', uid, 'role', pr.role, 'full_name', pr.full_name, 'phone', pr.phone, 'language', pr.language,
    'suspended', pr.suspended, 'consent_at', pr.consent_at,
    'seeker', case when sp.user_id is null then null else to_jsonb(sp) || jsonb_build_object('stars_left', app.stars_left(uid), 'skills', skills) end,
    'employer', case when em.user_id is null then null else to_jsonb(em) end,
    'unread', unread, 'unread_messages', msgs);
end $$;

create or replace function public.set_role(p_role text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_role not in ('seeker', 'employer') then raise exception 'invalid role'; end if;
  update public.profiles set role = p_role where id = uid and role is null;
  if p_role = 'seeker' and exists (select 1 from public.profiles where id = uid and role = 'seeker') then
    insert into public.seeker_profiles (user_id) values (uid) on conflict do nothing;
  end if;
  return public.me();
end $$;

create or replace function public.register_employer(p_name text, p_type text, p_area text, p_address text, p_cname text, p_cemail text, p_cphone text, p_about text, p_docs jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); d jsonb; a record;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = uid and role = 'employer') then raise exception 'not an employer account'; end if;
  if exists (select 1 from public.employers where user_id = uid) then raise exception 'already registered'; end if;
  if jsonb_array_length(coalesce(p_docs, '[]')) < 2 then raise exception 'two documents are required'; end if;
  insert into public.employers (user_id, name, type, area_id, address, contact_name, contact_email, contact_phone, about)
  values (uid, trim(p_name), p_type, p_area, trim(p_address), trim(p_cname), trim(p_cemail), trim(p_cphone), trim(p_about));
  insert into public.employer_team (employer_id, name, email, role) values (uid, trim(p_cname), trim(p_cemail), 'Owner');
  for d in select * from jsonb_array_elements(p_docs) loop
    insert into public.employer_docs (employer_id, kind, file_path, file_name) values (uid, d->>'kind', d->>'path', d->>'name');
  end loop;
  for a in select id from public.profiles where role = 'admin' loop
    perform app.notify(a.id, 'tip', 'New employer to verify', trim(p_name) || ' submitted documents.', '/admin/verification');
  end loop;
  perform app.notify(uid, 'tip', 'Verification submitted', 'We will review your documents shortly. You can draft jobs in the meantime.', '/employer');
  return public.me();
end $$;

create or replace function public.resubmit_docs(p_docs jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); d jsonb; a record; nm text;
begin
  select name into nm from public.employers where user_id = uid and verification_status = 'rejected';
  if nm is null then raise exception 'nothing to resubmit'; end if;
  if jsonb_array_length(coalesce(p_docs, '[]')) < 2 then raise exception 'two documents are required'; end if;
  delete from public.employer_docs where employer_id = uid;
  for d in select * from jsonb_array_elements(p_docs) loop
    insert into public.employer_docs (employer_id, kind, file_path, file_name) values (uid, d->>'kind', d->>'path', d->>'name');
  end loop;
  update public.employers set verification_status = 'pending', verification_reason = '', submitted_at = now(), reviewed_at = null where user_id = uid;
  for a in select id from public.profiles where role = 'admin' loop
    perform app.notify(a.id, 'tip', 'Employer resubmitted documents', nm || ' resubmitted for verification.', '/admin/verification');
  end loop;
  return public.me();
end $$;

-- =====================================================================
-- job seeker: deck, preferred, apply
-- =====================================================================
create or replace function public.get_deck(p_limit int default 30) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); sp public.seeker_profiles; f jsonb; res jsonb;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into sp from public.seeker_profiles where user_id = uid;
  if not found then return '[]'::jsonb; end if;
  f := sp.filters;
  select coalesce(jsonb_agg(x.o order by x.rank desc), '[]'::jsonb) into res from (
    select jsonb_build_object(
             'id', j.id, 'title', j.title, 'category', j.category, 'type', j.type,
             'salary_min', j.salary_min, 'salary_max', j.salary_max, 'area_id', j.area_id,
             'skills', to_jsonb(j.skills), 'description', j.description, 'posted_at', j.posted_at,
             'boosted', coalesce(j.boosted_until > now(), false),
             'company', jsonb_build_object('name', e.name, 'verified', true),
             'match', m.mj) as o,
           ((m.mj->>'score')::numeric + case when j.boosted_until > now() then 8 else 0 end) as rank
    from public.jobs j
    join public.employers e on e.user_id = j.employer_id
    join public.profiles pr on pr.id = j.employer_id
    cross join lateral (select app.match(uid, j.id) as mj) m
    where j.status = 'published' and e.verification_status = 'verified' and not pr.suspended
      and not exists (select 1 from public.swipes s where s.user_id = uid and s.job_id = j.id)
      and not exists (select 1 from public.applications a where a.user_id = uid and a.job_id = j.id)
      and (coalesce(f->>'type', '') = '' or j.type = f->>'type')
      and (coalesce((f->>'minSalary')::int, 0) = 0 or j.salary_max >= (f->>'minSalary')::int)
      and (not coalesce((f->>'nearMe')::boolean, false) or app.dist_km(sp.area_id, j.area_id) <= sp.commute_km)
    order by rank desc limit greatest(1, least(p_limit, 100))
  ) x;
  return res;
end $$;

create or replace function app.job_card(p_user uuid, p_job uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', j.id, 'title', j.title, 'category', j.category, 'type', j.type, 'status', j.status,
    'salary_min', j.salary_min, 'salary_max', j.salary_max, 'area_id', j.area_id, 'role_id', j.role_id,
    'skills', to_jsonb(j.skills), 'description', j.description, 'posted_at', j.posted_at,
    'boosted', coalesce(j.boosted_until > now(), false),
    'company', jsonb_build_object('name', e.name, 'about', e.about, 'type', e.type, 'area_id', e.area_id, 'verified', e.verification_status = 'verified'),
    'match', app.match(p_user, j.id))
  from public.jobs j join public.employers e on e.user_id = j.employer_id where j.id = p_job
$$;

create or replace function public.get_job(p_job uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); card jsonb; sw text; ap public.applications;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into ap from public.applications where user_id = uid and job_id = p_job;
  if not exists (select 1 from public.jobs j join public.employers e on e.user_id = j.employer_id
                 where j.id = p_job and ((j.status = 'published' and e.verification_status = 'verified') or ap.id is not null)) then
    return null;
  end if;
  card := app.job_card(uid, p_job);
  select dir into sw from public.swipes where user_id = uid and job_id = p_job;
  insert into public.job_views (job_id, user_id) values (p_job, uid) on conflict do nothing;
  return card || jsonb_build_object('swipe', sw, 'application', case when ap.id is null then null else jsonb_build_object('id', ap.id, 'status', ap.status, 'starred', ap.starred, 'created_at', ap.created_at) end);
end $$;

create or replace function app.refund_star(p_user uuid) returns void language sql security definer set search_path = '' as $$
  update public.seeker_profiles set stars_used = greatest(0, stars_used - 1) where user_id = p_user and stars_date = app.today()
$$;

create or replace function public.swipe_job(p_job uuid, p_dir text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); prev text;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_dir not in ('left', 'right', 'star') then raise exception 'invalid direction'; end if;
  if not exists (select 1 from public.jobs j join public.employers e on e.user_id = j.employer_id where j.id = p_job and j.status = 'published' and e.verification_status = 'verified')
     and not exists (select 1 from public.applications where user_id = uid and job_id = p_job) then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;
  select dir into prev from public.swipes where user_id = uid and job_id = p_job;
  if p_dir = 'star' and prev is distinct from 'star' then
    if app.stars_left(uid) <= 0 then return jsonb_build_object('ok', false, 'reason', 'nostars'); end if;
    update public.seeker_profiles set stars_used = case when stars_date = app.today() then stars_used + 1 else 1 end, stars_date = app.today() where user_id = uid;
  elsif prev = 'star' and p_dir <> 'star' then
    perform app.refund_star(uid);
  end if;
  insert into public.swipes (user_id, job_id, dir) values (uid, p_job, p_dir)
    on conflict (user_id, job_id) do update set dir = excluded.dir, created_at = now();
  insert into public.job_views (job_id, user_id) values (p_job, uid) on conflict do nothing;
  return jsonb_build_object('ok', true, 'stars_left', app.stars_left(uid));
end $$;

create or replace function public.undo_swipe() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.swipes;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into s from public.swipes where user_id = uid and dir <> 'removed' order by created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;
  if exists (select 1 from public.applications where user_id = uid and job_id = s.job_id) then
    return jsonb_build_object('ok', false, 'reason', 'applied');
  end if;
  delete from public.swipes where user_id = uid and job_id = s.job_id;
  if s.dir = 'star' then perform app.refund_star(uid); end if;
  return jsonb_build_object('ok', true, 'job_id', s.job_id, 'stars_left', app.stars_left(uid));
end $$;

create or replace function public.remove_preferred(p_job uuid) returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); prev text;
begin
  select dir into prev from public.swipes where user_id = uid and job_id = p_job;
  if prev = 'star' then perform app.refund_star(uid); end if;
  update public.swipes set dir = 'removed' where user_id = uid and job_id = p_job and dir in ('right', 'star');
end $$;

create or replace function public.get_preferred() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('job', app.job_card(uid, s.job_id), 'starred', s.dir = 'star', 'saved_at', s.created_at,
             'application', case when a.id is null then null else jsonb_build_object('id', a.id, 'status', a.status) end)
           order by (s.dir = 'star') desc, s.created_at desc)
    from public.swipes s
    join public.jobs j on j.id = s.job_id and j.status <> 'removed'
    left join public.applications a on a.user_id = uid and a.job_id = s.job_id
    where s.user_id = uid and s.dir in ('right', 'star')
  ), '[]'::jsonb);
end $$;

create or replace function public.apply_job(p_job uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); ap public.applications; j public.jobs; sw text; sc int; em public.employers;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into ap from public.applications where user_id = uid and job_id = p_job;
  if found then return jsonb_build_object('ok', true, 'existing', true, 'id', ap.id); end if;
  select j2.* into j from public.jobs j2 join public.employers e on e.user_id = j2.employer_id where j2.id = p_job and j2.status = 'published' and e.verification_status = 'verified';
  if not found then return jsonb_build_object('ok', false, 'reason', 'unavailable'); end if;
  if not exists (select 1 from public.seeker_profiles where user_id = uid and onboarded) then return jsonb_build_object('ok', false, 'reason', 'profile'); end if;
  select dir into sw from public.swipes where user_id = uid and job_id = p_job;
  if sw is null or sw in ('left', 'removed') then
    insert into public.swipes (user_id, job_id, dir) values (uid, p_job, 'right')
      on conflict (user_id, job_id) do update set dir = 'right', created_at = now();
    sw := 'right';
  end if;
  sc := (app.match(uid, p_job)->>'score')::int;
  insert into public.applications (user_id, job_id, starred, score) values (uid, p_job, sw = 'star', sc) returning * into ap;
  select * into em from public.employers where user_id = j.employer_id;
  if coalesce((em.notif->>'applicants')::boolean, true) then
    perform app.notify(j.employer_id, 'applicant', 'New applicant', 'Someone applied to ' || j.title || case when sw = 'star' then ' and starred it as a top choice.' else '.' end, '/employer/jobs/' || j.id || '/applicants');
  end if;
  return jsonb_build_object('ok', true, 'id', ap.id);
end $$;

create or replace function public.my_applications() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'status', a.status, 'starred', a.starred, 'score', a.score, 'created_at', a.created_at, 'viewed', a.viewed_at is not null,
      'job', jsonb_build_object('id', j.id, 'title', j.title, 'role_id', j.role_id, 'company', e.name),
      'conversation_id', (select c.id from public.conversations c where c.application_id = a.id)) order by a.created_at desc)
    from public.applications a join public.jobs j on j.id = a.job_id join public.employers e on e.user_id = j.employer_id
    where a.user_id = uid), '[]'::jsonb);
end $$;

create or replace function public.application_insights(p_app uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); a public.applications; rk int; tot int; med numeric; avgd numeric;
begin
  select * into a from public.applications where id = p_app and user_id = uid;
  if not found then raise exception 'not found'; end if;
  if not app.is_pro(uid) then raise exception 'pro_required'; end if;
  select 1 + count(*) filter (where b.score > a.score), count(*), percentile_cont(0.5) within group (order by b.score)
    into rk, tot, med from public.applications b where b.job_id = a.job_id;
  select avg(extract(epoch from (b.responded_at - b.created_at)) / 3600) into avgd from public.applications b where b.job_id = a.job_id and b.responded_at is not null;
  return jsonb_build_object('status', a.status, 'score', a.score, 'viewed_at', a.viewed_at, 'responded_at', a.responded_at,
    'applied_at', a.created_at, 'rank', rk, 'total', tot, 'median_score', round(med), 'avg_response_hours', round(avgd));
end $$;

create or replace function public.my_matches() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'application_id', a.id, 'status', a.status, 'matched_at', a.updated_at,
      'job', jsonb_build_object('id', j.id, 'title', j.title, 'role_id', j.role_id),
      'company', jsonb_build_object('name', e.name, 'contact_name', e.contact_name, 'contact_email', e.contact_email, 'contact_phone', e.contact_phone, 'address', e.address),
      'conversation_id', (select c.id from public.conversations c where c.application_id = a.id)) order by a.updated_at desc)
    from public.applications a join public.jobs j on j.id = a.job_id join public.employers e on e.user_id = j.employer_id
    where a.user_id = uid and a.status in ('shortlisted', 'hired')), '[]'::jsonb);
end $$;

create or replace function public.take_unseen_match() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); a public.applications; res jsonb;
begin
  select * into a from public.applications where user_id = uid and status = 'shortlisted' and not match_seen order by updated_at limit 1;
  if not found then return null; end if;
  update public.applications set match_seen = true where id = a.id;
  select jsonb_build_object('application_id', a.id, 'job_title', j.title, 'company', e.name) into res
    from public.jobs j join public.employers e on e.user_id = j.employer_id where j.id = a.job_id;
  return res;
end $$;

-- =====================================================================
-- career breakdown, roadmap, quizzes
-- =====================================================================
create or replace function public.breakdown(p_kind text, p_id text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); rid text; j public.jobs; r public.career_roles; pro boolean;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_kind = 'job' then
    select * into j from public.jobs where id = p_id::uuid;
    rid := j.role_id;
  else
    rid := p_id;
  end if;
  select * into r from public.career_roles where id = rid and active;
  if not found then return null; end if;
  pro := app.is_pro(uid);
  return jsonb_build_object(
    'role', jsonb_build_object('id', r.id, 'title', r.title, 'category', r.category, 'overview', r.overview, 'duties', to_jsonb(r.duties)),
    'job', case when j.id is null then null else jsonb_build_object('id', j.id, 'title', j.title, 'company', (select name from public.employers where user_id = j.employer_id)) end,
    'salary', app.salary_for(rid), 'readiness', app.readiness(uid, rid), 'pro', pro,
    'growth', case when pro then r.growth else null end, 'courses', case when pro then r.courses else null end,
    'weeks', app.roadmap_json(uid, rid, pro));
end $$;

create or replace function public.career_overview() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); goal text;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select goal_role into goal from public.seeker_profiles where user_id = uid;
  return jsonb_build_object(
    'goal', case when goal is null then null else jsonb_build_object('role', (select jsonb_build_object('id', id, 'title', title) from public.career_roles where id = goal), 'readiness', app.readiness(uid, goal)) end,
    'tracked', coalesce((
      select jsonb_agg(t.o) from (
        select jsonb_build_object('job_id', j.id, 'title', r.title, 'role_id', r.id, 'company', e.name, 'reason', t0.reason, 'ready', (app.readiness(uid, r.id)->>'ready')::int) as o
        from (
          select a.job_id, 'Applied' as reason from public.applications a where a.user_id = uid
          union
          select s.job_id, 'Starred' from public.swipes s where s.user_id = uid and s.dir = 'star' and not exists (select 1 from public.applications a2 where a2.user_id = uid and a2.job_id = s.job_id)
        ) t0
        join public.jobs j on j.id = t0.job_id join public.career_roles r on r.id = j.role_id join public.employers e on e.user_id = j.employer_id
      ) t), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'category', category, 'salary', app.salary_for(id)) order by title) from public.career_roles where active), '[]'::jsonb));
end $$;

create or replace function public.toggle_task(p_task text, p_done boolean) returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t public.roadmap_tasks;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_task ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' then
    update public.roadmap_extra set done = p_done where id = p_task::uuid and user_id = uid;
    return;
  end if;
  select * into t from public.roadmap_tasks where id = p_task;
  if not found then raise exception 'not found'; end if;
  if t.week > 1 and not app.is_pro(uid) then raise exception 'pro_required'; end if;
  if p_done then
    insert into public.roadmap_progress (user_id, task_id) values (uid, p_task) on conflict do nothing;
  else
    delete from public.roadmap_progress where user_id = uid and task_id = p_task;
  end if;
end $$;

create or replace function public.quiz_for_task(p_task text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.roadmap_tasks;
begin
  select * into t from public.roadmap_tasks where id = p_task;
  if not found then return null; end if;
  if t.week > 1 and not app.is_pro(auth.uid()) then raise exception 'pro_required'; end if;
  return jsonb_build_object('skill', t.skill, 'questions', coalesce((
    select jsonb_agg(jsonb_build_object('id', q.id, 'question', q.question, 'options', q.options) order by q.id)
    from (select * from public.quiz_questions where skill = t.skill order by id limit 3) q), '[]'::jsonb));
end $$;

create or replace function public.submit_quiz(p_task text, p_answers jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t public.roadmap_tasks; score int := 0; total int := 0; q record; passed boolean;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into t from public.roadmap_tasks where id = p_task and type = 'quiz';
  if not found then raise exception 'not a quiz'; end if;
  if t.week > 1 and not app.is_pro(uid) then raise exception 'pro_required'; end if;
  for q in select id, answer from public.quiz_questions where skill = t.skill order by id limit 3 loop
    total := total + 1;
    if (p_answers->>(q.id::text))::int = q.answer then score := score + 1; end if;
  end loop;
  if total = 0 then
    total := 5; score := greatest(1, least(5, coalesce((p_answers->>'confidence')::int, 3)));
  end if;
  passed := score::numeric / total >= 0.6;
  insert into public.quiz_results (user_id, task_id, score, total) values (uid, p_task, score, total)
    on conflict (user_id, task_id) do update set score = excluded.score, total = excluded.total, created_at = now();
  if passed then
    insert into public.roadmap_progress (user_id, task_id) values (uid, p_task) on conflict do nothing;
  else
    delete from public.roadmap_progress where user_id = uid and task_id = p_task;
    insert into public.roadmap_extra (user_id, role_id, week, skill, text)
    select uid, t.role_id, t.week, t.skill, 'Review: revisit ' || t.skill || ' basics, then retake the quiz'
    where (select count(*) from public.roadmap_extra where user_id = uid and role_id = t.role_id and skill = t.skill and not done) < 2;
  end if;
  return jsonb_build_object('score', score, 'total', total, 'passed', passed);
end $$;

create or replace function public.save_course_click(p_role text, p_title text, p_provider text, p_url text) returns void language sql security definer set search_path = '' as $$
  insert into public.course_clicks (user_id, role_id, title, provider, url) values (auth.uid(), p_role, left(p_title, 200), left(p_provider, 100), left(p_url, 500))
$$;

-- =====================================================================
-- reports, notifications, data export
-- =====================================================================
create or replace function public.mark_all_read() returns void language sql security definer set search_path = '' as $$
  update public.notifications set read = true where user_id = auth.uid() and not read
$$;

create or replace function public.export_my_data() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'seeker_profile', (select to_jsonb(s) - 'user_id' from public.seeker_profiles s where s.user_id = uid),
    'skills', (select coalesce(jsonb_agg(to_jsonb(k) - 'user_id'), '[]') from public.seeker_skills k where k.user_id = uid),
    'employer', (select to_jsonb(e) from public.employers e where e.user_id = uid),
    'swipes', (select coalesce(jsonb_agg(to_jsonb(w) - 'user_id'), '[]') from public.swipes w where w.user_id = uid),
    'applications', (select coalesce(jsonb_agg(to_jsonb(a) - 'user_id'), '[]') from public.applications a where a.user_id = uid),
    'messages', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.messages m where m.sender_id = uid),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(n) - 'user_id'), '[]') from public.notifications n where n.user_id = uid),
    'payments', (select coalesce(jsonb_agg(to_jsonb(y) - 'user_id'), '[]') from public.payments y where y.user_id = uid));
end $$;

-- =====================================================================
-- chat
-- =====================================================================
create or replace function public.my_conversations() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'job_title', j.title, 'job_id', j.id,
      'other_id', case when c.seeker_id = uid then c.employer_id else c.seeker_id end,
      'other_name', case when c.seeker_id = uid then e.name else sp.full_name end,
      'last_body', lm.body, 'last_at', coalesce(c.last_message_at, c.created_at),
      'unread', (select count(*) from public.messages m where m.conversation_id = c.id and m.sender_id <> uid and m.read_at is null),
      'blocked', exists (select 1 from public.blocks b where (b.blocker_id = uid and b.blocked_id = case when c.seeker_id = uid then c.employer_id else c.seeker_id end)
                                                          or (b.blocked_id = uid and b.blocker_id = case when c.seeker_id = uid then c.employer_id else c.seeker_id end)))
      order by coalesce(c.last_message_at, c.created_at) desc)
    from public.conversations c
    join public.jobs j on j.id = c.job_id
    join public.employers e on e.user_id = c.employer_id
    join public.profiles sp on sp.id = c.seeker_id
    left join lateral (select m2.body from public.messages m2 where m2.conversation_id = c.id order by m2.created_at desc limit 1) lm on true
    where c.seeker_id = uid or c.employer_id = uid), '[]'::jsonb);
end $$;

create or replace function public.send_message(p_conv uuid, p_body text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); c public.conversations; other uuid; mid uuid; msg text := trim(p_body); who text; recent int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into c from public.conversations where id = p_conv and (seeker_id = uid or employer_id = uid);
  if not found then raise exception 'not found'; end if;
  if char_length(msg) < 1 or char_length(msg) > 2000 then raise exception 'message must be 1 to 2000 characters'; end if;
  other := case when c.seeker_id = uid then c.employer_id else c.seeker_id end;
  if exists (select 1 from public.blocks where (blocker_id = uid and blocked_id = other) or (blocker_id = other and blocked_id = uid)) then
    raise exception 'blocked';
  end if;
  select count(*) into recent from public.messages where sender_id = uid and created_at > now() - interval '1 minute';
  if recent >= 20 then raise exception 'slow_down'; end if;
  insert into public.messages (conversation_id, sender_id, body) values (p_conv, uid, msg) returning id into mid;
  update public.conversations set last_message_at = now() where id = p_conv;
  if not exists (select 1 from public.notifications where user_id = other and ref = '/messages/' || p_conv and not read) then
    select case when c.seeker_id = uid then (select name from public.employers where user_id = uid) else (select full_name from public.profiles where id = uid) end into who;
    perform app.notify(other, 'message', 'New message from ' || coalesce(who, 'a match'), left(msg, 120), '/messages/' || p_conv);
  end if;
  return jsonb_build_object('id', mid);
end $$;

create or replace function public.mark_conversation_read(p_conv uuid) returns void language sql security definer set search_path = '' as $$
  update public.messages m set read_at = now()
  where m.conversation_id = p_conv and m.sender_id <> auth.uid() and m.read_at is null
    and exists (select 1 from public.conversations c where c.id = p_conv and (c.seeker_id = auth.uid() or c.employer_id = auth.uid()));
  update public.notifications set read = true where user_id = auth.uid() and ref = '/messages/' || p_conv
$$;

create or replace function public.report_content(p_kind text, p_target text, p_reason text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  insert into public.reports (reporter_id, kind, target_id, reason) values (auth.uid(), p_kind, p_target, trim(p_reason));
end $$;

-- =====================================================================
-- employer
-- =====================================================================
create or replace function app.employer_plan(p_user uuid) returns text language sql stable security definer set search_path = '' as $$
  select plan from public.employers where user_id = p_user
$$;

create or replace function public.set_job_status(p_job uuid, p_status text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); j public.jobs; e public.employers; live int;
begin
  select * into j from public.jobs where id = p_job and employer_id = uid;
  if not found then raise exception 'not found'; end if;
  select * into e from public.employers where user_id = uid;
  if j.status = 'removed' then raise exception 'removed'; end if;
  if p_status not in ('published', 'paused', 'closed') then raise exception 'invalid status'; end if;
  if p_status = 'published' and j.status <> 'published' then
    if e.verification_status <> 'verified' then return jsonb_build_object('ok', false, 'reason', 'verify_required'); end if;
    select count(*) into live from public.jobs where employer_id = uid and status = 'published';
    if live >= app.plan_posts(e.plan) then return jsonb_build_object('ok', false, 'reason', 'plan_limit', 'limit', app.plan_posts(e.plan)); end if;
    update public.jobs set status = 'published', posted_at = now() where id = p_job;
  else
    update public.jobs set status = p_status where id = p_job;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.employer_overview() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); e public.employers; ranked boolean;
begin
  select * into e from public.employers where user_id = uid;
  if not found then raise exception 'not an employer'; end if;
  ranked := e.plan <> 'starter';
  return jsonb_build_object(
    'live', (select count(*) from public.jobs where employer_id = uid and status = 'published'),
    'applicants', (select count(*) from public.applications a join public.jobs j on j.id = a.job_id where j.employer_id = uid),
    'matched', (select count(*) from public.applications a join public.jobs j on j.id = a.job_id where j.employer_id = uid and a.status in ('shortlisted', 'hired')),
    'views', (select count(*) from public.job_views v join public.jobs j on j.id = v.job_id where j.employer_id = uid),
    'recent', coalesce((
      select jsonb_agg(r.o) from (
        select jsonb_build_object('app_id', a.id, 'job_id', j.id, 'job_title', j.title, 'created_at', a.created_at,
                 'name', app.mask_name(pr.full_name, a.status in ('shortlisted', 'hired')), 'initials', upper(left(pr.full_name, 1)),
                 'score', case when ranked then a.score end, 'starred', case when ranked then a.starred else false end) as o
        from public.applications a join public.jobs j on j.id = a.job_id join public.profiles pr on pr.id = a.user_id
        where j.employer_id = uid
        order by case when ranked then a.starred::int end desc nulls last, case when ranked then a.score end desc nulls last, a.created_at desc limit 5) r), '[]'::jsonb));
end $$;

create or replace function public.employer_applicants(p_job uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); e public.employers; ranked boolean;
begin
  select * into e from public.employers where user_id = uid;
  if not found or not exists (select 1 from public.jobs where id = p_job and employer_id = uid) then raise exception 'not found'; end if;
  ranked := e.plan <> 'starter';
  return jsonb_build_object('ranked', ranked, 'items', coalesce((
    select jsonb_agg(x.o) from (
      select jsonb_build_object('id', a.id, 'status', a.status, 'created_at', a.created_at,
               'name', app.mask_name(pr.full_name, a.status in ('shortlisted', 'hired')), 'initials', upper(left(pr.full_name, 1)),
               'area_id', sp.area_id, 'viewed', a.viewed_at is not null,
               'starred', case when ranked then a.starred else false end,
               'score', case when ranked then a.score end,
               'skills', (select coalesce(jsonb_agg(k.skill order by k.level desc), '[]') from public.seeker_skills k where k.user_id = a.user_id)) as o
      from public.applications a join public.profiles pr on pr.id = a.user_id join public.seeker_profiles sp on sp.user_id = a.user_id
      where a.job_id = p_job
      order by case when ranked then a.starred::int end desc nulls last, case when ranked then a.score end desc nulls last, a.created_at asc) x), '[]'::jsonb));
end $$;

create or replace function public.employer_application(p_app uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); a public.applications; j public.jobs; e public.employers; sp public.seeker_profiles; pr public.profiles;
        named boolean; ranked boolean; m jsonb; em text;
begin
  select * into a from public.applications where id = p_app;
  select * into j from public.jobs where id = a.job_id;
  if not found or j.employer_id <> uid then raise exception 'not found'; end if;
  select * into e from public.employers where user_id = uid;
  select * into sp from public.seeker_profiles where user_id = a.user_id;
  select * into pr from public.profiles where id = a.user_id;
  named := a.status in ('shortlisted', 'hired'); ranked := e.plan <> 'starter';
  if a.viewed_at is null then update public.applications set viewed_at = now() where id = p_app; end if;
  m := app.match(a.user_id, a.job_id);
  select email into em from auth.users where id = a.user_id;
  return jsonb_build_object(
    'id', a.id, 'status', a.status, 'created_at', a.created_at, 'job', jsonb_build_object('id', j.id, 'title', j.title, 'skills', to_jsonb(j.skills)),
    'name', app.mask_name(pr.full_name, named), 'named', named, 'starred', case when ranked then a.starred else false end,
    'score', case when ranked then a.score end, 'why', case when ranked then m->'why' end, 'missing', case when ranked then m->'missing' end,
    'skills', (select coalesce(jsonb_agg(jsonb_build_object('name', k.skill, 'level', k.level) order by k.level desc), '[]') from public.seeker_skills k where k.user_id = a.user_id),
    'education', jsonb_build_object('level', sp.edu_level, 'school', sp.school, 'course', sp.course),
    'experience', sp.experience, 'resume_mode', sp.resume_mode, 'resume_summary', sp.resume_summary,
    'resume_path', case when named then sp.resume_path end,
    'area_id', sp.area_id,
    'age', case when named and sp.birth_year is not null then extract(year from now())::int - sp.birth_year end,
    'gender', case when named then nullif(sp.gender, '') end,
    'contact', case when named then jsonb_build_object('email', em, 'phone', pr.phone, 'full_name', pr.full_name) end,
    'conversation_id', (select c.id from public.conversations c where c.application_id = a.id));
end $$;

create or replace function public.set_application_status(p_app uuid, p_status text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); a public.applications; j public.jobs; e public.employers; sp public.seeker_profiles;
begin
  select * into a from public.applications where id = p_app;
  select * into j from public.jobs where id = a.job_id;
  if not found or j.employer_id <> uid then raise exception 'not found'; end if;
  select * into e from public.employers where user_id = uid;
  if not ((a.status = 'applied' and p_status in ('shortlisted', 'rejected')) or (a.status = 'shortlisted' and p_status in ('hired', 'rejected'))) then
    raise exception 'invalid_transition';
  end if;
  update public.applications set status = p_status, responded_at = coalesce(responded_at, now()),
         match_seen = case when p_status = 'shortlisted' then false else match_seen end where id = p_app;
  select * into sp from public.seeker_profiles where user_id = a.user_id;
  if p_status = 'shortlisted' then
    insert into public.conversations (application_id, seeker_id, employer_id, job_id) values (a.id, a.user_id, uid, j.id) on conflict (application_id) do nothing;
    if coalesce((sp.notif->>'matches')::boolean, true) then
      perform app.notify(a.user_id, 'match', 'It''s a Match!', e.name || ' shortlisted you for ' || j.title || '.', '/matches');
    end if;
  elsif coalesce((sp.notif->>'status')::boolean, true) then
    perform app.notify(a.user_id, 'status',
      case when p_status = 'hired' then 'You''re hired!' else 'Application update' end,
      case when p_status = 'hired' then e.name || ' marked you as hired for ' || j.title || '. Congratulations!'
           else e.name || ' did not move forward with your application for ' || j.title || '. Check your Career Breakdown for next steps.' end,
      '/applications');
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.candidate_search(p_q text, p_area text, p_job uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); e public.employers;
begin
  select * into e from public.employers where user_id = uid;
  if not found then raise exception 'not an employer'; end if;
  if e.plan <> 'business' then raise exception 'plan_required'; end if;
  return coalesce((
    select jsonb_agg(x.o) from (
      select jsonb_build_object('id', sp.user_id, 'name', app.mask_name(pr.full_name, false), 'initials', upper(left(pr.full_name, 1)),
               'area_id', sp.area_id, 'education', sp.edu_level,
               'skills', (select coalesce(jsonb_agg(jsonb_build_object('name', k.skill, 'level', k.level) order by k.level desc), '[]') from public.seeker_skills k where k.user_id = sp.user_id),
               'score', case when p_job is null then null else (app.match(sp.user_id, p_job)->>'score')::int end,
               'invited', exists (select 1 from public.invites i where i.seeker_id = sp.user_id and i.job_id = p_job)) as o,
             case when p_job is null then 0 else (app.match(sp.user_id, p_job)->>'score')::int end as rk
      from public.seeker_profiles sp join public.profiles pr on pr.id = sp.user_id
      where sp.open_to_employers and sp.onboarded and not pr.suspended
        and (coalesce(p_area, '') = '' or sp.area_id = p_area)
        and (coalesce(trim(p_q), '') = '' or exists (select 1 from public.seeker_skills k where k.user_id = sp.user_id and k.skill ilike '%' || trim(p_q) || '%'))
      order by rk desc limit 50) x), '[]'::jsonb);
end $$;

create or replace function public.invite_candidate(p_seeker uuid, p_job uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); e public.employers; j public.jobs;
begin
  select * into e from public.employers where user_id = uid;
  if e.plan <> 'business' then raise exception 'plan_required'; end if;
  select * into j from public.jobs where id = p_job and employer_id = uid and status = 'published';
  if not found then raise exception 'publish the job first'; end if;
  if not exists (select 1 from public.seeker_profiles where user_id = p_seeker and open_to_employers) then raise exception 'not available'; end if;
  insert into public.invites (employer_id, seeker_id, job_id) values (uid, p_seeker, p_job) on conflict do nothing;
  perform app.notify(p_seeker, 'invite', 'You were invited to apply', e.name || ' invited you to apply for ' || j.title || '.', '/jobs/' || j.id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.employer_analytics() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); e public.employers;
begin
  select * into e from public.employers where user_id = uid;
  if not found then raise exception 'not an employer'; end if;
  if e.plan = 'starter' then raise exception 'plan_required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('job_id', j.id, 'title', j.title, 'status', j.status,
      'views', (select count(*) from public.job_views v where v.job_id = j.id),
      'left', (select count(*) from public.swipes s where s.job_id = j.id and s.dir = 'left'),
      'right', (select count(*) from public.swipes s where s.job_id = j.id and s.dir in ('right', 'removed')),
      'star', (select count(*) from public.swipes s where s.job_id = j.id and s.dir = 'star'),
      'applications', (select count(*) from public.applications a where a.job_id = j.id),
      'matched', (select count(*) from public.applications a where a.job_id = j.id and a.status in ('shortlisted', 'hired'))) order by j.created_at desc)
    from public.jobs j where j.employer_id = uid and j.status in ('published', 'paused', 'closed')), '[]'::jsonb);
end $$;

-- =====================================================================
-- admin
-- =====================================================================
create or replace function public.admin_overview() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return jsonb_build_object(
    'seekers', (select count(*) from public.profiles where role = 'seeker'),
    'employers', (select count(*) from public.profiles where role = 'employer'),
    'live_jobs', (select count(*) from public.jobs where status = 'published'),
    'applications', (select count(*) from public.applications),
    'pending_verification', (select count(*) from public.employers where verification_status = 'pending'),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'matches', (select count(*) from public.applications where status in ('shortlisted', 'hired')),
    'hires', (select count(*) from public.applications where status = 'hired'),
    'roadmap_users', (select count(distinct user_id) from public.roadmap_progress),
    'tickets', coalesce((select jsonb_agg(t.o) from (
        select jsonb_build_object('id', k.id, 'kind', k.kind, 'subject', k.subject, 'message', k.message, 'created_at', k.created_at, 'user', pr.full_name) as o
        from public.tickets k join public.profiles pr on pr.id = k.user_id order by k.created_at desc limit 8) t), '[]'::jsonb));
end $$;

create or replace function public.admin_verification_queue() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
    'user_id', e.user_id, 'name', e.name, 'type', e.type, 'address', e.address, 'contact_name', e.contact_name, 'contact_email', e.contact_email,
    'contact_phone', e.contact_phone, 'status', e.verification_status, 'reason', e.verification_reason, 'submitted_at', e.submitted_at, 'reviewed_at', e.reviewed_at,
    'docs', (select coalesce(jsonb_agg(jsonb_build_object('kind', d.kind, 'name', d.file_name, 'path', d.file_path)), '[]') from public.employer_docs d where d.employer_id = e.user_id))
    order by (e.verification_status = 'pending') desc, e.submitted_at desc) from public.employers e), '[]'::jsonb);
end $$;

create or replace function public.admin_review_employer(p_employer uuid, p_approve boolean, p_reason text default '') returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  if p_approve then
    update public.employers set verification_status = 'verified', verification_reason = '', reviewed_at = now(), reviewed_by = auth.uid() where user_id = p_employer;
    perform app.notify(p_employer, 'tip', 'You are verified!', 'Your business is verified. You can publish jobs now.', '/employer/jobs/new');
  else
    if coalesce(trim(p_reason), '') = '' then raise exception 'a reason is required'; end if;
    update public.employers set verification_status = 'rejected', verification_reason = trim(p_reason), reviewed_at = now(), reviewed_by = auth.uid() where user_id = p_employer;
    update public.jobs set status = 'paused' where employer_id = p_employer and status = 'published';
    perform app.notify(p_employer, 'tip', 'Verification not approved', trim(p_reason), '/employer');
  end if;
  perform app.audit(case when p_approve then 'employer.approve' else 'employer.reject' end, p_employer::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.admin_revoke_employer(p_employer uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  update public.employers set verification_status = 'pending', reviewed_at = null where user_id = p_employer;
  update public.jobs set status = 'paused' where employer_id = p_employer and status = 'published';
  perform app.audit('employer.revoke', p_employer::text);
end $$;

create or replace function public.admin_reports() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'target_id', r.target_id, 'reason', r.reason, 'status', r.status, 'created_at', r.created_at,
    'reporter', rp.full_name,
    'job', case when r.kind = 'job' then (select jsonb_build_object('id', j.id, 'title', j.title, 'description', j.description, 'status', j.status, 'employer_id', j.employer_id, 'employer', e.name)
                                         from public.jobs j join public.employers e on e.user_id = j.employer_id where j.id::text = r.target_id) end,
    'message', case when r.kind = 'message' then (select jsonb_build_object('body', m.body, 'sender_id', m.sender_id, 'sender', sp.full_name)
                                                 from public.messages m join public.profiles sp on sp.id = m.sender_id where m.id::text = r.target_id) end)
    order by (r.status = 'open') desc, r.created_at desc)
    from public.reports r join public.profiles rp on rp.id = r.reporter_id), '[]'::jsonb);
end $$;

create or replace function public.admin_resolve_report(p_report uuid, p_action text) returns void language plpgsql security definer set search_path = '' as $$
declare r public.reports; j public.jobs; target uuid;
begin
  perform app.require_admin();
  select * into r from public.reports where id = p_report;
  if not found then raise exception 'not found'; end if;
  if p_action = 'dismiss' then
    update public.reports set status = 'dismissed' where id = p_report;
  elsif p_action = 'remove_job' and r.kind = 'job' then
    update public.jobs set status = 'removed', removed_reason = r.reason where id = r.target_id::uuid returning * into j;
    if j.id is not null then perform app.notify(j.employer_id, 'tip', 'A listing was removed', 'Your listing "' || j.title || '" was removed after a review. Contact support if you think this is a mistake.', '/employer/jobs'); end if;
    update public.reports set status = 'actioned' where id = p_report;
  elsif p_action = 'suspend' then
    if r.kind = 'job' then select employer_id into target from public.jobs where id = r.target_id::uuid;
    elsif r.kind = 'message' then select sender_id into target from public.messages where id = r.target_id::uuid;
    else target := r.target_id::uuid; end if;
    if target is not null then perform public.admin_set_suspended(target, true); end if;
    update public.reports set status = 'actioned' where id = p_report;
  else
    raise exception 'invalid action';
  end if;
  perform app.audit('report.' || p_action, p_report::text);
end $$;

create or replace function public.admin_remove_job(p_job uuid, p_reason text default 'Removed by admin') returns void language plpgsql security definer set search_path = '' as $$
declare j public.jobs;
begin
  perform app.require_admin();
  update public.jobs set status = 'removed', removed_reason = p_reason where id = p_job returning * into j;
  if j.id is not null then perform app.notify(j.employer_id, 'tip', 'A listing was removed', 'Your listing "' || j.title || '" was removed after a review.', '/employer/jobs'); end if;
  perform app.audit('job.remove', p_job::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.admin_set_suspended(p_user uuid, p_value boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  if exists (select 1 from public.profiles where id = p_user and role = 'admin') then raise exception 'cannot suspend an admin'; end if;
  update public.profiles set suspended = p_value where id = p_user;
  if p_value then update public.jobs set status = 'paused' where employer_id = p_user and status = 'published'; end if;
  perform app.audit(case when p_value then 'user.suspend' else 'user.reactivate' end, p_user::text);
end $$;

create or replace function public.admin_users(p_q text default '', p_role text default '') returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.full_name, 'email', u.email, 'role', pr.role, 'suspended', pr.suspended, 'created_at', pr.created_at,
      'plan', coalesce((select plan from public.seeker_profiles s where s.user_id = pr.id), (select plan from public.employers e where e.user_id = pr.id))) order by pr.created_at desc)
    from public.profiles pr join auth.users u on u.id = pr.id
    where (coalesce(p_role, '') = '' or pr.role = p_role)
      and (coalesce(trim(p_q), '') = '' or pr.full_name ilike '%' || trim(p_q) || '%' or u.email ilike '%' || trim(p_q) || '%')), '[]'::jsonb);
end $$;

create or replace function public.admin_payments_overview() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return jsonb_build_object(
    'total', coalesce((select sum(amount) from public.payments where status = 'paid'), 0),
    'by_kind', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'count', n, 'amount', amt)) from (select kind, count(*) n, sum(amount) amt from public.payments where status = 'paid' group by kind) k), '[]'::jsonb),
    'pro_subscribers', (select count(*) from public.seeker_profiles where plan = 'pro'),
    'paying_employers', (select count(*) from public.employers where plan <> 'starter'),
    'recent', coalesce((select jsonb_agg(r.o) from (
        select jsonb_build_object('id', p.id, 'who', coalesce(e.name, pr.full_name), 'kind', p.kind, 'item', p.item, 'amount', p.amount, 'provider', p.provider, 'status', p.status, 'ref', p.provider_ref, 'created_at', p.created_at) as o
        from public.payments p join public.profiles pr on pr.id = p.user_id left join public.employers e on e.user_id = p.user_id
        order by p.created_at desc limit 50) r), '[]'::jsonb));
end $$;

create or replace function public.admin_platform_analytics() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare seekers int; apps int; matches int;
begin
  perform app.require_admin();
  select count(*) into seekers from public.profiles where role = 'seeker';
  select count(*), count(*) filter (where status in ('shortlisted', 'hired')) into apps, matches from public.applications;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles where role in ('seeker', 'employer')), 'seekers', seekers,
    'applications_per_user', case when seekers > 0 then round(apps::numeric / seekers, 1) else 0 end,
    'match_rate', case when apps > 0 then round(100.0 * matches / apps) else 0 end,
    'matches', matches, 'hires', (select count(*) from public.applications where status = 'hired'),
    'skill_course_users', (select count(distinct user_id) from public.quiz_results where score::numeric / total >= 0.6),
    'jobs_by_category', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'n', n) order by n desc) from (select category, count(*) n from public.jobs where status = 'published' group by category) c), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d::date, 'signups', (select count(*) from public.profiles p where p.created_at::date = d::date), 'applications', (select count(*) from public.applications a where a.created_at::date = d::date)) order by d)
                       from generate_series((current_date - 13)::timestamp, current_date::timestamp, interval '1 day') d), '[]'::jsonb));
end $$;

create or replace function public.admin_course_overview() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return jsonb_build_object(
    'partners', coalesce((select jsonb_agg(jsonb_build_object('provider', cp.provider, 'rate', cp.commission_rate, 'active', cp.active,
        'clicks', (select count(*) from public.course_clicks c where c.provider = cp.provider),
        'conversions', (select count(*) from public.course_conversions v where v.provider = cp.provider),
        'sales', (select coalesce(sum(sale_amount), 0) from public.course_conversions v where v.provider = cp.provider),
        'commission', (select coalesce(sum(commission), 0) from public.course_conversions v where v.provider = cp.provider)) order by cp.provider) from public.course_partners cp), '[]'::jsonb),
    'top_courses', coalesce((select jsonb_agg(t.o) from (select jsonb_build_object('title', title, 'provider', provider, 'clicks', count(*)) as o from public.course_clicks group by title, provider order by count(*) desc limit 10) t), '[]'::jsonb),
    'conversions', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'provider', provider, 'course_title', course_title, 'sale_amount', sale_amount, 'commission', commission, 'occurred_at', occurred_at, 'notes', notes) order by occurred_at desc, created_at desc) from (select * from public.course_conversions order by occurred_at desc limit 50) c), '[]'::jsonb));
end $$;

create or replace function public.admin_log_conversion(p_provider text, p_title text, p_sale numeric, p_date date, p_notes text default '') returns void language plpgsql security definer set search_path = '' as $$
declare rate numeric;
begin
  perform app.require_admin();
  select commission_rate into rate from public.course_partners where provider = p_provider;
  if rate is null then raise exception 'unknown partner'; end if;
  insert into public.course_conversions (provider, course_title, sale_amount, commission, occurred_at, notes, created_by)
  values (p_provider, p_title, p_sale, round(p_sale * rate, 2), coalesce(p_date, current_date), coalesce(p_notes, ''), auth.uid());
  perform app.audit('course.conversion', p_provider, jsonb_build_object('sale', p_sale));
end $$;

create or replace function public.admin_send_announcement(p_title text, p_body text, p_audience text, p_push boolean) returns jsonb language plpgsql security definer set search_path = '' as $$
declare n int; aid uuid;
begin
  perform app.require_admin();
  if char_length(trim(p_title)) < 3 or char_length(trim(p_body)) < 3 then raise exception 'title and message are required'; end if;
  if p_audience not in ('all', 'seekers', 'employers') then raise exception 'invalid audience'; end if;
  insert into public.notifications (user_id, type, title, body, ref)
  select pr.id, 'announcement', trim(p_title), trim(p_body), null from public.profiles pr
  where pr.role is not null and pr.role <> 'admin' and not pr.suspended
    and (p_audience = 'all' or (p_audience = 'seekers' and pr.role = 'seeker') or (p_audience = 'employers' and pr.role = 'employer'));
  get diagnostics n = row_count;
  insert into public.announcements (title, body, audience, push, recipients, created_by) values (trim(p_title), trim(p_body), p_audience, p_push, n, auth.uid()) returning id into aid;
  perform app.audit('announcement.send', aid::text, jsonb_build_object('audience', p_audience, 'recipients', n));
  return jsonb_build_object('id', aid, 'recipients', n);
end $$;

-- =====================================================================
-- service role only (called by edge functions after a payment)
-- =====================================================================
create or replace function public.svc_record_payment(p_user uuid, p_kind text, p_item text, p_amount numeric, p_provider text, p_ref text, p_job uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pid uuid;
begin
  insert into public.payments (user_id, kind, item, amount, provider, provider_ref, status, job_id) values (p_user, p_kind, p_item, p_amount, p_provider, p_ref, 'paid', p_job) returning id into pid;
  return pid;
end $$;

create or replace function public.svc_activate_pro(p_user uuid, p_period text) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.seeker_profiles set plan = 'pro', plan_period = p_period, auto_renew = true,
         plan_renews_at = now() + case p_period when 'monthly' then interval '30 days' else interval '365 days' end where user_id = p_user;
  if not found then raise exception 'not a job seeker'; end if;
  perform app.notify(p_user, 'tip', 'Welcome to Pro', 'Unlimited stars, your full roadmap and application insights are unlocked.', '/pro');
end $$;

create or replace function public.svc_activate_employer_plan(p_user uuid, p_plan text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_plan not in ('growth', 'business') then raise exception 'invalid plan'; end if;
  update public.employers set plan = p_plan, plan_renews_at = now() + interval '30 days' where user_id = p_user;
  if not found then raise exception 'not an employer'; end if;
end $$;

create or replace function public.svc_boost_job(p_user uuid, p_job uuid, p_days int) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.jobs set boosted_until = greatest(coalesce(boosted_until, now()), now()) + make_interval(days => p_days) where id = p_job and employer_id = p_user and status = 'published';
  if not found then raise exception 'publish the job before boosting it'; end if;
end $$;

-- =====================================================================
-- exposure: only signed-in users may call public functions; svc_* are service role only
-- =====================================================================
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    if r.proname like 'svc\_%' then
      execute format('grant execute on function %s to service_role', r.sig);
    else
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
end $$;
