# JobMatch – Feature Request Implementation Prompt

> **Purpose:** This is the full brief for the next round of JobMatch changes. It is a plan only. Whoever picks it up (developer or AI agent) should follow it section by section, with **Section 0** applying to everything.
>
> **Scope (8 feature requests):**
> 1. Typeahead / pre-filled suggestions while typing in any search or add field
> 2. Work setup: **On-site / Hybrid / Remote** for both seekers and job listings
> 3. Discover card redesign: company logo circle + 4:3 listing photo, details moved below
> 4. Messages: **long-press** a bubble to open a dropdown of actions (Reply, Edit, Unsend, Remove for you…)
> 5. Categorized skills picker (sign-up, profile update, job posting, anywhere skills appear) with a much larger skill list
> 6. More career roles and career goals, categorized, with an "Other / specify" path
> 7. Detailed, up-to-date professional summary built from the résumé, experience and skills
> 8. Clean image previews everywhere: no broken images (profile picture first)

---

## 0. Ground rules (apply to every section)

### 0.1 Project facts (verified in the current codebase)
| Area | Where it lives |
| --- | --- |
| Front end | `web/` – no-build static PWA, vanilla JS, string-template rendering, `JM.route`, `JM.actions` (`data-act`), `JM.inputs` (`data-in`), `JM.forms` (`data-form`) |
| Shared helpers | `web/js/core.js` (`JM.avatar`, `JM.uploadBtn`, `JM.previewFile`, `JM.modal`, `JM.confirm`, `JM.esc`…) and `web/js/app.js` (global event delegation) |
| Seeker | `web/js/seeker.js` (draft/onboarding `STEPS`, profile `SEC.*`, Discover deck `cardHtml`, filters) and `web/js/seeker2.js` (messages `chatPage` / `bubble`, career, résumé review, settings) |
| Employer | `web/js/employer.js` (setup, `jobForm`, applicants drawer, candidate search, company page/logo) |
| Admin | `web/js/admin.js` (career data editing) |
| Styles | `web/css/app.css` (has duplicated rule blocks, e.g. `.thumb` at ~L1419 and ~L1706, `.jcard` at ~L1404 and ~L1483. **Edit the later, active block** or merge them) |
| Database | `supabase/migrations/001…010`. Reference data in `003_reference_data.sql`; `get_deck` last redefined in `006_updates.sql`; `candidate_search` in `007`; message actions in `010` |
| Edge functions | `supabase/functions/parse-resume`, `resume-review`, `candidate-overview`, … |
| Service worker | `web/sw.js` – `CACHE = 'jobmatch-shell-v9'` |
| Security headers | `web/_headers`, `firebase.json`, `web/vercel.json` (same CSP in all three) |

### 0.2 Rules
1. **Keep the existing design system.** Brand `#0C70F8`, Inter, neutral surfaces, the current card/chip/badge/button classes. New UI must look like it was always there.
2. **No build step.** Plain JS following the existing `JM.*` patterns. Put new reusable components in `core.js` so seeker, employer and admin pages can share them.
3. **One new migration:** `supabase/migrations/011_setup_media_taxonomy.sql`. Make it idempotent (`add column if not exists`, `on conflict do update`, `create or replace`). Never edit old migrations.
4. **Rules run on the server.** Match scoring, filters, validation and permissions go in Postgres functions and RLS, and the UI mirrors them. Re-grant any new columns that the client writes to (`grant insert/update (col) … to authenticated`), the same way `006` does.
5. **Fair hiring stays intact.** Photos, logos and summaries never feed the match score. Seeker photos stay private until shortlisting, as they are today.
6. **Mobile first.** Every interaction (typeahead, long-press menu, skill picker, image preview) must work by touch, mouse and keyboard, with correct ARIA.
7. **Escape everything** rendered from user data with `JM.esc`, including suggestion highlighting.
8. **After the front-end changes**, bump `web/sw.js` to `jobmatch-shell-v10` so installed PWAs pick up the new files.
9. **Don't break existing records.** Old jobs and profiles must still render with sensible defaults (for example `work_setup = 'On-site'` and placeholder images).

---

## 1. Typeahead / pre-filled suggestions while typing

### 1.1 Goal
When the user types into any **search** or **add** field, a dropdown immediately suggests matching items, starting with the first letter. They can pick one with a tap or the keyboard, or keep typing a custom value where custom values are allowed. "Area" here means location areas in particular (e.g. typing `bi` → `Biñan – Poblacion`, `Biñan – Canlalay`…), and the same component covers every other search or add list.

### 1.2 Build one reusable component: `JM.typeahead`
Add it to `web/js/core.js`.

```
JM.typeahead({
  id,              // unique input id
  name / dataIn,   // wire into existing data-in / form handling
  value,           // current value (id or text)
  source,          // array of {value, label, group?, hint?}  OR  async (q) => [...]
  allowCustom,     // true → shows 'Add "<typed text>"' as the last option
  multi,           // true → picking adds a chip and clears the input (skills)
  placeholder, minChars (default 1), max (default 8), onPick(item)
})
```

**Behavior spec**
- Matching is **case- and accent-insensitive**: normalize with `str.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase()`, so `binan` matches `Biñan`.
- Ranking: (1) label **starts with** the query, (2) a **word inside** the label starts with the query, (3) label **contains** the query. Within each tier, sort alphabetically, or by `weight` if the source provides one.
- **Inline completion ("pre-filled")**: when the top result starts with the query, show the rest of the label as selected, greyed-out text in the input (classic autocomplete). `Tab` / `→` / `Enter` accepts it, and continuing to type overwrites it. Turn inline completion off for `multi` inputs on mobile, where it fights the keyboard.
- Dropdown shows up to `max` items, **bolds the matched letters** (escape first, then wrap the match), and shows the `group` as a small muted label (e.g. the skill category or area municipality).
- Keyboard: `↑/↓` move, `Enter` picks, `Esc` closes, `Tab` accepts the inline completion. Mouse/touch: tap picks, and tapping outside closes.
- ARIA: input `role="combobox" aria-autocomplete="both" aria-expanded aria-controls`, list `role="listbox"`, items `role="option" aria-selected`.
- Async sources are debounced by 200 ms and show a small "Searching…" row. Stale responses are ignored (track a request counter).
- Empty state: "No matches. Press Enter to add "xyz"" when `allowCustom`, otherwise "No matches".
- Dropdown positioning: `position:absolute` under the input inside a `position:relative` wrapper. It flips above when there isn't room below (important inside modals and drawers). `max-height: 280px; overflow:auto`.
- CSS: new `.ta`, `.ta-list`, `.ta-item`, `.ta-item.on`, `.ta-ghost`, `.ta-group` classes in `app.css`, reusing `--line`, `--brand-t`, radius and shadow tokens.

### 1.3 Where to apply it (replace the existing `<select>` / `<datalist>` / filter inputs)
| Screen | Field | Source | Custom allowed |
| --- | --- | --- | --- |
| Seeker onboarding + profile (`SEC.about`) | "Where do you live?" (currently `<select>` of areas) | `JM.areas` (value = area id) | No (needs lat/lng) |
| Employer setup (`/employer/setup`) | Business area | `JM.areas` | No |
| Employer job form | Location | `JM.areas` | No |
| Employer candidate search | Area filter + skill/keyword `q` | areas / skills + roles | Free text |
| Seeker Discover filters modal | (new) Area filter, if added | areas | No |
| Skills (Section 5) | Skill search / add | `JM.skillList` with categories | Yes (see 5.5) |
| Career goal + job "Career role" (Section 6) | Role picker | `JM.roles` grouped by category | Yes ("Other – specify") |
| Job form "Category" (currently `<datalist id="jm-cats">`) and admin category (`<datalist id="cats">`) | Category | `JM.categories` | Yes |
| Seeker education | School, Course/strand | distinct values already in `seeker_profiles` (new RPC `suggest_text(p_field, p_q)`, returns top 8) plus a small seeded list of local schools/courses | Yes |
| Employer setup | Type of business (`BIZ` list) | categorized business types (Section 6.5) | Yes |
| Messages "New" modal | Search matches by name/job | the loaded `items` list | No |

### 1.4 Areas data (optional, recommended)
`areas` currently has 12 rows (Biñan barangays plus nearby cities). With typeahead, a longer list becomes usable. In `011`, add more barangays/cities for Biñan, Santa Rosa, San Pedro, Cabuyao, Carmona, Calamba and GMA, **each with real lat/lng** (distance scoring depends on it). Each label follows the existing `City – Barangay` pattern so `group` = city. Verify coordinates against an authoritative source before seeding.

### 1.5 Acceptance
- Typing one letter in any listed field shows ranked suggestions within 100 ms (local sources).
- `binan`, `BIÑAN` and `Bi` all surface the Biñan areas, with matched letters bolded.
- Works in a modal, in a drawer and on a 360 px wide screen, and by keyboard alone.

---

## 2. Work setup: On-site / Hybrid / Remote

### 2.1 Database (`011`)
```sql
alter table public.jobs
  add column if not exists work_setup text not null default 'On-site'
  check (work_setup in ('On-site','Hybrid','Remote'));
alter table public.seeker_profiles
  add column if not exists work_setups text[] not null default '{On-site,Hybrid,Remote}';
-- (+ a check constraint so every element is one of the three values)
grant insert (work_setup), update (work_setup) on public.jobs to authenticated;
grant update (work_setups) on public.seeker_profiles to authenticated;
```
- Optional for Hybrid jobs: `jobs.onsite_days smallint null check (onsite_days between 1 and 5)` to show "Hybrid · 3 days on-site".
- Add `work_setup` (and `onsite_days`) to every job JSON builder: `get_deck`, `get_job`, `my_matches`, preferred/applications RPCs, `employer_applicants`, `candidate_search`, and the swipe-history/undo payloads. Add `work_setups` to the seeker JSON (`me`, applicant drawer, candidate search, candidate overview).

### 2.2 Matching rules (server, in the score function used by `get_deck`)
- **Remote job** → the location component (20%) counts as **full credit**, and distance is shown as "Remote" instead of km. The commute filter (`nearMe`) must **not** exclude remote jobs.
- **Hybrid job** → normal distance scoring, plus a small leniency: compute it with `commute_km × 1.5`. This rule is a recommendation; note it in a code comment.
- **Seeker preference:** if the job's setup is not in `seeker.work_setups`, exclude it from the deck when the seeker turned on the setup filter (2.4). Otherwise keep it, add a "why" note ("Setup: Remote (not in your preferences)") and apply a small penalty (e.g. −10 points, floor 0). Keep the existing weights (skills 55 / interests 15 / location 20 / pay 10) untouched.
- Add `setup` to the `why` array when it matches ("Remote, which you prefer").

### 2.3 Employer UI
- `jobForm` (`employer.js`): new **required** field "Work setup" as a three-option segmented control (reuse the `label.opt` radio pattern from the interview modal), with an icon and helper text for each:
  - On-site: "Work at your business location"
  - Hybrid: "Mix of on-site and remote", plus the "on-site days per week" stepper
  - Remote: "Work from anywhere"
- Location stays required for On-site/Hybrid. For Remote it becomes "Hiring area / company base" with a helper line.
- `blankJob()` defaults to `'On-site'`. `jobsave` validates the value.
- Jobs list, job detail and applicants header show a setup badge.
- Applicant drawer and candidate cards show the seeker's accepted setups as chips. Candidate search gets a setup filter (pass `p_setup` to `candidate_search`).

### 2.4 Seeker UI
- Onboarding step "Goals" and profile `SEC.goal`: new chip group **"Work setups you accept"** (same `chipBtn` + `JM.actions.dt` pattern as job types). Validation (`checkStep(4)`): require at least one.
- `initDraft` / `saveDraft`: include `work_setups`.
- Discover:
  - Card: setup badge beside the job-type badge (icons: building / shuffle / globe). Use `badge brand` for Remote and the neutral badge for others, or one consistent style.
  - Quick chips row: add a second chip row, or merge into one, "All setups · On-site · Hybrid · Remote", saved into `seeker_profiles.filters.setup` like `quicktype`.
  - Filters modal: add a "Work setup" select. Update `JM.forms.filters` and the active-filter count `nf`.
- Job detail page: a "Work setup" row in the facts list.

### 2.5 Acceptance
- An employer can't publish without a setup. Old jobs show "On-site".
- A seeker who accepts only Remote and turns on the setup filter sees only remote jobs. Remote jobs are never hidden by the commute filter.
- The badge shows consistently on cards, job detail, applications, preferred and matches.

---

## 3. Discover card redesign (logo circle + 4:3 listing photo)

### 3.1 Database and storage (`011`)
- `alter table public.jobs add column if not exists photo_path text;` plus insert/update grant.
- New **public** bucket `job-photos` (5 MB, `image/jpeg,image/png,image/webp`), mirroring the `company-logos` policies in `007`: public read, and the owner writes/deletes only inside their `auth.uid()` folder.
- Add `photo_url`/`photo_path` and `company.logo_path` to the `get_deck` / `get_job` / `my_matches` JSON (`e.logo_path` already exists on `employers`). The client builds public URLs with `JM.sb.storage.from(bucket).getPublicUrl(path)` and caches them (see 8.3).

### 3.2 Employer: upload the listing photo
- `jobForm`: new optional field "Listing photo (shown on job cards)". Use `JM.uploadBtn` with preview-before-upload, accepting JPG/PNG/WEBP.
- The preview modal shows the image **inside a 4:3 frame** (`aspect-ratio:4/3; object-fit:cover`) so the employer sees exactly how the card crops it. Optional: a simple drag-to-reposition focal point stored as `jobs.photo_focus text` (e.g. `"50% 30%"`), applied as `object-position`.
- Client-side downscale before upload (canvas → max 1600 px wide, WebP or JPEG quality 0.85) to keep cards fast.
- Replace and remove actions. Delete the old object on replace, as the logo flow does.
- If the employer has no company logo yet, show a nudge linking to the Company page.

### 3.3 Card layout (`cardHtml` in `seeker.js` + `.jcard` styles)
Order, top to bottom:
1. **Header (kept above):** badges row (Featured · job type · work setup · custom role) → **job title** (`h2`) → company name + verified check. **Match ring on the right**, the same as today.
2. **Media block:**
   - A **4:3 listing photo**: `.jmedia { position:relative; aspect-ratio:4/3; border-radius:14px; overflow:visible; }`, image `width:100%; height:100%; object-fit:cover; border-radius:14px`.
   - A **company logo circle on the left** that **slightly overlaps** the photo: about 56–64 px circle, `border:3px solid #fff`, soft shadow, `object-fit:cover`, absolutely positioned at the photo's **bottom-left** (`left:14px; bottom:-26px`) so roughly 40% of the circle hangs below the photo edge. Add matching top padding to the details block so nothing collides.
3. **Details (moved below):** location (+ distance, or "Remote") and salary row → requirements line → skill chips (have/missing colors kept) → description (line-clamped) → "Why this match".

Card sizing: the card has a fixed height (`.deck` ≈ 540 px desktop, `calc(100vh - 340px)` mobile). To fit the photo:
- Make `.jcard-in` scroll internally (`overflow:auto` with a subtle fade at the bottom), **or** clamp the description to 2 lines and the skills to one row plus "+N".
- On short screens (`max-height: 700px`), cap the photo at `max-height: 38%` of the card while keeping 4:3 via `aspect-ratio` + `max-height` + `width:auto; margin:auto`.
- Don't let internal scroll break swiping: only start a drag when horizontal movement is greater than vertical, or when the pointer starts outside the scroll area.

Swipe safety:
- Images get `draggable="false"`, plus `pointer-events:none` on the `<img>`, so native image drag never hijacks the pointer handlers in `bindTop()`.
- Preload the images of the next two cards (`new Image().src = url`) after `drawDeck()` so they don't pop in.

Fallbacks (never a broken image, see Section 8):
- No listing photo → a 4:3 placeholder with a brand-tinted gradient and the category icon / job initial.
- No logo → the circle shows company initials (reuse the `.avatar` style).
- Image error → swap to the same placeholder.

Apply the same media header, smaller, to: job detail page (`/jobs/:id`), the Preferred list rows (logo circle only), the employer's own job preview, and the public job page if one exists.

### 3.4 Open decision to confirm with Makheyl before building
The request reads two ways: (a) **cover style**, with the logo circle overlapping the photo's bottom-left corner (the layout above, recommended), or (b) **side-by-side**, with the logo circle on the left and the photo to its right, the circle overlapping the photo's left edge. Build (a) by default and keep the logo offset in CSS variables (`--logo-x`, `--logo-y`) so switching to (b) is a CSS-only change.

### 3.5 Acceptance
- The title and match % are visible without scrolling. Photo is exactly 4:3. The logo is a perfect circle overlapping the photo.
- Swipes still work on touch and mouse, and tapping still opens details.
- Cards with no photo or logo look intentional, not empty.

---

## 4. Messages: long-press to reveal actions

### 4.1 Current state
`bubble()` in `seeker2.js` renders **all actions inline** under every message (`.msg-actions` with Reply / Edit / Unsend / Remove for you / Report). The server RPCs already exist (`edit_message`, `unsend_message`, `remove_message_for_me` in `010`). "Reply" currently just pre-fills `Re: "…" —` into the input.

### 4.2 Interaction spec
- **Remove the inline action buttons** from every bubble. Keep only the time + "edited" tag in `.msg-meta`.
- **Open the menu by:**
  - **Touch:** press and hold **450 ms**. Cancel if the finger moves more than 8 px, lifts early, or the list scrolls.
  - **Mouse:** right-click (`contextmenu`) **or** press and hold. Optional: a small "⋯" button that appears only on hover on desktop.
  - **Keyboard:** bubbles get `tabindex="0"`. `Enter`, `Space`, `Shift+F10` or the `ContextMenu` key opens the menu.
- **Feedback while holding:** the bubble scales to 0.97 and highlights, then fires `navigator.vibrate?.(10)` on open. Block the native callout and text selection during the press (`-webkit-touch-callout:none; user-select:none` on `.bub`), but keep a **Copy** action so text can still be copied.
- **Menu = a dropdown, not a floating toolbar:** a small vertical list anchored to the pressed bubble. It is right-aligned under **my** bubbles and left-aligned under the other person's. It **flips above** the bubble when there isn't room below. Width 180–220 px, the same card/shadow tokens as other menus, and a light dimmed backdrop on mobile is fine. Only one menu can be open at a time.
- **Items (same rules as today):**
  | Item | Shown when |
  | --- | --- |
  | Reply | message not unsent |
  | Copy | message not unsent |
  | Edit | mine and not unsent |
  | Unsend | mine and not unsent → `JM.confirm` "Unsend for everyone?" |
  | Remove for you | always → `JM.confirm` "Remove for you? The other person still sees it." |
  | Report | theirs and not unsent (danger color) |
- **Closes on:** item pick, outside tap, `Esc`, thread scroll, route change, or a realtime update that re-renders the bubble.
- ARIA: `role="menu"` / `role="menuitem"`, focus the first item on open, arrow-key navigation, return focus to the bubble on close.

### 4.3 Implementation notes
- Put the gesture logic in **one delegated listener** on `#bubbles` (pointerdown / pointermove / pointerup / pointercancel / contextmenu / keydown), not per bubble, because bubbles are re-rendered by `appendBubble` / `updateBubble` from realtime.
- Store the open message id. `JM.updateBubble` must close or reposition the menu if that bubble changes (e.g. the other side unsends).
- Reuse the existing action handlers (`JM.actions.replymsg`, `editmsg`, `unsendmsg`, `rmmsgme`, `reportmsg`). Menu items carry the same `data-act` / `data-id`.
- Remove `.msg-actions` / `.msg-act` CSS once unused. Add `.msg-menu`, `.msg-menu button`, `.bub.pressing`.
- Show a one-time hint ("Tip: press and hold a message for options") the first time a thread opens (store a flag in `localStorage`, wrapped in try/catch).

### 4.4 Recommended upgrade: real replies
Replace the `Re: "…"` text hack with a proper quoted reply:
- `011`: `alter table public.messages add column if not exists reply_to uuid references public.messages(id) on delete set null;` Extend `send_message(p_conv, p_body, p_reply_to uuid default null)` to validate that `reply_to` belongs to the same conversation.
- UI: picking Reply shows a **reply bar** above the input ("Replying to Juan: <snippet> ✕"). The sent bubble shows a small quoted block, and tapping the quote scrolls to and flashes the original. An unsent or removed original shows "Original message unavailable".

### 4.5 Acceptance
- No action buttons are visible until long-press or right-click. A quick tap does nothing. Scrolling never opens the menu.
- Works the same for seeker and employer accounts, on iOS Safari, Android Chrome and desktop.
- Realtime edits and unsends from the other side update the open thread correctly.

---

## 5. Categorized skills (sign-up, profile, job posting, everywhere)

### 5.1 Current state
`skills` is a flat table (`name`, `active`) with **40 rows**. Seeker skills (`SEC.skills`) and job skills (`jobForm`) render every skill as one long chip cloud with a basic text filter. `role_skills` and `seeker_skills` reference `skills(name)` by FK.

### 5.2 Database (`011`)
```sql
create table if not exists public.skill_categories (
  id text primary key, name text not null, icon text not null default 'sparkle', sort int not null default 100);
alter table public.skills add column if not exists category text references public.skill_categories(id);
alter table public.skills add column if not exists aliases text[] not null default '{}'; -- e.g. {'MS Excel','Excel'}
alter table public.skills add column if not exists is_custom boolean not null default false;
```
- RLS: categories are readable by everyone and writable only by admins (same as `skills`).
- Seed with `insert … on conflict (name) do update set category = excluded.category`. **Keep every existing skill name exactly as spelled** (FKs from `role_skills`, `seeker_skills` and `jobs.skills` depend on it) and just assign each one a category.
- `JM.loadRef` loads `skills(name,category,aliases)` + `skill_categories`. Keep `JM.skillList` as names for backward compatibility and add `JM.skillsByCat`.

### 5.3 Seed taxonomy (the long list)
Use this as the starting dataset. Existing skills are marked ★. Admins can extend it later.

- **Core workplace / soft skills:** Teamwork★, Time management★, Problem solving★, Communication★, Critical thinking, Adaptability, Attention to detail, Work ethic, Leadership, Decision making, Conflict resolution, Multitasking, Organization, Self-motivation, Accountability, Creativity, Emotional intelligence, Stress management, Punctuality, Active listening
- **Languages:** Filipino★, English★, Tagalog writing, Cebuano / Bisaya, Ilocano, Mandarin, Japanese, Korean, Spanish, Sign language (FSL), Business English, Public speaking
- **Customer service & hospitality:** Customer service★, Customer support★, Complaint handling, Front desk operations, Guest relations, Reservations, Phone etiquette, Hotel housekeeping standards, Event assistance, Concierge services, Upselling★
- **BPO / contact center:** Inbound calls, Outbound calls, Chat support, Email support, Technical support (Tier 1), CRM tools, Zendesk, Salesforce basics, Call quality standards, Average handle time management, Typing speed 40+ WPM, Neutral accent
- **Retail & sales:** Sales★, Negotiation★, Cash handling★, POS system★, Inventory★, Visual merchandising, Product knowledge, Stock replenishment, Shelf planning (planogram), Lead generation, Cold calling, Account management, Sales reporting
- **Food & beverage / culinary:** Barista skills★, Food safety★, Food preparation, Line cooking, Baking, Pastry, Kitchen sanitation, Food plating, Bartending, Order taking, Table service, Menu knowledge, HACCP basics, Food costing, Dishwashing operations
- **Office & administrative:** Microsoft Word★, Microsoft Excel★, Data entry★, Filing★, Scheduling★, Email writing★, Record keeping★, Microsoft PowerPoint, Google Workspace, Typing, Document management, Minutes taking, Reception, Calendar management, Office equipment operation, Virtual assistance
- **Finance & accounting:** Bookkeeping★, Basic accounting★, Accounts payable, Accounts receivable, Payroll processing, Bank reconciliation, QuickBooks, Xero, Tax filing (BIR forms), Invoicing, Budgeting, Financial reporting, Auditing basics, Petty cash management
- **IT support & networking:** Troubleshooting★, Networking basics★, Computer hardware repair, Windows administration, macOS support, Printer setup, Help desk ticketing, Cable termination, Wi-Fi setup, Active Directory basics, CCTV installation, IT asset inventory, Cybersecurity basics
- **Software development:** HTML & CSS★, JavaScript★, TypeScript, React, Vue, Node.js, PHP, Laravel, Python, Java, C#, Kotlin, Flutter, SQL, PostgreSQL, MySQL, Firebase, Supabase, REST APIs, Git & GitHub, Responsive web design, Software testing / QA, WordPress, Power Apps, Power Automate, SharePoint
- **Data & analytics:** Data analysis, Data visualization, Power BI, Google Sheets, Excel pivot tables, Excel formulas (VLOOKUP/XLOOKUP), Statistics basics, Data cleaning, Report writing, Survey design
- **Design & creative:** Graphic design★, Canva★, Adobe Photoshop★, Photography★, Adobe Illustrator, Adobe Premiere Pro, Video editing, CapCut, Figma, UI design, UX research, Layout / pubmat design, Branding, Motion graphics, 3D modeling (Blender), Illustration, Copywriting★
- **Marketing & social media:** Social media★, Marketing basics★, Content creation, Social media management, Facebook Ads, TikTok marketing, SEO basics, Email marketing, Community management, Influencer coordination, Market research, Event promotion
- **Game development:** Unity, Unreal Engine, C# for Unity, Game design, Level design, Roblox Studio (Lua), Pixel art, 2D animation, Game testing, Godot
- **Healthcare & caregiving:** First aid★, Dental assisting★, Sterilization★, Patient care, Vital signs monitoring, Caregiving, Elderly care, Child care, Medical records, Pharmacy assisting, Phlebotomy, Infection control, Medical terminology, Basic life support (BLS)
- **Education & training:** Tutoring, Lesson planning, Classroom management, Early childhood education, Online teaching, ESL teaching, Training facilitation, Curriculum development, Special education support
- **Logistics, warehouse & supply chain:** Warehouse handling★, Forklift operation, Picking & packing, Inventory counting, Shipping & receiving, Dispatching, Barcode scanning, WMS software, Loading / unloading, Delivery route planning, Supply chain basics, Order fulfillment
- **Manufacturing & production:** Machine operation, Assembly line work, Quality control / inspection, 5S, Lean manufacturing basics, SMT / electronics assembly, Packaging, Production reporting, Safety compliance (OSH), Soldering, Blueprint reading
- **Construction & skilled trades:** Carpentry, Masonry, Plumbing, Welding (SMAW), Painting, Tile setting, Steel fixing, Scaffolding, Heavy equipment operation, Construction safety, Estimating / quantity take-off
- **Electrical & electronics:** Electrical installation & maintenance, Electronics repair, Wiring, Aircon / refrigeration servicing, Appliance repair, Solar panel installation, Motor control basics
- **Automotive & transport:** Driving (non-professional), Professional driving, Motorcycle riding (delivery), Automotive servicing, Vehicle maintenance, Tire service, Defensive driving, Route navigation (Waze/Maps)
- **Security & safety:** Security guarding, CCTV monitoring, Access control, Incident reporting, Fire safety, Emergency response, Patrolling
- **Housekeeping & facilities:** Housekeeping, Janitorial services, Laundry operations, Facility maintenance, Landscaping / gardening, Pest control basics
- **Beauty & wellness:** Hairdressing, Barbering, Nail care, Makeup artistry, Massage therapy, Skin care, Spa services
- **HR & recruitment:** Recruitment, Interviewing, Onboarding, HR records, Timekeeping, Labor law basics (PH), Employee relations, Training coordination
- **Legal & compliance:** Legal research, Document review, Contract drafting basics, Notarial assistance, Compliance monitoring, Data privacy (RA 10173) awareness
- **Agriculture & fisheries:** Crop production, Animal husbandry, Aquaculture, Farm equipment operation, Organic farming, Post-harvest handling
- **Licenses & certifications** (record what the seeker *holds*): TESDA NC II (specify), Driver's license – Professional, Food handler's certificate, Civil Service eligibility, PRC license (specify), First aid certification, Forklift certification, OSH training (BOSH/COSH)

> Before seeding: deduplicate against existing names (e.g. keep `Customer support` and `Customer service` as separate existing rows), use consistent capitalization, and add common spellings as `aliases` so typeahead finds them.

### 5.4 Reusable UI component: `JM.skillPicker`
Add it to `core.js`. It is used by **onboarding**, **profile**, the **employer job form**, **candidate search**, and admin **career data** (role skills).

Layout:
1. **Typeahead search** (Section 1) across names + aliases. The category shows as the group label.
2. **"Suggested for you"** row at the top, computed client-side:
   - Seeker: `role_skills` of the chosen goal role (ordered by weight) + skills common to their interests/categories + skills parsed from the résumé.
   - Employer: `role_skills` of the selected career role + the job's category.
3. **Category browser:** collapsible accordion sections (desktop) / horizontally scrollable category tabs + list (mobile). Each header shows icon · name · `selected/total` count. Sections the user has selections in, plus the category matching their goal/interest, open by default. All others stay collapsed, so the long list never overwhelms.
4. **Selected tray** (sticky at the bottom on mobile): chips grouped by category. Seekers keep the level select per skill (Beginner / Intermediate / Advanced, values 40/70/95 as today). The job form keeps its 1–8 limit, and seekers their minimum of 3 (onboarding) / 1 (profile).
5. Empty-search result: "Add "xyz" as a new skill" (see 5.5).

State is still stored in the same draft objects (`JM.draft.skills`, `JM.jd.skills`), so `saveDraft` / `jobsave` keep working.

### 5.5 Custom skills
New `security definer` RPC `add_custom_skill(p_name text, p_category text)`. It trims the name, caps it at 60 chars, dedupes case- and accent-insensitively against names and aliases, inserts with `is_custom = true, active = true`, and rate-limits per user. Admin career data page gets a "Custom skills" review list to recategorize, merge (`on update cascade` already handles renames) or deactivate them.

### 5.6 Apply categorization elsewhere
- Seeker "Fields that interest you" chips → group by the role categories (Section 6).
- Candidate search skill filter, Career page skill-gap lists, résumé review "missing skills": label each skill with its category.
- Admin career data: filter skills and roles by category.

### 5.7 Acceptance
- 300+ skills are browsable without lag. Typing finds a skill in at most 2 keystrokes for most names.
- Existing profiles and jobs keep their skills, now shown under categories.
- The same component and behavior appears in onboarding, profile and the job form.

---

## 6. More roles and career goals, categorized

### 6.1 Current state
`career_roles` has about **13 roles** in 11 categories. Seeker "Career goal" is a flat `<select>`, and the employer job form "Career role" is a flat `<select>` + `custom_role` text. Each role drives the **roadmap** (`roadmap_tasks`), **readiness** (`role_skills`) and salary info, so a new role is more than a label.

### 6.2 Database (`011`)
- `create table if not exists public.role_categories (id text primary key, name text not null, icon text, sort int)`. Point `career_roles.category` at a category name/id (migrate the existing strings).
- Add `career_roles.level text default 'Entry'` (Entry / Mid / Senior / Lead) and `career_roles.aliases text[]` for typeahead.
- For every new role, seed: `salary_min/max` (**fill with current, sourced PH monthly ranges for Laguna/Cavite; do not guess**), `overview`, `duties[]`, `growth` (Entry→Mid→Senior titles, the same `jsonb_build_array` pattern as `003`), and **at least 4 `role_skills`** using names from Section 5.3.
- **Roadmap fallback:** new function `app.ensure_default_roadmap(p_role)` that generates a generic 4-week roadmap (Learn → Practice → Build proof → Apply) from the role's top `role_skills`, so new roles never show an empty Career page. Call it from `roadmap_json` when a role has no tasks.
- Seeker extras (optional, recommended): `seeker_profiles.goal_level text` (target level) and `goal_timeframe text` ("Within 3 months", "6 months", "1 year", "2+ years").

### 6.3 Role taxonomy to seed (expand the current list)
- **Retail & Sales:** Sales Associate★, Cashier★, Merchandiser, Promodiser, Stock Clerk, Store Supervisor, Sales Agent (field), Inside Sales Representative, Account Executive
- **Customer Service & BPO:** Customer Service Representative★, Technical Support Representative, Chat Support Agent, Email Support Specialist, Collections Agent, Quality Analyst, Team Leader
- **Food & Beverage:** Barista, Service Crew, Line Cook, Kitchen Helper, Baker, Pastry Cook, Waiter / Waitress, Bartender, Restaurant Supervisor, Commissary Staff
- **Hospitality & Tourism:** Front Desk Agent, Housekeeping Attendant, Room Attendant, Concierge, Events Assistant, Tour Coordinator
- **Admin & Office:** Administrative Assistant, Office Clerk, Receptionist, Data Encoder, Secretary, Virtual Assistant, Records Officer, Purchasing Assistant
- **Finance & Accounting:** Bookkeeper, Accounting Assistant, Payroll Assistant, Billing Clerk, AP/AR Clerk, Junior Accountant, Audit Assistant
- **IT & Tech:** IT Support Technician, Help Desk Analyst, Junior Web Developer, Front-End Developer, Back-End Developer, Full-Stack Developer, Mobile App Developer, QA Tester, Network Technician, Database Assistant, Low-code / Power Platform Developer, CCTV & Systems Technician
- **Data & Analytics:** Data Analyst (junior), Reporting Analyst, Business Intelligence Assistant
- **Creative & Design:** Graphic Designer, Multimedia Artist, Video Editor, Social Media Content Creator, UI/UX Designer, Photographer, Layout Artist
- **Game Development:** Junior Game Developer, Game Tester (QA), 2D/3D Game Artist, Level Designer
- **Marketing:** Marketing Assistant, Social Media Manager, Digital Marketing Assistant, Events & Promotions Staff, Brand Ambassador
- **Healthcare:** Dental Assistant★, Caregiver, Nursing Aide, Pharmacy Assistant, Medical Secretary, Clinic Receptionist, Barangay Health Worker, Medical Technologist (licensed)
- **Education:** Tutor, Teacher Aide, Daycare Worker, ESL Teacher (online), Trainer
- **Logistics & Warehouse:** Warehouse Staff, Picker / Packer, Forklift Operator, Inventory Controller, Delivery Rider, Delivery Driver, Dispatcher, Logistics Coordinator
- **Manufacturing:** Production Operator, Machine Operator, Quality Control Inspector, Assembler, Packer, Production Supervisor, Maintenance Technician
- **Construction & Trades:** Carpenter, Mason, Electrician, Plumber, Welder, Painter, Construction Helper, Aircon Technician, Foreman
- **Security & Facilities:** Security Guard, CCTV Operator, Janitor / Utility Staff, Maintenance Staff, Gardener / Landscaper
- **Beauty & Wellness:** Hairstylist, Barber, Nail Technician, Massage Therapist, Makeup Artist, Spa Attendant
- **HR & People:** HR Assistant, Recruitment Assistant, Timekeeper, Training Coordinator
- **Transport:** Company Driver, Shuttle Driver, Truck Helper
- **Internships / OJT (category):** OJT – IT, OJT – Business / Admin, OJT – Hospitality, OJT – Engineering, OJT – Healthcare

### 6.4 UI
- New reusable `JM.rolePicker` (built on `JM.typeahead`): grouped by category (category = group label), searchable by title + aliases, with "Popular near you" at the top (most-posted roles in `jobs` over the last 90 days, from a light RPC).
- **"Other / not listed – specify"** option at the bottom:
  - Seeker: sets `goal_role = null` and requires `goal_text`. The Career page shows the generic roadmap from the closest category or a "pick a similar role" suggestion.
  - Employer: keeps `role_id = null` and uses `custom_role` (as today) plus the category.
  - Log custom entries (`custom_role_requests` table, or simply query distinct `custom_role` / `goal_text`) so admins can promote frequent ones into real roles.
- Seeker onboarding/profile "Goals" section order: Career goal (rolePicker) → Target level + timeframe → "In your own words" → Fields that interest you (now grouped by category) → Work setups (Section 2) → Job types → Minimum pay.
- Employer job form: picking a role still auto-fills title, category and top skills (existing `JM.inputs.jdrole`), now through the picker.

### 6.5 Also categorize
- **Employer "Type of business"** (`BIZ` in `employer.js`): turn it into a grouped list (Retail, Food & Beverage, BPO, Manufacturing, Healthcare, Education, Construction, Logistics, Professional Services, Government / NGO, Others – specify) with typeahead.
- **Job types**: keep the DB values, but group them in the UI under "Employment type", next to "Work setup", so the two are not confused.
- **Interests**: group the chips by role category.

### 6.6 Acceptance
- 100+ roles, all grouped, searchable and with a working Career page (real or generated roadmap).
- Users can always specify something not on the list, and admins can see those entries.

---

## 7. Detailed, up-to-date professional summary

### 7.1 Current problems found
- `autoResumeSummary()` (`seeker.js`) produces at most 3 short sentences and **slices to 600 chars**. The textarea also has `maxlength="600"` and is labeled "Short summary".
- **Résumé text is not actually read for PDF/Word/image files.** `JM._lastResumeText` is only filled for `.txt/.md`, so "Update All Info" usually sends an empty string to `parse-resume`, and the summary falls back to the 3-sentence template.
- `parse-resume` caps the AI summary at 600 chars and the rules fallback at 300 chars of raw text. It uses an outdated default model id (`claude-3-5-haiku-latest`).

### 7.2 Server: make `parse-resume` read the real file
- Accept `{ resume_path }` instead of, or as well as, `text`. Verify the path starts with `user.id + '/'`, download it from the `resumes` bucket with the service client, and extract text:
  - **PDF** → a Deno-compatible PDF text extractor (e.g. `npm:unpdf`).
  - **DOCX** → unzip and read `word/document.xml` (e.g. `npm:mammoth` or `npm:fflate` plus XML text stripping).
  - **DOC (legacy)** → best effort; otherwise return `needs_text: true` so the UI asks the user to paste their résumé text.
  - **JPG/PNG** → if `ANTHROPIC_API_KEY` is set, send the image to the model (vision) for extraction. Otherwise return `needs_text: true`.
- Model: read `ANTHROPIC_MODEL` and default to a current Haiku-class model. Raise `max_tokens` (around 1500).
- Return the full professional profile: `edu_level, school, course, grad_year, skills[] (matched against names + aliases), experience[] (role, org, years, start, end, highlights[])` (up to 10), `certificates[]` (titles only), `languages[]`, `tools[]`, `resume_summary` (detailed, see 7.3), `goal_text`, `source`.
- **Still never return or modify** full name, phone, email or birth date. Keep the existing protected-fields restore on the client.

### 7.3 What the summary must contain
No longer a "short" summary. Rename the field **"Professional summary"**. Target **120–250 words** (hard max 2,000 characters), in 2–3 short paragraphs or one paragraph plus a highlights list:
1. **Headline:** who they are and the target role (`goal_role` title or `goal_text`), target level, and work setups (e.g. "open to hybrid or on-site roles in Biñan / Santa Rosa").
2. **Education:** level, course, school, graduation year, relevant honors if parsed.
3. **Experience:** total years (summed), most recent and most relevant roles with org names, plus 1–2 highlights each (from parsed `highlights`), including OJT, volunteer work and school projects.
4. **Skills:** grouped by category (Section 5), Advanced and Intermediate first (e.g. "Advanced in Microsoft Excel and data entry; intermediate in Canva and social media"), plus tools and languages.
5. **Credentials:** certificates and licenses (from `certificates` + parsed).
6. **Availability & preferences:** job types, work setups, commute reach / area, and earliest start if known.

Rules: third-person-neutral or first-person-implied professional tone (match whatever the résumé uses), no invented facts, no personal identifiers, no age/gender. Plain text with line breaks; no markdown.

### 7.4 Client
- Replace `autoResumeSummary(d)` with `composeSummary(d, parsed?)`. It builds the 6 parts above deterministically from the draft (used when there is no AI or as the fallback), and prefers the server's `resume_summary` when it is 300+ chars.
- Textarea: `maxlength="2000"`, auto-growing, live word count, helper text "Covers your goal, education, experience, skills, credentials and availability."
- Add `seeker_profiles.summary_source text default 'auto' check (in ('auto','manual'))`. Set `'manual'` whenever the user types in the summary.
- **When to regenerate:**
  - On résumé upload and on **Update All Info**: always recompute. If `summary_source = 'manual'`, show a **before/after preview** and ask "Replace your edited summary?" before overwriting.
  - On **onboarding finish**: recompute if `auto`.
  - On profile save, if skills, experience, education, goal or certificates changed and the source is `auto`: refresh silently. If the source is `manual`: show a small "Your summary may be outdated – Regenerate" notice.
- "Update All Info" modal: also list what changed in the summary.
- Where the summary is displayed (employer applicant drawer, candidate search, candidate overview, résumé review): render line breaks, with a "Read more" clamp after about 5 lines.
- `resume-review` function: feed it the new detailed summary as context.

### 7.5 Acceptance
- Uploading a typical PDF résumé fills education, experience, skills and a 120–250 word summary that mentions each of the 6 parts that has data.
- Manual edits are never overwritten silently.
- Protected personal fields are unchanged after Update All Info (existing notice stays).

---

## 8. Clean image previews everywhere (no broken images)

### 8.1 Root cause found (fix this first)
The **Content-Security-Policy** in `web/_headers`, `firebase.json` and `web/vercel.json` has:
```
img-src 'self' data: blob:
```
Every profile picture, professional photo, certificate thumbnail, company logo and (soon) job photo is served from **`https://repxbwvcylwbscdklyli.supabase.co/storage/...`** (signed or public URLs). The CSP blocks them, so the deployed site shows broken images, while local `py -m http.server` (no CSP) looks fine.

**Fix:** in all three files, change to
```
img-src 'self' data: blob: https://repxbwvcylwbscdklyli.supabase.co;
```
If PDFs or résumés are ever embedded with `<iframe>`/`<object>`, also add the same origin to `frame-src`. Keep `object-src 'none'` and open PDFs in a new tab as today.

### 8.2 Secondary causes in the code
- Images are rendered as `<img data-media-path="…">` **with no `src`**. `loadMediaThumbs()` fills the signed URL afterwards, so there is a moment, or a permanent state if signing fails, where the browser shows the broken-image icon and alt text.
- Signed URLs expire after **300 s**. Re-renders after that, or a tab left open, keep stale URLs and break.
- No `onerror` fallback anywhere. The profile hero (`picPreview`) has the same problem.

### 8.3 Build one image helper (`core.js`)
`JM.img({ bucket, path, publicUrl?, alt, shape: 'circle'|'rounded'|'cover43', size, fallback: 'initials'|'icon'|'placeholder', name })`
- Renders a **wrapper with a skeleton/placeholder** (initials circle for avatars, icon tile for documents, gradient 4:3 for job photos) and an `<img>` that is **hidden until `onload`**, then fades in. The broken-image glyph is never visible.
- Never outputs an `<img>` without a valid `src`.
- `onerror`: re-sign once (or bust the cache for public URLs), then keep the fallback visible.
- **URL cache:** `JM.urlCache` keyed by `bucket/path`. Sign for 3600 s and refresh at 50 minutes. Batch with `createSignedUrls(paths, 3600)` per render instead of one request per image. Public buckets (`company-logos`, `job-photos`) use `getPublicUrl` once.
- `loading="lazy"`, `decoding="async"`, explicit width/height or `aspect-ratio` to avoid layout shift.
- Replace every `data-media-path` usage and `loadMediaThumbs()` with this helper.

### 8.4 Upload and preview flow (all pictures)
1. **Preview before upload** (`JM.previewFile`, already present): show the local `blob:` URL inside the **final shape**. Circle crop for the profile picture and logo, 4:3 for the job photo, a contained frame for certificates. Add a simple **crop/zoom** step for avatar, logo and job photo (canvas-based; output 512×512 for avatars/logos and 1600×1200 max for job photos, WebP/JPEG ~0.85).
2. **Optimistic display:** right after picking, show the local blob URL in the profile/job form while the upload runs (with a small progress or spinner overlay). Swap to the storage URL when done, and call `URL.revokeObjectURL` afterwards.
3. **Validation:** reject HEIC/HEIF with a clear message ("Please choose a JPG, PNG or WEBP. On iPhone: Settings → Camera → Formats → Most Compatible"), or convert via canvas where the browser can decode it. Keep the 5 MB limit, checked after compression.
4. Keep `image-orientation: from-image` (the default) so phone photos aren't sideways.

### 8.5 "Your Profile" specifically
- Top hero card (`/profile`): an 88–96 px **circular** avatar via `JM.img` with an initials fallback. A small camera badge on the circle opens upload/replace. Click opens the full preview modal.
- The Photos section shows the profile picture as a circle and the professional photo as a 3:4 portrait thumbnail, both via `JM.img`.
- Also show the seeker's avatar (when present) in the app shell top bar / nav, the messages list and the thread header. Respect privacy: employers see it only after shortlisting, the same as today.

### 8.6 Apply everywhere
Profile picture · professional photo · certificate thumbnails · résumé image preview · company logo (Company page, deck card, job detail, messages) · job listing photo · employer verification documents preview · admin verification and moderation views · the preview-before-upload modal · the `mediaview` / `imgview` modals.

### 8.7 Acceptance
- On the **deployed** site, no image anywhere shows a broken icon. Missing images show tidy placeholders.
- Leaving the profile open for more than an hour and then re-rendering still shows images.
- Uploading shows the cropped preview instantly, in the final shape.

---

## 9. Suggested build order (each step shippable)
1. **8.1 CSP fix** (one-line change in 3 files) → immediate win.
2. `011` migration: work setup columns, job photo + bucket, skill/role categories + seeds, `reply_to`, `summary_source`, RPC updates.
3. `JM.typeahead` + `JM.img` (core components), then swap them into existing screens.
4. Work setup (employer form → deck/filters → seeker prefs).
5. Discover card redesign + employer listing photo upload.
6. Messages long-press menu (+ real replies).
7. `JM.skillPicker` + `JM.rolePicker` across onboarding, profile, job form, candidate search, admin.
8. `parse-resume` file extraction + detailed summary.
9. Bump `sw.js` cache → `jobmatch-shell-v10`. Update `README.md` (migration list 001→011, new bucket) and `DEPLOY.md` (CSP note, `ANTHROPIC_MODEL`).

## 10. Test checklist (manual, mobile + desktop)
- [ ] Typeahead: areas, skills, roles, categories, school/course, business type. Accent-insensitive, keyboard, inside modals.
- [ ] Work setup: create a job for each setup. Seeker preference filter. Remote ignores commute. Badges everywhere. Old jobs default to On-site.
- [ ] Deck: 4:3 photo + overlapping logo circle. Title/match on top, details below. Swipe, tap, undo and keyboard still work. Placeholders when missing.
- [ ] Messages: long-press / right-click / keyboard opens the dropdown. Tap and scroll don't. Every action works for seeker and employer. Realtime updates. Reply quote.
- [ ] Skills: categorized browser, suggestions, search, custom skill, levels. Onboarding minimum of 3, job maximum of 8. Existing data intact.
- [ ] Roles: grouped picker, "Other – specify", generated roadmap for new roles, employer auto-fill.
- [ ] Summary: PDF and DOCX extraction, 120–250 words, covers the 6 parts, manual edits protected, personal fields untouched.
- [ ] Images: deployed site with CSP, no broken icons, signed-URL refresh after an hour, crop previews, HEIC message.
- [ ] RLS: a user can't write another user's `job-photos` or read another seeker's media. New RPCs are `security definer` with `search_path = ''`.
