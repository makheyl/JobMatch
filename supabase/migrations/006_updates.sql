-- JobMatch 006: feature updates, bug fixes, harder quizzes, image uploads, locked roadmap weeks, and auto-notifications.

-- ---------- 1. Schema additions ----------
alter table public.seeker_profiles
  add column if not exists avatar_path text,
  add column if not exists photo_path text,
  add column if not exists certificates jsonb not null default '[]',
  add column if not exists resume_link text not null default '';

alter table public.jobs
  add column if not exists custom_role text not null default '',
  add column if not exists intern_requirements text not null default '';

-- Grant update on new seeker_profiles columns and insert/update on new jobs columns
grant update (avatar_path, photo_path, certificates, resume_link) on public.seeker_profiles to authenticated;
grant insert (custom_role, intern_requirements) on public.jobs to authenticated;
grant update (custom_role, intern_requirements) on public.jobs to authenticated;

-- ---------- 2. Storage updates ----------
-- Allow images (jpg/png) for résumés as well as PDF/Word
update storage.buckets
   set allowed_mime_types = array[
     'application/pdf',
     'application/msword',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'image/jpeg',
     'image/png'
   ]
 where id = 'resumes';

-- Private/authenticated bucket for seeker profile pictures, professional photos, and certificates
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('seeker-media', 'seeker-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
   set public = false,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "seeker-media owner all" on storage.objects;
create policy "seeker-media owner all" on storage.objects for all to authenticated
  using (bucket_id = 'seeker-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'seeker-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 3. Bug fixes & updated RPCs ----------

-- Fix me() to include unread_matches count
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
  update public.employers set plan = 'starter', plan_renews_at = null where user_id = uid and plan <> 'starter' and plan_renews_at < now();
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

-- Fix send_message() inverted sender name lookup
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
    select case when c.employer_id = uid then (select name from public.employers where user_id = uid) else (select full_name from public.profiles where id = uid) end into who;
    perform app.notify(other, 'message', 'New message from ' || coalesce(who, 'a match'), left(msg, 120), '/messages/' || p_conv);
  end if;
  return jsonb_build_object('id', mid);
end $$;

-- Allow seeker or employer to start/open a conversation for any shortlisted/hired match
create or replace function public.start_conversation(p_app uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); a public.applications; j public.jobs; cid uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into a from public.applications where id = p_app;
  if not found then raise exception 'not found'; end if;
  select * into j from public.jobs where id = a.job_id;
  if a.user_id <> uid and j.employer_id <> uid then raise exception 'forbidden' using errcode = '42501'; end if;
  if a.status not in ('shortlisted', 'hired') then raise exception 'not_matched'; end if;
  insert into public.conversations (application_id, seeker_id, employer_id, job_id)
  values (a.id, a.user_id, j.employer_id, j.id)
  on conflict (application_id) do nothing;
  select id into cid from public.conversations where application_id = a.id;
  return jsonb_build_object('id', cid);
end $$;

-- Update get_deck to also include intern_requirements and custom_role
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
             'custom_role', j.custom_role, 'intern_requirements', j.intern_requirements,
             'boosted', coalesce(j.boosted_until > now(), false),
             'company', jsonb_build_object('name', e.name, 'verified', true),
             'match', m.mj) as o,
           ((m.mj->>'score')::numeric
            + case when j.boosted_until > now() then 8 else 0 end
            + case when j.type = any(sp.job_types) then 3 else 0 end) as rank
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
    'custom_role', j.custom_role, 'intern_requirements', j.intern_requirements,
    'skills', to_jsonb(j.skills), 'description', j.description, 'posted_at', j.posted_at,
    'boosted', coalesce(j.boosted_until > now(), false),
    'company', jsonb_build_object('name', e.name, 'about', e.about, 'type', e.type, 'area_id', e.area_id, 'verified', e.verification_status = 'verified'),
    'match', app.match(p_user, j.id))
  from public.jobs j join public.employers e on e.user_id = j.employer_id where j.id = p_job
$$;

-- Rerun rejected/passed jobs in Discover & view full swipe history
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

create or replace function public.my_swipe_history() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
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

-- ---------- 4. Lock upcoming roadmap weeks until previous week is completed ----------
create or replace function app.week_unlocked(p_user uuid, p_role text, p_week int, p_pro boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_week <= 1 then true
    when not p_pro then false
    else not exists (
      select 1 from public.roadmap_tasks t
      left join public.roadmap_progress p on p.task_id = t.id and p.user_id = p_user
      where t.role_id = p_role and t.week < p_week and p.task_id is null
    )
  end
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
    'tasks', r.tasks) order by r.week), '[]'::jsonb)
  from (
    select week, min(title) as title,
           case when not app.week_unlocked(p_user, p_role, week, p_pro) then '[]'::jsonb
                else jsonb_agg(jsonb_build_object('id', id, 'type', type, 'skill', skill, 'text', text, 'course', course, 'done', done, 'quiz', quiz, 'adaptive', adaptive) order by position) end as tasks
    from rows group by week
  ) r
$$;

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
  if not app.week_unlocked(uid, t.role_id, t.week, app.is_pro(uid)) then raise exception 'Complete previous week first.'; end if;
  if p_done then
    insert into public.roadmap_progress (user_id, task_id) values (uid, p_task) on conflict do nothing;
  else
    delete from public.roadmap_progress where user_id = uid and task_id = p_task;
  end if;
end $$;

-- ---------- 5. Harder Coursera-aligned quizzes (up to 5 questions per skill) ----------
create or replace function public.quiz_for_task(p_task text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.roadmap_tasks;
begin
  select * into t from public.roadmap_tasks where id = p_task;
  if not found then return null; end if;
  if t.week > 1 and not app.is_pro(auth.uid()) then raise exception 'pro_required'; end if;
  if not app.week_unlocked(auth.uid(), t.role_id, t.week, app.is_pro(auth.uid())) then raise exception 'Complete previous week first.'; end if;
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

-- Add harder, scenario-based Coursera-aligned quiz questions
insert into public.quiz_questions (skill, question, options, answer) values
  ('Customer service', 'In Coursera''s Customer Service Fundamentals (LAST method), after Listening and Apologizing, what are the next two steps?', '["Leave and Terminate","Solve and Thank","Log and Transfer"]', 1),
  ('Customer service', 'A repeat customer reports the same billing issue for the third time. Which KPI and action should you prioritize?', '["First Contact Resolution: own the fix, verify root cause, and confirm resolution","Average Handle Time: rush the call under 60 seconds","Upsell rate: offer a discount upgrade immediately"]', 0),
  ('POS system', 'At shift reconciliation, the POS Z-reading shows ₱14,850 in cash sales while the physical drawer has ₱14,550. What is the correct audit procedure?', '["Void a ₱300 item from earlier so the drawer matches","Recount with a supervisor, check split/e-wallet tender logs, and file a variance report","Add ₱300 from tips without logging"]', 1),
  ('POS system', 'A customer pays ₱1,200 using ₱500 cash and ₱700 via GCash QR. How should this be recorded in the POS?', '["Record all ₱1,200 as Cash to simplify closing","Use Split Tender: ₱500 Cash and ₱700 E-Wallet/QR, and verify the GCash reference","Ring up two separate unrelated orders"]', 1),
  ('Cash handling', 'Under standard retail cash-handling controls, when should a cashier perform a cash drop to the safe?', '["Only at the end of the week","Whenever drawer cash exceeds the store''s preset till limit","Only when the store runs out of coins"]', 1),
  ('Cash handling', 'A customer hands you a ₱1,000 bill that feels overly smooth and lacks the security thread watermark. What should you do?', '["Accept it to avoid embarrassing the customer","Politely ask for another bill or digital payment and notify your supervisor per counterfeit protocol","Confiscate and tear the bill immediately"]', 1),
  ('Communication', 'In business communication courses, what does the "BLUF" (Bottom Line Up Front) structure achieve in an email to a manager?', '["Puts the main decision or request in the first 1-2 sentences before supporting details","Hides bad news at the end of a long paragraph","Uses casual abbreviations to save time"]', 0),
  ('Communication', 'You disagree with a teammate''s schedule change during a busy shift. Which response applies non-violent, constructive communication?', '["You always mess up the schedule.","When the shift changed without notice, I missed my prep window. Can we confirm changes in chat 2 hours ahead?","Fine, do whatever you want."]', 1),
  ('Upselling', 'What is the key difference between upselling and cross-selling in retail?', '["Upselling upgrades the core item (e.g., regular to large); cross-selling adds a complementary item (e.g., pastry with coffee)","They mean the exact same thing","Cross-selling is only for online stores"]', 0),
  ('Upselling', 'A customer is buying a budget laptop for schoolwork. Which recommendation builds trust and increases basket value?', '["Push the most expensive gaming laptop","Recommend a protective sleeve and a 1-year warranty extension that fits their student budget","Refuse to sell the budget model"]', 1),
  ('Microsoft Excel', 'In Excel (Coursera Data Skills), which formula safely looks up a price in column B by product ID in A2 without breaking when columns are inserted?', '["=VLOOKUP(A2,A:B,2,FALSE)","=XLOOKUP(A2,A:A,B:B,\"Not found\")","=SUMIF(A:A,A2,B:B)"]', 1),
  ('Microsoft Excel', 'You need total sales in C2:C50 only for rows where Branch (A2:A50) is "Biñan" and Status (B2:B50) is "Paid". Which formula is correct?', '["=SUMIFS(C2:C50,A2:A50,\"Biñan\",B2:B50,\"Paid\")","=COUNTIF(C2:C50,\"Biñan\")","=IF(A2=\"Biñan\",SUM(C2:C50))"]', 0),
  ('Barista skills', 'Your 18g espresso dose yields 36g of liquid in 16 seconds and tastes sour and watery. How should you calibrate the grinder?', '["Grind coarser to speed up extraction","Grind finer to slow the shot toward 25-30 seconds","Use hotter water at 105°C"]', 1),
  ('Barista skills', 'When steaming milk for a flat white versus a cappuccino, what is the main textural difference?', '["Flat white uses thin, silky microfoam; cappuccino has thicker, airy foam","Cappuccino uses cold milk","Flat white is boiled to 90°C"]', 0),
  ('Food safety', 'In HACCP food safety standards, what is the maximum total time potentially hazardous food may stay in the temperature danger zone (5°C–60°C) before it must be discarded?', '["4 hours cumulative","12 hours","24 hours if reheated"]', 0),
  ('Food safety', 'A kitchen staff member has a minor cut on their finger. What is the compliant food-safety action before returning to prep?', '["Wear a regular cloth bandage only","Cover with a waterproof brightly colored bandage AND wear a single-use glove","Wash hands and work without covering it"]', 1),
  ('Bookkeeping', 'Under accrual accounting, a client pays ₱12,000 upfront in January for 3 months of service (Jan–Mar). How much revenue is recognized in January?', '["₱12,000 in January","₱4,000 in January and ₱8,000 as Unearned Revenue","₱0 until March"]', 1),
  ('Bookkeeping', 'Which entry correctly records buying ₱5,000 of office supplies on credit (Accounts Payable)?', '["Debit Office Supplies ₱5,000; Credit Accounts Payable ₱5,000","Debit Cash ₱5,000; Credit Office Supplies ₱5,000","Debit Accounts Payable ₱5,000; Credit Revenue ₱5,000"]', 0),
  ('Graphic design', 'When preparing a poster for commercial offset printing vs. Instagram, which color mode and resolution should you export?', '["Print: CMYK at 300 DPI; Social: RGB at 72-150 DPI","Print: RGB at 72 DPI; Social: CMYK at 300 DPI","Both in CMYK at 72 DPI"]', 0),
  ('Graphic design', 'Visual hierarchy guides the viewer''s eye first to the key message. Which combination creates the strongest hierarchy?', '["Using 5 different script fonts at the same size","Strong size/weight contrast, generous whitespace, and a clear focal point","Centering every element with equal font size"]', 1),
  ('HTML & CSS', 'In responsive CSS, which rule lets a 3-column grid automatically stack into 1 column on narrow screens without fixed pixel breakpoints?', '["grid-template-columns: repeat(auto-fit, minmax(260px, 1fr))","position: absolute; float: left","display: table-cell; width: 33%"]', 0),
  ('HTML & CSS', 'Why should interactive controls use semantic <button> elements instead of clickable <div> elements?', '["Built-in keyboard focus, Enter/Space activation, and screen-reader role","<button> loads faster over HTTP","<div> cannot have CSS classes"]', 0),
  ('Troubleshooting', 'A user can ping 8.8.8.8 by IP address, but websites fail to load by domain name. Where is the fault?', '["DNS resolution","Physical Ethernet cable","Monitor display driver"]', 0),
  ('Troubleshooting', 'Following the CompTIA/Google IT Support troubleshooting methodology, what should you do right after establishing a theory of probable cause?', '["Immediately replace the motherboard","Test the theory to determine the actual cause before making permanent changes","Close the ticket"]', 1),
  ('Inventory', 'A café uses 40 bags of coffee beans per week, supplier lead time is 2 weeks, and safety stock is 25 bags. What is the Reorder Point (ROP)?', '["65 bags","105 bags","80 bags"]', 1),
  ('Inventory', 'During cycle counting, physical stock is 48 units while the system shows 55 units. What is the best next step?', '["Overwrite the system count to 48 without notes","Recount, check recent receiving/sales/shrinkage logs, and document the adjustment with supervisor approval","Hide 7 units from another shelf"]', 1),
  ('Social media', 'Your local shop''s Reel got 10,000 views but only 12 link clicks (0.12% CTR). Which change directly addresses the bottleneck?', '["Post at 3 AM","Strengthen the hook-to-CTA bridge and make the offer/next step explicit in the caption and on-screen text","Turn off comments"]', 1),
  ('Social media', 'What is the purpose of UTM parameters on links shared in social campaigns?', '["To track which platform, campaign, and post drove traffic and conversions in analytics","To make the URL shorter","To boost organic reach automatically"]', 0);

-- ---------- 6. Automatic notifications for aligned job postings ----------
create or replace function app.notify_matching_seekers() returns trigger language plpgsql security definer set search_path = '' as $$
declare emp_name text;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    select name into emp_name from public.employers where user_id = new.employer_id;
    insert into public.notifications (user_id, type, title, body, ref)
    select sp.user_id, 'tip',
           'New matching job: ' || new.title,
           coalesce(emp_name, 'A verified employer') || ' posted ' || new.title || ' (' || new.type || ').',
           '/jobs/' || new.id
      from public.seeker_profiles sp
      join public.profiles pr on pr.id = sp.user_id
     where sp.onboarded
       and not pr.suspended
       and coalesce((sp.notif->>'tips')::boolean, true)
       and (
         (new.role_id is not null and sp.goal_role = new.role_id)
         or new.category = any(sp.interests)
       )
       and not exists (
         select 1 from public.notifications n
          where n.user_id = sp.user_id and n.ref = '/jobs/' || new.id
       );
  end if;
  return new;
end $$;

drop trigger if exists jobs_notify_seekers on public.jobs;
create trigger jobs_notify_seekers
  after insert or update of status on public.jobs
  for each row execute function app.notify_matching_seekers();

-- ---------- 7. Grants for newly added public functions ----------
revoke all on function public.start_conversation(uuid) from public, anon, authenticated;
grant execute on function public.start_conversation(uuid) to authenticated;
revoke all on function public.requeue_passed_jobs() from public, anon, authenticated;
grant execute on function public.requeue_passed_jobs() to authenticated;
revoke all on function public.my_swipe_history() from public, anon, authenticated;
grant execute on function public.my_swipe_history() to authenticated;
