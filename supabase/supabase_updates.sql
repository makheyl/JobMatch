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
-- JobMatch 010: Message actions (Edit, Unsend for everyone, Remove for you) for both seekers and employers.

alter table public.messages
  add column if not exists edited_at timestamptz,
  add column if not exists unsent_at timestamptz,
  add column if not exists hidden_by uuid[] not null default '{}';

create or replace function public.edit_message(p_msg uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m public.messages;
  txt text := trim(coalesce(p_body, ''));
  ts timestamptz := now();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if char_length(txt) < 1 or char_length(txt) > 2000 then
    raise exception 'message must be 1 to 2000 characters';
  end if;
  select * into m from public.messages where id = p_msg;
  if not found then raise exception 'not found'; end if;
  if m.sender_id <> uid then raise exception 'forbidden' using errcode = '42501'; end if;
  if m.unsent_at is not null then raise exception 'cannot edit an unsent message'; end if;
  update public.messages
     set body = txt,
         edited_at = ts
   where id = p_msg;
  return jsonb_build_object('ok', true, 'id', p_msg, 'body', txt, 'edited_at', ts);
end $$;

create or replace function public.unsend_message(p_msg uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m public.messages;
  ts timestamptz := now();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into m from public.messages where id = p_msg;
  if not found then raise exception 'not found'; end if;
  if m.sender_id <> uid then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.messages
     set body = 'This message was unsent',
         unsent_at = coalesce(unsent_at, ts)
   where id = p_msg;
  return jsonb_build_object('ok', true, 'id', p_msg, 'unsent_at', ts);
end $$;

create or replace function public.remove_message_for_me(p_msg uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m public.messages;
  c public.conversations;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into m from public.messages where id = p_msg;
  if not found then raise exception 'not found'; end if;
  select * into c from public.conversations where id = m.conversation_id and (seeker_id = uid or employer_id = uid);
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (uid = any(m.hidden_by)) then
    update public.messages
       set hidden_by = array_append(hidden_by, uid)
     where id = p_msg;
  end if;
  return jsonb_build_object('ok', true, 'id', p_msg);
end $$;

create or replace function public.my_conversations() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'job_title', j.title, 'job_id', j.id,
      'other_id', case when c.seeker_id = uid then c.employer_id else c.seeker_id end,
      'other_name', case when c.seeker_id = uid then e.name else sp.full_name end,
      'last_body', case when lm.unsent_at is not null then 'Message unsent' else lm.body end,
      'last_at', coalesce(c.last_message_at, c.created_at),
      'unread', (select count(*) from public.messages m where m.conversation_id = c.id and m.sender_id <> uid and m.read_at is null and not (uid = any(m.hidden_by))),
      'blocked', exists (select 1 from public.blocks b where (b.blocker_id = uid and b.blocked_id = case when c.seeker_id = uid then c.employer_id else c.seeker_id end)
                                                          or (b.blocked_id = uid and b.blocker_id = case when c.seeker_id = uid then c.employer_id else c.seeker_id end)))
      order by coalesce(c.last_message_at, c.created_at) desc)
    from public.conversations c
    join public.jobs j on j.id = c.job_id
    join public.employers e on e.user_id = c.employer_id
    join public.profiles sp on sp.id = c.seeker_id
    left join lateral (
      select m2.body, m2.unsent_at
        from public.messages m2
       where m2.conversation_id = c.id
         and not (uid = any(m2.hidden_by))
       order by m2.created_at desc
       limit 1
    ) lm on true
    where c.seeker_id = uid or c.employer_id = uid), '[]'::jsonb);
end $$;

revoke all on function public.edit_message(uuid, text) from public, anon, authenticated;
grant execute on function public.edit_message(uuid, text) to authenticated;
revoke all on function public.unsend_message(uuid) from public, anon, authenticated;
grant execute on function public.unsend_message(uuid) to authenticated;
revoke all on function public.remove_message_for_me(uuid) from public, anon, authenticated;
grant execute on function public.remove_message_for_me(uuid) to authenticated;

notify pgrst, 'reload schema';
