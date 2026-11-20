-- JobMatch 008: employer billing date fix, monthly auto-renew, and candidate match rates per job position.

-- ---------- 1. Employer billing: monthly renewal dates ----------
alter table public.employers
  add column if not exists auto_renew boolean not null default true;
grant update (auto_renew) on public.employers to authenticated;

-- One-time fix: employer plans are monthly, so any renewal date beyond next month (e.g. demo data set to 2036) becomes next month.
update public.employers
   set plan_renews_at = now() + interval '1 month'
 where plan <> 'starter'
   and (plan_renews_at is null or plan_renews_at > now() + interval '1 month 1 day');

-- Paid employer plans now renew exactly one calendar month ahead.
create or replace function public.svc_activate_employer_plan(p_user uuid, p_plan text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_plan not in ('growth', 'business') then raise exception 'invalid plan'; end if;
  update public.employers set plan = p_plan, auto_renew = true, plan_renews_at = now() + interval '1 month' where user_id = p_user;
  if not found then raise exception 'not an employer'; end if;
end $$;

-- me(): employer plans roll forward monthly when auto-renew is on (mirrors seeker auto-renew), otherwise drop to Starter.
create or replace function public.me() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); pr public.profiles; sp public.seeker_profiles; em public.employers;
        skills jsonb; unread int; msgs int; unseen_matches int;
begin
  if uid is null then return null; end if;
  select * into pr from public.profiles where id = uid;
  if pr.id is null then return null; end if;
  update public.seeker_profiles
     set plan_renews_at = case when auto_renew then plan_renews_at + (case plan_period when 'monthly' then interval '30 days' else interval '365 days' end) else null end,
         plan = case when auto_renew then plan else 'free' end,
         plan_period = case when auto_renew then plan_period else null end
   where user_id = uid and plan = 'pro' and plan_renews_at < now();
  update public.employers
     set plan_renews_at = case when auto_renew
                               then plan_renews_at + make_interval(months => ((extract(year from age(now(), plan_renews_at)) * 12 + extract(month from age(now(), plan_renews_at)))::int + 1))
                               else null end,
         plan = case when auto_renew then plan else 'starter' end
   where user_id = uid and plan <> 'starter' and plan_renews_at < now();
  select * into sp from public.seeker_profiles where user_id = uid;
  select * into em from public.employers where user_id = uid;
  select coalesce(jsonb_agg(jsonb_build_object('name', skill, 'level', level) order by skill), '[]'::jsonb) into skills from public.seeker_skills where user_id = uid;
  select count(*) into unread from public.notifications where user_id = uid and not read;
  select count(*) into msgs from public.messages m join public.conversations c on c.id = m.conversation_id
    where m.sender_id <> uid and m.read_at is null and (c.seeker_id = uid or c.employer_id = uid);
  select count(*) into unseen_matches from public.applications where user_id = uid and status = 'shortlisted' and not match_seen;
  return jsonb_build_object(
    'id', uid, 'role', pr.role, 'full_name', pr.full_name, 'phone', pr.phone, 'language', pr.language,
    'suspended', pr.suspended, 'consent_at', pr.consent_at,
    'seeker', case when sp.user_id is null then null else to_jsonb(sp) || jsonb_build_object('stars_left', app.stars_left(uid), 'skills', skills) end,
    'employer', case when em.user_id is null then null else to_jsonb(em) end,
    'unread', unread, 'unread_messages', msgs, 'unread_matches', unseen_matches);
end $$;

-- ---------- 2. Candidate match rate for every job position ----------
create or replace function public.candidate_job_matches(p_seeker uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); e public.employers;
begin
  select * into e from public.employers where user_id = uid;
  if not found then raise exception 'not an employer'; end if;
  if e.plan <> 'business' then raise exception 'plan_required'; end if;
  if not exists (select 1 from public.seeker_profiles where user_id = p_seeker and open_to_employers and onboarded) then raise exception 'not available'; end if;
  return coalesce((
    select jsonb_agg(x.o order by x.sc desc) from (
      select jsonb_build_object('job_id', j.id, 'title', j.title, 'status', j.status,
               'score', (m.mj->>'score')::int, 'parts', m.mj->'parts', 'have', m.mj->'have', 'missing', m.mj->'missing') as o,
             (m.mj->>'score')::int as sc
      from public.jobs j
      cross join lateral (select app.match(p_seeker, j.id) as mj) m
      where j.employer_id = uid and j.status in ('published', 'paused')
    ) x), '[]'::jsonb);
end $$;

revoke all on function public.candidate_job_matches(uuid) from public, anon, authenticated;
grant execute on function public.candidate_job_matches(uuid) to authenticated;

-- Include resume_link in employer_application when applicant is shortlisted/hired
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
    'resume_link', case when named then nullif(sp.resume_link, '') end,
    'area_id', sp.area_id,
    'age', case when named and sp.birth_year is not null then extract(year from now())::int - sp.birth_year end,
    'gender', case when named then nullif(sp.gender, '') end,
    'contact', case when named then jsonb_build_object('email', em, 'phone', pr.phone, 'full_name', pr.full_name) end,
    'conversation_id', (select c.id from public.conversations c where c.application_id = a.id));
end $$;

-- Reload PostgREST schema cache so new columns (e.g. resume_link, logo_path, strengths/weaknesses) are immediately visible
notify pgrst, 'reload schema';
