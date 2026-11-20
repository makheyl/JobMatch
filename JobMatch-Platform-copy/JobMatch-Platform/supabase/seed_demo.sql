-- JobMatch demo data. OPTIONAL: for demos and the competition only. Do NOT run on a real production database.
-- Creates fictional employers, job seekers, listings, applications, chats and one admin.
-- Demo password for every demo account: JobMatch#Demo1
-- To remove it all later:  delete from auth.users where email like '%@jobmatch.demo';

create or replace function pg_temp.demo_user(p_email text, p_name text, p_role text, p_pw text) returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', p_email, p_pw, now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_name),
          now() - interval '30 days', now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', p_email, 'email_verified', true), 'email', now(), now(), now());
  update public.profiles set role = p_role, consent_at = now() - interval '30 days', created_at = now() - interval '30 days' where id = uid;
  return uid;
end $$;

do $$
declare
  pw text := extensions.crypt('JobMatch#Demo1', extensions.gen_salt('bf'));
  e record; s record; j record; uid uuid; jid uuid; m int; roll float; dr text; st float; sts text; n int := 0; rid text;
begin
  perform setseed(0.42);
  perform pg_temp.demo_user('admin@jobmatch.demo', 'JobMatch Admin', 'admin', pw);

  -- employers: email, owner, business, type, area, plan, verification, phone, about
  for e in select * from (values
    ('kape@jobmatch.demo', 'Demo Owner – Kape Biñan', 'Kape Biñan', 'Café / restaurant', 'bin-poblacion', 'growth', 'verified', '0917 000 0001', 'A neighborhood café serving locally roasted coffee in the heart of Biñan.'),
    ('casa@jobmatch.demo', 'Demo Owner – CasaBuilt', 'CasaBuilt Hardware', 'Hardware / construction', 'bin-platero', 'starter', 'verified', '0917 000 0002', 'Construction materials and tools for homeowners and contractors.'),
    ('sulit@jobmatch.demo', 'Demo Owner – Sulit Mart', 'Sulit Mart Biñan', 'Grocery', 'bin-canlalay', 'starter', 'verified', '0917 000 0003', 'A family-run supermarket with everyday low prices.'),
    ('smile@jobmatch.demo', 'Demo Owner – Laguna Smile', 'Laguna Smile Dental Clinic', 'Healthcare clinic', 'bin-poblacion', 'starter', 'verified', '0917 000 0004', 'A friendly dental clinic offering general and family dentistry.'),
    ('pixel@jobmatch.demo', 'Demo Owner – Pixel Hub', 'Pixel Hub IT Services', 'IT services', 'sta-rosa', 'business', 'verified', '0917 000 0005', 'Web development, IT support and design for small businesses.'),
    ('swift@jobmatch.demo', 'Demo Owner – Swiftline', 'Swiftline Logistics', 'Logistics', 'bin-zapote', 'growth', 'verified', '0917 000 0006', 'Warehousing and last-mile delivery for local sellers.'),
    ('ledger@jobmatch.demo', 'Demo Owner – Ledger & Co.', 'Ledger & Co. Accounting', 'Accounting / office services', 'bin-poblacion', 'starter', 'verified', '0917 000 0007', 'Bookkeeping and tax compliance for MSMEs.'),
    ('bright@jobmatch.demo', 'Demo Owner – BrightBrand', 'BrightBrand Studio', 'Marketing / creative', 'san-pedro', 'starter', 'verified', '0917 000 0008', 'A small creative studio helping local brands grow online.'),
    ('serve@jobmatch.demo', 'Demo Owner – ServeWell', 'ServeWell Support Hub', 'Customer support', 'bin-malamig', 'growth', 'verified', '0917 000 0009', 'Customer support for online shops and small businesses.'),
    ('sunrise@jobmatch.demo', 'Demo Owner – Sunrise Bakery', 'Sunrise Bakery & Café', 'Café / restaurant', 'bin-sanantonio', 'starter', 'pending', '0917 000 0010', 'Fresh bread and pastries baked every morning.')
  ) as t(email, owner, biz, typ, area, plan, ver, phone, about) loop
    uid := pg_temp.demo_user(e.email, e.owner, 'employer', pw);
    insert into public.employers (user_id, name, type, area_id, address, contact_name, contact_email, contact_phone, about, plan, plan_renews_at, verification_status, submitted_at, reviewed_at)
    values (uid, e.biz, e.typ, e.area, 'Demo address, ' || (select name from public.areas where id = e.area), e.owner, e.email, e.phone, e.about, e.plan,
            case when e.plan = 'starter' then null else now() + interval '10 years' end, e.ver, now() - interval '20 days', case when e.ver = 'verified' then now() - interval '18 days' end);
    insert into public.employer_team (employer_id, name, email, role) values (uid, e.owner, e.email, 'Owner');
    insert into public.employer_docs (employer_id, kind, file_path, file_name) values
      (uid, 'DTI certificate', uid || '/dti-certificate.pdf', 'dti-certificate.pdf'), (uid, 'Mayor''s permit', uid || '/mayors-permit.pdf', 'mayors-permit.pdf');
  end loop;

  -- listings: key, employer email, role, type, min, max, area, days ago, summary
  for j in select * from (values
    (1, 'kape@jobmatch.demo', 'sales-associate', 'Full-time', 14000, 16000, 'bin-poblacion', 2, 'Greet guests, recommend our beans and pastries, and keep the display fresh.'),
    (2, 'kape@jobmatch.demo', 'barista', 'Full-time', 12000, 16000, 'bin-poblacion', 6, 'Prepare espresso drinks, keep the bar clean and serve with a smile.'),
    (3, 'kape@jobmatch.demo', 'cashier', 'Part-time', 9000, 12000, 'bin-poblacion', 4, 'Handle orders and payments on weekends and holidays.'),
    (4, 'sulit@jobmatch.demo', 'cashier', 'Full-time', 12500, 15000, 'bin-canlalay', 9, 'Scan groceries, accept cash and e-wallet payments and bag items.'),
    (5, 'sulit@jobmatch.demo', 'sales-associate', 'Full-time', 13000, 17000, 'bin-canlalay', 12, 'Assist shoppers and restock shelves in the dry-goods aisles.'),
    (6, 'sulit@jobmatch.demo', 'warehouse-staff', 'Full-time', 13500, 16500, 'bin-canlalay', 15, 'Receive deliveries, check counts and keep the stockroom organized.'),
    (7, 'casa@jobmatch.demo', 'hardware-associate', 'Full-time', 13000, 18000, 'bin-platero', 5, 'Help customers choose materials, keep stock organized and process sales.'),
    (8, 'casa@jobmatch.demo', 'cashier', 'Full-time', 12000, 14500, 'bin-platero', 20, 'Handle payments, deliveries and receipts at our counter.'),
    (9, 'smile@jobmatch.demo', 'dental-assistant', 'Full-time', 15000, 20000, 'bin-poblacion', 3, 'Prepare rooms, assist the dentist and sterilize instruments.'),
    (10, 'smile@jobmatch.demo', 'admin-assistant', 'Full-time', 14000, 17000, 'bin-poblacion', 8, 'Manage appointments, patient records and clinic correspondence.'),
    (11, 'pixel@jobmatch.demo', 'web-developer', 'Full-time', 22000, 32000, 'sta-rosa', 1, 'Build and maintain client websites with our senior developers.'),
    (12, 'pixel@jobmatch.demo', 'it-support', 'Full-time', 17000, 24000, 'bin-malamig', 7, 'Support client offices with hardware, software and network issues.'),
    (13, 'pixel@jobmatch.demo', 'graphic-designer', 'Contract', 15000, 22000, 'sta-rosa', 10, 'Create layouts and graphics for client campaigns.'),
    (14, 'swift@jobmatch.demo', 'warehouse-staff', 'Full-time', 14000, 18000, 'bin-zapote', 11, 'Pick, pack and load parcels accurately and safely.'),
    (15, 'swift@jobmatch.demo', 'admin-assistant', 'Full-time', 15000, 19000, 'bin-zapote', 13, 'Prepare delivery documents and coordinate schedules.'),
    (16, 'ledger@jobmatch.demo', 'accounting-clerk', 'Full-time', 16000, 22000, 'bin-poblacion', 14, 'Record transactions, file receipts and prepare simple reports for clients.'),
    (17, 'ledger@jobmatch.demo', 'admin-assistant', 'Part-time', 9000, 12000, 'bin-poblacion', 16, 'Answer emails, schedule client meetings and organize files.'),
    (18, 'bright@jobmatch.demo', 'marketing-assistant', 'Full-time', 16000, 23000, 'san-pedro', 17, 'Schedule posts, write captions and report on campaigns.'),
    (19, 'bright@jobmatch.demo', 'graphic-designer', 'Full-time', 16000, 24000, 'bin-poblacion', 18, 'Design social content and print materials for local brands.'),
    (20, 'serve@jobmatch.demo', 'customer-service-rep', 'Full-time', 16000, 21000, 'bin-malamig', 19, 'Support online shoppers through chat and email.'),
    (21, 'serve@jobmatch.demo', 'customer-service-rep', 'Part-time', 9500, 12500, 'bin-malamig', 21, 'Evening chat support shift for online shops.'),
    (22, 'bright@jobmatch.demo', 'customer-service-rep', 'Internship / OJT', 6000, 8000, 'bin-poblacion', 22, 'OJT slot supporting our client inbox, with mentoring.')
  ) as t(k, email, role_id, typ, lo, hi, area, days, summary) loop
    select id into uid from auth.users where email = j.email;
    insert into public.jobs (id, employer_id, role_id, title, category, type, salary_min, salary_max, area_id, description, skills, status, posted_at)
    select ('00000000-0000-4000-8000-0000000001' || lpad(j.k::text, 2, '0'))::uuid, uid, r.id, r.title, r.category, j.typ, j.lo, j.hi, j.area,
           j.summary || ' Duties include: ' || lower(array_to_string(r.duties, '; ')) || '.',
           (select array_agg(skill order by weight desc, skill) from (select skill, weight from public.role_skills where role_id = r.id order by weight desc, skill limit 4) q),
           'published', now() - make_interval(days => j.days)
    from public.career_roles r where r.id = j.role_id;
  end loop;
  update public.jobs set boosted_until = now() + interval '5 days' where id = '00000000-0000-4000-8000-000000000102';
  insert into public.payments (user_id, kind, item, amount, provider, provider_ref, job_id)
  values ((select id from auth.users where email = 'kape@jobmatch.demo'), 'boost', 'Boosted listing (7 days)', 299, 'sandbox', 'SBX-DEMO0001', '00000000-0000-4000-8000-000000000102');

  -- job seekers: email, name, birth, gender, education, school, course, skills, interests, goal, area, commute, min salary, plan, discoverable
  for s in select * from (values
    ('demo@jobmatch.demo', 'Demo Job Seeker', 2004, '', 'College graduate', 'Pamantasan ng Biñan (demo)', 'BS Business Administration', '{"Customer service":70,"Communication":70,"Filipino":95,"English":70,"Cash handling":40}', array['Retail & Sales','Customer Service','Food & Beverage'], 'sales-associate', 'bin-poblacion', 10, 12000, 'free', false),
    ('maria@jobmatch.demo', 'Maria Reyes', 2002, 'Female', 'College graduate', 'UPHSD–Laguna (demo)', 'BS Business Administration', '{"Customer service":95,"POS system":70,"Upselling":70,"Communication":95,"Filipino":95,"English":70}', array['Retail & Sales','Customer Service'], 'sales-associate', 'bin-poblacion', 8, 13000, 'pro', true),
    ('jun@jobmatch.demo', 'Jun Santos', 2000, 'Male', 'Vocational / TESDA', 'TESDA Laguna (demo)', 'Barista NC II', '{"Barista skills":95,"Customer service":70,"Food safety":70,"Teamwork":95,"Filipino":95}', array['Food & Beverage'], 'barista', 'bin-canlalay', 12, 12000, 'free', true),
    ('ana@jobmatch.demo', 'Ana Cruz', 2003, 'Female', 'College graduate', 'UPHSD–Laguna (demo)', 'BS Accountancy', '{"Bookkeeping":70,"Microsoft Excel":95,"Basic accounting":70,"Data entry":95,"English":95}', array['Finance & Accounting','Admin & Office'], 'accounting-clerk', 'bin-poblacion', 10, 16000, 'free', true),
    ('paolo@jobmatch.demo', 'Paolo Garcia', 2001, 'Male', 'College graduate', 'Laguna State (demo)', 'BS Information Technology', '{"JavaScript":70,"HTML & CSS":95,"Problem solving":70,"Teamwork":70,"Troubleshooting":70,"English":70}', array['IT & Tech'], 'web-developer', 'sta-rosa', 15, 20000, 'pro', true),
    ('liza@jobmatch.demo', 'Liza Mendoza', 1998, 'Female', 'Senior high school', 'Biñan Integrated (demo)', 'ABM Strand', '{"Cash handling":95,"POS system":70,"Customer service":70,"Time management":70,"Filipino":95}', array['Retail & Sales'], 'cashier', 'bin-malamig', 8, 12000, 'free', true),
    ('rico@jobmatch.demo', 'Rico Flores', 1999, 'Male', 'Senior high school', 'Biñan Integrated (demo)', 'TVL Strand', '{"Inventory":70,"Warehouse handling":95,"Teamwork":95,"Record keeping":40}', array['Logistics & Warehouse'], 'warehouse-staff', 'bin-zapote', 12, 13500, 'free', true),
    ('joy@jobmatch.demo', 'Joy Bautista', 2002, 'Female', 'College graduate', 'UPHSD–Laguna (demo)', 'BS Communication', '{"Communication":95,"English":95,"Customer support":70,"Problem solving":70,"Social media":70,"Copywriting":70}', array['Customer Service','Marketing'], 'customer-service-rep', 'bin-malamig', 10, 16000, 'free', true),
    ('carlo@jobmatch.demo', 'Carlo Ramos', 2004, 'Male', 'College undergraduate', 'UPHSD–Laguna (demo)', 'BS Multimedia Arts', '{"Graphic design":70,"Canva":95,"Adobe Photoshop":70,"Time management":40}', array['Creative & Design','Marketing'], 'graphic-designer', 'bin-poblacion', 12, 15000, 'free', true)
  ) as t(email, name, birth, gender, edu, school, course, skills, interests, goal, area, commute, minsal, plan, open) loop
    uid := pg_temp.demo_user(s.email, s.name, 'seeker', pw);
    insert into public.seeker_profiles (user_id, birth_year, gender, edu_level, school, course, grad_year, experience, interests, goal_role, goal_text, area_id, commute_km, salary_min,
                                         resume_summary, open_to_employers, plan, plan_period, plan_renews_at, onboarded)
    values (uid, s.birth, s.gender, s.edu, s.school, s.course, 2024, '[{"role":"Part-time / OJT","org":"Local business (demo)","years":"1"}]', s.interests, s.goal,
            'I want to grow in this field and eventually lead a team.', s.area, s.commute, s.minsal,
            'Motivated candidate with hands-on school and part-time experience. Quick learner and reliable teammate.', s.open, s.plan,
            case when s.plan = 'pro' then 'yearly' end, case when s.plan = 'pro' then now() + interval '200 days' end, true);
    insert into public.seeker_skills (user_id, skill, level) select uid, key, value::int from jsonb_each_text(s.skills::jsonb);
    update public.profiles set phone = '0917 100 00' || lpad((n + 10)::text, 2, '0') where id = uid;
    n := n + 1;
  end loop;
  insert into public.payments (user_id, kind, item, amount, provider, provider_ref)
  select id, 'pro', 'JobMatch Pro (yearly)', 899, 'sandbox', 'SBX-DEMO' || row_number() over () from auth.users where email in ('maria@jobmatch.demo', 'paolo@jobmatch.demo');

  -- swipes and applications from the demo seekers (not the first demo account)
  for s in select u.id as uid, u.email from auth.users u where u.email like '%@jobmatch.demo' and u.email not in ('demo@jobmatch.demo', 'admin@jobmatch.demo')
           and exists (select 1 from public.seeker_profiles sp where sp.user_id = u.id) loop
    for j in select id from public.jobs order by id loop
      m := (app.match(s.uid, j.id)->>'score')::int;
      roll := random();
      dr := case when m >= 75 then case when roll < 0.3 then 'star' when roll < 0.95 then 'right' else 'left' end
                 when m >= 55 then case when roll < 0.35 then 'right' when roll < 0.8 then 'left' else null end
                 else case when roll < 0.55 then 'left' else null end end;
      if dr is not null then
        insert into public.swipes (user_id, job_id, dir, created_at) values (s.uid, j.id, dr, now() - (random() * 10) * interval '1 day');
        insert into public.job_views (job_id, user_id) values (j.id, s.uid) on conflict do nothing;
        if dr in ('right', 'star') and m >= 55 and random() < 0.9 then
          st := random();
          sts := case when st < 0.55 then 'applied' when st < 0.78 then 'shortlisted' when st < 0.9 then 'hired' else 'rejected' end;
          insert into public.applications (user_id, job_id, status, starred, score, created_at, viewed_at, responded_at)
          values (s.uid, j.id, sts, dr = 'star', m, now() - (random() * 9) * interval '1 day',
                  case when sts <> 'applied' or random() < 0.5 then now() - (random() * 5) * interval '1 day' end,
                  case when sts <> 'applied' then now() - (random() * 3) * interval '1 day' end);
        end if;
      end if;
    end loop;
  end loop;
  update public.applications set status = 'applied', responded_at = null where user_id = (select id from auth.users where email = 'maria@jobmatch.demo') and job_id = '00000000-0000-4000-8000-000000000101';

  -- make the demo employer's first two listings look lived-in
  for j in select unnest(array['00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102'])::uuid as id loop
    for s in select u.id as uid, row_number() over (order by u.email) as i from auth.users u where u.email like '%@jobmatch.demo' and u.email not in ('demo@jobmatch.demo', 'admin@jobmatch.demo') and exists (select 1 from public.seeker_profiles sp where sp.user_id = u.id) loop
      continue when exists (select 1 from public.applications a where a.user_id = s.uid and a.job_id = j.id);
      m := (app.match(s.uid, j.id)->>'score')::int;
      continue when m < 40;
      insert into public.swipes (user_id, job_id, dir) values (s.uid, j.id, case when m >= 65 and s.i % 2 = 0 then 'star' else 'right' end) on conflict (user_id, job_id) do update set dir = excluded.dir;
      insert into public.applications (user_id, job_id, status, starred, score, created_at)
      values (s.uid, j.id, case when s.i % 5 = 0 then 'shortlisted' else 'applied' end, m >= 65 and s.i % 2 = 0, m, now() - s.i * interval '7 hours');
    end loop;
  end loop;

  -- a shortlisted application and chat for the demo job seeker
  uid := (select id from auth.users where email = 'demo@jobmatch.demo');
  insert into public.swipes (user_id, job_id, dir) values (uid, '00000000-0000-4000-8000-000000000103', 'star');
  insert into public.applications (id, user_id, job_id, status, starred, score, match_seen, viewed_at, responded_at)
  values ('00000000-0000-4000-8000-000000000a01', uid, '00000000-0000-4000-8000-000000000103', 'shortlisted', true, 78, true, now() - interval '5 hours', now() - interval '4 hours');
  insert into public.conversations (id, application_id, seeker_id, employer_id, job_id, last_message_at)
  values ('00000000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-000000000a01', uid, (select id from auth.users where email = 'kape@jobmatch.demo'), '00000000-0000-4000-8000-000000000103', now() - interval '3 hours');
  insert into public.messages (conversation_id, sender_id, body, created_at) values
    ('00000000-0000-4000-8000-000000000c01', (select id from auth.users where email = 'kape@jobmatch.demo'), 'Hi! Thanks for applying. Are you free for a short interview this Saturday morning?', now() - interval '4 hours'),
    ('00000000-0000-4000-8000-000000000c01', uid, 'Hello! Yes, I am free on Saturday. What time works for you?', now() - interval '3 hours');
  perform app.notify(uid, 'match', 'It''s a Match!', 'Kape Biñan shortlisted you for Cashier.', '/matches');
  perform app.notify(uid, 'tip', 'Welcome to JobMatch', 'Swipe right on jobs you like and star your top choices. Check the Career tab for your skill-gap plan.', '/career');

  insert into public.reports (reporter_id, kind, target_id, reason)
  values ((select id from auth.users where email = 'ana@jobmatch.demo'), 'job', '00000000-0000-4000-8000-000000000111', 'Salary looks unrealistic for the role');
  insert into public.tickets (user_id, kind, subject, message)
  values ((select id from auth.users where email = 'liza@jobmatch.demo'), 'support', 'How do I change my commute distance?', 'I moved to a new barangay and want to update my commute limit.');
  insert into public.course_clicks (user_id, role_id, title, provider, url)
  select u.id, 'sales-associate', 'Customer service courses', 'Coursera (partner link)', 'https://www.coursera.org/search?query=Customer%20service' from auth.users u where u.email in ('maria@jobmatch.demo', 'liza@jobmatch.demo', 'demo@jobmatch.demo');
end $$;
