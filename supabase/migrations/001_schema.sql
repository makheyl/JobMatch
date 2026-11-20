-- JobMatch 001: tables, constraints, indexes, row level security, grants.
-- Run order: 001_schema -> 002_functions -> 003_reference_data -> 004_storage.

create schema if not exists app;
revoke all on schema app from public, anon, authenticated;

-- ---------- reference data (public read, admin write) ----------
create table public.areas (
  id text primary key,
  name text not null,
  lat double precision not null,
  lng double precision not null
);
create table public.skills (
  name text primary key,
  active boolean not null default true
);
create table public.career_roles (
  id text primary key,
  title text not null,
  category text not null,
  salary_min int not null check (salary_min > 0),
  salary_max int not null check (salary_max >= salary_min),
  overview text not null default '',
  duties text[] not null default '{}',
  growth jsonb not null default '[]',
  courses jsonb not null default '[]',
  active boolean not null default true
);
create table public.role_skills (
  role_id text not null references public.career_roles(id) on delete cascade,
  skill text not null references public.skills(name) on update cascade,
  weight int not null default 10 check (weight > 0),
  primary key (role_id, skill)
);
create table public.roadmap_tasks (
  id text primary key,
  role_id text not null references public.career_roles(id) on delete cascade,
  week int not null check (week > 0),
  week_title text not null,
  position int not null default 1,
  type text not null check (type in ('learn','practice','quiz')),
  skill text not null,
  text text not null,
  course jsonb
);
create index roadmap_tasks_role_idx on public.roadmap_tasks(role_id, week, position);
create table public.quiz_questions (
  id serial primary key,
  skill text not null,
  question text not null,
  options jsonb not null,
  answer int not null check (answer >= 0)
);
create index quiz_questions_skill_idx on public.quiz_questions(skill);
create table public.course_partners (
  provider text primary key,
  commission_rate numeric(5,4) not null default 0.15 check (commission_rate between 0 and 1),
  active boolean not null default true
);

-- ---------- people ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text check (role in ('seeker','employer','admin')),
  full_name text not null default '',
  phone text not null default '',
  language text not null default 'en' check (language in ('en','fil')),
  suspended boolean not null default false,
  consent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.seeker_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  birth_year int check (birth_year between 1940 and 2015),
  gender text not null default '',
  edu_level text not null default '',
  school text not null default '',
  course text not null default '',
  grad_year int,
  experience jsonb not null default '[]',
  interests text[] not null default '{}',
  goal_role text references public.career_roles(id) on delete set null,
  goal_text text not null default '',
  area_id text not null default 'bin-poblacion' references public.areas(id),
  commute_km int not null default 10 check (commute_km between 1 and 60),
  salary_min int not null default 0 check (salary_min >= 0),
  job_types text[] not null default '{Full-time}',
  resume_mode text not null default 'built' check (resume_mode in ('built','uploaded')),
  resume_summary text not null default '',
  resume_path text,
  open_to_employers boolean not null default false,
  plan text not null default 'free' check (plan in ('free','pro')),
  plan_period text check (plan_period in ('monthly','yearly')),
  plan_renews_at timestamptz,
  auto_renew boolean not null default true,
  stars_date date,
  stars_used int not null default 0,
  filters jsonb not null default '{"nearMe":false,"type":"","minSalary":0}',
  notif jsonb not null default '{"matches":true,"status":true,"tips":true,"messages":true}',
  checklist jsonb not null default '{}',
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.seeker_skills (
  user_id uuid not null references public.seeker_profiles(user_id) on delete cascade,
  skill text not null references public.skills(name) on update cascade,
  level int not null default 70 check (level between 0 and 100),
  primary key (user_id, skill)
);

create table public.employers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  name text not null,
  type text not null default '',
  area_id text not null references public.areas(id),
  address text not null default '',
  contact_name text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  about text not null default '',
  plan text not null default 'starter' check (plan in ('starter','growth','business')),
  plan_renews_at timestamptz,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  verification_reason text not null default '',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  notif jsonb not null default '{"applicants":true,"weekly":true,"messages":true}',
  created_at timestamptz not null default now()
);
create table public.employer_docs (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employers(user_id) on delete cascade,
  kind text not null,
  file_path text not null,
  file_name text not null,
  created_at timestamptz not null default now()
);
create table public.employer_team (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employers(user_id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'Recruiter' check (role in ('Owner','Admin','Recruiter'))
);

-- ---------- marketplace ----------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employers(user_id) on delete cascade,
  role_id text references public.career_roles(id) on delete set null,
  title text not null check (char_length(title) between 3 and 120),
  category text not null,
  type text not null check (type in ('Full-time','Part-time','Internship / OJT','Contract')),
  salary_min int not null check (salary_min > 0),
  salary_max int not null check (salary_max >= salary_min),
  area_id text not null references public.areas(id),
  description text not null check (char_length(description) between 20 and 5000),
  skills text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','published','paused','closed','removed')),
  removed_reason text,
  boosted_until timestamptz,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_employer_idx on public.jobs(employer_id, status);
create index jobs_status_idx on public.jobs(status, area_id);
create table public.job_views (
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (job_id, user_id)
);
create table public.swipes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  dir text not null check (dir in ('left','right','star','removed')),
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);
create index swipes_job_idx on public.swipes(job_id);
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  status text not null default 'applied' check (status in ('applied','shortlisted','hired','rejected')),
  starred boolean not null default false,
  score int not null default 0,
  match_seen boolean not null default true,
  viewed_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);
create index applications_job_idx on public.applications(job_id, status);
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employers(user_id) on delete cascade,
  seeker_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (seeker_id, job_id)
);

-- ---------- learning progress ----------
create table public.roadmap_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id text not null references public.roadmap_tasks(id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (user_id, task_id)
);
create table public.quiz_results (
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id text not null references public.roadmap_tasks(id) on delete cascade,
  score int not null,
  total int not null check (total > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, task_id)
);
create table public.roadmap_extra (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id text not null references public.career_roles(id) on delete cascade,
  week int not null,
  skill text not null,
  text text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index roadmap_extra_user_idx on public.roadmap_extra(user_id, role_id);

-- ---------- communication ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'tip',
  title text not null,
  body text not null default '',
  ref text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  seeker_id uuid not null references public.profiles(id) on delete cascade,
  employer_id uuid not null references public.employers(user_id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz
);
create index conversations_seeker_idx on public.conversations(seeker_id);
create index conversations_employer_idx on public.conversations(employer_id);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index messages_conv_idx on public.messages(conversation_id, created_at);
create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('job','message','user')),
  target_id text not null,
  reason text not null check (char_length(reason) between 3 and 1000),
  status text not null default 'open' check (status in ('open','dismissed','actioned')),
  created_at timestamptz not null default now()
);
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('support','problem')),
  subject text not null,
  message text not null check (char_length(message) between 3 and 4000),
  created_at timestamptz not null default now()
);
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'all' check (audience in ('all','seekers','employers')),
  push boolean not null default false,
  recipients int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ---------- money ----------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('pro','employer_plan','boost')),
  item text not null,
  amount numeric(10,2) not null check (amount >= 0),
  currency text not null default 'PHP',
  provider text not null default 'sandbox',
  provider_ref text not null,
  status text not null default 'paid' check (status in ('pending','paid','failed','refunded')),
  job_id uuid references public.jobs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index payments_user_idx on public.payments(user_id, created_at desc);
create table public.resume_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  score int not null check (score between 0 and 100),
  summary text not null default '',
  suggestions jsonb not null default '[]',
  source text not null default 'rules' check (source in ('rules','ai')),
  created_at timestamptz not null default now()
);
create table public.course_clicks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id text,
  title text not null,
  provider text not null,
  url text not null,
  created_at timestamptz not null default now()
);
create table public.course_conversions (
  id uuid primary key default gen_random_uuid(),
  provider text not null references public.course_partners(provider) on update cascade,
  course_title text not null,
  sale_amount numeric(10,2) not null check (sale_amount >= 0),
  commission numeric(10,2) not null check (commission >= 0),
  user_id uuid references public.profiles(id) on delete set null,
  occurred_at date not null default current_date,
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.audit_log (
  id bigserial primary key,
  actor uuid references public.profiles(id) on delete set null,
  action text not null,
  target text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------- generic triggers ----------
create or replace function app.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger seeker_profiles_touch before update on public.seeker_profiles for each row execute function app.touch_updated_at();
create trigger jobs_touch before update on public.jobs for each row execute function app.touch_updated_at();
create trigger applications_touch before update on public.applications for each row execute function app.touch_updated_at();

create or replace function app.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function app.handle_new_user();

-- helper used in policies
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and not suspended)
$$;

-- ---------- row level security ----------
alter table public.areas enable row level security;
alter table public.skills enable row level security;
alter table public.career_roles enable row level security;
alter table public.role_skills enable row level security;
alter table public.roadmap_tasks enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.course_partners enable row level security;
alter table public.profiles enable row level security;
alter table public.seeker_profiles enable row level security;
alter table public.seeker_skills enable row level security;
alter table public.employers enable row level security;
alter table public.employer_docs enable row level security;
alter table public.employer_team enable row level security;
alter table public.jobs enable row level security;
alter table public.job_views enable row level security;
alter table public.swipes enable row level security;
alter table public.applications enable row level security;
alter table public.invites enable row level security;
alter table public.roadmap_progress enable row level security;
alter table public.quiz_results enable row level security;
alter table public.roadmap_extra enable row level security;
alter table public.notifications enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.tickets enable row level security;
alter table public.announcements enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.resume_reviews enable row level security;
alter table public.course_clicks enable row level security;
alter table public.course_conversions enable row level security;
alter table public.audit_log enable row level security;

-- reference tables: anyone reads, admins write
do $$
declare t text;
begin
  foreach t in array array['areas','skills','career_roles','role_skills','roadmap_tasks','course_partners'] loop
    execute format('create policy "%s public read" on public.%I for select using (true)', t, t);
    execute format('create policy "%s admin insert" on public.%I for insert to authenticated with check (public.is_admin())', t, t);
    execute format('create policy "%s admin update" on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
    execute format('create policy "%s admin delete" on public.%I for delete to authenticated using (public.is_admin())', t, t);
  end loop;
end $$;
create policy "quiz admin all" on public.quiz_questions for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles
create policy "profiles read own or admin" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- seeker data
create policy "seeker own read" on public.seeker_profiles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "seeker own insert" on public.seeker_profiles for insert to authenticated with check (user_id = auth.uid());
create policy "seeker own update" on public.seeker_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "skills own read" on public.seeker_skills for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "skills own write" on public.seeker_skills for insert to authenticated with check (user_id = auth.uid());
create policy "skills own update" on public.seeker_skills for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "skills own delete" on public.seeker_skills for delete to authenticated using (user_id = auth.uid());

-- employer data
create policy "employer own read" on public.employers for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "employer own update" on public.employers for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "docs own read" on public.employer_docs for select to authenticated using (employer_id = auth.uid() or public.is_admin());
create policy "team own all" on public.employer_team for all to authenticated using (employer_id = auth.uid()) with check (employer_id = auth.uid());

-- jobs (seekers only reach jobs through security-definer functions)
create policy "jobs owner read" on public.jobs for select to authenticated using (employer_id = auth.uid() or public.is_admin());
create policy "jobs owner insert" on public.jobs for insert to authenticated with check (employer_id = auth.uid());
create policy "jobs owner update" on public.jobs for update to authenticated using (employer_id = auth.uid()) with check (employer_id = auth.uid());
create policy "jobs owner delete draft" on public.jobs for delete to authenticated using (employer_id = auth.uid() and status = 'draft');

-- own-read only; all writes go through functions
create policy "swipes own read" on public.swipes for select to authenticated using (user_id = auth.uid());
create policy "applications read" on public.applications for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "invites own read" on public.invites for select to authenticated using (seeker_id = auth.uid() or employer_id = auth.uid());
create policy "progress own read" on public.roadmap_progress for select to authenticated using (user_id = auth.uid());
create policy "quiz own read" on public.quiz_results for select to authenticated using (user_id = auth.uid());
create policy "extra own read" on public.roadmap_extra for select to authenticated using (user_id = auth.uid());
create policy "notif own read" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notif own update" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "conv participants read" on public.conversations for select to authenticated using (seeker_id = auth.uid() or employer_id = auth.uid() or public.is_admin());
create policy "messages participants read" on public.messages for select to authenticated using (
  exists (select 1 from public.conversations c where c.id = conversation_id and (c.seeker_id = auth.uid() or c.employer_id = auth.uid()))
);
create policy "blocks own all" on public.blocks for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy "reports own insert" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "reports read" on public.reports for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
create policy "reports admin update" on public.reports for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "tickets own insert" on public.tickets for insert to authenticated with check (user_id = auth.uid());
create policy "tickets read" on public.tickets for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "announcements read" on public.announcements for select to authenticated using (true);
create policy "announcements admin write" on public.announcements for insert to authenticated with check (public.is_admin());
create policy "push own all" on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "payments own read" on public.payments for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "reviews own read" on public.resume_reviews for select to authenticated using (user_id = auth.uid());
create policy "clicks own insert" on public.course_clicks for insert to authenticated with check (user_id = auth.uid());
create policy "clicks admin read" on public.course_clicks for select to authenticated using (public.is_admin());
create policy "conversions admin all" on public.course_conversions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "audit admin read" on public.audit_log for select to authenticated using (public.is_admin());

-- ---------- column level grants (stop users editing plans, status, stars, roles) ----------
revoke all on all tables in schema public from anon, authenticated;
grant select on public.areas, public.skills, public.career_roles, public.role_skills, public.roadmap_tasks, public.course_partners to anon, authenticated;
grant insert, update, delete on public.areas, public.skills, public.career_roles, public.role_skills, public.roadmap_tasks, public.course_partners to authenticated;
grant select, insert, update, delete on public.quiz_questions to authenticated;
grant usage, select on sequence public.quiz_questions_id_seq to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, phone, language, consent_at) on public.profiles to authenticated;

grant select on public.seeker_profiles to authenticated;
grant insert (user_id) on public.seeker_profiles to authenticated;
grant update (birth_year, gender, edu_level, school, course, grad_year, experience, interests, goal_role, goal_text, area_id, commute_km, salary_min, job_types, resume_mode, resume_summary, resume_path, open_to_employers, auto_renew, filters, notif, checklist, onboarded) on public.seeker_profiles to authenticated;
grant select, insert, update, delete on public.seeker_skills to authenticated;

grant select on public.employers to authenticated;
grant update (name, type, area_id, address, contact_name, contact_email, contact_phone, about, notif) on public.employers to authenticated;
grant select on public.employer_docs to authenticated;
grant select, insert, update, delete on public.employer_team to authenticated;

grant select, delete on public.jobs to authenticated;
grant insert (employer_id, role_id, title, category, type, salary_min, salary_max, area_id, description, skills) on public.jobs to authenticated;
grant update (role_id, title, category, type, salary_min, salary_max, area_id, description, skills) on public.jobs to authenticated;

grant select on public.swipes, public.applications, public.invites, public.roadmap_progress, public.quiz_results, public.roadmap_extra, public.conversations, public.messages, public.payments, public.resume_reviews, public.announcements, public.audit_log to authenticated;
grant select on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select, insert on public.reports to authenticated;
grant update (status) on public.reports to authenticated;
grant select, insert on public.tickets to authenticated;
grant insert on public.announcements to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant insert on public.course_clicks to authenticated;
grant select on public.course_clicks to authenticated;
grant select, insert, update, delete on public.course_conversions to authenticated;

-- realtime for chat and alerts (row level security still applies)
alter publication supabase_realtime add table public.notifications, public.messages;
