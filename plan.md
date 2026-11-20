# JobMatch – System Modifications and Improvements Plan

This document outlines the technical implementation plan for the requested modifications and additions to the **JobMatch** platform while preserving its existing branding, color scheme (`#0C70F8` / Inter / neutral surfaces), architecture (no-build static PWA + Supabase Postgres/RLS/Edge Functions), and working features.

---

## Guiding Implementation Rules

1. **Preserve Existing Design & Features:** Keep the current layout, color palette, typography, and working functionality intact unless explicitly modified below.
2. **Database-Backed Accuracy:** All analytics, schedules, match rates, plans, and permissions must be powered by real Supabase database tables, RPCs, and RLS policies — no hardcoded or mock dashboard numbers.
3. **Non-Breaking Schema Evolution:** Implement all database additions in a new incremental migration (`supabase/migrations/007_enhancements.sql`) so existing records and functions remain intact.
4. **Role-Based Security & Privacy:** Enforce all plan restrictions, messaging rules, document access, and protected personal fields on the server (Postgres RLS / `SECURITY DEFINER` RPCs / Edge Functions) as well as the UI.
5. **Cross-Role Synchronization:** Shared features (Interview Scheduling, Direct Messaging, Company Documents, Plan Changes) stay synchronized across Seeker and Employer accounts.

---

## Detailed Work Breakdown

### 1. Radio Buttons Alignment
* **Target Files:** `web/css/app.css`, `web/js/seeker2.js` (and any radio inputs across `web/js/*.js`)
* **Changes:**
  * Audit every `input[type="radio"]` across quizzes, forms, and modals.
  * Standardize flex container alignment (`display: flex; align-items: center; gap: 10px`) with `input[type="radio"] { flex: none; margin: 0; vertical-align: middle; }` and ensure multi-line labels stay vertically balanced with their radio buttons.

### 2. Careers – Locked Upcoming Weeks & Quiz Gate
* **Target Files:** `supabase/migrations/007_enhancements.sql`, `web/js/seeker2.js`
* **Changes:**
  * Keep upcoming weeks (`Week N > 1`) locked until all tasks in `Week N - 1` are completed (in addition to plan gating).
  * **Preliminary Task Gate for Quizzes:** Update `app.roadmap_json`, `public.quiz_for_task`, and `public.submit_quiz` so a week's quiz cannot be opened or submitted until **all non-quiz tasks (Learn / Practice checkboxes and preliminary items) in that same week** are checked/completed.
  * In `web/js/seeker2.js`, disable the **Take quiz** button with a clear inline helper/tooltip (*"Complete all preliminary tasks in this week first"*) until prerequisites are checked.

### 3. Resume Review – Detailed Strengths, Weaknesses & Actionable Recommendations
* **Target Files:** `supabase/functions/resume-review/index.ts`, `supabase/migrations/007_enhancements.sql`, `web/js/seeker2.js`
* **Changes:**
  * Expand the review response schema (both AI and rule-based fallback) to return structured sections:
    * `score` (0–100) and `summary`
    * `strengths[]` — specific strong areas found in the résumé/profile
    * `weaknesses[]` — identified gaps with `area`, `issue`, `solution`, and `example` (concrete rewrite/action to improve employer appeal)
    * `recommendations[]` — prioritized professional polish tips
  * Store the richer structured payload in `public.resume_reviews` (backward-compatible with existing `suggestions` jsonb).
  * Render clearly separated **Strengths**, **Weaknesses & Fixes**, and **Professional Recommendations** cards in `/resume-review`.

### 4. First-Time Job Seeker – Visual Block-Style Resume Sample
* **Target Files:** `web/assets/sample-resume-template.svg` (clean, lightweight vectorized block-style template), `web/js/seeker2.js`
* **Changes:**
  * Create a crisp, easy-to-read **block-style SVG résumé template** (`web/assets/sample-resume-template.svg`) showing standard sections (Header/Contact, Objective/Summary, Education, Skills, Experience/OJT, Character References) in a clean visual layout.
  * On `/checklist`, add a dedicated **First-Time Jobseeker Resume Sample** card/button (and update sample previews) displaying the visual block-style résumé image inside a clear modal with zoom/view support rather than plain text details.

### 5. Profile – Section Ordering & "Update All Info" from Resume Upload
* **Target Files:** `web/js/seeker.js`, `supabase/functions/parse-resume/` (new Edge Function, or client + server extraction)
* **Changes:**
  * **Logical Section Arrangement:** Reorder `/profile` sections so they flow naturally:
    1. **Profile Picture & Professional Photo** (top hero/media card)
    2. **Personal & Contact Details** (Full Name, Contact Number, Date of Birth/Birth Year, Email, Location/Commute)
    3. **Résumé & Auto-Fill** (Upload résumé + **"Update All Info"** button + Summary + Experience)
    4. **Education**
    5. **Skills**
    6. **Certificates & Credentials**
    7. **Goals & Work Preferences**
  * **"Update All Info" Button:**
    * Displayed whenever a résumé file is uploaded (or newly selected).
    * Extracts Education (level, school, course, graduation year), Skills, Experience entries, Résumé Summary, and Career Goal from the uploaded résumé (using text/PDF extraction + optional AI parsing via Edge Function with deterministic fallback).
    * **Strict Personal-Info Lock:** Never modifies or overwrites:
      * **Full Name** (`profiles.full_name`)
      * **Contact Number** (`profiles.phone`)
      * **Date of Birth** (`seeker_profiles.birth_year` / `birth_date`)
      * **Email Address** (`auth.users.email`)
    * Shows a clear confirmation summary modal listing which fields were updated and confirming that protected personal fields were left untouched.

### 6. Job Seeker Subscription Plans & Free Plan Restrictions
* **Target Files:** `supabase/migrations/007_enhancements.sql`, `supabase/functions/checkout/index.ts`, `web/js/seeker.js`, `web/js/seeker2.js`, `web/js/public.js`
* **Changes:**
  * **New Seeker Plan Structure (replacing single "Pro" label):**
    * **Free Plan (₱0)**
    * **Monthly Plan (₱99 / month)** — Full Pro-level features (unlimited stars, full roadmap, quiz backtracking, undo swipe, full swipe/application history, direct messaging, application insights, detailed résumé review).
    * **Annual Plan (₱899 / year)** — Everything in Monthly Plan **plus exclusive Annual perks** (e.g., 24% savings, priority profile visibility badge for employers, unlimited AI résumé reviews, downloadable PDF Career Roadmap & Resume Review reports, early access to new job alerts).
    * Add a clear side-by-side **Free vs. Monthly vs. Annual** comparison table highlighting Annual savings and exclusive perks.
  * **Enforced Free Plan Restrictions (Server + UI):**
    * **No Quiz Backtracking:** In quiz modal (`seeker2.js`), Free users answer one question at a time in forward-only mode with no Back button; Monthly/Annual users can navigate/review previous questions before submitting.
    * **No Undo / Reject-Reversal:** Disable and server-block `undo_swipe()` and `requeue_passed_jobs()` for Free users (`plan_required`), showing an upgrade prompt.
    * **No Application or Activity History:** Restrict `/applications` history and `my_swipe_history()` for Free users with a clear upgrade callout.
    * **Messaging Restriction for Free Users:**
      * Block Free seekers from calling `start_conversation()` or sending the **first** message in a conversation where the employer has not yet sent a message (enforced in `public.start_conversation` and `public.send_message`).
      * Free seekers can only view and reply to threads **after an employer messages them first**.

### 7. Employer Plans & Billing Pricing Update
* **Target Files:** `supabase/functions/checkout/index.ts`, `web/js/employer.js`, `web/js/public.js`
* **Changes:**
  * Update employer pricing consistently across landing page, billing page, and checkout catalog:
    * **Starter Plan:** ₱0 / month
    * **Growth Plan:** **₱999 / month** (updated from ₱1,499)
    * **Business Plan:** **₱2,499 / month** (updated from ₱3,999)
  * Update the employer feature comparison table to clearly contrast Starter, Growth, and Business tiers.

### 8. Company and Team – Document & Logo Uploads
* **Target Files:** `supabase/migrations/007_enhancements.sql`, `web/js/employer.js`
* **Changes:**
  * Add `logo_path text` to `public.employers` (with a public/authenticated `company-logos` bucket or `verification-docs` storage policies) and support uploading/replacing all 4 items under **Company and Team** (`/employer/company`) as well as registration:
    1. **Company Logo** (JPG/PNG/WEBP preview displayed in company profile & listings)
    2. **BIR Registration Document** (PDF/JPG/PNG)
    3. **DTI Registration Document** (PDF/JPG/PNG)
    4. **Mayor's Permit** (PDF/JPG/PNG)
  * Allow employers to upload, replace, and preview each document with clear status badges (`Uploaded` / `Missing`).

### 9. Post a Job – Required Asterisks & Specific Field Validation
* **Target Files:** `web/js/employer.js`, `web/css/app.css`
* **Changes:**
  * Mark every required field label with a visible red asterisk (`<span class="req">*</span>`): Job Title, Category, Job Type, Location, Minimum Pay, Maximum Pay, Description, and Skills Needed.
  * Replace generic validation with **field-level inline error messages** + a clear summary listing every missing or invalid field (e.g., *"Job title must be at least 3 characters"*, *"Maximum pay (₱10,000) cannot be lower than minimum pay (₱15,000)"*, *"Description needs at least 20 characters (currently 8)"*, *"Select at least 1 required skill"*), highlighting the exact invalid inputs with `.field-err`.

### 10. Interview Scheduling (Employer & Job Seeker)
* **Target Files:** `supabase/migrations/007_enhancements.sql`, `web/js/employer.js`, `web/js/seeker.js`, `web/js/core.js`
* **Changes:**
  * **Database Table & RPCs:**
    * Create `public.interviews` (`id`, `application_id`, `job_id`, `employer_id`, `seeker_id`, `scheduled_date`, `scheduled_time`, `interview_type` [`Online` | `On-site`], `location_or_link`, `notes`, `status` [`scheduled` | `confirmed` | `rescheduled` | `completed` | `cancelled`], `created_at`, `updated_at`) with RLS for participating employer and seeker.
    * RPCs: `schedule_interview(...)`, `update_interview_status(...)`, `my_interviews()`, `employer_interviews()`.
    * Automatic notifications sent to both parties on creation, reschedule, confirmation, or cancellation.
  * **Employer UI:** Add a **Schedule Interview** button inside the applicant drawer (`/employer/jobs/:id/applicants`) and an **Interviews** list/widget on `/employer` Overview.
  * **Job Seeker UI:** Display **Upcoming Interviews** directly on the Job Seeker Overview/Discover header (or dedicated Overview card) and Matches page, showing Employer Name, Job Position, Date, Time, Type (Online/On-site), Location/Meeting Link, Status, and a **Confirm / Request Reschedule** action.

### 11. Candidate Search Enhancements
* **Target Files:** `supabase/migrations/007_enhancements.sql`, `supabase/functions/candidate-overview/index.ts` (new Edge Function), `web/js/employer.js`
* **Changes:**
  * **Applicant Match Rate:** Always compute and display a compatibility `%` ring/badge for every candidate in Candidate Search (ranked against the selected job, or against the employer's highest-matching published job when none is selected), using the same skills/location/interests/pay matching logic.
  * **Clickable Applicant Cards:** Clicking any candidate card opens a detailed **Candidate Profile Drawer/Modal** displaying their skills, education, work experience, résumé summary/file (respecting privacy masking rules), and **AI-Powered Applicant Overview**.
  * **AI-Powered Applicant Overview:** Edge Function `candidate-overview` synthesizes the candidate's profile, résumé, skills, education, and experience into a concise suitability summary for the selected role (using Anthropic API when configured, with a smart deterministic structured summary fallback).
  * **Direct Messaging:** Add a **Message** button on both the candidate card and detailed profile modal that creates/opens a direct conversation (`start_employer_conversation(p_seeker, p_job)`) and routes directly to `/messages/:id`.

### 12. Employer Analytics Overhaul (Real Database Data)
* **Target Files:** `supabase/migrations/007_enhancements.sql`, `web/js/employer.js`, `web/css/app.css`
* **Changes:**
  * **Backend RPC (`employer_analytics_v2(p_start date, p_end date)`):** Queries actual `job_views`, `swipes`, `applications`, and `jobs` filtered by the selected date range (`Last 7 Days`, `Last 30 Days`, `Last 90 Days`, or `Custom Date Range`).
  * **A. Summary Cards:** Total Job Views, Total Applications, Total Saved Jobs, and Overall Application Rate (`Applications / Views %`).
  * **B. Application Trends Line Chart:** Responsive inline SVG line chart plotting daily **Job Views** and **Applications** over the selected date range with hover tooltips and date range selector.
  * **C. Improved Funnel by Listing Table:**
    * Columns: **Listing** (clickable to open per-job detail analytics modal), **Views**, **Skipped** (renamed from *Passed* with column tooltips clarifying each metric), **Saved**, **Starred**, **Applied**, **Matched**, **Application Rate (%)**, and **Conversion Rate (%)**.
  * **D. Job Performance Comparison:** Visual horizontal comparison bars comparing Job Position, Total Views, Total Applications, and Application Rate side by side.
  * **E. Candidate Engagement Insights:** Automatically computed highlights + actionable tips:
    * Most Viewed, Most Saved, Most Applied, Zero-Application postings, and Highest Application Rate posting.
    * Automated suggestions (e.g., high views + 0 applications -> *"Review job description, qualifications, or salary range"*).
  * **F. Export Reports:** Client-side report generators using live RPC data for the active date range:
    * **Export as CSV** (`.csv`)
    * **Download as Excel** (`.xls` / SpreadsheetML or `.xlsx`-compatible workbook)
    * **Download as PDF** (clean print-formatted report view triggering browser PDF save)

### 13. Overall Website Improvements – Mobile Responsiveness & Animations
* **Target Files:** `web/css/app.css`, `web/js/core.js`
* **Changes:**
  * **Mobile Responsiveness Audit:** Refine breakpoints (`< 960px`, `< 640px`, `< 420px`) across sidebar, topbar, tabbar, stat grids, data tables (clean horizontal scroll wrappers without page overflow), SVG charts, modals, and forms so no text clips or overlaps.
  * **Subtle, Lightweight Animations:** Add smooth GPU-friendly CSS transitions (`page-enter` fade/slide, card hover elevation, button press micro-interaction, modal/drawer spring entrance, animated progress bar fill, subtle skeleton shimmer) while respecting `@media (prefers-reduced-motion: reduce)`.

### 14. Payment Methods & Subscription Upgrade Flow
* **Target Files:** `web/js/seeker2.js`, `web/js/employer.js`, `web/css/app.css`, `supabase/functions/checkout/index.ts`, `supabase/migrations/007_enhancements.sql`
* **Changes:**
  * **Unified Payment Modal / Interface:**
    * Clean, visually appealing checkout modal with custom SVG icons for **GCash**, **Maya**, **Credit / Debit Card (Visa / Mastercard)**, and **Online Banking / BPI / BDO**.
    * Step-by-step flow:
      1. **Plan Review:** Selected plan name, price, billing period, and feature summary.
      2. **Payment Method Selection:** Interactive payment method cards.
      3. **Payment Instructions & Verification:** Clear steps/reference entry, loading state, and server-side verification via `checkout` Edge Function.
      4. **Transaction Status Feedback:** Dedicated **Success**, **Pending**, and **Failed** confirmation states; plan features activate **only** after server-confirmed `paid` status.
  * **Feature Comparison Tables:**
    * Seeker comparison table: **Free vs. Monthly (₱99/mo) vs. Annual (₱899/yr)**.
    * Employer comparison table: **Starter (₱0) vs. Growth (₱999/mo) vs. Business (₱2,499/mo)**.

---

## Execution Order

| Phase | Scope | Key Files |
| :--- | :--- | :--- |
| **Phase 1: Database & Storage** | Create `007_enhancements.sql` (interviews table, company logo/doc support, quiz prerequisite gate, Free plan server restrictions, `employer_analytics_v2`, `start_employer_conversation`, payment status handling) | `supabase/migrations/007_enhancements.sql` |
| **Phase 2: Edge Functions** | Update `checkout/index.ts` (new prices ₱999/₱2,499, payment method & status handling), enhance `resume-review/index.ts` (strengths/weaknesses/solutions), add `candidate-overview/index.ts` & `parse-resume/index.ts` | `supabase/functions/*/index.ts` |
| **Phase 3: Core Styles & Assets** | Radio alignment, responsive polish, micro-animations, payment UI styles, SVG line chart styles, and block-style resume SVG template | `web/css/app.css`, `web/assets/sample-resume-template.svg` |
| **Phase 4: Seeker Experience** | Profile reordering + "Update All Info" (with protected fields), Career quiz gate, Detailed Resume Review UI, Visual Resume Sample, Monthly/Annual plans + Free restrictions, Seeker Interviews dashboard, Payment modal | `web/js/seeker.js`, `web/js/seeker2.js`, `web/js/public.js`, `web/js/core.js` |
| **Phase 5: Employer Experience** | New pricing (₱999/₱2,499) + Payment modal, Company Logo/BIR/DTI/Mayor's Permit uploads, Post a Job `*` & specific field validation, Interview Scheduling, Candidate Search (Match Rate + Clickable Cards + AI Overview + Direct Message), Full Employer Analytics + Insights + CSV/Excel/PDF export | `web/js/employer.js` |
| **Phase 6: Verification** | End-to-end testing across Seeker (Free/Monthly/Annual), Employer (Starter/Growth/Business), and Mobile/Tablet/Desktop viewports | All `web/` and `supabase/` files |
