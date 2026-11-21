-- JobMatch 011: Work setup (On-site/Hybrid/Remote), job listing photos, message replies,
-- expanded areas, categorized skills (300+), categorized career roles (100+) with default roadmaps,
-- summary_source, typeahead helpers, and updated RPCs.

-- =====================================================================
-- 1. Schema additions (Work setup, Job photos, Message replies, Summary, Goals)
-- =====================================================================
alter table public.jobs
  add column if not exists work_setup text not null default 'On-site',
  add column if not exists onsite_days smallint null,
  add column if not exists photo_path text,
  add column if not exists photo_focus text not null default '50% 50%';

alter table public.jobs drop constraint if exists jobs_work_setup_check;
alter table public.jobs add constraint jobs_work_setup_check check (work_setup in ('On-site', 'Hybrid', 'Remote'));

alter table public.jobs drop constraint if exists jobs_onsite_days_check;
alter table public.jobs add constraint jobs_onsite_days_check check (onsite_days is null or onsite_days between 1 and 5);

alter table public.seeker_profiles
  add column if not exists work_setups text[] not null default array['On-site', 'Hybrid', 'Remote']::text[],
  add column if not exists goal_level text not null default '',
  add column if not exists goal_timeframe text not null default '',
  add column if not exists summary_source text not null default 'auto';

alter table public.seeker_profiles drop constraint if exists seeker_profiles_work_setups_check;
alter table public.seeker_profiles add constraint seeker_profiles_work_setups_check
  check (work_setups <@ array['On-site', 'Hybrid', 'Remote']::text[]);

alter table public.seeker_profiles drop constraint if exists seeker_profiles_summary_source_check;
alter table public.seeker_profiles add constraint seeker_profiles_summary_source_check
  check (summary_source in ('auto', 'manual'));

alter table public.messages
  add column if not exists reply_to uuid references public.messages(id) on delete set null;

create index if not exists messages_reply_idx on public.messages(reply_to) where reply_to is not null;

-- Grants for client-writable columns
grant insert (work_setup, onsite_days, photo_path, photo_focus),
      update (work_setup, onsite_days, photo_path, photo_focus) on public.jobs to authenticated;
grant update (work_setups, goal_level, goal_timeframe, summary_source) on public.seeker_profiles to authenticated;

-- =====================================================================
-- 2. Storage bucket for Job Listing Photos (public read, owner write/delete)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
   set public = true,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "job-photos public read" on storage.objects;
create policy "job-photos public read" on storage.objects for select
  using (bucket_id = 'job-photos');
drop policy if exists "job-photos owner write" on storage.objects;
create policy "job-photos owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'job-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "job-photos owner update" on storage.objects;
create policy "job-photos owner update" on storage.objects for update to authenticated
  using (bucket_id = 'job-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'job-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "job-photos owner delete" on storage.objects;
create policy "job-photos owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'job-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- 3. Expanded Areas (Biñan, Santa Rosa, San Pedro, Cabuyao, Carmona, Calamba, GMA)
-- =====================================================================
insert into public.areas (id, name, lat, lng) values
  -- Additional Biñan barangays
  ('bin-binan', 'Biñan – Biñan (Poblacion North)', 14.3372, 121.0804),
  ('bin-bungahan', 'Biñan – Bungahan', 14.3248, 121.0802),
  ('bin-casile', 'Biñan – Casile', 14.3422, 121.0868),
  ('bin-ganado', 'Biñan – Ganado', 14.3075, 121.0835),
  ('bin-halang', 'Biñan – Halang', 14.3210, 121.0915),
  ('bin-langkiwa', 'Biñan – Langkiwa', 14.3168, 121.0736),
  ('bin-loma', 'Biñan – Loma', 14.3055, 121.0725),
  ('bin-malaban', 'Biñan – Malaban', 14.3428, 121.0928),
  ('bin-mamplasan', 'Biñan – Mamplasan', 14.3025, 121.0852),
  ('bin-sanfrancisco', 'Biñan – San Francisco (Halang)', 14.3195, 121.0790),
  ('bin-sanjose', 'Biñan – San Jose', 14.3358, 121.0836),
  ('bin-sanvicente', 'Biñan – San Vicente', 14.3315, 121.0784),
  ('bin-santodomingo', 'Biñan – Santo Domingo', 14.3292, 121.0852),
  ('bin-santoniño', 'Biñan – Santo Niño', 14.3396, 121.0772),
  ('bin-santotomas', 'Biñan – Santo Tomas (Calabuso)', 14.3108, 121.0885),
  ('bin-sorosoro', 'Biñan – Soro-soro', 14.3242, 121.0748),
  ('bin-tubigan', 'Biñan – Tubigan', 14.3312, 121.0724),
  -- Santa Rosa barangays
  ('sr-balibago', 'Santa Rosa – Balibago', 14.2940, 121.1028),
  ('sr-dila', 'Santa Rosa – Dila', 14.2925, 121.1112),
  ('sr-dita', 'Santa Rosa – Dita', 14.2868, 121.1172),
  ('sr-donjose', 'Santa Rosa – Don Jose (Nuvali / Paseo)', 14.2485, 121.0598),
  ('sr-macabling', 'Santa Rosa – Macabling', 14.3064, 121.0972),
  ('sr-market', 'Santa Rosa – Market Area', 14.3128, 121.1118),
  ('sr-pooc', 'Santa Rosa – Pooc', 14.3018, 121.1195),
  ('sr-pulongsc', 'Santa Rosa – Pulong Santa Cruz', 14.2825, 121.0912),
  ('sr-tagapo', 'Santa Rosa – Tagapo', 14.3052, 121.1065),
  -- San Pedro barangays
  ('sp-chrysanthemum', 'San Pedro – Chrysanthemum', 14.3422, 121.0458),
  ('sp-cuyab', 'San Pedro – Cuyab', 14.3652, 121.0645),
  ('sp-landayan', 'San Pedro – Landayan', 14.3554, 121.0638),
  ('sp-nueva', 'San Pedro – Nueva', 14.3618, 121.0558),
  ('sp-pacita1', 'San Pedro – Pacita 1', 14.3478, 121.0518),
  ('sp-pacita2', 'San Pedro – Pacita 2', 14.3435, 121.0512),
  ('sp-poblacion', 'San Pedro – Poblacion', 14.3595, 121.0568),
  ('sp-sanantonio', 'San Pedro – San Antonio', 14.3568, 121.0485),
  ('sp-ubayanihan', 'San Pedro – United Bayanihan', 14.3502, 121.0432),
  -- Cabuyao barangays
  ('cab-banaybanay', 'Cabuyao – Banay-Banay', 14.2598, 121.1275),
  ('cab-banlic', 'Cabuyao – Banlic', 14.2520, 121.1328),
  ('cab-mamatid', 'Cabuyao – Mamatid', 14.2442, 121.1482),
  ('cab-marinig', 'Cabuyao – Marinig', 14.2745, 121.1490),
  ('cab-pulo', 'Cabuyao – Pulo', 14.2495, 121.1268),
  ('cab-sala', 'Cabuyao – Sala', 14.2708, 121.1282),
  -- Carmona, Cavite
  ('car-bancal', 'Carmona – Bancal', 14.3072, 121.0468),
  ('car-cabilang', 'Carmona – Cabilang Baybay', 14.3168, 121.0662),
  ('car-maduya', 'Carmona – Maduya', 14.3248, 121.0628),
  ('car-poblacion', 'Carmona – Poblacion', 14.3136, 121.0576),
  -- Calamba, Laguna
  ('cal-canlubang', 'Calamba – Canlubang', 14.2125, 121.0982),
  ('cal-crossing', 'Calamba – Crossing', 14.2118, 121.1652),
  ('cal-real', 'Calamba – Real', 14.2055, 121.1585),
  ('cal-turbina', 'Calamba – Turbina', 14.1865, 121.1408),
  -- GMA, Cavite
  ('gma-poblacion', 'GMA, Cavite – Poblacion', 14.2975, 121.0068),
  ('gma-sangabriel', 'GMA, Cavite – San Gabriel', 14.2872, 121.0155)
on conflict (id) do update
  set name = excluded.name,
      lat = excluded.lat,
      lng = excluded.lng;

-- =====================================================================
-- 4. Categorized Skills Taxonomy (28 categories, 310+ skills)
-- =====================================================================
create table if not exists public.skill_categories (
  id text primary key,
  name text not null,
  icon text not null default 'sparkle',
  sort int not null default 100
);

alter table public.skill_categories enable row level security;
drop policy if exists "skill_categories public read" on public.skill_categories;
create policy "skill_categories public read" on public.skill_categories for select using (true);
drop policy if exists "skill_categories admin write" on public.skill_categories;
create policy "skill_categories admin write" on public.skill_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.skill_categories to anon, authenticated;
grant insert, update, delete on public.skill_categories to authenticated;

alter table public.skills
  add column if not exists category text references public.skill_categories(id),
  add column if not exists aliases text[] not null default '{}',
  add column if not exists is_custom boolean not null default false;

insert into public.skill_categories (id, name, icon, sort) values
  ('core', 'Core Workplace & Soft Skills', 'sparkle', 10),
  ('languages', 'Languages', 'chat', 20),
  ('customer', 'Customer Service & Hospitality', 'users', 30),
  ('bpo', 'BPO & Contact Center', 'mail', 40),
  ('retail', 'Retail & Sales', 'briefcase', 50),
  ('fnb', 'Food & Beverage / Culinary', 'star', 60),
  ('office', 'Office & Administrative', 'file', 70),
  ('finance', 'Finance & Accounting', 'dollar', 80),
  ('it_support', 'IT Support & Networking', 'sliders', 90),
  ('software', 'Software Development', 'zap', 100),
  ('data', 'Data & Analytics', 'chart', 110),
  ('design', 'Design & Creative', 'edit', 120),
  ('marketing', 'Marketing & Social Media', 'megaphone', 130),
  ('gamedev', 'Game Development', 'play', 140),
  ('healthcare', 'Healthcare & Caregiving', 'heart', 150),
  ('education', 'Education & Training', 'book', 160),
  ('logistics', 'Logistics, Warehouse & Supply Chain', 'inbox', 170),
  ('manufacturing', 'Manufacturing & Production', 'settings', 180),
  ('construction', 'Construction & Skilled Trades', 'layers', 190),
  ('electrical', 'Electrical & Electronics', 'zap', 200),
  ('automotive', 'Automotive & Transport', 'pin', 210),
  ('security', 'Security & Safety', 'shield', 220),
  ('housekeeping', 'Housekeeping & Facilities', 'home', 230),
  ('beauty', 'Beauty & Wellness', 'sparkle', 240),
  ('hr', 'HR & Recruitment', 'users', 250),
  ('legal', 'Legal & Compliance', 'shield', 260),
  ('agriculture', 'Agriculture & Fisheries', 'award', 270),
  ('licenses', 'Licenses & Certifications', 'award', 280)
on conflict (id) do update
  set name = excluded.name,
      icon = excluded.icon,
      sort = excluded.sort;

insert into public.skills (name, category, aliases, active) values
  -- Core workplace / soft skills
  ('Teamwork', 'core', array['Collaboration','Team player'], true),
  ('Time management', 'core', array['Scheduling','Deadline management'], true),
  ('Problem solving', 'core', array['Troubleshooting','Critical analysis'], true),
  ('Communication', 'core', array['Verbal communication','Written communication'], true),
  ('Critical thinking', 'core', array['Analytical thinking'], true),
  ('Adaptability', 'core', array['Flexibility'], true),
  ('Attention to detail', 'core', array['Accuracy','Detail-oriented'], true),
  ('Work ethic', 'core', array['Dependability','Reliability'], true),
  ('Leadership', 'core', array['Team leadership','Supervision'], true),
  ('Decision making', 'core', array['Judgment'], true),
  ('Conflict resolution', 'core', array['De-escalation'], true),
  ('Multitasking', 'core', array['Task switching'], true),
  ('Organization', 'core', array['Organizational skills'], true),
  ('Self-motivation', 'core', array['Initiative'], true),
  ('Accountability', 'core', array['Ownership','Responsibility'], true),
  ('Creativity', 'core', array['Creative thinking'], true),
  ('Emotional intelligence', 'core', array['Empathy','EQ'], true),
  ('Stress management', 'core', array['Composure'], true),
  ('Punctuality', 'core', array['Attendance'], true),
  ('Active listening', 'core', array['Listening skills'], true),

  -- Languages
  ('Filipino', 'languages', array['Tagalog'], true),
  ('English', 'languages', array['English proficiency'], true),
  ('Tagalog writing', 'languages', array['Filipino writing'], true),
  ('Cebuano / Bisaya', 'languages', array['Bisaya','Cebuano'], true),
  ('Ilocano', 'languages', array['Ilokano'], true),
  ('Mandarin', 'languages', array['Chinese'], true),
  ('Japanese', 'languages', array['Nihongo'], true),
  ('Korean', 'languages', array['Hangul'], true),
  ('Spanish', 'languages', array['Español'], true),
  ('Sign language (FSL)', 'languages', array['FSL','Sign language'], true),
  ('Business English', 'languages', array['Corporate English'], true),
  ('Public speaking', 'languages', array['Presentation skills'], true),

  -- Customer service & hospitality
  ('Customer service', 'customer', array['Client service','Guest service'], true),
  ('Customer support', 'customer', array['Client support','Helpdesk'], true),
  ('Complaint handling', 'customer', array['Escalation handling'], true),
  ('Front desk operations', 'customer', array['Reception desk','Hotel front desk'], true),
  ('Guest relations', 'customer', array['Hospitality'], true),
  ('Reservations', 'customer', array['Booking management'], true),
  ('Phone etiquette', 'customer', array['Telephone handling'], true),
  ('Hotel housekeeping standards', 'customer', array['Room turnover'], true),
  ('Event assistance', 'customer', array['Event coordination','Ushering'], true),
  ('Concierge services', 'customer', array['Guest assistance'], true),
  ('Upselling', 'customer', array['Cross-selling','Suggestive selling'], true),

  -- BPO / contact center
  ('Inbound calls', 'bpo', array['Voice support','Call center'], true),
  ('Outbound calls', 'bpo', array['Telemarketing','Cold calling'], true),
  ('Chat support', 'bpo', array['Live chat','Non-voice'], true),
  ('Email support', 'bpo', array['Ticket support','Non-voice'], true),
  ('Technical support (Tier 1)', 'bpo', array['Tech support','L1 support'], true),
  ('CRM tools', 'bpo', array['CRM','Customer database'], true),
  ('Zendesk', 'bpo', array['Ticketing'], true),
  ('Salesforce basics', 'bpo', array['Salesforce','SFDC'], true),
  ('Call quality standards', 'bpo', array['QA compliance'], true),
  ('Average handle time management', 'bpo', array['AHT'], true),
  ('Typing speed 40+ WPM', 'bpo', array['Fast typing','WPM'], true),
  ('Neutral accent', 'bpo', array['Voice clarity'], true),

  -- Retail & sales
  ('Sales', 'retail', array['Retail sales','Selling'], true),
  ('Negotiation', 'retail', array['Deal closing'], true),
  ('Cash handling', 'retail', array['Cashiering','Till balancing'], true),
  ('POS system', 'retail', array['Point of Sale','Cash register'], true),
  ('Inventory', 'retail', array['Stock control','Inventory management'], true),
  ('Visual merchandising', 'retail', array['Store display'], true),
  ('Product knowledge', 'retail', array['Merchandise knowledge'], true),
  ('Stock replenishment', 'retail', array['Restocking','Shelf stocking'], true),
  ('Shelf planning (planogram)', 'retail', array['Planogram'], true),
  ('Lead generation', 'retail', array['Prospecting'], true),
  ('Cold calling', 'retail', array['Outbound sales'], true),
  ('Account management', 'retail', array['Client management'], true),
  ('Sales reporting', 'retail', array['Daily sales report'], true),

  -- Food & beverage / culinary
  ('Barista skills', 'fnb', array['Coffee making','Espresso','Latte art'], true),
  ('Food safety', 'fnb', array['Food hygiene','Sanitation'], true),
  ('Food preparation', 'fnb', array['Food prep','Mise en place'], true),
  ('Line cooking', 'fnb', array['Cooking','Short-order cooking'], true),
  ('Baking', 'fnb', array['Bread making'], true),
  ('Pastry', 'fnb', array['Pastry arts','Cake decorating'], true),
  ('Kitchen sanitation', 'fnb', array['Kitchen cleaning'], true),
  ('Food plating', 'fnb', array['Food presentation'], true),
  ('Bartending', 'fnb', array['Mixology'], true),
  ('Order taking', 'fnb', array['Waitstaff','Serving'], true),
  ('Table service', 'fnb', array['Dining service','Bussing'], true),
  ('Menu knowledge', 'fnb', array['Product pairing'], true),
  ('HACCP basics', 'fnb', array['HACCP'], true),
  ('Food costing', 'fnb', array['Recipe costing'], true),
  ('Dishwashing operations', 'fnb', array['Stewarding'], true),

  -- Office & administrative
  ('Microsoft Word', 'office', array['MS Word','Word'], true),
  ('Microsoft Excel', 'office', array['MS Excel','Excel','Spreadsheets'], true),
  ('Data entry', 'office', array['Encoding','Data encoding'], true),
  ('Filing', 'office', array['Records filing','Archiving'], true),
  ('Scheduling', 'office', array['Appointment setting'], true),
  ('Email writing', 'office', array['Business correspondence'], true),
  ('Record keeping', 'office', array['Logbook','Documentation'], true),
  ('Microsoft PowerPoint', 'office', array['MS PowerPoint','PowerPoint','Slides'], true),
  ('Google Workspace', 'office', array['Google Docs','Google Drive','G Suite'], true),
  ('Typing', 'office', array['Touch typing'], true),
  ('Document management', 'office', array['Document control'], true),
  ('Minutes taking', 'office', array['Meeting minutes'], true),
  ('Reception', 'office', array['Front office'], true),
  ('Calendar management', 'office', array['Executive scheduling'], true),
  ('Office equipment operation', 'office', array['Photocopier','Scanner','Printer'], true),
  ('Virtual assistance', 'office', array['VA','Remote admin'], true),

  -- Finance & accounting
  ('Bookkeeping', 'finance', array['Ledger','Journal entries'], true),
  ('Basic accounting', 'finance', array['Accounting','General ledger'], true),
  ('Accounts payable', 'finance', array['AP'], true),
  ('Accounts receivable', 'finance', array['AR','Collections'], true),
  ('Payroll processing', 'finance', array['Payroll','SSS PhilHealth Pag-IBIG'], true),
  ('Bank reconciliation', 'finance', array['Bank recon'], true),
  ('QuickBooks', 'finance', array['QBO','QuickBooks Online'], true),
  ('Xero', 'finance', array['Xero accounting'], true),
  ('Tax filing (BIR forms)', 'finance', array['BIR','Tax compliance','eBIRForms'], true),
  ('Invoicing', 'finance', array['Billing','Official receipts'], true),
  ('Budgeting', 'finance', array['Cost tracking'], true),
  ('Financial reporting', 'finance', array['Financial statements'], true),
  ('Auditing basics', 'finance', array['Internal audit'], true),
  ('Petty cash management', 'finance', array['Petty cash','Liquidation'], true),

  -- IT support & networking
  ('Troubleshooting', 'it_support', array['PC repair','IT troubleshooting'], true),
  ('Networking basics', 'it_support', array['LAN','TCP/IP','Routers'], true),
  ('Computer hardware repair', 'it_support', array['PC assembly','Hardware'], true),
  ('Windows administration', 'it_support', array['Windows 10/11','Windows Server'], true),
  ('macOS support', 'it_support', array['Mac support','Apple'], true),
  ('Printer setup', 'it_support', array['Peripherals'], true),
  ('Help desk ticketing', 'it_support', array['ITSM','Jira Service'], true),
  ('Cable termination', 'it_support', array['RJ45','Structured cabling'], true),
  ('Wi-Fi setup', 'it_support', array['Wireless networking'], true),
  ('Active Directory basics', 'it_support', array['AD','User provisioning'], true),
  ('CCTV installation', 'it_support', array['CCTV setup','NVR/DVR'], true),
  ('IT asset inventory', 'it_support', array['Asset management'], true),
  ('Cybersecurity basics', 'it_support', array['InfoSec','Security awareness'], true),

  -- Software development
  ('HTML & CSS', 'software', array['HTML','CSS','HTML5','CSS3'], true),
  ('JavaScript', 'software', array['JS','ES6'], true),
  ('TypeScript', 'software', array['TS'], true),
  ('React', 'software', array['ReactJS','Next.js'], true),
  ('Vue', 'software', array['Vue.js','VueJS'], true),
  ('Node.js', 'software', array['Node','Express'], true),
  ('PHP', 'software', array['PHP8'], true),
  ('Laravel', 'software', array['Laravel PHP'], true),
  ('Python', 'software', array['Python3','Django','FastAPI'], true),
  ('Java', 'software', array['Spring Boot'], true),
  ('C#', 'software', array['CSharp','.NET','ASP.NET'], true),
  ('Kotlin', 'software', array['Android Kotlin'], true),
  ('Flutter', 'software', array['Dart','Mobile dev'], true),
  ('SQL', 'software', array['Structured Query Language'], true),
  ('PostgreSQL', 'software', array['Postgres'], true),
  ('MySQL', 'software', array['MariaDB'], true),
  ('Firebase', 'software', array['Firestore'], true),
  ('Supabase', 'software', array['Supabase Postgres'], true),
  ('REST APIs', 'software', array['API integration','JSON APIs'], true),
  ('Git & GitHub', 'software', array['Git','GitHub','Version control'], true),
  ('Responsive web design', 'software', array['Mobile-first CSS'], true),
  ('Software testing / QA', 'software', array['QA','Manual testing','Bug tracking'], true),
  ('WordPress', 'software', array['WP','Elementor'], true),
  ('Power Apps', 'software', array['Microsoft Power Apps','Power Platform'], true),
  ('Power Automate', 'software', array['Microsoft Flow'], true),
  ('SharePoint', 'software', array['Microsoft SharePoint'], true),

  -- Data & analytics
  ('Data analysis', 'data', array['Analytics'], true),
  ('Data visualization', 'data', array['Dashboards','Charts'], true),
  ('Power BI', 'data', array['Microsoft Power BI','DAX'], true),
  ('Google Sheets', 'data', array['Sheets'], true),
  ('Excel pivot tables', 'data', array['Pivot tables'], true),
  ('Excel formulas (VLOOKUP/XLOOKUP)', 'data', array['VLOOKUP','XLOOKUP'], true),
  ('Statistics basics', 'data', array['Descriptive statistics'], true),
  ('Data cleaning', 'data', array['Data wrangling'], true),
  ('Report writing', 'data', array['Business reporting'], true),
  ('Survey design', 'data', array['Google Forms','Questionnaires'], true),

  -- Design & creative
  ('Graphic design', 'design', array['Visual design'], true),
  ('Canva', 'design', array['Canva Pro'], true),
  ('Adobe Photoshop', 'design', array['Photoshop','PS'], true),
  ('Photography', 'design', array['Product photography','Event photography'], true),
  ('Adobe Illustrator', 'design', array['Illustrator','AI','Vector design'], true),
  ('Adobe Premiere Pro', 'design', array['Premiere','Premiere Pro'], true),
  ('Video editing', 'design', array['Reels editing','Short-form video'], true),
  ('CapCut', 'design', array['CapCut editing'], true),
  ('Figma', 'design', array['Wireframing','Prototyping'], true),
  ('UI design', 'design', array['User interface'], true),
  ('UX research', 'design', array['User research','Usability testing'], true),
  ('Layout / pubmat design', 'design', array['Pubmat','Poster design'], true),
  ('Branding', 'design', array['Brand identity'], true),
  ('Motion graphics', 'design', array['After Effects'], true),
  ('3D modeling (Blender)', 'design', array['Blender','3D art'], true),
  ('Illustration', 'design', array['Digital drawing'], true),
  ('Copywriting', 'design', array['Ad copy','Captions'], true),

  -- Marketing & social media
  ('Social media', 'marketing', array['Facebook','Instagram','TikTok'], true),
  ('Marketing basics', 'marketing', array['Digital marketing'], true),
  ('Content creation', 'marketing', array['UGC','Reels'], true),
  ('Social media management', 'marketing', array['SMM','Page management'], true),
  ('Facebook Ads', 'marketing', array['Meta Ads','FB Ads'], true),
  ('TikTok marketing', 'marketing', array['TikTok Shop','Live selling'], true),
  ('SEO basics', 'marketing', array['Search engine optimization'], true),
  ('Email marketing', 'marketing', array['Newsletters','Mailchimp'], true),
  ('Community management', 'marketing', array['Page moderation'], true),
  ('Influencer coordination', 'marketing', array['Creator outreach'], true),
  ('Market research', 'marketing', array['Competitor analysis'], true),
  ('Event promotion', 'marketing', array['Promos','Activation'], true),

  -- Game development
  ('Unity', 'gamedev', array['Unity3D'], true),
  ('Unreal Engine', 'gamedev', array['UE5','Blueprints'], true),
  ('C# for Unity', 'gamedev', array['Unity scripting'], true),
  ('Game design', 'gamedev', array['Mechanics design'], true),
  ('Level design', 'gamedev', array['Map design'], true),
  ('Roblox Studio (Lua)', 'gamedev', array['Roblox','Lua'], true),
  ('Pixel art', 'gamedev', array['Sprites'], true),
  ('2D animation', 'gamedev', array['Sprite animation'], true),
  ('Game testing', 'gamedev', array['Game QA','Playtesting'], true),
  ('Godot', 'gamedev', array['GDScript'], true),

  -- Healthcare & caregiving
  ('First aid', 'healthcare', array['Emergency first aid'], true),
  ('Dental assisting', 'healthcare', array['Chairside assisting'], true),
  ('Sterilization', 'healthcare', array['Autoclave','Instrument sterilization'], true),
  ('Patient care', 'healthcare', array['Bedside care'], true),
  ('Vital signs monitoring', 'healthcare', array['BP taking','Vitals'], true),
  ('Caregiving', 'healthcare', array['Home care'], true),
  ('Elderly care', 'healthcare', array['Senior care'], true),
  ('Child care', 'healthcare', array['Babysitting','Nanny'], true),
  ('Medical records', 'healthcare', array['Patient charting','EMR'], true),
  ('Pharmacy assisting', 'healthcare', array['Dispensing support'], true),
  ('Phlebotomy', 'healthcare', array['Blood extraction'], true),
  ('Infection control', 'healthcare', array['PPE protocol'], true),
  ('Medical terminology', 'healthcare', array['Clinical terms'], true),
  ('Basic life support (BLS)', 'healthcare', array['CPR','BLS'], true),

  -- Education & training
  ('Tutoring', 'education', array['Academic tutoring'], true),
  ('Lesson planning', 'education', array['Syllabus planning'], true),
  ('Classroom management', 'education', array['Student engagement'], true),
  ('Early childhood education', 'education', array['Preschool','Daycare'], true),
  ('Online teaching', 'education', array['Zoom teaching','Virtual classroom'], true),
  ('ESL teaching', 'education', array['English tutoring','TEFL'], true),
  ('Training facilitation', 'education', array['Workshop facilitation'], true),
  ('Curriculum development', 'education', array['Instructional design'], true),
  ('Special education support', 'education', array['SPED support'], true),

  -- Logistics, warehouse & supply chain
  ('Warehouse handling', 'logistics', array['Warehousing','Material handling'], true),
  ('Forklift operation', 'logistics', array['Forklift','Reach truck'], true),
  ('Picking & packing', 'logistics', array['Order picking','Packing'], true),
  ('Inventory counting', 'logistics', array['Cycle count','Stocktaking'], true),
  ('Shipping & receiving', 'logistics', array['Inbound/outbound'], true),
  ('Dispatching', 'logistics', array['Fleet dispatch'], true),
  ('Barcode scanning', 'logistics', array['RF scanner'], true),
  ('WMS software', 'logistics', array['Warehouse management system'], true),
  ('Loading / unloading', 'logistics', array['Cargo handling'], true),
  ('Delivery route planning', 'logistics', array['Routing'], true),
  ('Supply chain basics', 'logistics', array['Procurement basics'], true),
  ('Order fulfillment', 'logistics', array['E-commerce fulfillment'], true),

  -- Manufacturing & production
  ('Machine operation', 'manufacturing', array['CNC','Production machine'], true),
  ('Assembly line work', 'manufacturing', array['Production assembly'], true),
  ('Quality control / inspection', 'manufacturing', array['QC','QA inspection'], true),
  ('5S', 'manufacturing', array['5S workplace'], true),
  ('Lean manufacturing basics', 'manufacturing', array['Kaizen','Lean'], true),
  ('SMT / electronics assembly', 'manufacturing', array['SMT','Semiconductor'], true),
  ('Packaging', 'manufacturing', array['Boxing','Labeling'], true),
  ('Production reporting', 'manufacturing', array['Output log'], true),
  ('Safety compliance (OSH)', 'manufacturing', array['OSH','PPE safety'], true),
  ('Soldering', 'manufacturing', array['PCB soldering'], true),
  ('Blueprint reading', 'manufacturing', array['Technical drawing'], true),

  -- Construction & skilled trades
  ('Carpentry', 'construction', array['Woodworking'], true),
  ('Masonry', 'construction', array['Concrete work','Bricklaying'], true),
  ('Plumbing', 'construction', array['Pipefitting'], true),
  ('Welding (SMAW)', 'construction', array['SMAW','Arc welding','TIG/MIG'], true),
  ('Painting', 'construction', array['House painting'], true),
  ('Tile setting', 'construction', array['Tiling'], true),
  ('Steel fixing', 'construction', array['Rebar'], true),
  ('Scaffolding', 'construction', array['Scaffold erection'], true),
  ('Heavy equipment operation', 'construction', array['Backhoe','Excavator'], true),
  ('Construction safety', 'construction', array['Site safety'], true),
  ('Estimating / quantity take-off', 'construction', array['BOQ','Cost estimate'], true),

  -- Electrical & electronics
  ('Electrical installation & maintenance', 'electrical', array['EIM','Electrician'], true),
  ('Electronics repair', 'electrical', array['EPAS','Board repair'], true),
  ('Wiring', 'electrical', array['Building wiring'], true),
  ('Aircon / refrigeration servicing', 'electrical', array['RAC','HVAC','Aircon tech'], true),
  ('Appliance repair', 'electrical', array['Home appliance repair'], true),
  ('Solar panel installation', 'electrical', array['PV installation'], true),
  ('Motor control basics', 'electrical', array['Industrial controls'], true),

  -- Automotive & transport
  ('Driving (non-professional)', 'automotive', array['4-wheel driving'], true),
  ('Professional driving', 'automotive', array['Pro driver','Truck driving'], true),
  ('Motorcycle riding (delivery)', 'automotive', array['Rider','Courier'], true),
  ('Automotive servicing', 'automotive', array['Auto mechanic'], true),
  ('Vehicle maintenance', 'automotive', array['Preventive maintenance'], true),
  ('Tire service', 'automotive', array['Vulcanizing','Wheel alignment'], true),
  ('Defensive driving', 'automotive', array['Road safety'], true),
  ('Route navigation (Waze/Maps)', 'automotive', array['Google Maps','Waze'], true),

  -- Security & safety
  ('Security guarding', 'security', array['Guard duty','VIP security'], true),
  ('CCTV monitoring', 'security', array['Surveillance'], true),
  ('Access control', 'security', array['Gate inspection','Visitor log'], true),
  ('Incident reporting', 'security', array['Spot report'], true),
  ('Fire safety', 'security', array['Fire brigade','Extinguisher use'], true),
  ('Emergency response', 'security', array['Disaster response'], true),
  ('Patrolling', 'security', array['Roving guard'], true),

  -- Housekeeping & facilities
  ('Housekeeping', 'housekeeping', array['Cleaning','Room attendant'], true),
  ('Janitorial services', 'housekeeping', array['Utility','Sanitation'], true),
  ('Laundry operations', 'housekeeping', array['Ironing','Pressing'], true),
  ('Facility maintenance', 'housekeeping', array['Building maintenance','Handyman'], true),
  ('Landscaping / gardening', 'housekeeping', array['Groundskeeping'], true),
  ('Pest control basics', 'housekeeping', array['Sanitizing'], true),

  -- Beauty & wellness
  ('Hairdressing', 'beauty', array['Hairstyling','Hair color'], true),
  ('Barbering', 'beauty', array['Haircut','Fade'], true),
  ('Nail care', 'beauty', array['Manicure','Pedicure','Gel nails'], true),
  ('Makeup artistry', 'beauty', array['HMUA','Bridal makeup'], true),
  ('Massage therapy', 'beauty', array['Hilot','Swedish massage'], true),
  ('Skin care', 'beauty', array['Facial treatment'], true),
  ('Spa services', 'beauty', array['Wellness therapy'], true),

  -- HR & recruitment
  ('Recruitment', 'hr', array['Sourcing','Talent acquisition'], true),
  ('Interviewing', 'hr', array['Applicant screening'], true),
  ('Onboarding', 'hr', array['New hire orientation'], true),
  ('HR records', 'hr', array['201 file'], true),
  ('Timekeeping', 'hr', array['DTR','Attendance tracking'], true),
  ('Labor law basics (PH)', 'hr', array['DOLE compliance'], true),
  ('Employee relations', 'hr', array['Staff engagement'], true),
  ('Training coordination', 'hr', array['L&D'], true),

  -- Legal & compliance
  ('Legal research', 'legal', array['Case research'], true),
  ('Document review', 'legal', array['Paralegal'], true),
  ('Contract drafting basics', 'legal', array['Agreements'], true),
  ('Notarial assistance', 'legal', array['Notary clerk'], true),
  ('Compliance monitoring', 'legal', array['Regulatory compliance'], true),
  ('Data privacy (RA 10173) awareness', 'legal', array['DPA','Data privacy'], true),

  -- Agriculture & fisheries
  ('Crop production', 'agriculture', array['Farming','Horticulture'], true),
  ('Animal husbandry', 'agriculture', array['Livestock','Poultry'], true),
  ('Aquaculture', 'agriculture', array['Fish farming'], true),
  ('Farm equipment operation', 'agriculture', array['Tractor operation'], true),
  ('Organic farming', 'agriculture', array['Urban gardening'], true),
  ('Post-harvest handling', 'agriculture', array['Sorting & grading'], true),

  -- Licenses & certifications
  ('TESDA NC II (specify)', 'licenses', array['TESDA','NC II','NC2'], true),
  ('Driver''s license – Professional', 'licenses', array['Pro license','LTO Pro'], true),
  ('Food handler''s certificate', 'licenses', array['Health card','Sanitary permit'], true),
  ('Civil Service eligibility', 'licenses', array['CSE','CSC'], true),
  ('PRC license (specify)', 'licenses', array['PRC','Board passer'], true),
  ('First aid certification', 'licenses', array['Red Cross'], true),
  ('Forklift certification', 'licenses', array['Forklift NC II'], true),
  ('OSH training (BOSH/COSH)', 'licenses', array['BOSH','COSH','SO1','SO2'], true)
on conflict (name) do update
  set category = excluded.category,
      aliases = excluded.aliases,
      active = true;

-- =====================================================================
-- 5. Categorized Career Roles (22 categories, 110+ roles) + Default Roadmaps
-- =====================================================================
create table if not exists public.role_categories (
  id text primary key,
  name text not null,
  icon text not null default 'briefcase',
  sort int not null default 100
);

alter table public.role_categories enable row level security;
drop policy if exists "role_categories public read" on public.role_categories;
create policy "role_categories public read" on public.role_categories for select using (true);
drop policy if exists "role_categories admin write" on public.role_categories;
create policy "role_categories admin write" on public.role_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.role_categories to anon, authenticated;
grant insert, update, delete on public.role_categories to authenticated;

alter table public.career_roles
  add column if not exists level text not null default 'Entry',
  add column if not exists aliases text[] not null default '{}';

insert into public.role_categories (id, name, icon, sort) values
  ('retail-sales', 'Retail & Sales', 'briefcase', 10),
  ('customer-bpo', 'Customer Service & BPO', 'chat', 20),
  ('food-beverage', 'Food & Beverage', 'star', 30),
  ('hospitality', 'Hospitality & Tourism', 'home', 40),
  ('admin-office', 'Admin & Office', 'file', 50),
  ('finance-accounting', 'Finance & Accounting', 'dollar', 60),
  ('it-tech', 'IT & Tech', 'zap', 70),
  ('data-analytics', 'Data & Analytics', 'chart', 80),
  ('creative-design', 'Creative & Design', 'edit', 90),
  ('game-dev', 'Game Development', 'play', 100),
  ('marketing', 'Marketing', 'megaphone', 110),
  ('healthcare', 'Healthcare', 'heart', 120),
  ('education', 'Education', 'book', 130),
  ('logistics', 'Logistics & Warehouse', 'inbox', 140),
  ('manufacturing', 'Manufacturing', 'settings', 150),
  ('construction', 'Construction & Trades', 'layers', 160),
  ('security-facilities', 'Security & Facilities', 'shield', 170),
  ('beauty-wellness', 'Beauty & Wellness', 'sparkle', 180),
  ('hr-people', 'HR & People', 'users', 190),
  ('transport', 'Transport', 'pin', 200),
  ('ojt-internships', 'Internships / OJT', 'award', 210)
on conflict (id) do update
  set name = excluded.name,
      icon = excluded.icon,
      sort = excluded.sort;

-- Normalize existing category labels on existing roles so they match role_categories.name cleanly
update public.career_roles set category = 'Customer Service & BPO' where category = 'Customer Service';
update public.career_roles set category = 'Construction & Trades' where category = 'Construction & Hardware';

-- Seed expanded roles (100+ roles, Laguna/Cavite PH monthly salary ranges based on CALABARZON wage floor & local market)
insert into public.career_roles (id, title, category, level, aliases, salary_min, salary_max, overview, duties, growth)
select v.id, v.title, v.category, v.lvl, v.aliases, v.lo, v.hi, v.overview, v.duties,
       jsonb_build_array(
         jsonb_build_object('level', 'Entry', 'title', v.t1, 'min', v.lo, 'max', round(v.lo + (v.hi - v.lo) * 0.45)),
         jsonb_build_object('level', 'Mid', 'title', v.t2, 'min', round(v.lo + (v.hi - v.lo) * 0.45), 'max', v.hi),
         jsonb_build_object('level', 'Senior', 'title', v.t3, 'min', v.hi, 'max', round(v.hi * 1.45)))
from (values
  -- Retail & Sales
  ('sales-associate', 'Sales Associate', 'Retail & Sales', 'Entry', array['Sales Clerk','Retail Staff','Shop Assistant'], 14000, 21000, 'Sales Associate', 'Senior Sales Associate', 'Store Supervisor',
   'Assists shoppers on the floor, maintains tidy displays, and closes daily sales accurately.', array['Greet and assist customers','Maintain shelves and stock displays','Process sales and suggest add-ons']),
  ('cashier', 'Cashier', 'Retail & Sales', 'Entry', array['POS Cashier','Counter Clerk'], 13500, 19000, 'Cashier', 'Head Cashier', 'Store Supervisor',
   'Processes cash, card, and e-wallet payments quickly while keeping the register balanced.', array['Scan purchases and process POS tenders','Reconcile drawer at shift close','Provide friendly checkout service']),
  ('merchandiser', 'Merchandiser', 'Retail & Sales', 'Entry', array['Retail Merchandiser','Display Merchandiser'], 14000, 20000, 'Merchandiser', 'Senior Merchandiser', 'Visual Merchandising Lead',
   'Arranges store displays, tracks shelf stock, and ensures products follow brand planograms.', array['Arrange merchandise according to planogram','Monitor stock levels and expiry dates','Coordinate restocking with warehouse']),
  ('promodiser', 'Promodiser', 'Retail & Sales', 'Entry', array['Brand Promodiser','Sales Promoter'], 14000, 20000, 'Promodiser', 'Senior Promodiser', 'Area Sales Coordinator',
   'Represents brands inside retail stores, demonstrates products, and drives daily unit sales.', array['Demonstrate product features to shoppers','Track daily promo sales and inventory','Keep promo booth clean and stocked']),
  ('stock-clerk', 'Stock Clerk', 'Retail & Sales', 'Entry', array['Bagger','Stockman','Replenisher'], 13500, 18500, 'Stock Clerk', 'Inventory Clerk', 'Storekeeping Lead',
   'Receives store deliveries, labels items, and keeps retail shelves replenished.', array['Unpack and price incoming deliveries','Replenish sales floor shelves','Assist with periodic stock counts']),
  ('store-supervisor', 'Store Supervisor', 'Retail & Sales', 'Mid', array['Branch Supervisor','Shift Manager','OIC'], 20000, 32000, 'Assistant Supervisor', 'Store Supervisor', 'Branch Manager',
   'Leads daily store operations, schedules staff shifts, and monitors branch sales targets.', array['Supervise cashiers and sales staff','Audit daily sales and inventory','Resolve escalated customer concerns']),
  ('field-sales-agent', 'Sales Agent (Field)', 'Retail & Sales', 'Entry', array['Field Sales','Territory Sales'], 16000, 28000, 'Junior Sales Agent', 'Field Sales Agent', 'Territory Manager',
   'Visits local businesses and clients in Laguna and Cavite to generate orders and build accounts.', array['Prospect and visit local accounts','Present quotations and close orders','Submit weekly sales pipeline reports']),
  ('inside-sales-rep', 'Inside Sales Representative', 'Retail & Sales', 'Entry', array['Telesales','Online Sales Agent'], 17000, 28000, 'Inside Sales Rep', 'Senior Sales Rep', 'Sales Team Lead',
   'Converts inbound inquiries and outbound leads via phone, chat, and online demos.', array['Qualify inbound and outbound leads','Follow up on quotes and proposals','Log client activity in CRM']),
  ('account-executive', 'Account Executive', 'Retail & Sales', 'Mid', array['B2B Sales','Client Executive'], 24000, 42000, 'Junior AE', 'Account Executive', 'Senior Account Manager',
   'Manages B2B client relationships, negotiates renewals, and expands recurring revenue.', array['Pitch solutions to business decision-makers','Negotiate contracts and pricing','Maintain strong client retention']),

  -- Customer Service & BPO
  ('customer-service-rep', 'Customer Service Representative', 'Customer Service & BPO', 'Entry', array['CSR','Call Center Agent','Support Rep'], 17000, 28000, 'Customer Service Rep', 'Senior CSR', 'Team Leader',
   'Resolves customer inquiries across voice, chat, or email with clear communication and empathy.', array['Handle inbound customer queries','Document cases accurately in CRM','Meet quality and resolution targets']),
  ('tech-support-rep', 'Technical Support Representative', 'Customer Service & BPO', 'Entry', array['TSR','Tech Support Agent'], 20000, 32000, 'Tier 1 Tech Support', 'Tier 2 Tech Support', 'Technical Lead',
   'Guides customers through troubleshooting software, devices, or internet connectivity issues.', array['Diagnose customer technical issues','Walk callers through step-by-step fixes','Escalate complex tickets to engineering']),
  ('chat-support-agent', 'Chat Support Agent', 'Customer Service & BPO', 'Entry', array['Non-Voice Agent','Live Chat Specialist'], 16000, 26000, 'Chat Support Agent', 'Senior Chat Agent', 'Support Team Lead',
   'Handles concurrent live-chat customer sessions quickly with accurate written responses.', array['Respond to multiple live chats simultaneously','Follow brand tone and help scripts','Log ticket resolutions in Zendesk or CRM']),
  ('email-support-specialist', 'Email Support Specialist', 'Customer Service & BPO', 'Entry', array['Ticket Support','Non-Voice Support'], 16000, 26000, 'Email Support Rep', 'Senior Support Specialist', 'Support Lead',
   'Investigates customer tickets and writes thorough, polite email resolutions.', array['Manage queued email support tickets','Verify order or account details','Coordinate with internal teams for fixes']),
  ('collections-agent', 'Collections Agent', 'Customer Service & BPO', 'Entry', array['Credit & Collection','Billing Specialist'], 17000, 27000, 'Collections Agent', 'Senior Collections Specialist', 'Collections Supervisor',
   'Contacts account holders professionally to arrange payment plans and resolve past-due balances.', array['Conduct outbound follow-up calls','Negotiate structured repayment schedules','Document promises-to-pay accurately']),
  ('bpo-qa-analyst', 'Quality Analyst', 'Customer Service & BPO', 'Mid', array['QA Analyst','Call QA'], 22000, 35000, 'QA Auditor', 'Quality Analyst', 'QA Lead',
   'Audits customer calls and chats against quality rubrics and coaches agents to improve scores.', array['Evaluate recorded calls and chat logs','Provide constructive coaching feedback','Report team quality trends to leads']),
  ('bpo-team-leader', 'Team Leader', 'Customer Service & BPO', 'Lead', array['TL','Operations Supervisor','Shift Lead'], 32000, 52000, 'Assistant TL', 'Team Leader', 'Operations Manager',
   'Coaches a team of support agents, monitors real-time KPIs, and handles escalated cases.', array['Track attendance, AHT, and CSAT','Run daily huddles and 1-on-1 coaching','Handle supervisor escalations']),

  -- Food & Beverage
  ('barista', 'Barista', 'Food & Beverage', 'Entry', array['Coffee Maker','Cafe Staff'], 13500, 19500, 'Barista', 'Senior Barista', 'Cafe Supervisor',
   'Crafts espresso beverages, maintains clean equipment, and delivers welcoming café service.', array['Prepare espresso and cold drinks to recipe','Keep bar and machines sanitized','Greet guests and take counter orders']),
  ('service-crew', 'Service Crew', 'Food & Beverage', 'Entry', array['Fast Food Crew','Dining Crew','F&B Staff'], 13500, 18000, 'Service Crew', 'Crew Trainer', 'Shift Manager',
   'Supports counter service, dining cleanliness, and meal assembly in quick-service restaurants.', array['Take and assemble customer orders','Keep dining tables and lobby spotless','Follow food safety and speed standards']),
  ('line-cook', 'Line Cook', 'Food & Beverage', 'Entry', array['Cook','Station Cook','Chef de Partie'], 15000, 24000, 'Junior Cook', 'Line Cook', 'Head Cook / Sous Chef',
   'Prepares ingredients and cooks menu dishes accurately and consistently during busy shifts.', array['Prep ingredients before service','Cook dishes to recipe and plating standards','Maintain clean, HACCP-compliant stations']),
  ('kitchen-helper', 'Kitchen Helper', 'Food & Beverage', 'Entry', array['Commis','Kitchen Steward','Prep Cook'], 13500, 18000, 'Kitchen Helper', 'Prep Cook', 'Line Cook',
   'Supports cooks with ingredient preparation, dishwashing, and keeping the kitchen organized.', array['Wash, peel, and portion ingredients','Sanitize cookware and kitchen surfaces','Assist with kitchen stock receiving']),
  ('baker', 'Baker', 'Food & Beverage', 'Entry', array['Bread Baker','Bakery Staff'], 14500, 22000, 'Assistant Baker', 'Baker', 'Head Baker',
   'Measures, mixes, proofs, and bakes breads and daily bakery items to consistent quality.', array['Scale and mix dough recipes','Monitor ovens and baking schedules','Keep bakery tools and racks clean']),
  ('pastry-cook', 'Pastry Cook', 'Food & Beverage', 'Entry', array['Pastry Chef','Cake Decorator'], 15000, 24000, 'Pastry Assistant', 'Pastry Cook', 'Head Pastry Chef',
   'Creates cakes, pastries, and desserts with careful attention to recipe precision and presentation.', array['Bake cakes, tarts, and pastries','Frost and decorate custom orders','Manage pastry ingredient freshness']),
  ('waiter-waitress', 'Waiter / Waitress', 'Food & Beverage', 'Entry', array['Server','Dining Staff','Food Attendant'], 13500, 19000, 'Server', 'Senior Server', 'Dining Supervisor',
   'Welcomes diners, recommends menu items, serves food promptly, and processes table bills.', array['Take accurate food and drink orders','Serve meals and check on guests','Clear and reset tables promptly']),
  ('bartender', 'Bartender', 'Food & Beverage', 'Entry', array['Mixologist','Bar Staff'], 15000, 24000, 'Barback', 'Bartender', 'Bar Manager',
   'Prepares cocktails and beverages, manages bar stock, and ensures responsible guest service.', array['Mix classic and signature drinks','Monitor bar inventory and glassware','Maintain an inviting, clean bar area']),
  ('restaurant-supervisor', 'Restaurant Supervisor', 'Food & Beverage', 'Mid', array['Dining Manager','F&B Supervisor'], 22000, 34000, 'Shift Supervisor', 'Restaurant Supervisor', 'Store Manager',
   'Oversees front-of-house and kitchen coordination, staff scheduling, and food cost targets.', array['Supervise shift operations and staff','Control food waste and daily inventory','Ensure high guest satisfaction']),
  ('commissary-staff', 'Commissary Staff', 'Food & Beverage', 'Entry', array['Central Kitchen Staff','Food Packer'], 13500, 19000, 'Commissary Crew', 'Commissary Lead', 'Commissary Supervisor',
   'Prepares, portions, and packs bulk sauces and ingredients in a central food commissary.', array['Portion and seal batch food items','Label batches with dates and lot codes','Follow strict sanitation standards']),

  -- Hospitality & Tourism
  ('front-desk-agent', 'Front Desk Agent', 'Hospitality & Tourism', 'Entry', array['Hotel Receptionist','Guest Service Agent'], 15000, 23000, 'Front Desk Agent', 'Senior Front Desk Agent', 'Front Office Supervisor',
   'Handles guest check-ins, check-outs, reservations, and inquiries with warm hospitality.', array['Process hotel check-ins and check-outs','Manage room bookings and billing','Assist guests with local requests']),
  ('housekeeping-attendant', 'Housekeeping Attendant', 'Hospitality & Tourism', 'Entry', array['Hotel Housekeeper'], 13500, 18500, 'Housekeeping Attendant', 'Senior Attendant', 'Housekeeping Supervisor',
   'Cleans and replenishes guest rooms and common areas to hotel hospitality standards.', array['Clean and sanitize guest rooms','Change linens and restock amenities','Report maintenance issues promptly']),
  ('room-attendant', 'Room Attendant', 'Hospitality & Tourism', 'Entry', array['Chambermaid','Room Boy'], 13500, 18500, 'Room Attendant', 'Floor Lead', 'Executive Housekeeper',
   'Turns over guest rooms quickly and thoroughly between stays.', array['Make beds and sanitize bathrooms','Restock toiletries and towels','Inspect rooms before marking ready']),
  ('concierge', 'Concierge', 'Hospitality & Tourism', 'Entry', array['Guest Relations Officer','Bell Captain'], 16000, 25000, 'Concierge', 'Senior Concierge', 'Guest Relations Manager',
   'Assists hotel and resort guests with transport, dining reservations, and local recommendations.', array['Arrange guest transfers and tours','Recommend local dining and attractions','Coordinate special guest requests']),
  ('events-assistant', 'Events Assistant', 'Hospitality & Tourism', 'Entry', array['Banquet Staff','Event Crew'], 15000, 24000, 'Events Assistant', 'Event Coordinator', 'Events Manager',
   'Supports setup, vendor coordination, and guest registration for weddings and corporate events.', array['Coordinate venue setup and suppliers','Manage guest lists and check-in','Assist smooth program execution']),
  ('tour-coordinator', 'Tour Coordinator', 'Hospitality & Tourism', 'Entry', array['Travel Agent','Tour Guide'], 16000, 26000, 'Tour Assistant', 'Tour Coordinator', 'Travel Operations Lead',
   'Organizes itineraries, bookings, and group logistics for local and domestic tours.', array['Book transport, hotels, and tickets','Brief travelers and manage schedules','Handle itinerary adjustments']),

  -- Admin & Office
  ('admin-assistant', 'Administrative Assistant', 'Admin & Office', 'Entry', array['Admin Staff','Office Assistant'], 15000, 24000, 'Admin Assistant', 'Senior Admin Officer', 'Office Manager',
   'Keeps daily office operations organized through document prep, scheduling, and coordination.', array['Prepare letters, memos, and spreadsheets','Manage office supplies and schedules','Organize physical and digital files']),
  ('office-clerk', 'Office Clerk', 'Admin & Office', 'Entry', array['General Clerk','Clerical Staff'], 14000, 20000, 'Office Clerk', 'Senior Clerk', 'Admin Supervisor',
   'Handles routine filing, photocopying, encoding, and front-office errands.', array['File and retrieve company documents','Encode forms and update spreadsheets','Receive deliveries and visitors']),
  ('receptionist', 'Receptionist', 'Admin & Office', 'Entry', array['Front Desk Clerk'], 14500, 21000, 'Receptionist', 'Front Office Coordinator', 'Admin Lead',
   'Greets visitors, answers incoming calls, and routes inquiries to the right department.', array['Welcome guests and log visitor passes','Answer phone lines and take messages','Keep reception area neat and organized']),
  ('data-encoder', 'Data Encoder', 'Admin & Office', 'Entry', array['Data Entry Clerk','Encoder'], 14000, 21000, 'Data Encoder', 'Senior Data Encoder', 'Data Operations Lead',
   'Inputs, verifies, and cleans records in spreadsheets and company databases with high accuracy.', array['Transcribe forms into digital systems','Check entries for duplicates and typos','Prepare daily encoding summaries']),
  ('secretary', 'Secretary', 'Admin & Office', 'Entry', array['Executive Secretary','Admin Secretary'], 16000, 26000, 'Secretary', 'Executive Assistant', 'Office Manager',
   'Supports managers with calendars, meeting minutes, travel bookings, and correspondence.', array['Schedule meetings and take minutes','Draft formal emails and memos','Coordinate executive calendars']),
  ('virtual-assistant', 'Virtual Assistant', 'Admin & Office', 'Entry', array['VA','Remote Admin Assistant'], 18000, 35000, 'General VA', 'Executive VA', 'Operations Specialist',
   'Provides remote administrative, inbox, research, and scheduling support to business owners.', array['Manage client emails and calendars','Prepare reports in Google Workspace','Coordinate tasks and follow-ups remotely']),
  ('records-officer', 'Records Officer', 'Admin & Office', 'Mid', array['Document Controller','Archivist'], 17000, 27000, 'Records Clerk', 'Records Officer', 'Records Manager',
   'Maintains document control policies, archiving, and compliance logs across departments.', array['Index and archive official records','Track document revisions and approvals','Ensure data privacy compliance']),
  ('purchasing-assistant', 'Purchasing Assistant', 'Admin & Office', 'Entry', array['Procurement Assistant','Buyer'], 16000, 25000, 'Purchasing Assistant', 'Purchasing Officer', 'Procurement Manager',
   'Requests supplier quotes, prepares purchase orders, and tracks deliveries for the business.', array['Canvass prices from accredited suppliers','Prepare POs and track delivery dates','Verify invoices against received goods']),

  -- Finance & Accounting
  ('accounting-clerk', 'Accounting Clerk', 'Finance & Accounting', 'Entry', array['Accounting Staff','Bookkeeping Clerk'], 15500, 24000, 'Accounting Clerk', 'Staff Accountant', 'Senior Accountant',
   'Records daily financial transactions, reconciles accounts, and organizes vouchers and receipts.', array['Post daily journal and ledger entries','Assist with bank reconciliations','Organize receipts and BIR files']),
  ('bookkeeper', 'Bookkeeper', 'Finance & Accounting', 'Entry', array['Junior Bookkeeper','Online Bookkeeper'], 17000, 28000, 'Junior Bookkeeper', 'Bookkeeper', 'Senior Bookkeeper',
   'Maintains complete company books in QuickBooks, Xero, or Excel and prepares monthly summaries.', array['Record sales, expenses, and payables','Reconcile bank and e-wallet statements','Prepare monthly trial balances']),
  ('accounting-assistant', 'Accounting Assistant', 'Finance & Accounting', 'Entry', array['Finance Assistant'], 16000, 25000, 'Accounting Assistant', 'Accounting Officer', 'Accounting Supervisor',
   'Supports accountants with billing, voucher preparation, tax schedules, and month-end closing.', array['Prepare check vouchers and billing','Maintain AP/AR aging schedules','Assist with BIR tax remittances']),
  ('payroll-assistant', 'Payroll Assistant', 'Finance & Accounting', 'Entry', array['Payroll Clerk','Compensation Assistant'], 16000, 26000, 'Payroll Assistant', 'Payroll Specialist', 'Payroll Supervisor',
   'Computes employee attendance, overtime, statutory deductions, and payslips accurately.', array['Verify DTR and leave records','Compute SSS, PhilHealth, and Pag-IBIG','Prepare bi-monthly payroll registers']),
  ('billing-clerk', 'Billing Clerk', 'Finance & Accounting', 'Entry', array['Invoicing Clerk','Billing Staff'], 15000, 22000, 'Billing Clerk', 'Billing Specialist', 'Billing Supervisor',
   'Generates customer invoices, statements of account, and tracks payment receipts.', array['Issue accurate invoices and ORs','Send statements of account on time','Reconcile billing adjustments']),
  ('ap-ar-clerk', 'AP/AR Clerk', 'Finance & Accounting', 'Entry', array['Accounts Payable Clerk','Accounts Receivable Clerk'], 16000, 25000, 'AP/AR Clerk', 'AP/AR Specialist', 'Finance Supervisor',
   'Manages supplier payables and customer receivables to keep company cash flow healthy.', array['Match supplier invoices with POs','Follow up on overdue client receivables','Maintain clean AP and AR ledgers']),
  ('junior-accountant', 'Junior Accountant', 'Finance & Accounting', 'Mid', array['Staff Accountant','General Accountant'], 22000, 36000, 'Junior Accountant', 'Senior Accountant', 'Finance Manager',
   'Prepares financial statements, tax filings, and variance reports under accounting standards.', array['Prepare monthly P&L and balance sheets','File monthly and quarterly BIR returns','Support annual external audits']),
  ('audit-assistant', 'Audit Assistant', 'Finance & Accounting', 'Entry', array['Internal Audit Staff','Junior Auditor'], 18000, 28000, 'Audit Assistant', 'Internal Auditor', 'Audit Supervisor',
   'Reviews financial records, inventory counts, and internal controls for compliance.', array['Conduct branch cash and stock audits','Test compliance with company policies','Document audit findings clearly']),

  -- IT & Tech
  ('it-support', 'IT Support Technician', 'IT & Tech', 'Entry', array['IT Staff','Desktop Support','Computer Technician'], 17000, 28000, 'IT Support Technician', 'Systems Technician', 'IT Supervisor',
   'Keeps computers, printers, accounts, and office networks running smoothly for staff.', array['Troubleshoot hardware and OS issues','Set up employee laptops and accounts','Maintain IT inventory and backups']),
  ('help-desk-analyst', 'Help Desk Analyst', 'IT & Tech', 'Entry', array['Service Desk Analyst','IT Helpdesk'], 19000, 30000, 'L1 Help Desk', 'L2 Help Desk Analyst', 'Service Desk Lead',
   'Logs, diagnoses, and resolves internal or client IT tickets via remote support tools.', array['Resolve incoming IT support tickets','Document fixes in knowledge base','Escalate infrastructure incidents']),
  ('web-developer', 'Junior Web Developer', 'IT & Tech', 'Entry', array['Web Dev','Website Developer'], 22000, 38000, 'Junior Web Developer', 'Web Developer', 'Senior Web Developer',
   'Builds responsive websites and web applications using HTML, CSS, JavaScript, and APIs.', array['Develop web pages and UI features','Fix bugs across desktop and mobile','Collaborate using Git and GitHub']),
  ('frontend-developer', 'Front-End Developer', 'IT & Tech', 'Mid', array['React Developer','UI Developer','Frontend Dev'], 26000, 48000, 'Junior Front-End Dev', 'Front-End Developer', 'Senior Front-End Dev',
   'Builds interactive, accessible user interfaces with modern JavaScript frameworks.', array['Translate Figma mockups into code','Connect front-end views to REST APIs','Optimize web performance and responsiveness']),
  ('backend-developer', 'Back-End Developer', 'IT & Tech', 'Mid', array['API Developer','Server Developer','Node/PHP Dev'], 28000, 52000, 'Junior Back-End Dev', 'Back-End Developer', 'Senior Back-End Dev',
   'Designs APIs, databases, and authentication logic that power web and mobile products.', array['Build secure REST API endpoints','Design SQL schemas and queries','Write automated tests and monitor logs']),
  ('fullstack-developer', 'Full-Stack Developer', 'IT & Tech', 'Mid', array['Fullstack Dev','Software Engineer'], 30000, 58000, 'Junior Full-Stack Dev', 'Full-Stack Developer', 'Lead Software Engineer',
   'Ships end-to-end features across database, backend APIs, and frontend interfaces.', array['Build complete web features end-to-end','Manage deployments and database migrations','Review code and debug production issues']),
  ('mobile-app-developer', 'Mobile App Developer', 'IT & Tech', 'Mid', array['Flutter Developer','Android Developer','iOS Developer'], 28000, 52000, 'Junior Mobile Dev', 'Mobile App Developer', 'Senior Mobile Dev',
   'Develops Android and iOS apps using Flutter, Kotlin, or React Native.', array['Implement mobile screens and navigation','Integrate APIs and push notifications','Test and publish app store builds']),
  ('qa-tester', 'QA Tester', 'IT & Tech', 'Entry', array['Software Tester','Quality Assurance'], 20000, 34000, 'Junior QA Tester', 'QA Engineer', 'QA Lead',
   'Tests software releases, writes test cases, and reports reproducible bugs before launch.', array['Execute manual and regression tests','Write clear bug reports with steps','Verify fixes across devices and browsers']),
  ('network-technician', 'Network Technician', 'IT & Tech', 'Entry', array['Network Support','Cabling Tech'], 18000, 30000, 'Network Technician', 'Network Administrator', 'Network Engineer',
   'Installs and maintains routers, switches, structured cabling, and office Wi-Fi.', array['Terminate cables and configure routers','Diagnose LAN and ISP outages','Maintain network diagrams and uptime']),
  ('database-assistant', 'Database Assistant', 'IT & Tech', 'Entry', array['SQL Assistant','Junior DBA'], 20000, 34000, 'Database Assistant', 'Database Administrator', 'Data Platform Lead',
   'Maintains SQL databases, runs queries, and assists with backups and data integrity.', array['Write SQL queries and data exports','Monitor database backups and logs','Clean and validate imported tables']),
  ('lowcode-developer', 'Low-code / Power Platform Developer', 'IT & Tech', 'Entry', array['Power Apps Developer','SharePoint Developer'], 24000, 42000, 'Junior Power Platform Dev', 'Power Platform Developer', 'Solutions Architect',
   'Automates business workflows and internal apps using Power Apps, Power Automate, and SharePoint.', array['Build internal forms in Power Apps','Automate approvals via Power Automate','Maintain SharePoint lists and permissions']),
  ('cctv-systems-tech', 'CCTV & Systems Technician', 'IT & Tech', 'Entry', array['CCTV Installer','Biometrics Technician'], 16000, 26000, 'CCTV Technician', 'Senior Systems Tech', 'Technical Supervisor',
   'Installs, configures, and maintains CCTV cameras, NVRs, door access, and biometrics.', array['Mount cameras and run power/data cables','Configure NVR recording and mobile viewing','Troubleshoot alarms and access panels']),

  -- Data & Analytics
  ('data-analyst', 'Data Analyst (Junior)', 'Data & Analytics', 'Entry', array['Junior Data Analyst','Business Analyst'], 22000, 38000, 'Junior Data Analyst', 'Data Analyst', 'Senior Data Analyst',
   'Cleans datasets, builds dashboards, and uncovers business insights using Excel, SQL, and Power BI.', array['Clean and transform operational data','Build interactive Excel or Power BI dashboards','Present clear weekly trend summaries']),
  ('reporting-analyst', 'Reporting Analyst', 'Data & Analytics', 'Entry', array['MIS Analyst','Reports Specialist'], 20000, 34000, 'Reporting Analyst', 'Senior Reporting Analyst', 'MIS Lead',
   'Produces recurring KPI reports and automated spreadsheets for operations and management.', array['Compile daily and weekly KPI trackers','Automate recurring Excel/Sheets templates','Flag anomalies in team performance']),
  ('bi-assistant', 'Business Intelligence Assistant', 'Data & Analytics', 'Entry', array['BI Analyst','Power BI Assistant'], 22000, 36000, 'BI Assistant', 'BI Developer', 'BI Manager',
   'Supports company dashboards, SQL data models, and executive reporting in Power BI.', array['Update Power BI visual dashboards','Validate metrics against SQL sources','Assist stakeholders with ad-hoc queries']),

  -- Creative & Design
  ('graphic-designer', 'Graphic Designer', 'Creative & Design', 'Entry', array['Junior Graphic Designer','Pubmat Designer'], 17000, 28000, 'Junior Designer', 'Graphic Designer', 'Senior Designer',
   'Creates visual assets for social media, branding, packaging, and commercial print.', array['Design social posts, posters, and banners','Prepare print-ready CMYK artwork','Collaborate on brand guidelines']),
  ('multimedia-artist', 'Multimedia Artist', 'Creative & Design', 'Entry', array['Creative Specialist','MMA'], 18000, 32000, 'Junior Multimedia Artist', 'Multimedia Artist', 'Creative Lead',
   'Combines graphic design, photography, video editing, and light motion graphics for campaigns.', array['Produce graphics and short promo videos','Shoot and retouch product photos','Adapt assets for web and social formats']),
  ('video-editor', 'Video Editor', 'Creative & Design', 'Entry', array['Reels Editor','Short-form Video Editor'], 18000, 32000, 'Junior Video Editor', 'Video Editor', 'Lead Video Editor',
   'Edits engaging short-form Reels, TikToks, and promotional videos with clean pacing and captions.', array['Cut and color-grade video clips','Add captions, music, and motion callouts','Export aspect ratios for TikTok/Reels/YT']),
  ('content-creator', 'Social Media Content Creator', 'Creative & Design', 'Entry', array['UGC Creator','TikTok Creator'], 16000, 28000, 'Content Creator', 'Senior Content Creator', 'Content Strategist',
   'Plans, shoots, and edits relatable photos and videos that grow brand engagement.', array['Brainstorm trending Reels and TikTok concepts','Film and edit product showcase clips','Write engaging hooks and captions']),
  ('ui-ux-designer', 'UI/UX Designer', 'Creative & Design', 'Mid', array['Product Designer','Figma Designer'], 25000, 48000, 'Junior UI/UX Designer', 'UI/UX Designer', 'Lead Product Designer',
   'Designs intuitive web and mobile interfaces through user research, wireframes, and Figma prototypes.', array['Create wireframes and Figma prototypes','Conduct usability tests with users','Maintain clean design systems']),
  ('photographer', 'Photographer', 'Creative & Design', 'Entry', array['Event Photographer','Product Photographer'], 16000, 28000, 'Assistant Photographer', 'Photographer', 'Lead Photographer',
   'Captures crisp product, portrait, and event photography and delivers edited galleries.', array['Set up lighting and frame shots','Edit and color-correct photos','Deliver organized high-res files']),
  ('layout-artist', 'Layout Artist', 'Creative & Design', 'Entry', array['Print Layout Artist','Tarpaulin Designer'], 15000, 24000, 'Junior Layout Artist', 'Layout Artist', 'Production Design Lead',
   'Prepares print layouts, signage, menus, and brochures accurately for local print shops.', array['Lay out menus, flyers, and signage','Check bleed, margins, and color modes','Process client revisions promptly']),

  -- Game Development
  ('junior-game-dev', 'Junior Game Developer', 'Game Development', 'Entry', array['Unity Developer','Roblox Developer','Game Programmer'], 22000, 40000, 'Junior Game Dev', 'Game Developer', 'Lead Game Developer',
   'Builds gameplay mechanics, UI, and prototypes in Unity, Godot, or Roblox Studio.', array['Implement gameplay scripts and physics','Debug frame rate and input issues','Collaborate with artists and designers']),
  ('game-tester', 'Game Tester (QA)', 'Game Development', 'Entry', array['Game QA','Playtester'], 16000, 26000, 'Junior Game Tester', 'Game QA Analyst', 'QA Lead',
   'Playtests game builds systematically to catch crashes, glitches, and balance issues.', array['Run test checklists across levels','Record clear repro steps and clips','Verify bug fixes in new builds']),
  ('game-artist', '2D/3D Game Artist', 'Game Development', 'Entry', array['3D Artist','Pixel Artist','Game Animator'], 20000, 36000, 'Junior Game Artist', 'Game Artist', 'Art Director',
   'Creates characters, sprites, environments, and animations ready for game engines.', array['Create 2D sprites or 3D Blender models','Export optimized game-ready assets','Follow the game''s art direction']),
  ('level-designer', 'Level Designer', 'Game Development', 'Mid', array['Game Designer','Map Designer'], 22000, 38000, 'Junior Level Designer', 'Level Designer', 'Lead Game Designer',
   'Designs engaging game stages, pacing, obstacles, and player progression.', array['Block out playable maps and puzzles','Iterate based on playtester feedback','Document level mechanics clearly']),

  -- Marketing
  ('marketing-assistant', 'Marketing Assistant', 'Marketing', 'Entry', array['Marketing Staff','Promo Assistant'], 16000, 26000, 'Marketing Assistant', 'Marketing Specialist', 'Marketing Manager',
   'Supports digital campaigns, content calendars, events, and basic performance tracking.', array['Schedule social media posts','Write promo copy and newsletters','Track campaign clicks and leads']),
  ('social-media-manager', 'Social Media Manager', 'Marketing', 'Mid', array['SMM','Social Media Specialist'], 20000, 36000, 'Social Media Coordinator', 'Social Media Manager', 'Digital Marketing Lead',
   'Owns brand social pages, content calendars, community replies, and paid social boosts.', array['Plan monthly content calendars','Manage Facebook, Instagram, and TikTok','Report reach, engagement, and conversions']),
  ('digital-marketing-asst', 'Digital Marketing Assistant', 'Marketing', 'Entry', array['Ads Assistant','SEO Assistant'], 17000, 28000, 'Digital Marketing Asst', 'Digital Marketer', 'Performance Marketing Lead',
   'Assists with Facebook Ads, SEO updates, email campaigns, and analytics dashboards.', array['Assist with Meta Ads setup and copy','Update website SEO titles and tags','Compile weekly ad performance reports']),
  ('events-promo-staff', 'Events & Promotions Staff', 'Marketing', 'Entry', array['Activation Staff','Promo Crew'], 14000, 21000, 'Promo Staff', 'Events Coordinator', 'Events Supervisor',
   'Runs in-store promos, mall booths, and community activations to generate brand awareness.', array['Engage shoppers at promo booths','Distribute samples and flyers','Log daily event attendance and leads']),
  ('brand-ambassador', 'Brand Ambassador', 'Marketing', 'Entry', array['Brand Rep','Product Ambassador'], 15000, 24000, 'Brand Ambassador', 'Senior Ambassador', 'Field Marketing Lead',
   'Represents a product positively at retail stores, events, and livestreams.', array['Present brand benefits enthusiastically','Demonstrate products to customers','Collect customer feedback on-site']),

  -- Healthcare
  ('dental-assistant', 'Dental Assistant', 'Healthcare', 'Entry', array['Dental Aide','Clinic Assistant'], 14500, 22000, 'Dental Assistant', 'Senior Dental Assistant', 'Clinic Coordinator',
   'Supports dentists chairside, sterilizes instruments, and ensures patients feel comfortable.', array['Prepare dental chairs and instruments','Assist dentist during procedures','Autoclave tools and update patient charts']),
  ('caregiver', 'Caregiver', 'Healthcare', 'Entry', array['Home Caregiver','Elderly Caregiver'], 15000, 24000, 'Caregiver', 'Senior Caregiver', 'Care Coordinator',
   'Provides compassionate daily living assistance, vital checks, and companionship.', array['Assist with daily hygiene and meals','Monitor vital signs and medications','Keep care environment safe and clean']),
  ('nursing-aide', 'Nursing Aide', 'Healthcare', 'Entry', array['Nursing Assistant','Hospital Aide'], 15000, 23000, 'Nursing Aide', 'Senior Nursing Aide', 'Ward Coordinator',
   'Supports licensed nurses with patient comfort, vitals monitoring, and ward readiness.', array['Take and record patient vital signs','Assist patients with mobility and care','Maintain clean ward supplies']),
  ('pharmacy-assistant', 'Pharmacy Assistant', 'Healthcare', 'Entry', array['Drugstore Clerk','Pharmacy Aide'], 14500, 22000, 'Pharmacy Assistant', 'Senior Pharmacy Asst', 'Store Supervisor',
   'Assists licensed pharmacists with counter service, stock organization, and expiry checks.', array['Receive prescriptions and assist customers','Check medicine stocks and expiry dates','Operate drugstore POS accurately']),
  ('medical-secretary', 'Medical Secretary', 'Healthcare', 'Entry', array['Clinic Secretary','Doctor Secretary'], 15000, 23000, 'Medical Secretary', 'Senior Clinic Secretary', 'Clinic Administrator',
   'Manages doctor schedules, patient records, HMO approvals, and clinic reception.', array['Schedule patient appointments','Process HMO LOAs and billing','Maintain confidential medical records']),
  ('clinic-receptionist', 'Clinic Receptionist', 'Healthcare', 'Entry', array['Health Center Clerk'], 14500, 21000, 'Clinic Receptionist', 'Front Desk Lead', 'Clinic Coordinator',
   'Greets clinic patients, handles intake forms, and coordinates waiting queues smoothly.', array['Register incoming patients accurately','Answer phone and chat inquiries','Collect payments and issue receipts']),
  ('barangay-health-worker', 'Barangay Health Worker', 'Healthcare', 'Entry', array['BHW','Community Health Aide'], 13500, 19000, 'Health Worker', 'Community Health Lead', 'Health Program Coordinator',
   'Supports community health drives, immunization logs, and basic first aid education.', array['Assist community medical missions','Record household health updates','Guide residents on clinic referrals']),
  ('medical-technologist', 'Medical Technologist (Licensed)', 'Healthcare', 'Mid', array['MedTech','RMT','Lab Scientist'], 22000, 35000, 'Junior MedTech', 'Medical Technologist', 'Chief MedTech',
   'Performs clinical laboratory tests, phlebotomy, and quality-controlled diagnostics.', array['Collect specimens and run lab assays','Verify and release lab results','Maintain lab equipment calibration']),

  -- Education
  ('tutor', 'Tutor', 'Education', 'Entry', array['Academic Tutor','Private Tutor'], 15000, 26000, 'Tutor', 'Senior Tutor', 'Learning Center Lead',
   'Helps elementary, high school, or college students master subjects one-on-one or in small groups.', array['Prepare tailored practice exercises','Explain lessons clearly and patiently','Update parents on student progress']),
  ('teacher-aide', 'Teacher Aide', 'Education', 'Entry', array['Teaching Assistant','Classroom Aide'], 14000, 20000, 'Teacher Aide', 'Assistant Teacher', 'Lead Teacher',
   'Supports classroom teachers with learning materials, supervision, and student activities.', array['Prepare classroom materials and visuals','Assist students during group work','Help maintain a safe, tidy classroom']),
  ('daycare-worker', 'Daycare Worker', 'Education', 'Entry', array['Preschool Aide','Childcare Worker'], 14000, 20000, 'Daycare Assistant', 'Daycare Worker', 'Center Coordinator',
   'Guides toddlers and preschoolers through safe play, early literacy, and daily routines.', array['Lead age-appropriate play and songs','Ensure child safety and hygiene','Communicate daily notes to parents']),
  ('esl-teacher', 'ESL Teacher (Online)', 'Education', 'Entry', array['Online English Tutor','ESL Instructor'], 18000, 32000, 'Online ESL Teacher', 'Senior ESL Teacher', 'Academic Coach',
   'Teaches conversational and business English online to local or international learners.', array['Conduct engaging 1-on-1 online lessons','Give clear pronunciation feedback','Write brief post-lesson evaluations']),
  ('trainer', 'Trainer', 'Education', 'Mid', array['Skills Trainer','Corporate Trainer'], 24000, 40000, 'Junior Trainer', 'Trainer', 'Training Manager',
   'Facilitates onboarding workshops, technical upskilling, and hands-on assessments.', array['Deliver structured training sessions','Create slide decks and guides','Assess participant readiness']),

  -- Logistics & Warehouse
  ('warehouse-staff', 'Warehouse Staff', 'Logistics & Warehouse', 'Entry', array['Warehouseman','Helper','Stockroom Staff'], 14000, 21000, 'Warehouse Staff', 'Warehouse Lead', 'Warehouse Supervisor',
   'Receives, stores, picks, and counts warehouse goods accurately and safely.', array['Receive and inspect incoming shipments','Pick and stage outgoing orders','Maintain accurate stock records']),
  ('picker-packer', 'Picker / Packer', 'Logistics & Warehouse', 'Entry', array['Order Picker','E-commerce Packer'], 13500, 19500, 'Picker / Packer', 'Senior Picker', 'Fulfillment Lead',
   'Selects items by barcode and packs e-commerce or retail orders cleanly for dispatch.', array['Scan and pick items from pick lists','Pack fragile goods securely','Label parcels for courier handoff']),
  ('forklift-operator', 'Forklift Operator', 'Logistics & Warehouse', 'Entry', array['Reach Truck Operator','MHE Operator'], 16000, 25000, 'Forklift Operator', 'Senior MHE Operator', 'Warehouse Supervisor',
   'Operates forklifts safely to stack pallets, load trucks, and move warehouse inventory.', array['Load and unload palletized cargo','Inspect forklift daily before shifts','Follow strict aisle safety rules']),
  ('inventory-controller', 'Inventory Controller', 'Logistics & Warehouse', 'Mid', array['Inventory Analyst','Stock Controller'], 18000, 28000, 'Inventory Clerk', 'Inventory Controller', 'Inventory Supervisor',
   'Reconciles physical counts with WMS records and investigates stock variances.', array['Schedule daily cycle counts','Investigate and report variances','Maintain FIFO/FEFO stock rotation']),
  ('delivery-rider', 'Delivery Rider', 'Logistics & Warehouse', 'Entry', array['Motorcycle Courier','Lalamove/Parcel Rider'], 14500, 23000, 'Delivery Rider', 'Senior Rider', 'Fleet Lead',
   'Delivers parcels or food orders promptly and safely across Biñan and nearby towns.', array['Plan efficient daily delivery routes','Verify recipient handoff and COD','Keep motorcycle well-maintained']),
  ('delivery-driver', 'Delivery Driver', 'Logistics & Warehouse', 'Entry', array['Van Driver','4-Wheel Driver'], 16000, 25000, 'Delivery Driver', 'Senior Driver', 'Dispatch Supervisor',
   'Transports goods by van or light truck to stores and clients on schedule.', array['Deliver cargo safely to branches','Check vehicle fluids and tires daily','Collect signed delivery receipts']),
  ('dispatcher', 'Dispatcher', 'Logistics & Warehouse', 'Entry', array['Fleet Dispatcher','Delivery Coordinator'], 16000, 25000, 'Dispatcher', 'Senior Dispatcher', 'Logistics Supervisor',
   'Assigns routes to riders and drivers and monitors on-time delivery status.', array['Schedule daily vehicle dispatches','Track deliveries and resolve delays','Coordinate loading with warehouse']),
  ('logistics-coordinator', 'Logistics Coordinator', 'Logistics & Warehouse', 'Mid', array['Supply Chain Coordinator'], 20000, 32000, 'Logistics Assistant', 'Logistics Coordinator', 'Logistics Manager',
   'Coordinates suppliers, freight, customs or local trucking, and warehouse schedules.', array['Plan inbound and outbound shipments','Monitor carrier performance and costs','Keep order fulfillment on schedule']),

  -- Manufacturing
  ('production-operator', 'Production Operator', 'Manufacturing', 'Entry', array['Factory Worker','Line Operator','Semicon Operator'], 14500, 22000, 'Production Operator', 'Senior Operator', 'Line Leader',
   'Operates assembly stations in Laguna industrial parks with focus on quality and safety.', array['Follow standard work instructions','Meet hourly output and quality goals','Keep work area 5S compliant']),
  ('machine-operator', 'Machine Operator', 'Manufacturing', 'Entry', array['CNC Operator','Press Operator'], 15500, 24000, 'Machine Operator', 'Senior Machine Operator', 'Production Lead',
   'Sets up, monitors, and cleans manufacturing machines while verifying part tolerances.', array['Operate production machinery safely','Log machine checks and output counts','Report wear or faults immediately']),
  ('qc-inspector', 'Quality Control Inspector', 'Manufacturing', 'Entry', array['QC Inspector','QA Inspector'], 15500, 24000, 'QC Inspector', 'Senior QC Inspector', 'QA Supervisor',
   'Inspects raw materials and finished products against specs and logs defects.', array['Perform visual and gauge inspections','Tag and segregate non-conforming lots','Compile shift quality reports']),
  ('assembler', 'Assembler', 'Manufacturing', 'Entry', array['Electronics Assembler','SMT Operator'], 14500, 21000, 'Assembler', 'Senior Assembler', 'Line Leader',
   'Assembles electronic or mechanical sub-components accurately on a production line.', array['Assemble parts per work instructions','Follow ESD and cleanroom rules','Check finished assemblies for defects']),
  ('packer', 'Packer', 'Manufacturing', 'Entry', array['Production Packer','Packaging Staff'], 13500, 19000, 'Packer', 'Packaging Lead', 'Production Supervisor',
   'Packs, seals, weighs, and labels finished products ready for palletizing.', array['Pack products neatly into cartons','Check batch labels and seals','Stack finished cartons safely']),
  ('production-supervisor', 'Production Supervisor', 'Manufacturing', 'Mid', array['Line Supervisor','Shift Supervisor'], 25000, 42000, 'Line Leader', 'Production Supervisor', 'Production Manager',
   'Leads shift operators, balances line targets, and enforces OSH and quality standards.', array['Assign operators and balance lines','Track daily yield, scrap, and OEE','Enforce 5S and workplace safety']),
  ('maintenance-technician', 'Maintenance Technician', 'Manufacturing', 'Mid', array['Plant Technician','Electromechanical Tech'], 19000, 32000, 'Junior Technician', 'Maintenance Technician', 'Maintenance Supervisor',
   'Performs preventive maintenance and repairs on factory equipment and utilities.', array['Execute preventive maintenance schedules','Troubleshoot electrical and mechanical faults','Keep spare parts and work logs updated']),

  -- Construction & Trades
  ('hardware-associate', 'Hardware Store Associate', 'Construction & Trades', 'Entry', array['Hardware Clerk','Depot Staff'], 14000, 21000, 'Store Associate', 'Senior Associate', 'Branch Supervisor',
   'Advises builders and homeowners on tools and materials, manages stock, and processes orders.', array['Help customers select construction materials','Keep hardware aisles organized and counted','Process orders and delivery schedules']),
  ('carpenter', 'Carpenter', 'Construction & Trades', 'Entry', array['Woodworker','Finishing Carpenter'], 16000, 26000, 'Helper Carpenter', 'Carpenter', 'Lead Carpenter / Foreman',
   'Measures, cuts, and builds wooden structures, cabinets, and site formwork.', array['Read plans and measure accurately','Build framing, doors, and cabinetry','Use hand and power tools safely']),
  ('mason', 'Mason', 'Construction & Trades', 'Entry', array['Tile Setter','Concrete Worker'], 16000, 25000, 'Helper Mason', 'Mason', 'Lead Mason',
   'Lays blocks, finishes concrete, and installs tiles for residential and commercial projects.', array['Mix mortar and lay CHB walls','Plaster and level concrete surfaces','Install floor and wall tiles cleanly']),
  ('electrician', 'Electrician', 'Construction & Trades', 'Entry', array['Building Electrician','EIM Technician'], 17000, 28000, 'Assistant Electrician', 'Electrician', 'Master Electrician',
   'Installs, tests, and repairs electrical wiring, panels, and fixtures per safety code.', array['Pull conduits and install wiring','Test circuits and breakers safely','Troubleshoot electrical faults']),
  ('plumber', 'Plumber', 'Construction & Trades', 'Entry', array['Pipefitter','Plumbing Tech'], 16000, 26000, 'Helper Plumber', 'Plumber', 'Senior Plumber',
   'Installs and repairs water lines, drainage pipes, and sanitary fixtures.', array['Fit PVC and PPR water pipes','Fix leaks, valves, and fixtures','Test water pressure and drainage']),
  ('welder', 'Welder', 'Construction & Trades', 'Entry', array['SMAW Welder','Fabricator'], 17000, 28000, 'Junior Welder', 'Welder (SMAW)', 'Welding Foreman',
   'Joins metal structures and fabricates gates, frames, and supports using arc welding.', array['Cut and weld steel frames to specs','Inspect weld quality and grind clean','Wear proper PPE and follow hot-work rules']),
  ('painter', 'Painter', 'Construction & Trades', 'Entry', array['House Painter','Finishing Painter'], 15000, 24000, 'Helper Painter', 'Painter', 'Finishing Lead',
   'Prepares walls and applies primers, paints, and varnishes smoothly and cleanly.', array['Sand, putty, and prime surfaces','Apply even coats with brush or roller','Protect floors and clean tools']),
  ('construction-helper', 'Construction Helper', 'Construction & Trades', 'Entry', array['Laborer','Site Helper'], 13500, 18500, 'Construction Helper', 'Skilled Trades Helper', 'Skilled Tradesman',
   'Supports skilled tradesmen with material handling, site prep, and cleanup.', array['Haul and stage construction materials','Assist carpenters, masons, and welders','Keep job site clean and hazard-free']),
  ('aircon-technician', 'Aircon Technician', 'Construction & Trades', 'Entry', array['HVAC Technician','RAC Technician'], 17000, 28000, 'Assistant Aircon Tech', 'Aircon Technician', 'HVAC Supervisor',
   'Installs, cleans, and repairs split-type, window, and commercial air conditioning units.', array['Perform preventive aircon cleaning','Diagnose cooling and compressor issues','Install units and charge refrigerant safely']),
  ('foreman', 'Foreman', 'Construction & Trades', 'Lead', array['Site Foreman','Construction Supervisor'], 25000, 42000, 'Leadman', 'Foreman', 'Project Superintendent',
   'Supervises site crews, tracks daily progress against blueprints, and enforces site safety.', array['Coordinate daily crew assignments','Inspect workmanship against plans','Enforce PPE and construction safety']),

  -- Security & Facilities
  ('security-guard', 'Security Guard', 'Security & Facilities', 'Entry', array['Lady Guard','Watchman'], 15000, 22000, 'Security Guard', 'Shift-in-Charge', 'Detachment Commander',
   'Protects people and property through access control, roving patrols, and incident logging.', array['Check IDs, bags, and vehicle entries','Conduct scheduled perimeter patrols','Write accurate shift incident reports']),
  ('cctv-operator', 'CCTV Operator', 'Security & Facilities', 'Entry', array['Surveillance Operator','Command Center'], 15500, 23000, 'CCTV Operator', 'Senior Operator', 'Security Supervisor',
   'Monitors live security cameras, flags unusual activity, and archives incident clips.', array['Monitor multi-screen CCTV feeds','Alert roving guards to anomalies','Export incident logs and footage']),
  ('janitor-utility', 'Janitor / Utility Staff', 'Security & Facilities', 'Entry', array['Cleaner','Sanitation Staff'], 13500, 18500, 'Utility Staff', 'Senior Utility Staff', 'Facilities Lead',
   'Keeps offices, malls, schools, and restrooms clean, sanitized, and well-stocked.', array['Sweep, mop, and disinfect floors','Sanitize restrooms and restock soap','Collect and segregate workplace waste']),
  ('maintenance-staff', 'Maintenance Staff', 'Security & Facilities', 'Entry', array['Building Maintenance','Handyman'], 15000, 23000, 'Maintenance Staff', 'Building Technician', 'Facilities Supervisor',
   'Handles general plumbing, lighting, painting, and preventive building upkeep.', array['Fix minor plumbing and lighting issues','Run daily facility safety checks','Coordinate repairs with contractors']),
  ('gardener-landscaper', 'Gardener / Landscaper', 'Security & Facilities', 'Entry', array['Groundskeeper'], 13500, 19000, 'Gardener', 'Landscaper', 'Grounds Supervisor',
   'Maintains lawns, ornamental plants, and outdoor grounds for estates and businesses.', array['Trim grass, hedges, and trees','Water and fertilize landscaped beds','Keep outdoor paths tidy and clean']),

  -- Beauty & Wellness
  ('hairstylist', 'Hairstylist', 'Beauty & Wellness', 'Entry', array['Salon Stylist','Hairdresser'], 15000, 26000, 'Junior Stylist', 'Hairstylist', 'Senior Stylist / Salon Lead',
   'Provides haircuts, coloring, styling, and hair treatments tailored to each client.', array['Consult clients on desired styles','Perform cuts, color, and treatments','Keep salon station clean and sanitized']),
  ('barber', 'Barber', 'Beauty & Wellness', 'Entry', array['Master Barber'], 15000, 25000, 'Junior Barber', 'Barber', 'Master Barber',
   'Delivers precision haircuts, fades, shaves, and grooming in a welcoming barbershop.', array['Cut classic styles and modern fades','Sanitize clippers and blades between clients','Provide friendly barbershop service']),
  ('nail-technician', 'Nail Technician', 'Beauty & Wellness', 'Entry', array['Manicurist','Nail Artist'], 14000, 22000, 'Nail Technician', 'Senior Nail Artist', 'Salon Lead',
   'Performs manicures, pedicures, gel polish, and nail art with strict hygiene.', array['Perform nail care and gel extensions','Sterilize tools after every client','Recommend nail care maintenance']),
  ('massage-therapist', 'Massage Therapist', 'Beauty & Wellness', 'Entry', array['Spa Therapist','Licensed Therapist'], 15000, 25000, 'Massage Therapist', 'Senior Therapist', 'Spa Supervisor',
   'Provides relaxing therapeutic massage services tailored to client comfort and safety.', array['Deliver Swedish, Shiatsu, or Hilot massage','Maintain calm, sanitized treatment rooms','Check client health preferences first']),
  ('makeup-artist', 'Makeup Artist', 'Beauty & Wellness', 'Entry', array['HMUA','Beauty Advisor'], 16000, 28000, 'Junior MUA', 'Makeup Artist', 'Lead HMUA',
   'Applies event, editorial, or retail-counter makeup and advises clients on skincare.', array['Apply long-wearing event makeup','Keep brushes and kits fully sanitized','Recommend suitable shades and skincare']),
  ('spa-attendant', 'Spa Attendant', 'Beauty & Wellness', 'Entry', array['Wellness Receptionist'], 13500, 19000, 'Spa Attendant', 'Senior Attendant', 'Spa Coordinator',
   'Prepares treatment rooms, welcomes guests, and manages towels and bookings.', array['Greet spa guests and serve tea','Prepare linens and treatment areas','Schedule appointments cleanly']),

  -- HR & People
  ('hr-assistant', 'HR Assistant', 'HR & People', 'Entry', array['Human Resources Staff','People Assistant'], 16000, 25000, 'HR Assistant', 'HR Officer', 'HR Supervisor',
   'Supports employee 201 files, attendance tracking, onboarding, and staff inquiries.', array['Maintain confidential 201 records','Assist with onboarding and clearances','Track attendance and leave filings']),
  ('recruitment-assistant', 'Recruitment Assistant', 'HR & People', 'Entry', array['Talent Sourcing','Junior Recruiter'], 16500, 26000, 'Recruitment Assistant', 'Recruiter', 'Talent Acquisition Lead',
   'Sources applicants, schedules interviews, and coordinates hiring stages with managers.', array['Screen résumés and call candidates','Schedule online or on-site interviews','Track applicant status in pipelines']),
  ('timekeeper', 'Timekeeper', 'HR & People', 'Entry', array['Attendance Clerk','DTR Staff'], 15000, 22000, 'Timekeeper', 'Senior Timekeeper', 'Payroll Supervisor',
   'Verifies biometric logs, shift schedules, overtime, and leave forms for payroll.', array['Audit daily time records (DTR)','Resolve missed punch adjustments','Submit clean cut-off summaries to payroll']),
  ('training-coordinator', 'Training Coordinator', 'HR & People', 'Entry', array['L&D Assistant'], 18000, 28000, 'Training Assistant', 'Training Coordinator', 'L&D Specialist',
   'Organizes new-hire orientation, workshop logistics, and employee training records.', array['Schedule training sessions and venues','Track attendance and completion logs','Gather post-training feedback']),

  -- Transport
  ('company-driver', 'Company Driver', 'Transport', 'Entry', array['Family Driver','Executive Driver'], 16000, 25000, 'Company Driver', 'Senior Driver', 'Fleet Coordinator',
   'Drives executives, staff, or supplies safely while keeping company vehicles spotless.', array['Drive safely following traffic laws','Perform daily pre-trip vehicle checks','Keep trip logs and fuel receipts']),
  ('shuttle-driver', 'Shuttle Driver', 'Transport', 'Entry', array['Employee Shuttle','Van Driver'], 17000, 26000, 'Shuttle Driver', 'Senior Shuttle Driver', 'Transport Lead',
   'Operates employee shuttles on fixed pickup schedules around Laguna and Cavite.', array['Follow scheduled pickup and drop-off points','Ensure passenger safety and comfort','Keep vehicle clean and roadworthy']),
  ('truck-helper', 'Truck Helper', 'Transport', 'Entry', array['Pahinante','Delivery Helper'], 13500, 18500, 'Truck Helper', 'Lead Helper', 'Delivery Driver',
   'Assists delivery drivers with loading, unloading, and verifying cargo counts.', array['Load and secure cargo safely','Unload deliveries at client sites','Assist driver with backing and routing']),

  -- Internships / OJT
  ('ojt-it', 'OJT – IT', 'Internships / OJT', 'Entry', array['IT Intern','Web Dev Intern','CS Intern'], 5000, 12000, 'IT Intern', 'Junior IT Staff', 'Developer / Technician',
   'Hands-on internship in web development, IT support, QA testing, or data tasks for BSIT/BSCS students.', array['Assist with real coding or IT support tickets','Document solutions and test fixes','Complete required university OJT hours']),
  ('ojt-business', 'OJT – Business / Admin', 'Internships / OJT', 'Entry', array['Admin Intern','HR Intern','Accounting Intern','ABM Immersion'], 5000, 10000, 'Business Intern', 'Junior Associate', 'Specialist',
   'Practical office, HR, marketing, or accounting immersion for BSBA, BSA, and ABM students.', array['Support daily office and spreadsheet tasks','Assist with filing, scheduling, or marketing','Learn real business workflows']),
  ('ojt-hospitality', 'OJT – Hospitality', 'Internships / OJT', 'Entry', array['HRM Intern','Tourism Intern','Culinary Intern'], 5000, 10000, 'Hospitality Intern', 'Service Crew / Barista', 'Supervisor',
   'Hands-on café, kitchen, front desk, or events immersion for BSHM and BSTM students.', array['Assist dining, kitchen, or front desk teams','Practice guest service and food safety','Complete practicum hours and evaluations']),
  ('ojt-engineering', 'OJT – Engineering', 'Internships / OJT', 'Entry', array['Engineering Intern','Plant Intern'], 6000, 12000, 'Engineering Intern', 'Cadet Engineer', 'Project Engineer',
   'Industrial, electrical, civil, or manufacturing internship in Laguna tech parks and firms.', array['Support site or plant engineers','Assist with QA checks, CAD, or logs','Learn OSH and industrial standards']),
  ('ojt-healthcare', 'OJT – Healthcare', 'Internships / OJT', 'Entry', array['Clinic Intern','Allied Health Intern'], 5000, 10000, 'Healthcare Intern', 'Clinic Assistant', 'Licensed Practitioner',
   'Supervised clinic, pharmacy, or community health immersion for allied health students.', array['Assist clinic staff with intake and prep','Practice strict infection control','Maintain accurate patient documentation'])
) as v(id, title, category, lvl, aliases, lo, hi, t1, t2, t3, overview, duties)
on conflict (id) do update
  set title = excluded.title,
      category = excluded.category,
      level = excluded.level,
      aliases = excluded.aliases,
      salary_min = excluded.salary_min,
      salary_max = excluded.salary_max,
      overview = excluded.overview,
      duties = excluded.duties,
      growth = excluded.growth,
      active = true;

-- Seed at least 4 role_skills for every new role (using exact skill names from public.skills)
insert into public.role_skills (role_id, skill, weight) values
  -- Retail & Sales
  ('merchandiser', 'Visual merchandising', 30), ('merchandiser', 'Stock replenishment', 25), ('merchandiser', 'Inventory', 25), ('merchandiser', 'Shelf planning (planogram)', 20),
  ('promodiser', 'Sales', 30), ('promodiser', 'Product knowledge', 25), ('promodiser', 'Customer service', 25), ('promodiser', 'Upselling', 20),
  ('stock-clerk', 'Stock replenishment', 30), ('stock-clerk', 'Inventory', 30), ('stock-clerk', 'Warehouse handling', 20), ('stock-clerk', 'Attention to detail', 20),
  ('store-supervisor', 'Leadership', 30), ('store-supervisor', 'Sales reporting', 25), ('store-supervisor', 'POS system', 25), ('store-supervisor', 'Complaint handling', 20),
  ('field-sales-agent', 'Sales', 30), ('field-sales-agent', 'Lead generation', 25), ('field-sales-agent', 'Negotiation', 25), ('field-sales-agent', 'Communication', 20),
  ('inside-sales-rep', 'Sales', 30), ('inside-sales-rep', 'Cold calling', 25), ('inside-sales-rep', 'CRM tools', 25), ('inside-sales-rep', 'Communication', 20),
  ('account-executive', 'Account management', 30), ('account-executive', 'Negotiation', 25), ('account-executive', 'Sales', 25), ('account-executive', 'Business English', 20),
  -- BPO
  ('tech-support-rep', 'Technical support (Tier 1)', 35), ('tech-support-rep', 'Troubleshooting', 25), ('tech-support-rep', 'English', 20), ('tech-support-rep', 'Customer support', 20),
  ('chat-support-agent', 'Chat support', 35), ('chat-support-agent', 'Typing speed 40+ WPM', 25), ('chat-support-agent', 'English', 20), ('chat-support-agent', 'Multitasking', 20),
  ('email-support-specialist', 'Email support', 35), ('email-support-specialist', 'Email writing', 25), ('email-support-specialist', 'CRM tools', 20), ('email-support-specialist', 'Attention to detail', 20),
  ('collections-agent', 'Outbound calls', 30), ('collections-agent', 'Negotiation', 25), ('collections-agent', 'Accounts receivable', 25), ('collections-agent', 'Communication', 20),
  ('bpo-qa-analyst', 'Call quality standards', 35), ('bpo-qa-analyst', 'Attention to detail', 25), ('bpo-qa-analyst', 'Communication', 20), ('bpo-qa-analyst', 'Microsoft Excel', 20),
  ('bpo-team-leader', 'Leadership', 30), ('bpo-team-leader', 'Call quality standards', 25), ('bpo-team-leader', 'Average handle time management', 25), ('bpo-team-leader', 'Conflict resolution', 20),
  -- F&B
  ('service-crew', 'Order taking', 30), ('service-crew', 'Customer service', 25), ('service-crew', 'Food safety', 25), ('service-crew', 'Teamwork', 20),
  ('line-cook', 'Line cooking', 35), ('line-cook', 'Food preparation', 25), ('line-cook', 'Food safety', 25), ('line-cook', 'Time management', 15),
  ('kitchen-helper', 'Food preparation', 30), ('kitchen-helper', 'Kitchen sanitation', 30), ('kitchen-helper', 'Dishwashing operations', 20), ('kitchen-helper', 'Food safety', 20),
  ('baker', 'Baking', 35), ('baker', 'Food safety', 25), ('baker', 'Attention to detail', 20), ('baker', 'Time management', 20),
  ('pastry-cook', 'Pastry', 35), ('pastry-cook', 'Baking', 25), ('pastry-cook', 'Food plating', 20), ('pastry-cook', 'Food safety', 20),
  ('waiter-waitress', 'Table service', 35), ('waiter-waitress', 'Order taking', 25), ('waiter-waitress', 'Customer service', 25), ('waiter-waitress', 'Menu knowledge', 15),
  ('bartender', 'Bartending', 35), ('bartender', 'Customer service', 25), ('bartender', 'Cash handling', 20), ('bartender', 'Upselling', 20),
  ('restaurant-supervisor', 'Leadership', 30), ('restaurant-supervisor', 'Food safety', 25), ('restaurant-supervisor', 'Food costing', 25), ('restaurant-supervisor', 'Customer service', 20),
  ('commissary-staff', 'Food preparation', 30), ('commissary-staff', 'Food safety', 30), ('commissary-staff', 'Packaging', 20), ('commissary-staff', 'Inventory', 20),
  -- Hospitality
  ('front-desk-agent', 'Front desk operations', 35), ('front-desk-agent', 'Reservations', 25), ('front-desk-agent', 'Guest relations', 20), ('front-desk-agent', 'English', 20),
  ('housekeeping-attendant', 'Hotel housekeeping standards', 35), ('housekeeping-attendant', 'Housekeeping', 25), ('housekeeping-attendant', 'Attention to detail', 20), ('housekeeping-attendant', 'Time management', 20),
  ('room-attendant', 'Housekeeping', 35), ('room-attendant', 'Hotel housekeeping standards', 30), ('room-attendant', 'Attention to detail', 20), ('room-attendant', 'Teamwork', 15),
  ('concierge', 'Concierge services', 35), ('concierge', 'Guest relations', 25), ('concierge', 'Communication', 20), ('concierge', 'English', 20),
  ('events-assistant', 'Event assistance', 35), ('events-assistant', 'Organization', 25), ('events-assistant', 'Communication', 20), ('events-assistant', 'Teamwork', 20),
  ('tour-coordinator', 'Reservations', 30), ('tour-coordinator', 'Scheduling', 25), ('tour-coordinator', 'Guest relations', 25), ('tour-coordinator', 'Communication', 20),
  -- Admin & Office
  ('office-clerk', 'Filing', 30), ('office-clerk', 'Data entry', 25), ('office-clerk', 'Microsoft Word', 25), ('office-clerk', 'Office equipment operation', 20),
  ('receptionist', 'Reception', 35), ('receptionist', 'Phone etiquette', 25), ('receptionist', 'Customer service', 20), ('receptionist', 'Scheduling', 20),
  ('data-encoder', 'Data entry', 35), ('data-encoder', 'Typing', 25), ('data-encoder', 'Microsoft Excel', 20), ('data-encoder', 'Attention to detail', 20),
  ('secretary', 'Calendar management', 30), ('secretary', 'Minutes taking', 25), ('secretary', 'Email writing', 25), ('secretary', 'Microsoft Word', 20),
  ('virtual-assistant', 'Virtual assistance', 35), ('virtual-assistant', 'Google Workspace', 25), ('virtual-assistant', 'Email writing', 20), ('virtual-assistant', 'Calendar management', 20),
  ('records-officer', 'Document management', 35), ('records-officer', 'Record keeping', 25), ('records-officer', 'Filing', 20), ('records-officer', 'Data privacy (RA 10173) awareness', 20),
  ('purchasing-assistant', 'Negotiation', 30), ('purchasing-assistant', 'Microsoft Excel', 25), ('purchasing-assistant', 'Supply chain basics', 25), ('purchasing-assistant', 'Record keeping', 20),
  -- Finance
  ('bookkeeper', 'Bookkeeping', 35), ('bookkeeper', 'QuickBooks', 25), ('bookkeeper', 'Bank reconciliation', 20), ('bookkeeper', 'Microsoft Excel', 20),
  ('accounting-assistant', 'Basic accounting', 30), ('accounting-assistant', 'Bookkeeping', 25), ('accounting-assistant', 'Microsoft Excel', 25), ('accounting-assistant', 'Invoicing', 20),
  ('payroll-assistant', 'Payroll processing', 35), ('payroll-assistant', 'Timekeeping', 25), ('payroll-assistant', 'Microsoft Excel', 25), ('payroll-assistant', 'Attention to detail', 15),
  ('billing-clerk', 'Invoicing', 35), ('billing-clerk', 'Accounts receivable', 25), ('billing-clerk', 'Microsoft Excel', 20), ('billing-clerk', 'Data entry', 20),
  ('ap-ar-clerk', 'Accounts payable', 30), ('ap-ar-clerk', 'Accounts receivable', 30), ('ap-ar-clerk', 'Bank reconciliation', 20), ('ap-ar-clerk', 'Microsoft Excel', 20),
  ('junior-accountant', 'Financial reporting', 30), ('junior-accountant', 'Tax filing (BIR forms)', 25), ('junior-accountant', 'Basic accounting', 25), ('junior-accountant', 'Microsoft Excel', 20),
  ('audit-assistant', 'Auditing basics', 35), ('audit-assistant', 'Basic accounting', 25), ('audit-assistant', 'Attention to detail', 20), ('audit-assistant', 'Microsoft Excel', 20),
  -- IT & Tech
  ('help-desk-analyst', 'Help desk ticketing', 30), ('help-desk-analyst', 'Troubleshooting', 30), ('help-desk-analyst', 'Windows administration', 20), ('help-desk-analyst', 'Customer support', 20),
  ('frontend-developer', 'JavaScript', 30), ('frontend-developer', 'React', 30), ('frontend-developer', 'HTML & CSS', 25), ('frontend-developer', 'Responsive web design', 15),
  ('backend-developer', 'Node.js', 30), ('backend-developer', 'SQL', 25), ('backend-developer', 'REST APIs', 25), ('backend-developer', 'Git & GitHub', 20),
  ('fullstack-developer', 'JavaScript', 30), ('fullstack-developer', 'React', 25), ('fullstack-developer', 'Node.js', 25), ('fullstack-developer', 'PostgreSQL', 20),
  ('mobile-app-developer', 'Flutter', 35), ('mobile-app-developer', 'REST APIs', 25), ('mobile-app-developer', 'Firebase', 20), ('mobile-app-developer', 'Git & GitHub', 20),
  ('qa-tester', 'Software testing / QA', 35), ('qa-tester', 'Attention to detail', 25), ('qa-tester', 'Problem solving', 20), ('qa-tester', 'Communication', 20),
  ('network-technician', 'Networking basics', 35), ('network-technician', 'Cable termination', 25), ('network-technician', 'Wi-Fi setup', 20), ('network-technician', 'Troubleshooting', 20),
  ('database-assistant', 'SQL', 35), ('database-assistant', 'PostgreSQL', 25), ('database-assistant', 'Data cleaning', 20), ('database-assistant', 'Attention to detail', 20),
  ('lowcode-developer', 'Power Apps', 35), ('lowcode-developer', 'Power Automate', 30), ('lowcode-developer', 'SharePoint', 20), ('lowcode-developer', 'Problem solving', 15),
  ('cctv-systems-tech', 'CCTV installation', 35), ('cctv-systems-tech', 'Networking basics', 25), ('cctv-systems-tech', 'Cable termination', 20), ('cctv-systems-tech', 'Troubleshooting', 20),
  -- Data
  ('data-analyst', 'Data analysis', 30), ('data-analyst', 'SQL', 25), ('data-analyst', 'Excel pivot tables', 25), ('data-analyst', 'Data visualization', 20),
  ('reporting-analyst', 'Microsoft Excel', 30), ('reporting-analyst', 'Excel formulas (VLOOKUP/XLOOKUP)', 25), ('reporting-analyst', 'Report writing', 25), ('reporting-analyst', 'Google Sheets', 20),
  ('bi-assistant', 'Power BI', 35), ('bi-assistant', 'Data visualization', 25), ('bi-assistant', 'SQL', 20), ('bi-assistant', 'Data cleaning', 20),
  -- Creative
  ('multimedia-artist', 'Graphic design', 30), ('multimedia-artist', 'Video editing', 25), ('multimedia-artist', 'Adobe Photoshop', 25), ('multimedia-artist', 'Photography', 20),
  ('video-editor', 'Video editing', 35), ('video-editor', 'Adobe Premiere Pro', 25), ('video-editor', 'CapCut', 25), ('video-editor', 'Motion graphics', 15),
  ('content-creator', 'Content creation', 35), ('content-creator', 'Video editing', 25), ('content-creator', 'Social media', 20), ('content-creator', 'Copywriting', 20),
  ('ui-ux-designer', 'Figma', 35), ('ui-ux-designer', 'UI design', 25), ('ui-ux-designer', 'UX research', 25), ('ui-ux-designer', 'Communication', 15),
  ('photographer', 'Photography', 40), ('photographer', 'Adobe Photoshop', 25), ('photographer', 'Creativity', 20), ('photographer', 'Time management', 15),
  ('layout-artist', 'Layout / pubmat design', 35), ('layout-artist', 'Adobe Illustrator', 25), ('layout-artist', 'Adobe Photoshop', 20), ('layout-artist', 'Attention to detail', 20),
  -- Game Dev
  ('junior-game-dev', 'Unity', 35), ('junior-game-dev', 'C# for Unity', 30), ('junior-game-dev', 'Git & GitHub', 20), ('junior-game-dev', 'Problem solving', 15),
  ('game-tester', 'Game testing', 35), ('game-tester', 'Software testing / QA', 25), ('game-tester', 'Attention to detail', 20), ('game-tester', 'Communication', 20),
  ('game-artist', '3D modeling (Blender)', 30), ('game-artist', 'Pixel art', 25), ('game-artist', '2D animation', 25), ('game-artist', 'Illustration', 20),
  ('level-designer', 'Level design', 35), ('level-designer', 'Game design', 30), ('level-designer', 'Unity', 20), ('level-designer', 'Creativity', 15),
  -- Marketing
  ('social-media-manager', 'Social media management', 35), ('social-media-manager', 'Content creation', 25), ('social-media-manager', 'Facebook Ads', 20), ('social-media-manager', 'Copywriting', 20),
  ('digital-marketing-asst', 'Facebook Ads', 30), ('digital-marketing-asst', 'SEO basics', 25), ('digital-marketing-asst', 'Marketing basics', 25), ('digital-marketing-asst', 'Email marketing', 20),
  ('events-promo-staff', 'Event promotion', 35), ('events-promo-staff', 'Customer service', 25), ('events-promo-staff', 'Communication', 20), ('events-promo-staff', 'Teamwork', 20),
  ('brand-ambassador', 'Product knowledge', 30), ('brand-ambassador', 'Sales', 25), ('brand-ambassador', 'Public speaking', 25), ('brand-ambassador', 'Customer service', 20),
  -- Healthcare
  ('caregiver', 'Caregiving', 35), ('caregiver', 'Vital signs monitoring', 25), ('caregiver', 'Patient care', 20), ('caregiver', 'First aid', 20),
  ('nursing-aide', 'Patient care', 35), ('nursing-aide', 'Vital signs monitoring', 25), ('nursing-aide', 'Infection control', 20), ('nursing-aide', 'Basic life support (BLS)', 20),
  ('pharmacy-assistant', 'Pharmacy assisting', 35), ('pharmacy-assistant', 'Customer service', 25), ('pharmacy-assistant', 'Inventory', 20), ('pharmacy-assistant', 'Attention to detail', 20),
  ('medical-secretary', 'Medical records', 35), ('medical-secretary', 'Scheduling', 25), ('medical-secretary', 'Medical terminology', 20), ('medical-secretary', 'Customer service', 20),
  ('clinic-receptionist', 'Reception', 30), ('clinic-receptionist', 'Medical records', 25), ('clinic-receptionist', 'Customer service', 25), ('clinic-receptionist', 'Scheduling', 20),
  ('barangay-health-worker', 'First aid', 30), ('barangay-health-worker', 'Vital signs monitoring', 25), ('barangay-health-worker', 'Record keeping', 25), ('barangay-health-worker', 'Communication', 20),
  ('medical-technologist', 'Phlebotomy', 30), ('medical-technologist', 'Infection control', 25), ('medical-technologist', 'PRC license (specify)', 25), ('medical-technologist', 'Attention to detail', 20),
  -- Education
  ('tutor', 'Tutoring', 35), ('tutor', 'Lesson planning', 25), ('tutor', 'Communication', 20), ('tutor', 'Active listening', 20),
  ('teacher-aide', 'Classroom management', 30), ('teacher-aide', 'Early childhood education', 25), ('teacher-aide', 'Organization', 25), ('teacher-aide', 'Teamwork', 20),
  ('daycare-worker', 'Early childhood education', 35), ('daycare-worker', 'Child care', 30), ('daycare-worker', 'First aid', 20), ('daycare-worker', 'Communication', 15),
  ('esl-teacher', 'ESL teaching', 35), ('esl-teacher', 'Online teaching', 25), ('esl-teacher', 'English', 25), ('esl-teacher', 'Lesson planning', 15),
  ('trainer', 'Training facilitation', 35), ('trainer', 'Public speaking', 25), ('trainer', 'Curriculum development', 20), ('trainer', 'Microsoft PowerPoint', 20),
  -- Logistics
  ('picker-packer', 'Picking & packing', 35), ('picker-packer', 'Barcode scanning', 25), ('picker-packer', 'Order fulfillment', 20), ('picker-packer', 'Attention to detail', 20),
  ('forklift-operator', 'Forklift operation', 40), ('forklift-operator', 'Warehouse handling', 25), ('forklift-operator', 'Safety compliance (OSH)', 20), ('forklift-operator', 'Forklift certification', 15),
  ('inventory-controller', 'Inventory counting', 35), ('inventory-controller', 'WMS software', 25), ('inventory-controller', 'Microsoft Excel', 20), ('inventory-controller', 'Inventory', 20),
  ('delivery-rider', 'Motorcycle riding (delivery)', 35), ('delivery-rider', 'Route navigation (Waze/Maps)', 25), ('delivery-rider', 'Defensive driving', 20), ('delivery-rider', 'Customer service', 20),
  ('delivery-driver', 'Professional driving', 35), ('delivery-driver', 'Driver''s license – Professional', 25), ('delivery-driver', 'Route navigation (Waze/Maps)', 20), ('delivery-driver', 'Vehicle maintenance', 20),
  ('dispatcher', 'Dispatching', 35), ('dispatcher', 'Delivery route planning', 25), ('dispatcher', 'Communication', 20), ('dispatcher', 'Microsoft Excel', 20),
  ('logistics-coordinator', 'Supply chain basics', 30), ('logistics-coordinator', 'Shipping & receiving', 25), ('logistics-coordinator', 'Dispatching', 25), ('logistics-coordinator', 'Microsoft Excel', 20),
  -- Manufacturing
  ('production-operator', 'Assembly line work', 30), ('production-operator', '5S', 25), ('production-operator', 'Safety compliance (OSH)', 25), ('production-operator', 'Quality control / inspection', 20),
  ('machine-operator', 'Machine operation', 35), ('machine-operator', 'Safety compliance (OSH)', 25), ('machine-operator', 'Quality control / inspection', 20), ('machine-operator', 'Production reporting', 20),
  ('qc-inspector', 'Quality control / inspection', 40), ('qc-inspector', 'Attention to detail', 25), ('qc-inspector', '5S', 20), ('qc-inspector', 'Production reporting', 15),
  ('assembler', 'Assembly line work', 35), ('assembler', 'SMT / electronics assembly', 25), ('assembler', 'Soldering', 20), ('assembler', 'Attention to detail', 20),
  ('packer', 'Packaging', 35), ('packer', '5S', 25), ('packer', 'Attention to detail', 20), ('packer', 'Teamwork', 20),
  ('production-supervisor', 'Leadership', 30), ('production-supervisor', 'Lean manufacturing basics', 25), ('production-supervisor', 'Production reporting', 25), ('production-supervisor', 'Safety compliance (OSH)', 20),
  ('maintenance-technician', 'Electrical installation & maintenance', 30), ('maintenance-technician', 'Electronics repair', 25), ('maintenance-technician', 'Troubleshooting', 25), ('maintenance-technician', 'Safety compliance (OSH)', 20),
  -- Construction
  ('carpenter', 'Carpentry', 40), ('carpenter', 'Blueprint reading', 20), ('carpenter', 'Construction safety', 20), ('carpenter', 'Attention to detail', 20),
  ('mason', 'Masonry', 35), ('mason', 'Tile setting', 25), ('mason', 'Construction safety', 20), ('mason', 'Teamwork', 20),
  ('electrician', 'Electrical installation & maintenance', 35), ('electrician', 'Wiring', 30), ('electrician', 'Troubleshooting', 20), ('electrician', 'Construction safety', 15),
  ('plumber', 'Plumbing', 40), ('plumber', 'Troubleshooting', 20), ('plumber', 'Construction safety', 20), ('plumber', 'Customer service', 20),
  ('welder', 'Welding (SMAW)', 40), ('welder', 'Blueprint reading', 20), ('welder', 'Construction safety', 20), ('welder', 'TESDA NC II (specify)', 20),
  ('painter', 'Painting', 40), ('painter', 'Attention to detail', 25), ('painter', 'Construction safety', 20), ('painter', 'Time management', 15),
  ('construction-helper', 'Construction safety', 30), ('construction-helper', 'Loading / unloading', 25), ('construction-helper', 'Teamwork', 25), ('construction-helper', 'Work ethic', 20),
  ('aircon-technician', 'Aircon / refrigeration servicing', 40), ('aircon-technician', 'Electrical installation & maintenance', 25), ('aircon-technician', 'Troubleshooting', 20), ('aircon-technician', 'Customer service', 15),
  ('foreman', 'Leadership', 30), ('foreman', 'Blueprint reading', 25), ('foreman', 'Construction safety', 25), ('foreman', 'Estimating / quantity take-off', 20),
  -- Security & Facilities
  ('security-guard', 'Security guarding', 35), ('security-guard', 'Access control', 25), ('security-guard', 'Patrolling', 20), ('security-guard', 'Incident reporting', 20),
  ('cctv-operator', 'CCTV monitoring', 40), ('cctv-operator', 'Incident reporting', 25), ('cctv-operator', 'Attention to detail', 20), ('cctv-operator', 'Emergency response', 15),
  ('janitor-utility', 'Janitorial services', 35), ('janitor-utility', 'Housekeeping', 25), ('janitor-utility', 'Time management', 20), ('janitor-utility', 'Work ethic', 20),
  ('maintenance-staff', 'Facility maintenance', 35), ('maintenance-staff', 'Plumbing', 25), ('maintenance-staff', 'Wiring', 20), ('maintenance-staff', 'Troubleshooting', 20),
  ('gardener-landscaper', 'Landscaping / gardening', 40), ('gardener-landscaper', 'Facility maintenance', 20), ('gardener-landscaper', 'Work ethic', 20), ('gardener-landscaper', 'Time management', 20),
  -- Beauty
  ('hairstylist', 'Hairdressing', 40), ('hairstylist', 'Customer service', 25), ('hairstylist', 'Creativity', 20), ('hairstylist', 'Upselling', 15),
  ('barber', 'Barbering', 40), ('barber', 'Customer service', 25), ('barber', 'Attention to detail', 20), ('barber', 'Punctuality', 15),
  ('nail-technician', 'Nail care', 40), ('nail-technician', 'Customer service', 25), ('nail-technician', 'Attention to detail', 20), ('nail-technician', 'Creativity', 15),
  ('massage-therapist', 'Massage therapy', 40), ('massage-therapist', 'Spa services', 25), ('massage-therapist', 'Customer service', 20), ('massage-therapist', 'Work ethic', 15),
  ('makeup-artist', 'Makeup artistry', 40), ('makeup-artist', 'Skin care', 25), ('makeup-artist', 'Customer service', 20), ('makeup-artist', 'Creativity', 15),
  ('spa-attendant', 'Spa services', 30), ('spa-attendant', 'Reception', 25), ('spa-attendant', 'Housekeeping', 25), ('spa-attendant', 'Customer service', 20),
  -- HR
  ('hr-assistant', 'HR records', 30), ('hr-assistant', 'Onboarding', 25), ('hr-assistant', 'Timekeeping', 25), ('hr-assistant', 'Microsoft Excel', 20),
  ('recruitment-assistant', 'Recruitment', 35), ('recruitment-assistant', 'Interviewing', 25), ('recruitment-assistant', 'Communication', 20), ('recruitment-assistant', 'Scheduling', 20),
  ('timekeeper', 'Timekeeping', 40), ('timekeeper', 'Microsoft Excel', 25), ('timekeeper', 'Attention to detail', 20), ('timekeeper', 'HR records', 15),
  ('training-coordinator', 'Training coordination', 35), ('training-coordinator', 'Scheduling', 25), ('training-coordinator', 'Communication', 20), ('training-coordinator', 'Microsoft PowerPoint', 20),
  -- Transport
  ('company-driver', 'Professional driving', 35), ('company-driver', 'Defensive driving', 25), ('company-driver', 'Route navigation (Waze/Maps)', 20), ('company-driver', 'Vehicle maintenance', 20),
  ('shuttle-driver', 'Professional driving', 35), ('shuttle-driver', 'Driver''s license – Professional', 25), ('shuttle-driver', 'Punctuality', 20), ('shuttle-driver', 'Defensive driving', 20),
  ('truck-helper', 'Loading / unloading', 35), ('truck-helper', 'Warehouse handling', 25), ('truck-helper', 'Teamwork', 20), ('truck-helper', 'Work ethic', 20),
  -- Internships / OJT
  ('ojt-it', 'HTML & CSS', 25), ('ojt-it', 'JavaScript', 25), ('ojt-it', 'Troubleshooting', 25), ('ojt-it', 'Git & GitHub', 25),
  ('ojt-business', 'Microsoft Excel', 30), ('ojt-business', 'Microsoft Word', 25), ('ojt-business', 'Email writing', 25), ('ojt-business', 'Communication', 20),
  ('ojt-hospitality', 'Customer service', 30), ('ojt-hospitality', 'Food safety', 25), ('ojt-hospitality', 'Front desk operations', 25), ('ojt-hospitality', 'Teamwork', 20),
  ('ojt-engineering', 'Blueprint reading', 25), ('ojt-engineering', 'Safety compliance (OSH)', 25), ('ojt-engineering', 'Microsoft Excel', 25), ('ojt-engineering', 'Problem solving', 25),
  ('ojt-healthcare', 'Patient care', 30), ('ojt-healthcare', 'Vital signs monitoring', 25), ('ojt-healthcare', 'Medical records', 25), ('ojt-healthcare', 'Infection control', 20)
on conflict (role_id, skill) do update set weight = excluded.weight;

-- Fill recommended courses for any role with empty courses
with ranked as (
  select role_id, skill, row_number() over (partition by role_id order by weight desc, skill) as rn from public.role_skills
)
update public.career_roles r
   set courses = jsonb_build_array(
     jsonb_build_object('title', a.skill || ' courses', 'provider', 'Coursera (partner link)', 'url', 'https://www.coursera.org/search?query=' || replace(replace(a.skill, ' ', '%20'), '&', '%26')),
     jsonb_build_object('title', b.skill || ' courses', 'provider', 'Coursera (partner link)', 'url', 'https://www.coursera.org/search?query=' || replace(replace(b.skill, ' ', '%20'), '&', '%26')),
     jsonb_build_object('title', 'Free TESDA online programs', 'provider', 'e-TESDA', 'url', 'https://e-tesda.gov.ph/')
   )
  from ranked a
  join ranked b on b.role_id = a.role_id and b.rn = 2
 where a.role_id = r.id and a.rn = 1
   and (r.courses is null or jsonb_array_length(r.courses) = 0);

-- Reusable default roadmap generator (Learn -> Practice -> Build proof -> Apply) for any role without tasks
create or replace function app.ensure_default_roadmap(p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_role is null or exists (select 1 from public.roadmap_tasks where role_id = p_role) then
    return;
  end if;
  with ranked as (
    select role_id, skill, row_number() over (order by weight desc, skill) as wk, count(*) over () as cnt
      from public.role_skills
     where role_id = p_role
  ), w as (select * from ranked where wk <= 4)
  insert into public.roadmap_tasks (id, role_id, week, week_title, position, type, skill, text, course)
  select w.role_id || '-w' || w.wk || '-t1', w.role_id, w.wk::int, 'Week ' || w.wk || ': ' || w.skill, 1, 'learn', w.skill,
         'Learn the fundamentals of ' || w.skill,
         case when w.wk % 2 = 1
              then jsonb_build_object('title', w.skill || ' courses', 'provider', 'Coursera (partner link)', 'url', 'https://www.coursera.org/search?query=' || replace(replace(w.skill, ' ', '%20'), '&', '%26'))
              else jsonb_build_object('title', w.skill || ' tutorials', 'provider', 'YouTube', 'url', 'https://www.youtube.com/results?search_query=' || replace(replace(w.skill, ' ', '+'), '&', '%26') || '+tutorial') end
    from w
  union all
  select w.role_id || '-w' || w.wk || '-t2', w.role_id, w.wk::int, 'Week ' || w.wk || ': ' || w.skill, 2, 'practice', w.skill,
         case w.wk
           when 1 then 'Practice ' || w.skill || ' with a small hands-on exercise and note key takeaways.'
           when 2 then 'Apply ' || w.skill || ' to a realistic local workplace scenario.'
           when 3 then 'Build a brief proof-of-work sample or checklist demonstrating ' || w.skill || '.'
           else 'Highlight ' || w.skill || ' in your profile summary and practice answering interview questions.'
         end,
         null
    from w
  union all
  select w.role_id || '-w' || w.wk || '-t3', w.role_id, w.wk::int, 'Week ' || w.wk || ': ' || w.skill, 3, 'quiz', w.skill,
         'Quiz: ' || w.skill, null
    from w
  on conflict (id) do nothing;
end $$;

-- Ensure every seeded role has a roadmap immediately
do $$
declare rid text;
begin
  for rid in select id from public.career_roles loop
    perform app.ensure_default_roadmap(rid);
  end loop;
end $$;

-- Update breakdown() to call app.ensure_default_roadmap(rid) if a newly added admin role has no tasks yet
create or replace function public.breakdown(p_kind text, p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); rid text; j public.jobs; r public.career_roles; pro boolean;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_kind = 'job' then
    select * into j from public.jobs where id = p_id::uuid;
    rid := j.role_id;
  else
    rid := p_id;
  end if;
  if rid is null then return null; end if;
  select * into r from public.career_roles where id = rid;
  if not found then return null; end if;
  perform app.ensure_default_roadmap(rid);
  pro := app.is_pro(uid);
  return jsonb_build_object(
    'role', jsonb_build_object('id', r.id, 'title', r.title, 'category', r.category, 'level', r.level, 'overview', r.overview, 'duties', to_jsonb(r.duties)),
    'job', case when j.id is null then null else jsonb_build_object('id', j.id, 'title', j.title, 'company', (select name from public.employers where user_id = j.employer_id)) end,
    'pro', pro, 'salary', app.salary_for(rid), 'readiness', app.readiness(uid, rid),
    'weeks', app.roadmap_json(uid, rid, pro),
    'growth', case when pro then r.growth else null end,
    'courses', case when pro then r.courses else null end);
end $$;

-- =====================================================================
-- 6. Matching & Deck RPCs updated for Work Setup + Job Photos + Company Logos
-- =====================================================================
-- Match score: skills 55%, interests 15%, location 20%, pay 10%. Never uses age, gender or photos.
-- Work setup rules:
--   Remote -> full location credit (100%), distance null ('Remote'), never excluded by nearMe.
--   Hybrid -> commute leniency of 1.5x (recommended rule).
--   Preference mismatch -> -10 score penalty (floor 0) and noted in 'why'.
create or replace function app.match(p_user uuid, p_job uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  sp public.seeker_profiles; j public.jobs;
  sk numeric := 0; n int; s text; lvl int;
  have text[] := '{}'; missing text[] := '{}'; why text[] := '{}';
  d numeric; commute numeric; commute_eff numeric; loc numeric; sal numeric; interest numeric;
  base numeric; adj numeric := 0; setup_pen numeric := 0;
  pos int; neg int; yes int; tot int;
  setups text[];
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
  commute := coalesce(nullif(sp.commute_km, 0), 10);
  if j.work_setup = 'Remote' then
    d := null;
    loc := 1;
  else
    d := coalesce(app.dist_km(sp.area_id, j.area_id), 0);
    -- Hybrid commute leniency: 1.5x seeker commute limit
    commute_eff := case when j.work_setup = 'Hybrid' then commute * 1.5 else commute end;
    loc := case when d <= commute_eff then 1 else greatest(0, 1 - (d - commute_eff) / (commute_eff * 1.5)) end;
  end if;
  sal := case when sp.salary_min <= 0 or j.salary_max >= sp.salary_min then 1 else greatest(0, j.salary_max::numeric / sp.salary_min) end;
  base := 100 * (0.55 * sk + 0.15 * interest + 0.2 * loc + 0.1 * sal);

  -- Seeker work setup preference check
  setups := coalesce(nullif(sp.work_setups, '{}'), array['On-site', 'Hybrid', 'Remote']::text[]);
  if not (j.work_setup = any(setups)) then
    setup_pen := -10;
  end if;

  -- Re-rank by swipe behavior
  select count(*) filter (where w.dir in ('right', 'star')), count(*) filter (where w.dir = 'left') into pos, neg
    from public.swipes w join public.jobs j2 on j2.id = w.job_id where w.user_id = p_user and j2.category = j.category;
  adj := greatest(-6, least(6, (pos - neg) * 2));
  select count(*) filter (where dir in ('right', 'star')), count(*) into yes, tot
    from public.swipes where job_id = p_job and user_id <> p_user and dir in ('left', 'right', 'star');
  if tot >= 3 then adj := adj + greatest(-4, least(4, (yes::numeric / tot - 0.5) * 8)); end if;

  if array_length(have, 1) > 0 then why := why || ('your skills (' || array_to_string(have[1:3], ', ') || ')'); end if;
  if j.work_setup = 'Remote' then
    why := why || (case when setup_pen = 0 then 'Remote, which you prefer' else 'Setup: Remote (not in your preferences)' end);
  else
    why := why || (d::text || ' km commute' || case when d <= commute_eff then '' else ' (beyond your ' || round(commute_eff)::text || ' km reach)' end);
    if setup_pen < 0 then
      why := why || ('Setup: ' || j.work_setup || ' (not in your preferences)');
    else
      why := why || (j.work_setup || ', which you prefer');
    end if;
  end if;
  if sp.salary_min > 0 and j.salary_max >= sp.salary_min then why := why || ('pay meets your ₱' || to_char(sp.salary_min, 'FM999,999') || ' goal'); end if;
  if j.category = any (sp.interests) then why := why || ('your interest in ' || j.category); end if;

  return jsonb_build_object(
    'score', greatest(0, least(99, round(base + adj + setup_pen)))::int,
    'have', to_jsonb(have), 'missing', to_jsonb(missing), 'dist', d, 'why', to_jsonb(why),
    'parts', jsonb_build_object('skills', round(sk * 100), 'interest', round(interest * 100), 'location', round(loc * 100), 'salary', round(sal * 100)));
end $$;

create or replace function public.get_deck(p_limit int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); sp public.seeker_profiles; f jsonb; res jsonb;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into sp from public.seeker_profiles where user_id = uid;
  if not found then return '[]'::jsonb; end if;
  f := coalesce(sp.filters, '{}'::jsonb);
  select coalesce(jsonb_agg(x.o order by x.rank desc), '[]'::jsonb) into res from (
    select jsonb_build_object(
             'id', j.id, 'title', j.title, 'category', j.category, 'type', j.type,
             'work_setup', j.work_setup, 'onsite_days', j.onsite_days,
             'photo_path', j.photo_path, 'photo_focus', j.photo_focus,
             'salary_min', j.salary_min, 'salary_max', j.salary_max, 'area_id', j.area_id,
             'skills', to_jsonb(j.skills), 'description', j.description, 'posted_at', j.posted_at,
             'custom_role', j.custom_role, 'intern_requirements', j.intern_requirements,
             'boosted', coalesce(j.boosted_until > now(), false),
             'company', jsonb_build_object('name', e.name, 'verified', true, 'logo_path', e.logo_path),
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
      and (coalesce(f->>'setup', '') = '' or j.work_setup = f->>'setup')
      and (coalesce(f->>'area', '') = '' or j.work_setup = 'Remote' or j.area_id = f->>'area')
      and (coalesce((f->>'minSalary')::int, 0) = 0 or j.salary_max >= (f->>'minSalary')::int)
      and (not coalesce((f->>'nearMe')::boolean, false)
           or j.work_setup = 'Remote'
           or app.dist_km(sp.area_id, j.area_id) <= case when j.work_setup = 'Hybrid' then sp.commute_km * 1.5 else sp.commute_km end)
    order by rank desc limit greatest(1, least(p_limit, 100))
  ) x;
  return res;
end $$;

create or replace function app.job_card(p_user uuid, p_job uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', j.id, 'title', j.title, 'category', j.category, 'type', j.type, 'status', j.status,
    'work_setup', j.work_setup, 'onsite_days', j.onsite_days,
    'photo_path', j.photo_path, 'photo_focus', j.photo_focus,
    'salary_min', j.salary_min, 'salary_max', j.salary_max, 'area_id', j.area_id, 'role_id', j.role_id,
    'custom_role', j.custom_role, 'intern_requirements', j.intern_requirements,
    'skills', to_jsonb(j.skills), 'description', j.description, 'posted_at', j.posted_at,
    'boosted', coalesce(j.boosted_until > now(), false),
    'company', jsonb_build_object('name', e.name, 'about', e.about, 'type', e.type, 'area_id', e.area_id, 'verified', e.verification_status = 'verified', 'logo_path', e.logo_path),
    'match', app.match(p_user, j.id))
  from public.jobs j join public.employers e on e.user_id = j.employer_id where j.id = p_job
$$;

create or replace function public.my_applications() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not app.is_pro(uid) then raise exception 'pro_required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'status', a.status, 'starred', a.starred, 'score', a.score, 'created_at', a.created_at, 'viewed', a.viewed_at is not null,
      'job', jsonb_build_object('id', j.id, 'title', j.title, 'role_id', j.role_id, 'work_setup', j.work_setup, 'onsite_days', j.onsite_days, 'company', e.name, 'logo_path', e.logo_path),
      'conversation_id', (select c.id from public.conversations c where c.application_id = a.id)) order by a.created_at desc)
    from public.applications a join public.jobs j on j.id = a.job_id join public.employers e on e.user_id = j.employer_id
    where a.user_id = uid), '[]'::jsonb);
end $$;

create or replace function public.my_matches() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'application_id', a.id, 'status', a.status, 'matched_at', a.updated_at,
      'job', jsonb_build_object('id', j.id, 'title', j.title, 'role_id', j.role_id, 'work_setup', j.work_setup, 'onsite_days', j.onsite_days, 'photo_path', j.photo_path),
      'company', jsonb_build_object('name', e.name, 'logo_path', e.logo_path, 'contact_name', e.contact_name, 'contact_email', e.contact_email, 'contact_phone', e.contact_phone, 'address', e.address),
      'conversation_id', (select c.id from public.conversations c where c.application_id = a.id)) order by a.updated_at desc)
    from public.applications a join public.jobs j on j.id = a.job_id join public.employers e on e.user_id = j.employer_id
    where a.user_id = uid and a.status in ('shortlisted', 'hired')), '[]'::jsonb);
end $$;

create or replace function public.my_swipe_history() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not app.is_pro(uid) then raise exception 'pro_required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'job_id', j.id, 'title', j.title, 'type', j.type, 'work_setup', j.work_setup, 'company', e.name,
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

-- =====================================================================
-- 7. Employer & Admin RPC updates (work_setups, photos, avatars, setup filter)
-- =====================================================================
create or replace function public.employer_application(p_app uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
    'id', a.id, 'status', a.status, 'created_at', a.created_at,
    'job', jsonb_build_object('id', j.id, 'title', j.title, 'skills', to_jsonb(j.skills), 'work_setup', j.work_setup, 'onsite_days', j.onsite_days),
    'name', app.mask_name(pr.full_name, named), 'named', named, 'starred', case when ranked then a.starred else false end,
    'score', case when ranked then a.score end, 'why', case when ranked then m->'why' end, 'missing', case when ranked then m->'missing' end,
    'skills', (select coalesce(jsonb_agg(jsonb_build_object('name', k.skill, 'level', k.level) order by k.level desc), '[]') from public.seeker_skills k where k.user_id = a.user_id),
    'education', jsonb_build_object('level', sp.edu_level, 'school', sp.school, 'course', sp.course),
    'experience', sp.experience, 'work_setups', to_jsonb(sp.work_setups),
    'goal_level', sp.goal_level, 'goal_timeframe', sp.goal_timeframe,
    'resume_mode', sp.resume_mode, 'resume_summary', sp.resume_summary,
    'resume_path', case when named then sp.resume_path end,
    'resume_link', case when named then nullif(sp.resume_link, '') end,
    'avatar_path', case when named then sp.avatar_path end,
    'photo_path', case when named then sp.photo_path end,
    'certificates', case when named then sp.certificates end,
    'area_id', sp.area_id,
    'age', case when named and sp.birth_year is not null then extract(year from now())::int - sp.birth_year end,
    'gender', case when named then nullif(sp.gender, '') end,
    'contact', case when named then jsonb_build_object('email', em, 'phone', pr.phone, 'full_name', pr.full_name) end,
    'conversation_id', (select c.id from public.conversations c where c.application_id = a.id));
end $$;

drop function if exists public.candidate_search(text, text, uuid);
create or replace function public.candidate_search(p_q text, p_area text, p_job uuid, p_setup text default '') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
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
               'work_setups', to_jsonb(sp.work_setups),
               'resume_summary', sp.resume_summary,
               'goal_text', sp.goal_text,
               'goal_level', sp.goal_level,
               'goal_timeframe', sp.goal_timeframe,
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
        and (coalesce(p_setup, '') = '' or p_setup = any(sp.work_setups))
        and (coalesce(trim(p_q), '') = ''
             or exists (select 1 from public.seeker_skills k where k.user_id = sp.user_id and k.skill ilike '%' || trim(p_q) || '%')
             or exists (select 1 from public.career_roles r where r.id = sp.goal_role and r.title ilike '%' || trim(p_q) || '%')
             or sp.goal_text ilike '%' || trim(p_q) || '%')
      order by rk desc limit 50) x), '[]'::jsonb);
end $$;

create or replace function public.admin_verification_queue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
    'user_id', e.user_id, 'name', e.name, 'logo_path', e.logo_path, 'type', e.type, 'address', e.address,
    'contact_name', e.contact_name, 'contact_email', e.contact_email, 'contact_phone', e.contact_phone,
    'status', e.verification_status, 'reason', e.verification_reason, 'submitted_at', e.submitted_at, 'reviewed_at', e.reviewed_at,
    'docs', (select coalesce(jsonb_agg(jsonb_build_object('kind', d.kind, 'name', d.file_name, 'path', d.file_path)), '[]') from public.employer_docs d where d.employer_id = e.user_id))
    order by (e.verification_status = 'pending') desc, e.submitted_at desc) from public.employers e), '[]'::jsonb);
end $$;

-- =====================================================================
-- 8. Messaging RPC updates (real reply_to + avatars in my_conversations)
-- =====================================================================
drop function if exists public.send_message(uuid, text);
create or replace function public.send_message(p_conv uuid, p_body text, p_reply_to uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); c public.conversations; other uuid; mid uuid; msg text := trim(p_body); who text; recent int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into c from public.conversations where id = p_conv and (seeker_id = uid or employer_id = uid);
  if not found then raise exception 'not found'; end if;
  if c.seeker_id = uid and not app.is_pro(uid) then
    if not exists (select 1 from public.messages where conversation_id = p_conv and sender_id = c.employer_id) then
      raise exception 'free_chat_restricted';
    end if;
  end if;
  if char_length(msg) < 1 or char_length(msg) > 2000 then raise exception 'message must be 1 to 2000 characters'; end if;
  if p_reply_to is not null then
    if not exists (select 1 from public.messages where id = p_reply_to and conversation_id = p_conv) then
      raise exception 'invalid reply target';
    end if;
  end if;
  other := case when c.seeker_id = uid then c.employer_id else c.seeker_id end;
  if exists (select 1 from public.blocks where (blocker_id = uid and blocked_id = other) or (blocker_id = other and blocked_id = uid)) then
    raise exception 'blocked';
  end if;
  select count(*) into recent from public.messages where sender_id = uid and created_at > now() - interval '1 minute';
  if recent >= 20 then raise exception 'slow_down'; end if;
  insert into public.messages (conversation_id, sender_id, body, reply_to) values (p_conv, uid, msg, p_reply_to) returning id into mid;
  update public.conversations set last_message_at = now() where id = p_conv;
  if not exists (select 1 from public.notifications where user_id = other and ref = '/messages/' || p_conv and not read) then
    select case when c.employer_id = uid then (select name from public.employers where user_id = uid) else (select full_name from public.profiles where id = uid) end into who;
    perform app.notify(other, 'message', 'New message from ' || coalesce(who, 'a match'), left(msg, 120), '/messages/' || p_conv);
  end if;
  return jsonb_build_object('id', mid, 'reply_to', p_reply_to);
end $$;

create or replace function public.my_conversations() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'job_title', j.title, 'job_id', j.id,
      'other_id', case when c.seeker_id = uid then c.employer_id else c.seeker_id end,
      'other_name', case when c.seeker_id = uid then e.name else sp.full_name end,
      'other_avatar', case when c.seeker_id = uid then e.logo_path else skp.avatar_path end,
      'other_avatar_bucket', case when c.seeker_id = uid then 'company-logos' else 'seeker-media' end,
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
    left join public.seeker_profiles skp on skp.user_id = c.seeker_id
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

-- Allow employers to read seeker-media ONLY for seekers they have shortlisted/hired or have a conversation with
drop policy if exists "seeker-media shortlisted employer read" on storage.objects;
create policy "seeker-media shortlisted employer read" on storage.objects for select to authenticated
  using (
    bucket_id = 'seeker-media'
    and (
      exists (
        select 1 from public.applications a
        join public.jobs j on j.id = a.job_id
        where j.employer_id = auth.uid()
          and a.status in ('shortlisted', 'hired')
          and a.user_id::text = (storage.foldername(name))[1]
      )
      or exists (
        select 1 from public.conversations c
        where c.employer_id = auth.uid()
          and c.seeker_id::text = (storage.foldername(name))[1]
      )
    )
  );

-- =====================================================================
-- 9. New Helper RPCs: suggest_text, add_custom_skill, popular_roles, admin_custom_role_requests
-- =====================================================================
create or replace function public.suggest_text(p_field text, p_q text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := lower(trim(coalesce(p_q, '')));
  res jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_field not in ('school', 'course') then return '[]'::jsonb; end if;

  if p_field = 'school' then
    with seed(v) as (values
      ('University of Perpetual Help System DALTA – Biñan'),
      ('University of Perpetual Help System Laguna (UPHSL)'),
      ('De La Salle University – Laguna'),
      ('Polytechnic University of the Philippines – Biñan'),
      ('Polytechnic University of the Philippines – Santa Rosa'),
      ('Mapúa Malayan Colleges Laguna (MMCL)'),
      ('Trimex Colleges – Biñan'),
      ('Biñan City Senior High School'),
      ('Saint Michael''s College of Laguna'),
      ('La Consolacion College – Biñan'),
      ('STI College – Santa Rosa'),
      ('Laguna College of Business and Arts (LCBA)'),
      ('Colegio de San Juan de Letran – Calamba'),
      ('Pamantasan ng Cabuyao (PnC)'),
      ('San Pedro College of Business Administration (SPCBA)'),
      ('AMA Computer College – Biñan'),
      ('Lake Shore Educational Institution'),
      ('TESDA Laguna Training Center'),
      ('University of the Philippines Los Baños (UPLB)')
    ), db as (
      select distinct trim(school) as v from public.seeker_profiles where trim(coalesce(school, '')) <> ''
    ), allv as (
      select distinct v from (select v from seed union select v from db) t
    )
    select coalesce(jsonb_agg(x.v), '[]'::jsonb) into res from (
      select v from allv
       where q = '' or lower(v) like '%' || q || '%'
       order by (lower(v) like q || '%') desc, v asc
       limit 8
    ) x;
    return res;
  else
    with seed(v) as (values
      ('BS Information Technology (BSIT)'),
      ('BS Computer Science (BSCS)'),
      ('BS Business Administration (BSBA)'),
      ('BS Accountancy (BSA)'),
      ('BS Accounting Information System (BSAIS)'),
      ('BS Hospitality Management (BSHM)'),
      ('BS Tourism Management (BSTM)'),
      ('BS Psychology'),
      ('BS Nursing (BSN)'),
      ('BS Civil Engineering'),
      ('BS Industrial Engineering'),
      ('BS Electrical Engineering'),
      ('BS Mechanical Engineering'),
      ('BS Education (BSED / BEED)'),
      ('BS Criminology'),
      ('BA Communication'),
      ('ABM (Accountancy, Business & Management)'),
      ('STEM (Science, Technology, Engineering & Math)'),
      ('HUMSS (Humanities & Social Sciences)'),
      ('GAS (General Academic Strand)'),
      ('TVL – ICT (Information & Communications Tech)'),
      ('TVL – Home Economics (Bread & Pastry / Cookery)'),
      ('TVL – Industrial Arts (Electrical / Welding / RAC)')
    ), db as (
      select distinct trim(course) as v from public.seeker_profiles where trim(coalesce(course, '')) <> ''
    ), allv as (
      select distinct v from (select v from seed union select v from db) t
    )
    select coalesce(jsonb_agg(x.v), '[]'::jsonb) into res from (
      select v from allv
       where q = '' or lower(v) like '%' || q || '%'
       order by (lower(v) like q || '%') desc, v asc
       limit 8
    ) x;
    return res;
  end if;
end $$;

create or replace function public.add_custom_skill(p_name text, p_category text default 'core') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  clean text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  cat text := coalesce(nullif(trim(p_category), ''), 'core');
  existing text;
  recent_n int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if char_length(clean) < 2 or char_length(clean) > 60 then
    raise exception 'skill name must be 2 to 60 characters';
  end if;
  if not exists (select 1 from public.skill_categories where id = cat) then
    cat := 'core';
  end if;
  -- Case-insensitive dedupe against existing names and aliases
  select s.name into existing
    from public.skills s
   where lower(s.name) = lower(clean)
      or exists (select 1 from unnest(s.aliases) a where lower(a) = lower(clean))
   limit 1;
  if existing is not null then
    return jsonb_build_object('ok', true, 'name', existing, 'existing', true);
  end if;
  -- Simple abuse/rate guard: max 10 custom skills created per hour per user via audit log
  select count(*) into recent_n
    from public.audit_log
   where actor = uid and action = 'skill.custom_add' and created_at > now() - interval '1 hour';
  if recent_n >= 10 then raise exception 'slow_down'; end if;

  insert into public.skills (name, category, is_custom, active)
  values (clean, cat, true, true)
  on conflict (name) do nothing;
  perform app.audit('skill.custom_add', clean, jsonb_build_object('category', cat));
  return jsonb_build_object('ok', true, 'name', clean, 'category', cat, 'existing', false);
end $$;

create or replace function public.popular_roles() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.role_id order by x.cnt desc), '[]'::jsonb)
    from (
      select j.role_id, count(*) as cnt
        from public.jobs j
       where j.role_id is not null
         and j.status in ('published', 'closed', 'paused')
         and j.created_at > now() - interval '90 days'
       group by j.role_id
       order by cnt desc
       limit 8
    ) x
$$;

create or replace function public.admin_custom_role_requests() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('label', x.label, 'source', x.src, 'count', x.cnt) order by x.cnt desc, x.label)
      from (
        select trim(custom_role) as label, 'employer' as src, count(*) as cnt
          from public.jobs
         where trim(coalesce(custom_role, '')) <> ''
         group by trim(custom_role)
        union all
        select trim(goal_text) as label, 'seeker' as src, count(*) as cnt
          from public.seeker_profiles
         where goal_role is null and trim(coalesce(goal_text, '')) <> ''
         group by trim(goal_text)
      ) x
  ), '[]'::jsonb);
end $$;

-- Grants for all new/updated RPCs
revoke all on function public.candidate_search(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.candidate_search(text, text, uuid, text) to authenticated;
revoke all on function public.send_message(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.send_message(uuid, text, uuid) to authenticated;
revoke all on function public.suggest_text(text, text) from public, anon, authenticated;
grant execute on function public.suggest_text(text, text) to authenticated;
revoke all on function public.add_custom_skill(text, text) from public, anon, authenticated;
grant execute on function public.add_custom_skill(text, text) to authenticated;
revoke all on function public.popular_roles() from public, anon, authenticated;
grant execute on function public.popular_roles() to authenticated;
revoke all on function public.admin_custom_role_requests() from public, anon, authenticated;
grant execute on function public.admin_custom_role_requests() to authenticated;

notify pgrst, 'reload schema';
