-- JobMatch 007: Comprehensive enhancements from plan.md
-- Interviews, quiz prerequisite gate, Free plan restrictions, company logo/docs,
-- direct candidate messaging, detailed resume reviews, and Employer Analytics v2.

-- ---------- 1. Schema additions ----------
alter table public.employers
  add column if not exists logo_path text;

grant update (logo_path) on public.employers to authenticated;

alter table public.resume_reviews
  add column if not exists strengths jsonb not null default '[]',
  add column if not exists weaknesses jsonb not null default '[]',
  add column if not exists recommendations jsonb not null default '[]';

alter table public.payments
  add column if not exists payment_method text not null default '';

-- Allow direct conversations from Candidate Search (when application_id is null)
alter table public.conversations
  alter column application_id drop not null;
create unique index if not exists conversations_direct_uniq
  on public.conversations (seeker_id, employer_id, job_id)
  where application_id is null;

-- Interviews table
create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  employer_id uuid not null references public.employers(user_id) on delete cascade,
  seeker_id uuid not null references public.profiles(id) on delete cascade,
  scheduled_date date not null,
  scheduled_time text not null,
  interview_type text not null check (interview_type in ('Online', 'On-site')),
  location_or_link text not null default '',
  notes text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled', 'confirmed', 'rescheduled', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists interviews_seeker_idx on public.interviews(seeker_id, scheduled_date);
create index if not exists interviews_employer_idx on public.interviews(employer_id, scheduled_date);

drop trigger if exists interviews_touch on public.interviews;
create trigger interviews_touch before update on public.interviews for each row execute function app.touch_updated_at();

alter table public.interviews enable row level security;
drop policy if exists "interviews participants read" on public.interviews;
create policy "interviews participants read" on public.interviews for select to authenticated
  using (seeker_id = auth.uid() or employer_id = auth.uid() or public.is_admin());
grant select on public.interviews to authenticated;

-- ---------- 2. Storage for Company Logos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-logos', 'company-logos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
   set public = true,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "company-logos public read" on storage.objects;
create policy "company-logos public read" on storage.objects for select
  using (bucket_id = 'company-logos');
drop policy if exists "company-logos owner write" on storage.objects;
create policy "company-logos owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'company-logos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "company-logos owner delete" on storage.objects;
create policy "company-logos owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'company-logos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 3. Quiz Prerequisite Gate (all non-quiz tasks in the week must be checked) ----------
create or replace function app.quiz_ready(p_user uuid, p_role text, p_week int) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.roadmap_tasks t
    left join public.roadmap_progress p on p.task_id = t.id and p.user_id = p_user
    where t.role_id = p_role and t.week = p_week and t.type <> 'quiz' and p.task_id is null
  )
$$;

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
  select coalesce(jsonb_agg(jsonb_build_object(
    'week', r.week,
    'title', r.title,
    'locked', not app.week_unlocked(p_user, p_role, r.week, p_pro),
    'pro_locked', (not p_pro and r.week > 1),
    'quiz_ready', app.quiz_ready(p_user, p_role, r.week),
    'tasks', r.tasks) order by r.week), '[]'::jsonb)
  from (
    select week, min(title) as title,
           case when not app.week_unlocked(p_user, p_role, week, p_pro) then '[]'::jsonb
                else jsonb_agg(jsonb_build_object('id', id, 'type', type, 'skill', skill, 'text', text, 'course', course, 'done', done, 'quiz', quiz, 'adaptive', adaptive) order by position) end as tasks
    from rows group by week
  ) r
$$;

create or replace function public.quiz_for_task(p_task text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.roadmap_tasks; uid uuid := auth.uid();
begin
  select * into t from public.roadmap_tasks where id = p_task;
  if not found then return null; end if;
  if t.week > 1 and not app.is_pro(uid) then raise exception 'pro_required'; end if;
  if not app.week_unlocked(uid, t.role_id, t.week, app.is_pro(uid)) then raise exception 'Complete previous week first.'; end if;
  if not app.quiz_ready(uid, t.role_id, t.week) then raise exception 'quiz_prereq_required'; end if;
  return jsonb_build_object('skill', t.skill, 'course', t.course, 'questions', coalesce((
    select jsonb_agg(jsonb_build_object('id', q.id, 'question', q.question, 'options', q.options) order by q.id desc)
    from (select * from public.quiz_questions where skill = t.skill order by id desc limit 5) q), '[]'::jsonb));
end $$;

create or replace function public.submit_quiz(p_task text, p_answers jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t public.roadmap_tasks; score int := 0; total int := 0; q record; passed boolean;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into t from public.roadmap_tasks where id = p_task and type = 'quiz';
  if not found then raise exception 'not a quiz'; end if;
  if t.week > 1 and not app.is_pro(uid) then raise exception 'pro_required'; end if;
  if not app.quiz_ready(uid, t.role_id, t.week) then raise exception 'quiz_prereq_required'; end if;
  for q in select id, answer from public.quiz_questions where skill = t.skill order by id desc limit 5 loop
    total := total + 1;
    if (p_answers->>(q.id::text))::int = q.answer then score := score + 1; end if;
  end loop;
  if total = 0 then
    total := 5; score := greatest(1, least(5, coalesce((p_answers->>'confidence')::int, 3)));
  end if;
  passed := score::numeric / total >= 0.7;
  insert into public.quiz_results (user_id, task_id, score, total) values (uid, p_task, score, total)
    on conflict (user_id, task_id) do update set score = excluded.score, total = excluded.total, created_at = now();
  if passed then
    insert into public.roadmap_progress (user_id, task_id) values (uid, p_task) on conflict do nothing;
  else
    delete from public.roadmap_progress where user_id = uid and task_id = p_task;
    insert into public.roadmap_extra (user_id, role_id, week, skill, text)
    select uid, t.role_id, t.week, t.skill, 'Review Coursera module for ' || t.skill || ', then retake the quiz (70% to pass)'
    where (select count(*) from public.roadmap_extra where user_id = uid and role_id = t.role_id and skill = t.skill and not done) < 2;
  end if;
  return jsonb_build_object('score', score, 'total', total, 'passed', passed);
end $$;

-- ---------- 4. Free Plan Restrictions (Undo, Requeue, History, Messaging Initiation) ----------
create or replace function public.undo_swipe() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.swipes;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not app.is_pro(uid) then raise exception 'pro_required'; end if;
  select * into s from public.swipes where user_id = uid and dir <> 'removed' order by created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;
  if exists (select 1 from public.applications where user_id = uid and job_id = s.job_id) then
    return jsonb_build_object('ok', false, 'reason', 'applied');
  end if;
  delete from public.swipes where user_id = uid and job_id = s.job_id;
  if s.dir = 'star' then perform app.refund_star(uid); end if;
  return jsonb_build_object('ok', true, 'job_id', s.job_id, 'stars_left', app.stars_left(uid));
end $$;

create or replace function public.requeue_passed_jobs() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not app.is_pro(uid) then raise exception 'pro_required'; end if;
  delete from public.swipes
   where user_id = uid
     and dir = 'left'
     and not exists (select 1 from public.applications a where a.user_id = uid and a.job_id = swipes.job_id);
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'count', n);
end $$;

create or replace function public.my_swipe_history() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not app.is_pro(uid) then raise exception 'pro_required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'job_id', j.id, 'title', j.title, 'type', j.type, 'company', e.name,
      'dir', s.dir, 'swiped_at', s.created_at,
      'score', (app.match(uid, j.id)->>'score')::int,
      'applied', exists (select 1 from public.applications a where a.user_id = uid and a.job_id = j.id)
    ) order by s.created_at desc)
    from public.swipes s
    join public.jobs j on j.id = s.job_id
    join public.employers e on e.user_id = j.employer_id
    where s.user_id = uid
  ), '[]'::jsonb);
end $$;

create or replace function public.my_applications() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not app.is_pro(uid) then raise exception 'pro_required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'status', a.status, 'starred', a.starred, 'score', a.score, 'created_at', a.created_at, 'viewed', a.viewed_at is not null,
      'job', jsonb_build_object('id', j.id, 'title', j.title, 'role_id', j.role_id, 'company', e.name),
      'conversation_id', (select c.id from public.conversations c where c.application_id = a.id)) order by a.created_at desc)
    from public.applications a join public.jobs j on j.id = a.job_id join public.employers e on e.user_id = j.employer_id
    where a.user_id = uid), '[]'::jsonb);
end $$;

create or replace function public.start_conversation(p_app uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); a public.applications; j public.jobs; cid uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into a from public.applications where id = p_app;
  if not found then raise exception 'not found'; end if;
  select * into j from public.jobs where id = a.job_id;
  if a.user_id <> uid and j.employer_id <> uid then raise exception 'forbidden' using errcode = '42501'; end if;
  if a.status not in ('shortlisted', 'hired') then raise exception 'not_matched'; end if;
  if a.user_id = uid and not app.is_pro(uid) then raise exception 'free_chat_restricted'; end if;
  insert into public.conversations (application_id, seeker_id, employer_id, job_id)
  values (a.id, a.user_id, j.employer_id, j.id)
  on conflict (application_id) do nothing;
  select id into cid from public.conversations where application_id = a.id;
  return jsonb_build_object('id', cid);
end $$;

create or replace function public.send_message(p_conv uuid, p_body text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); c public.conversations; other uuid; mid uuid; msg text := trim(p_body); who text; recent int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into c from public.conversations where id = p_conv and (seeker_id = uid or employer_id = uid);
  if not found then raise exception 'not found'; end if;
  -- Free job seekers can only respond after the employer initiates the conversation
  if c.seeker_id = uid and not app.is_pro(uid) then
    if not exists (select 1 from public.messages where conversation_id = p_conv and sender_id = c.employer_id) then
      raise exception 'free_chat_restricted';
    end if;
  end if;
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
    select case when c.employer_id = uid then (select name from public.employers where user_id = uid) else (select full_name from public.profiles where id = uid) end into who;
    perform app.notify(other, 'message', 'New message from ' || coalesce(who, 'a match'), left(msg, 120), '/messages/' || p_conv);
  end if;
  return jsonb_build_object('id', mid);
end $$;

-- ---------- 5. Employer Document Upsert (Company & Team) ----------
create or replace function public.employer_upsert_doc(p_kind text, p_path text, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.employers where user_id = uid) then raise exception 'not an employer'; end if;
  delete from public.employer_docs where employer_id = uid and kind = p_kind;
  insert into public.employer_docs (employer_id, kind, file_path, file_name)
  values (uid, p_kind, p_path, p_name);
end $$;

-- ---------- 6. Interview Scheduling RPCs ----------
create or replace function public.schedule_interview(
  p_app uuid, p_date date, p_time text, p_type text, p_location text, p_notes text default ''
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); a public.applications; j public.jobs; e public.employers; iid uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into a from public.applications where id = p_app;
  if not found then raise exception 'not found'; end if;
  select * into j from public.jobs where id = a.job_id and employer_id = uid;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from public.employers where user_id = uid;
  if p_type not in ('Online', 'On-site') then raise exception 'invalid interview type'; end if;
  insert into public.interviews (application_id, job_id, employer_id, seeker_id, scheduled_date, scheduled_time, interview_type, location_or_link, notes)
  values (a.id, j.id, uid, a.user_id, p_date, trim(p_time), p_type, trim(coalesce(p_location, '')), trim(coalesce(p_notes, '')))
  returning id into iid;
  perform app.notify(a.user_id, 'status', 'Interview scheduled!', e.name || ' scheduled an ' || p_type || ' interview for ' || j.title || ' on ' || to_char(p_date, 'Mon DD, YYYY') || ' at ' || trim(p_time) || '.', '/deck');
  return jsonb_build_object('ok', true, 'id', iid);
end $$;

create or replace function public.update_interview_status(
  p_id uuid, p_status text, p_date date default null, p_time text default null, p_location text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); iv public.interviews; j public.jobs; e public.employers; other uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into iv from public.interviews where id = p_id and (seeker_id = uid or employer_id = uid);
  if not found then raise exception 'not found'; end if;
  if p_status not in ('scheduled', 'confirmed', 'rescheduled', 'completed', 'cancelled') then raise exception 'invalid status'; end if;
  update public.interviews
     set status = p_status,
         scheduled_date = coalesce(p_date, scheduled_date),
         scheduled_time = coalesce(nullif(trim(p_time), ''), scheduled_time),
         location_or_link = coalesce(p_location, location_or_link)
   where id = p_id;
  select * into j from public.jobs where id = iv.job_id;
  select * into e from public.employers where user_id = iv.employer_id;
  other := case when iv.employer_id = uid then iv.seeker_id else iv.employer_id end;
  perform app.notify(other, 'status', 'Interview ' || p_status, 'Interview for ' || j.title || ' (' || e.name || ') was marked ' || p_status || '.', case when iv.employer_id = uid then '/deck' else '/employer' end);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.my_interviews() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', iv.id, 'application_id', iv.application_id, 'job_id', iv.job_id,
      'job_title', j.title, 'employer_name', e.name,
      'scheduled_date', iv.scheduled_date, 'scheduled_time', iv.scheduled_time,
      'interview_type', iv.interview_type, 'location_or_link', iv.location_or_link,
      'notes', iv.notes, 'status', iv.status
    ) order by iv.scheduled_date asc, iv.scheduled_time asc)
    from public.interviews iv
    join public.jobs j on j.id = iv.job_id
    join public.employers e on e.user_id = iv.employer_id
    where iv.seeker_id = uid
  ), '[]'::jsonb);
end $$;

create or replace function public.employer_interviews() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', iv.id, 'application_id', iv.application_id, 'job_id', iv.job_id,
      'job_title', j.title, 'applicant_name', pr.full_name,
      'scheduled_date', iv.scheduled_date, 'scheduled_time', iv.scheduled_time,
      'interview_type', iv.interview_type, 'location_or_link', iv.location_or_link,
      'notes', iv.notes, 'status', iv.status
    ) order by iv.scheduled_date asc, iv.scheduled_time asc)
    from public.interviews iv
    join public.jobs j on j.id = iv.job_id
    join public.profiles pr on pr.id = iv.seeker_id
    where iv.employer_id = uid
  ), '[]'::jsonb);
end $$;

-- ---------- 7. Candidate Search Enhancements & Direct Messaging ----------
create or replace function public.candidate_search(p_q text, p_area text, p_job uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); e public.employers; ref_job uuid := p_job;
begin
  select * into e from public.employers where user_id = uid;
  if not found then raise exception 'not an employer'; end if;
  if e.plan <> 'business' then raise exception 'plan_required'; end if;
  if ref_job is null then
    select id into ref_job from public.jobs where employer_id = uid and status = 'published' order by posted_at desc limit 1;
  end if;
  return coalesce((
    select jsonb_agg(x.o) from (
      select jsonb_build_object(
               'id', sp.user_id,
               'name', app.mask_name(pr.full_name, false),
               'initials', upper(left(pr.full_name, 1)),
               'area_id', sp.area_id,
               'education', sp.edu_level,
               'school', sp.school,
               'course', sp.course,
               'experience', sp.experience,
               'resume_summary', sp.resume_summary,
               'goal_text', sp.goal_text,
               'skills', (select coalesce(jsonb_agg(jsonb_build_object('name', k.skill, 'level', k.level) order by k.level desc), '[]') from public.seeker_skills k where k.user_id = sp.user_id),
               'score', case when ref_job is null then null else (app.match(sp.user_id, ref_job)->>'score')::int end,
               'match', case when ref_job is null then null else app.match(sp.user_id, ref_job) end,
               'ref_job_id', ref_job,
               'invited', exists (select 1 from public.invites i where i.seeker_id = sp.user_id and i.job_id = ref_job)
             ) as o,
             case when ref_job is null then 0 else (app.match(sp.user_id, ref_job)->>'score')::int end as rk
      from public.seeker_profiles sp join public.profiles pr on pr.id = sp.user_id
      where sp.open_to_employers and sp.onboarded and not pr.suspended
        and (coalesce(p_area, '') = '' or sp.area_id = p_area)
        and (coalesce(trim(p_q), '') = '' or exists (select 1 from public.seeker_skills k where k.user_id = sp.user_id and k.skill ilike '%' || trim(p_q) || '%'))
      order by rk desc limit 50) x), '[]'::jsonb);
end $$;

create or replace function public.start_employer_conversation(p_seeker uuid, p_job uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); e public.employers; j public.jobs; cid uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into e from public.employers where user_id = uid;
  if not found or e.plan <> 'business' then raise exception 'plan_required'; end if;
  select * into j from public.jobs where id = p_job and employer_id = uid;
  if not found then
    select * into j from public.jobs where employer_id = uid and status = 'published' order by posted_at desc limit 1;
  end if;
  if not found then raise exception 'publish a job first'; end if;
  select id into cid from public.conversations where seeker_id = p_seeker and employer_id = uid and job_id = j.id limit 1;
  if cid is null then
    insert into public.conversations (application_id, seeker_id, employer_id, job_id)
    values (null, p_seeker, uid, j.id)
    returning id into cid;
    perform app.notify(p_seeker, 'message', e.name || ' wants to connect', e.name || ' started a conversation about ' || j.title || '.', '/messages/' || cid);
  end if;
  return jsonb_build_object('id', cid);
end $$;

-- ---------- 8. Employer Analytics v2 (Real DB data + Date Filters + Insights) ----------
create or replace function public.employer_analytics_v2(p_start date default null, p_end date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); e public.employers;
  d_end date := coalesce(p_end, current_date);
  d_start date := coalesce(p_start, current_date - 29);
  tot_views int; tot_apps int; tot_saved int;
  listings jsonb; trends jsonb;
begin
  select * into e from public.employers where user_id = uid;
  if not found then raise exception 'not an employer'; end if;
  if e.plan = 'starter' then raise exception 'plan_required'; end if;

  select count(*) into tot_views
    from public.job_views v join public.jobs j on j.id = v.job_id
   where j.employer_id = uid and v.created_at::date between d_start and d_end;

  select count(*) into tot_apps
    from public.applications a join public.jobs j on j.id = a.job_id
   where j.employer_id = uid and a.created_at::date between d_start and d_end;

  select count(*) into tot_saved
    from public.swipes s join public.jobs j on j.id = s.job_id
   where j.employer_id = uid and s.dir in ('right', 'star') and s.created_at::date between d_start and d_end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'day', d::date,
    'views', (select count(*) from public.job_views v join public.jobs j on j.id = v.job_id where j.employer_id = uid and v.created_at::date = d::date),
    'applications', (select count(*) from public.applications a join public.jobs j on j.id = a.job_id where j.employer_id = uid and a.created_at::date = d::date)
  ) order by d), '[]'::jsonb) into trends
  from generate_series(d_start::timestamp, d_end::timestamp, interval '1 day') d;

  select coalesce(jsonb_agg(jsonb_build_object(
    'job_id', x.id, 'title', x.title, 'status', x.status, 'category', x.category, 'type', x.type,
    'salary_min', x.salary_min, 'salary_max', x.salary_max,
    'views', x.views, 'skipped', x.skipped, 'saved', x.saved, 'starred', x.starred,
    'applications', x.apps, 'matched', x.matched,
    'app_rate', case when x.views > 0 then round(100.0 * x.apps / x.views, 1) else 0 end,
    'conv_rate', case when x.apps > 0 then round(100.0 * x.matched / x.apps, 1) else 0 end
  ) order by x.created_at desc), '[]'::jsonb) into listings
  from (
    select j.id, j.title, j.status, j.category, j.type, j.salary_min, j.salary_max, j.created_at,
      (select count(*) from public.job_views v where v.job_id = j.id and v.created_at::date between d_start and d_end) as views,
      (select count(*) from public.swipes s where s.job_id = j.id and s.dir = 'left' and s.created_at::date between d_start and d_end) as skipped,
      (select count(*) from public.swipes s where s.job_id = j.id and s.dir in ('right', 'removed') and s.created_at::date between d_start and d_end) as saved,
      (select count(*) from public.swipes s where s.job_id = j.id and s.dir = 'star' and s.created_at::date between d_start and d_end) as starred,
      (select count(*) from public.applications a where a.job_id = j.id and a.created_at::date between d_start and d_end) as apps,
      (select count(*) from public.applications a where a.job_id = j.id and a.status in ('shortlisted', 'hired') and a.created_at::date between d_start and d_end) as matched
    from public.jobs j
    where j.employer_id = uid and j.status in ('published', 'paused', 'closed')
  ) x;

  return jsonb_build_object(
    'range', jsonb_build_object('start', d_start, 'end', d_end),
    'summary', jsonb_build_object(
      'views', tot_views,
      'applications', tot_apps,
      'saved', tot_saved,
      'app_rate', case when tot_views > 0 then round(100.0 * tot_apps / tot_views, 1) else 0 end
    ),
    'trends', trends,
    'listings', listings
  );
end $$;

-- ---------- 9. Payments helper with payment_method & status ----------
create or replace function public.svc_record_payment(
  p_user uuid, p_kind text, p_item text, p_amount numeric, p_provider text, p_ref text,
  p_job uuid default null, p_method text default '', p_status text default 'paid'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare pid uuid;
begin
  insert into public.payments (user_id, kind, item, amount, provider, provider_ref, status, job_id, payment_method)
  values (p_user, p_kind, p_item, p_amount, p_provider, p_ref, coalesce(p_status, 'paid'), p_job, coalesce(p_method, ''))
  returning id into pid;
  return pid;
end $$;

-- ---------- 10. Grants ----------
revoke all on function public.employer_upsert_doc(text, text, text) from public, anon, authenticated;
grant execute on function public.employer_upsert_doc(text, text, text) to authenticated;
revoke all on function public.schedule_interview(uuid, date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.schedule_interview(uuid, date, text, text, text, text) to authenticated;
revoke all on function public.update_interview_status(uuid, text, date, text, text) from public, anon, authenticated;
grant execute on function public.update_interview_status(uuid, text, date, text, text) to authenticated;
revoke all on function public.my_interviews() from public, anon, authenticated;
grant execute on function public.my_interviews() to authenticated;
revoke all on function public.employer_interviews() from public, anon, authenticated;
grant execute on function public.employer_interviews() to authenticated;
revoke all on function public.start_employer_conversation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.start_employer_conversation(uuid, uuid) to authenticated;
revoke all on function public.employer_analytics_v2(date, date) from public, anon, authenticated;
grant execute on function public.employer_analytics_v2(date, date) to authenticated;
revoke all on function public.svc_record_payment(uuid, text, text, numeric, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.svc_record_payment(uuid, text, text, numeric, text, text, uuid, text, text) to service_role;
