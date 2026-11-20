-- JobMatch 003: reference data (areas, skills, career roles, roadmaps, quizzes, course partners).
-- Admins can edit all of this later from the Career data page.

insert into public.areas (id, name, lat, lng) values
  ('bin-poblacion', 'Biñan – Poblacion', 14.3333, 121.0833),
  ('bin-canlalay', 'Biñan – Canlalay', 14.3270, 121.0960),
  ('bin-malamig', 'Biñan – Malamig', 14.3180, 121.0870),
  ('bin-platero', 'Biñan – Platero', 14.3400, 121.0720),
  ('bin-sanantonio', 'Biñan – San Antonio', 14.3480, 121.0610),
  ('bin-zapote', 'Biñan – Zapote', 14.3560, 121.0750),
  ('bin-timbao', 'Biñan – Timbao', 14.3120, 121.0760),
  ('bin-delapaz', 'Biñan – De La Paz', 14.3250, 121.0700),
  ('sta-rosa', 'Santa Rosa, Laguna', 14.3122, 121.1114),
  ('san-pedro', 'San Pedro, Laguna', 14.3595, 121.0473),
  ('carmona', 'Carmona, Cavite', 14.3136, 121.0576),
  ('cabuyao', 'Cabuyao, Laguna', 14.2723, 121.1236);

insert into public.skills (name) values
  ('Customer service'), ('Communication'), ('Filipino'), ('English'), ('POS system'), ('Cash handling'), ('Upselling'), ('Inventory'),
  ('Time management'), ('Teamwork'), ('Microsoft Excel'), ('Microsoft Word'), ('Bookkeeping'), ('Basic accounting'), ('Data entry'),
  ('Email writing'), ('Filing'), ('Scheduling'), ('Graphic design'), ('Canva'), ('Adobe Photoshop'), ('Social media'), ('Copywriting'),
  ('Marketing basics'), ('HTML & CSS'), ('JavaScript'), ('Problem solving'), ('Troubleshooting'), ('Networking basics'), ('Customer support'),
  ('Barista skills'), ('Food safety'), ('Dental assisting'), ('Sterilization'), ('First aid'), ('Record keeping'), ('Warehouse handling'),
  ('Sales'), ('Negotiation'), ('Photography');

insert into public.career_roles (id, title, category, salary_min, salary_max, overview, duties, growth)
select v.id, v.title, v.category, v.lo, v.hi, v.overview, v.duties,
       jsonb_build_array(
         jsonb_build_object('level', 'Entry', 'title', v.t1, 'min', v.lo, 'max', round(v.lo + (v.hi - v.lo) * 0.45)),
         jsonb_build_object('level', 'Mid', 'title', v.t2, 'min', round(v.lo + (v.hi - v.lo) * 0.45), 'max', v.hi),
         jsonb_build_object('level', 'Senior', 'title', v.t3, 'min', v.hi, 'max', round(v.hi * 1.5)))
from (values
  ('sales-associate', 'Sales Associate', 'Retail & Sales', 13000, 22000, 'Sales Associate', 'Senior Sales Associate', 'Store Supervisor',
   'Sales associates help customers find products, process purchases and keep the store welcoming. It is a common first job in retail and a path to supervisor roles.',
   array['Greet and assist customers on the floor', 'Keep shelves stocked and displays tidy', 'Process sales and promote add-ons']),
  ('cashier', 'Cashier', 'Retail & Sales', 12000, 18000, 'Cashier', 'Head Cashier', 'Store Supervisor',
   'Cashiers handle payments accurately and keep lines moving. Accuracy and friendliness matter most.',
   array['Scan items and handle cash and digital payments', 'Balance the till at shift end', 'Resolve simple customer concerns']),
  ('customer-service-rep', 'Customer Service Representative', 'Customer Service', 15000, 26000, 'Customer Service Rep', 'Team Lead', 'Operations Supervisor',
   'Customer service reps are the voice of a company. Clear communication and patience are key.',
   array['Answer customer calls, chats and emails', 'Resolve concerns and log cases', 'Escalate complex issues to the right team']),
  ('barista', 'Barista', 'Food & Beverage', 12000, 18000, 'Barista', 'Senior Barista', 'Shift Supervisor',
   'Baristas craft drinks and create a friendly café experience. Speed, consistency and hygiene are important.',
   array['Prepare coffee and beverages to recipe', 'Keep the bar clean and safe', 'Take orders and serve with a smile']),
  ('admin-assistant', 'Administrative Assistant', 'Admin & Office', 14000, 22000, 'Admin Assistant', 'Senior Admin Officer', 'Office Manager',
   'Administrative assistants keep an office running by handling documents, schedules and communication.',
   array['Prepare documents and reports', 'Manage schedules and correspondence', 'Keep records organized']),
  ('accounting-clerk', 'Accounting Clerk', 'Finance & Accounting', 15000, 24000, 'Accounting Clerk', 'Staff Accountant', 'Senior Accountant',
   'Accounting clerks record and organize a company''s financial transactions with accuracy.',
   array['Record daily transactions', 'Prepare simple reports and reconciliations', 'File receipts and invoices']),
  ('graphic-designer', 'Junior Graphic Designer', 'Creative & Design', 15000, 25000, 'Junior Designer', 'Graphic Designer', 'Senior Designer',
   'Junior graphic designers turn ideas into visuals for print and social media.',
   array['Design posters, social posts and layouts', 'Prepare print-ready files', 'Work with clients on revisions']),
  ('web-developer', 'Junior Web Developer', 'IT & Tech', 20000, 35000, 'Junior Developer', 'Web Developer', 'Senior Developer',
   'Junior web developers build websites and web apps under the guidance of senior teammates.',
   array['Build and fix website features', 'Test across browsers and devices', 'Collaborate in code reviews']),
  ('it-support', 'IT Support Technician', 'IT & Tech', 16000, 28000, 'IT Support Technician', 'Systems Technician', 'IT Supervisor',
   'IT support technicians keep computers and networks working for everyone in the office.',
   array['Diagnose hardware and software issues', 'Set up user accounts and devices', 'Document fixes for the team']),
  ('dental-assistant', 'Dental Assistant', 'Healthcare', 14000, 22000, 'Dental Assistant', 'Senior Dental Assistant', 'Clinic Coordinator',
   'Dental assistants support dentists and keep patients comfortable and safe.',
   array['Prepare treatment rooms and instruments', 'Assist the dentist during procedures', 'Sterilize tools and keep records']),
  ('warehouse-staff', 'Warehouse Staff', 'Logistics & Warehouse', 13000, 20000, 'Warehouse Staff', 'Warehouse Lead', 'Warehouse Supervisor',
   'Warehouse staff receive, store and move goods. Accuracy, safety and teamwork matter.',
   array['Receive, store and pick goods', 'Count stock and update records', 'Load and unload safely']),
  ('marketing-assistant', 'Marketing Assistant', 'Marketing', 16000, 26000, 'Marketing Assistant', 'Marketing Specialist', 'Marketing Manager',
   'Marketing assistants help brands reach customers through content and campaigns.',
   array['Schedule and post on social media', 'Write captions and short copy', 'Track campaign results']),
  ('hardware-associate', 'Hardware Store Associate', 'Construction & Hardware', 13000, 20000, 'Store Associate', 'Senior Associate', 'Branch Supervisor',
   'Hardware associates know products well and help builders and homeowners get what they need.',
   array['Help customers choose materials and tools', 'Keep stock organized and counted', 'Process sales and deliveries'])
) as v(id, title, category, lo, hi, t1, t2, t3, overview, duties);

insert into public.role_skills (role_id, skill, weight) values
  ('sales-associate', 'Customer service', 30), ('sales-associate', 'POS system', 25), ('sales-associate', 'Upselling', 20), ('sales-associate', 'Communication', 15), ('sales-associate', 'Filipino', 10),
  ('cashier', 'Cash handling', 35), ('cashier', 'POS system', 30), ('cashier', 'Customer service', 20), ('cashier', 'Time management', 15),
  ('customer-service-rep', 'Communication', 30), ('customer-service-rep', 'English', 25), ('customer-service-rep', 'Customer support', 25), ('customer-service-rep', 'Problem solving', 20),
  ('barista', 'Barista skills', 35), ('barista', 'Customer service', 25), ('barista', 'Food safety', 20), ('barista', 'Teamwork', 20),
  ('admin-assistant', 'Microsoft Excel', 25), ('admin-assistant', 'Microsoft Word', 20), ('admin-assistant', 'Email writing', 20), ('admin-assistant', 'Scheduling', 20), ('admin-assistant', 'Filing', 15),
  ('accounting-clerk', 'Bookkeeping', 30), ('accounting-clerk', 'Microsoft Excel', 25), ('accounting-clerk', 'Basic accounting', 25), ('accounting-clerk', 'Data entry', 20),
  ('graphic-designer', 'Graphic design', 30), ('graphic-designer', 'Adobe Photoshop', 25), ('graphic-designer', 'Canva', 20), ('graphic-designer', 'Time management', 15), ('graphic-designer', 'Communication', 10),
  ('web-developer', 'JavaScript', 35), ('web-developer', 'HTML & CSS', 30), ('web-developer', 'Problem solving', 20), ('web-developer', 'Teamwork', 15),
  ('it-support', 'Troubleshooting', 35), ('it-support', 'Networking basics', 25), ('it-support', 'Customer support', 20), ('it-support', 'Communication', 20),
  ('dental-assistant', 'Dental assisting', 35), ('dental-assistant', 'Sterilization', 25), ('dental-assistant', 'Customer service', 25), ('dental-assistant', 'First aid', 15),
  ('warehouse-staff', 'Inventory', 35), ('warehouse-staff', 'Warehouse handling', 30), ('warehouse-staff', 'Record keeping', 20), ('warehouse-staff', 'Teamwork', 15),
  ('marketing-assistant', 'Social media', 30), ('marketing-assistant', 'Copywriting', 25), ('marketing-assistant', 'Canva', 20), ('marketing-assistant', 'Marketing basics', 25),
  ('hardware-associate', 'Customer service', 25), ('hardware-associate', 'Inventory', 25), ('hardware-associate', 'Sales', 25), ('hardware-associate', 'Cash handling', 25);

insert into public.course_partners (provider, commission_rate) values
  ('Coursera (partner link)', 0.15), ('e-TESDA', 0), ('YouTube', 0);

-- recommended courses per role (top two skills + free TESDA programs)
with ranked as (
  select role_id, skill, row_number() over (partition by role_id order by weight desc, skill) as rn from public.role_skills
)
update public.career_roles r set courses = jsonb_build_array(
  jsonb_build_object('title', a.skill || ' courses', 'provider', 'Coursera (partner link)', 'url', 'https://www.coursera.org/search?query=' || replace(replace(a.skill, ' ', '%20'), '&', '%26')),
  jsonb_build_object('title', b.skill || ' courses', 'provider', 'Coursera (partner link)', 'url', 'https://www.coursera.org/search?query=' || replace(replace(b.skill, ' ', '%20'), '&', '%26')),
  jsonb_build_object('title', 'Free TESDA online programs', 'provider', 'e-TESDA', 'url', 'https://e-tesda.gov.ph/'))
from ranked a join ranked b on b.role_id = a.role_id and b.rn = 2
where a.role_id = r.id and a.rn = 1;

-- week-by-week roadmap generated from each role's skills (admins can edit tasks afterwards)
with ranked as (
  select role_id, skill, row_number() over (partition by role_id order by weight desc, skill) as wk, count(*) over (partition by role_id) as cnt from public.role_skills
), pr(skill, txt) as (values
  ('Customer service', 'Role-play three customer concerns (a complaint, a refund, a product question) and write how you would reply to each.'),
  ('POS system', 'Watch a POS demo video, then ring up ten sample orders including a void and a discount.'),
  ('Upselling', 'List five add-on offers and practice offering one naturally in a one-minute role-play.'),
  ('Cash handling', 'Count a sample till twice, record the total, and practice making change for five purchases.'),
  ('Communication', 'Record a 60-second self-introduction and play it back; note one thing to improve.'),
  ('Microsoft Excel', 'Build a simple monthly budget sheet using SUM, AVERAGE and one chart.'),
  ('Barista skills', 'Practice the steps of an espresso drink at home or at a partner café and time yourself.'),
  ('Food safety', 'Read the basic food-handling rules and make a one-page checklist for opening a kitchen.'),
  ('Bookkeeping', 'Record ten sample transactions in a simple ledger and balance the totals.'),
  ('Graphic design', 'Redesign a small business poster using only two fonts and three colors.'),
  ('HTML & CSS', 'Build a one-page profile site with a heading, an image and a contact section.'),
  ('Troubleshooting', 'Write a step-by-step checklist for fixing "my computer will not connect to Wi-Fi".'),
  ('Inventory', 'Make a stock list of 15 items and practice a quick count against it.'),
  ('Sterilization', 'Study the steps for cleaning and sterilizing instruments and write them in your own words.'),
  ('Social media', 'Plan seven days of posts for a local shop with captions and posting times.'),
  ('Email writing', 'Write a polite email asking a customer for missing information; keep it under 120 words.'),
  ('Copywriting', 'Write three headline options for a promo and pick the strongest with a reason.')
), w as (select * from ranked where wk <= 5)
insert into public.roadmap_tasks (id, role_id, week, week_title, position, type, skill, text, course)
select w.role_id || '-w' || w.wk || '-t1', w.role_id, w.wk::int, 'Week ' || w.wk || ': ' || w.skill, 1, 'learn', w.skill, 'Learn the basics of ' || w.skill,
       case when w.wk % 2 = 1
            then jsonb_build_object('title', w.skill || ' courses', 'provider', 'Coursera (partner link)', 'url', 'https://www.coursera.org/search?query=' || replace(replace(w.skill, ' ', '%20'), '&', '%26'))
            else jsonb_build_object('title', w.skill || ' tutorials', 'provider', 'YouTube', 'url', 'https://www.youtube.com/results?search_query=' || replace(replace(w.skill, ' ', '+'), '&', '%26') || '+tutorial') end
from w
union all
select w.role_id || '-w' || w.wk || '-t2', w.role_id, w.wk::int, 'Week ' || w.wk || ': ' || w.skill, 2, 'practice', w.skill,
       coalesce(p.txt, 'Practice ' || w.skill || ' with a small real-world exercise and note what you learned.'), null
from w left join pr p on p.skill = w.skill
union all
select w.role_id || '-w' || w.wk || '-t3', w.role_id, w.wk::int, 'Week ' || w.wk || ': ' || w.skill, 3, 'quiz', w.skill, 'Quiz: ' || w.skill, null from w
union all
select w.role_id || '-w' || w.wk || '-t4', w.role_id, w.wk::int, 'Week ' || w.wk || ': ' || w.skill, 4, 'practice', w.skill,
       'Prepare three short stories about your strengths and practice a mock interview with a friend.', null
from w where w.wk = least(w.cnt, 5);

insert into public.quiz_questions (skill, question, options, answer) values
  ('Customer service', 'A customer is upset about a late order. What is the best first step?', '["Explain why it is not your fault","Listen, apologize and offer a fix","Ask them to come back tomorrow"]', 1),
  ('Customer service', 'Which phrase shows active listening?', '["As I said before...","Let me repeat that back to be sure I got it.","Please hurry up."]', 1),
  ('Customer service', 'You do not know the answer to a customer question. You should...', '["Guess confidently","Say you will find out and follow up","Change the subject"]', 1),
  ('POS system', 'A customer wants to cancel an item after it was scanned. You should...', '["Void the item using the proper function","Delete the whole receipt","Give cash from your pocket"]', 0),
  ('POS system', 'What should you do at the end of a shift?', '["Close the till and reconcile the totals","Leave the system logged in","Take the cash home"]', 0),
  ('POS system', 'A product scans at the wrong price. First step?', '["Ignore it","Inform your supervisor and correct the price","Charge what you think is fair"]', 1),
  ('Cash handling', 'Change for ₱350 paid with a ₱500 bill is...', '["₱100","₱150","₱250"]', 1),
  ('Cash handling', 'How often should you check bills for authenticity?', '["Only large bills","Every transaction as per store policy","Never"]', 1),
  ('Cash handling', 'If the till is short at closing, you should...', '["Quietly add your own money","Report it and recount with a supervisor","Ignore it"]', 1),
  ('Communication', 'Which is clearest for a message to a teammate?', '["Do the thing.","Please update the stock list by 3 PM today.","Whenever."]', 1),
  ('Communication', 'Good communication includes...', '["Talking more than listening","Checking the other person understood","Using jargon"]', 1),
  ('Communication', 'Tone matters most in...', '["Written messages and calls","Only face-to-face talks","Neither"]', 0),
  ('Upselling', 'A good upsell is...', '["Always the most expensive item","A relevant add-on that helps the customer","Pushed after the customer says no twice"]', 1),
  ('Upselling', 'When is the best time to suggest an add-on?', '["After the customer chooses a main item","Before they enter","After payment"]', 0),
  ('Upselling', 'If a customer declines an add-on you should...', '["Politely accept and move on","Insist","Lower the price at once"]', 0),
  ('Microsoft Excel', 'Which formula adds cells A1 to A5?', '["=ADD(A1:A5)","=SUM(A1:A5)","=PLUS(A1,A5)"]', 1),
  ('Microsoft Excel', 'What does a filter do?', '["Deletes rows","Shows only rows that match a rule","Sorts alphabetically only"]', 1),
  ('Microsoft Excel', 'To lock a cell reference in a formula you use...', '["$ signs, e.g. $A$1","# signs","Quotation marks"]', 0),
  ('Barista skills', 'Espresso that tastes very bitter is often...', '["Under-extracted","Over-extracted","Too cold"]', 1),
  ('Barista skills', 'Milk for a latte should be steamed until...', '["It boils","It is warm and smooth, not scalded","It is cold"]', 1),
  ('Barista skills', 'Before service you should...', '["Clean and calibrate the grinder and machine","Skip tasting","Use yesterday milk"]', 0),
  ('Food safety', 'The danger zone for food temperature is roughly...', '["5°C to 60°C","60°C to 100°C","-18°C to 0°C"]', 0),
  ('Food safety', 'You should wash hands...', '["Only at shift start","Before handling food and after touching raw items","Only when visibly dirty"]', 1),
  ('Food safety', 'Raw meat should be stored...', '["Above ready-to-eat food","Below ready-to-eat food","Anywhere"]', 1),
  ('Bookkeeping', 'Every transaction is recorded as...', '["One entry","A debit and a credit","A note only"]', 1),
  ('Bookkeeping', 'A receipt for supplies is recorded as...', '["An expense","Revenue","An asset always"]', 0),
  ('Bookkeeping', 'Reconciling means...', '["Matching your records to bank or cash records","Deleting errors","Printing reports"]', 0),
  ('Graphic design', 'Good contrast helps...', '["Text be readable","Make files smaller","Add animation"]', 0),
  ('Graphic design', 'Too many fonts on one poster usually makes it...', '["Cleaner","Messy","Faster to print"]', 1),
  ('Graphic design', 'A logo should work in...', '["One color and on light and dark backgrounds","Only full color","Only on white"]', 0),
  ('HTML & CSS', 'Which tag makes the biggest heading?', '["<h6>","<h1>","<head>"]', 1),
  ('HTML & CSS', 'CSS is used to...', '["Style a page","Store data","Send email"]', 0),
  ('HTML & CSS', 'Which attribute gives an image alternative text?', '["alt","src","title only"]', 0),
  ('Troubleshooting', 'Your first step when a PC will not start is usually...', '["Reinstall Windows","Check power and cables","Buy new parts"]', 1),
  ('Troubleshooting', 'A good troubleshooter...', '["Changes many things at once","Changes one thing at a time and tests","Skips documentation"]', 1),
  ('Troubleshooting', 'If a user cannot connect to Wi-Fi, check...', '["Whether other devices connect","Only the user password","The screen brightness"]', 0),
  ('Inventory', 'FIFO means...', '["First in, first out","Fast in, fast out","Final in, final out"]', 0),
  ('Inventory', 'A regular stock count helps you...', '["Spot shortages and losses early","Raise prices","Avoid paperwork"]', 0),
  ('Inventory', 'Fast-moving items should be kept...', '["Easy to reach","Hidden away","Outside the stockroom"]', 0),
  ('Sterilization', 'Instruments should be cleaned before sterilizing to...', '["Remove debris so sterilization works","Save time","Make them shiny"]', 0),
  ('Sterilization', 'Sterilized packs should be stored...', '["Dry and sealed","Open on a tray","Next to waste bins"]', 0),
  ('Sterilization', 'If a pack is torn or wet, you should...', '["Use it anyway","Reprocess it","Dry it with a towel"]', 1),
  ('Social media', 'A content calendar helps you...', '["Post consistently with a plan","Delete old posts","Buy followers"]', 0),
  ('Social media', 'Which metric shows how many people saw your post?', '["Reach","Bio length","Caption emoji count"]', 0),
  ('Social media', 'When a customer comments a complaint you should...', '["Reply politely and move it to DM if needed","Delete it","Argue publicly"]', 0);
