# Prompt: "From sign-up to hired" – JobMatch seeker journey guide + iPhone 16 Pro Max mockups

## Role and goal
You are working in the **JobMatch** repo (`web/` = no-build vanilla-JS PWA, `supabase/` = backend). Produce two deliverables:

1. **A persuasive, step-by-step guide** that walks a job seeker from **creating an account → building their profile → discovering and applying to matched jobs → monitoring their career breakdown and matches → interviewing → getting hired.** Write it as if every feature is simply part of JobMatch.
2. **Mockup screenshots** of the main features from both the **seeker** and the **employer** side, framed as an **iPhone 16 Pro Max**, to illustrate the guide.

Before you write a step, read the code (`web/js/public.js`, `seeker.js`, `seeker2.js`, `employer.js`, `core.js`). **Every button label, screen name and flow must match what the app really shows.** If a step below doesn't match the code, follow the code and note the difference in your final report.

---

## 1. Content rules (read first)

### 1.1 What to leave out
The guide and screenshots must **not mention or show** any of the following:
- plans, tiers, "Free", "Pro", "Monthly", "Annual", "Starter", "Growth" or "Business"
- prices, ₱ amounts, subscriptions, upgrades, trials, payments, billing, boosts, receipts
- lock icons, "Upgrade to…" notices, plan comparison tables

Assume the seeker has **every seeker feature available**. That includes:
- unlimited stars
- undo and reviewing passed jobs
- full swipe/activity history
- the full career roadmap with quiz backtracking
- starting conversations with employers
- detailed résumé review and insights
- priority visibility to employers
- early job alerts and downloadable reports

Assume the employer has **every employer feature available**. That includes:
- unlimited listings
- ranked applicants with match scores
- analytics
- candidate search with invites
- interview scheduling
- messaging

Describe all of these as normal features ("You can star as many jobs as you like"), never as perks of a plan.

**Never** link to or screenshot `/pro`, `/employer/billing`, the payment modal, or any admin page.

### 1.2 Tone
Persuasive, warm and confident, aimed at Filipino first-time and early-career job seekers in Biñan / Laguna / Cavite. Emphasize how **easy, fast and guided** each step is ("about 2 minutes", "one tap", "JobMatch fills this in for you").

### 1.3 Honesty
- No invented statistics, testimonials or guarantees ("you will get hired in 7 days").
- Use soft, true claims ("JobMatch shows you exactly which skills to build next").
- Mention fairness the way the app implements it: age, gender and photos are never used for match scores, and contact details are shared only after an employer shortlists you.

### 1.4 Language and reading level
Simple English (about grade 8 reading level), short sentences, second person ("you"). Optional: a one-line Tagalog tagline per phase. Keep it natural, not forced.

---

## 2. Deliverable A – the guide

**File:** `docs/guide/jobmatch-seeker-journey.md`. Also create a matching, nicely styled single-file `docs/guide/jobmatch-seeker-journey.html` that embeds the screenshots, for sharing and printing.

### 2.1 Structure
1. **Hero intro:** 3–4 sentences on what JobMatch does: matches you with nearby jobs, shows your match %, explains why, and coaches you to close skill gaps. Include a **"Your first 15 minutes"** box: account → profile with résumé auto-fill → first swipes → first application.
2. **Journey map:** a numbered overview of all phases (below) with an estimated time per phase.
3. **Phases.** For **every step**, use this template:
   - **Step title** (action-first, e.g. "Upload your résumé and let JobMatch fill in the rest")
   - **Where:** the screen name and the route (e.g. *Profile → Résumé & auto-fill*, `#/profile`)
   - **Do this:** numbered taps and inputs, using the exact UI labels
   - **What you'll see:** the result on screen
   - **Why it helps you:** one persuasive line
   - **Tip:** a practical tip (optional)
   - **Screenshot:** a reference to the mockup file (Section 3)
4. **Quick-reference cheat sheet:** a table of gestures and buttons:
   - swipe right = save to Preferred
   - swipe left = pass
   - swipe up = star as top pick
   - tap card = details
   - Undo
   - Passed / History
   - Filters and work-setup chips
   - long-press a message for Reply / Edit / Unsend / Remove for you
5. **FAQ** (6–10 questions): privacy, editing your profile later, what match % means, what happens after shortlisting, how to prepare for interviews, how to delete your account.
6. **"How employers find you"** (short appendix, 1 page): the employer side in 5 steps, so seekers understand the process. Use the employer screenshots.
7. **Closing call to action:** "Create your account and see your first matches today."

### 2.2 Phases and steps to cover (verify each against the code)

**Phase 1 – Create your account** (`#/role`, sign-up, `#/consent`)
- Choose "Job seeker" on the account-type screen.
- Sign up with full name, email and a password (8+ characters), then confirm via email.
- Accept the privacy consent, and explain in plain words what is and isn't shared.

**Phase 2 – Set up your profile in 5 guided steps** (`#/onboarding`)
1. **About you:** name, mobile number, birth year (never used for matching), where you live (start typing your area and pick from the suggestions), and how far you're willing to commute (slider).
2. **Education:** highest education, school, course or strand, year. Mention the type-ahead suggestions.
3. **Skills:** the **categorized skill picker**: "Suggested for you", search, category sections, and choosing a level per skill. Explain that skills drive more than half of every match score.
4. **Résumé:**
   - upload a PDF, Word or image file
   - tap **Update All Info** to auto-fill education, experience, skills and a **detailed professional summary**
   - review and edit
   - note that name, phone, birth date and email are never overwritten
5. **Goals:**
   - career goal from the categorized role list (or "Other – specify"), plus target level and timeframe if present in the UI
   - fields of interest
   - **work setups** you accept (On-site / Hybrid / Remote)
   - job types
   - minimum monthly pay
   - the "let employers find me" toggle
- Finish → land on your first matches.

**Phase 3 – Make your profile stand out** (`#/profile`, `#/resume-review`, `#/checklist`)
- Profile picture (circle crop) and professional photo (3:4 crop) with a preview before upload. Certificates and credentials with titles and descriptions.
- Profile strength bar: reach 100%.
- **Résumé review:** score, strengths, weaknesses with fixes and examples, and professional recommendations. Apply the fixes and re-run.
- First-time job seeker checklist and the visual résumé sample (if the user is a first-timer).
- Discoverability setting so employers can invite you.

**Phase 4 – Discover jobs that fit you** (`#/deck`)
- Reading a job card:
  - title and match % ring on top
  - the 4:3 listing photo with the company logo
  - location / distance (or "Remote") and pay
  - work-setup badge
  - skills you have (green) vs. skills to build
  - "Why this match"
- Gestures and buttons: unlimited stars, **Undo**, **Passed** (review passed jobs), **History**, **Filters** (commute, job type, pay, work setup) and the quick chips. Keyboard arrows on desktop.
- Upcoming interviews appear at the top of Discover.

**Phase 5 – Check the details and apply** (`#/jobs/:id`)
- Job details:
  - match breakdown (skills / interests / location / pay)
  - missing skills
  - requirements
  - company info and verified badge
- Apply. Explain what the employer sees: a masked name until shortlisted.
- Open the **career breakdown for this job** (`#/career/job/:id`) to see exactly what to learn for it.

**Phase 6 – Track everything in one place** (`#/preferred`, `#/applications`, `#/matches`, `#/notifications`)
- Preferred (saved and starred jobs) → apply when ready.
- Applications: the status timeline (applied → shortlisted → hired / not selected) and application insights.
- **Matches:** employers who shortlisted you, with contact details unlocked.
- Notifications and early job alerts. Settings for notification types and downloadable reports (`#/settings`).

**Phase 7 – Talk to employers** (`#/messages`)
- Start a conversation with a shortlisted match ("New"), or reply to employers.
- Quick-reply chips.
- Long-press a message for Reply / Edit / Unsend / Remove for you.
- Report / Block for safety.
- Tips for professional messages.

**Phase 8 – Ace the interview**
- Interview cards (date, time, Online or On-site, meeting link or location) → tap **Confirm**.
- Prep checklist: review the job's career breakdown, résumé review fixes and quick quizzes.

**Phase 9 – Grow with your career breakdown** (`#/career`, `#/career/role/:id`)
- Skill readiness score for your goal role.
- The **full weekly roadmap**: Learn / Practice tasks, then the weekly quiz (unlocks after that week's tasks), with backtracking to retake quizzes.
- Learning progress, growth path (Entry → Mid → Senior with pay ranges), recommended courses, and "What you will do" in the role.
- How readiness and match scores rise as you complete tasks and add skills. Return weekly.

**Phase 10 – Get hired, and keep growing**
- Status turns **Hired**: what to do next (confirm details in Messages, update your profile and experience).
- Set your next goal role and keep the roadmap going.

### 2.3 Length and formatting
- Aim for about 2,500–4,000 words: detailed but skimmable.
- Use headings, numbered steps, short paragraphs, and bold for UI labels.
- Use callout boxes (`> **Tip:**`) sparingly: at most one per step.

---

## 3. Deliverable B – iPhone 16 Pro Max mockup screenshots

### 3.1 Device spec
- **Viewport:** 440 × 956 CSS px (points) at **devicePixelRatio 3**, which gives a raw PNG of **1320 × 2868 px**. Use `isMobile: true`, `hasTouch: true` and an iOS Safari user-agent.
- **Safe areas:** top ≈ 62 pt (status bar + Dynamic Island), bottom ≈ 34 pt (home indicator). Make sure no content or controls sit under them in the captured layout. If the app's mobile layout collides with them, add `env(safe-area-inset-*)` padding behind a `?mockup=1` query flag only. Don't change normal app behavior.
- **Frame:** composite each raw screenshot into a device frame built in HTML/CSS (no copyrighted Apple artwork or images):
  - a black titanium-style bezel (~18 px at 1×) and screen corner radius ≈ 55 pt
  - a Dynamic Island pill (≈ 126 × 37 pt, top 11 pt)
  - a status bar showing **9:41**, signal, Wi-Fi and battery
  - a home indicator bar
  Export framed PNGs at 3× on a transparent or very light neutral background.
- Also export a **side-by-side gallery** (`docs/guide/screenshots/gallery.html` + `gallery.png`) with captions.

### 3.2 How to capture
- Use **Playwright** (`npm i -D playwright` in a separate `tools/mockups/` folder; don't add dependencies to `web/`).
  - Serve `web/` locally (`npx serve web` or `py -m http.server 5173 -d web`).
  - Use the app's **demo accounts** (`demoMode: true` in `web/config.js`):
    - **Seeker:** `paolo@jobmatch.demo` or `maria@jobmatch.demo` (the accounts with every seeker feature)
    - **Employer:** `pixel@jobmatch.demo` (the account with every employer feature)
  - Get the demo password from `supabase/seed_demo.sql`. **Don't hard-code it in committed files**: read it from an env var `JM_DEMO_PW`.
- **Don't change live data.** Navigate and open screens only, and avoid swiping, applying, sending or deleting. If a screen needs a state the demo data lacks, render it with a `?mockup=1` fixture that mocks the RPC responses in the browser. Never write to the database.
- **Hide anything from Section 1.1** in the shots. With `?mockup=1`, inject CSS that hides plan badges, `/pro` links, lock icons, upgrade notices and prices. Also hide the demo-mode banner and any real-looking personal data.
- Wait for images to load (`.jm-img.loaded`) and the network to go idle before each capture. Disable animations. Use the light theme.

### 3.3 Screens to capture

**Seeker** (files `docs/guide/screenshots/seeker-XX-name.png`)
| # | Screen | Route / state |
|---|---|---|
| 01 | Welcome / landing | `#/` |
| 02 | Choose account type | `#/role` |
| 03 | Sign up | sign-up form, empty and clean |
| 04 | Onboarding – Skills (categorized picker) | `#/onboarding`, step 3 |
| 05 | Onboarding – Résumé + Update All Info result | step 4, with the "Profile updated from résumé" modal |
| 06 | Onboarding – Goals (role picker + work setups) | step 5 |
| 07 | Your profile (hero avatar, strength 100%) | `#/profile` (top) |
| 08 | Discover – job card (photo + logo, match ring) | `#/deck` |
| 09 | Discover – Filters (work setup, commute, pay) | Filters modal |
| 10 | Job details – match breakdown | `#/jobs/:id` |
| 11 | Career breakdown for a job | `#/career/job/:id` |
| 12 | Career – roadmap, readiness, growth path | `#/career` |
| 13 | Résumé review results | `#/resume-review` |
| 14 | Applications – status timeline | `#/applications` |
| 15 | Matches (shortlisted) | `#/matches` |
| 16 | Messages – long-press menu open | `#/messages/:id` |
| 17 | Upcoming interview card on Discover | `#/deck` (top) |

**Employer** (files `docs/guide/screenshots/employer-XX-name.png`)
| # | Screen | Route / state |
|---|---|---|
| 01 | Overview dashboard | `#/employer` |
| 02 | Post a job (work setup + listing photo + skill picker) | `#/employer/jobs/new` (filled with fixture values) |
| 03 | Jobs list | `#/employer/jobs` |
| 04 | Ranked applicants with match scores | `#/employer/jobs/:id/applicants` |
| 05 | Applicant drawer (shortlist, message, schedule interview) | drawer open |
| 06 | Schedule interview modal | modal open |
| 07 | Candidate search + invite | `#/employer/candidates` |
| 08 | Analytics (trends + insights) | `#/employer/analytics` |
| 09 | Company page (logo, verified) | `#/employer/company` |
| 10 | Messages with a candidate | `#/messages/:id` |

For each screenshot, record in `docs/guide/screenshots/manifest.json`: file name, perspective, screen title, route, a 1-line caption, and which guide step uses it.

---

## 4. Constraints
- Don't modify production app behavior. Any helper code lives in `tools/mockups/` or behind `?mockup=1`.
- Don't commit secrets (demo password, keys). Don't run `seed_demo.sql` against the live database.
- Use only fictional demo data. Never use a real person's photo: use initials placeholders or neutral generated illustrations.
- No Apple logos or trademarked device artwork. Build the frame in CSS.
- Keep JobMatch branding: `#0C70F8`, Inter, the existing logo.

## 5. Done when
- [ ] `docs/guide/jobmatch-seeker-journey.md` and `.html` cover all 10 phases with the step template, plus the cheat sheet, FAQ, employer appendix and call to action.
- [ ] A text search finds none of: Pro, Free plan, Monthly, Annual, Starter, Growth, Business plan, upgrade, subscription, price, ₱, payment, billing, boost, lock (outside unrelated words).
- [ ] All 27 framed screenshots exist at 1320 × 2868 px raw (frame adds a margin), with nothing under the Dynamic Island or home indicator, and no plan or price UI visible.
- [ ] `manifest.json` and `gallery.html` are generated, and every screenshot is referenced from the guide.
- [ ] Final report: files created, any step whose real UI label differed from this brief, and any screen that needed a mock fixture.
