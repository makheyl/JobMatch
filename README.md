# JobMatch

Job matching and career guidance for Biñan, Laguna. A static website (installable as an app) backed by Supabase.

**Finalist, Biñan StartUp Competition.**

## What is in this folder

| Path | What it is |
| --- | --- |
| `web/` | The whole website. No build step. Upload this folder to any static host. |
| `supabase/migrations/` | Database: tables, row level security, server-side logic, reference data, storage (`resumes`, `verification-docs`, `seeker-media`, `company-logos`, `job-photos`). Run in order `001` to `011`. |
| `supabase/functions/` | Edge functions: `checkout`, `resume-review`, `parse-resume`, `candidate-overview`, `delete-account`, `send-push`. |
| `supabase/seed_demo.sql` | Optional fictional demo data and demo logins. Never run it on a real production database. |
| `firebase.json`, `web/_headers`, `web/vercel.json` | Security headers (CSP including Supabase Storage `img-src`) for Firebase Hosting, Netlify/Cloudflare Pages, and Vercel. |
| `DEPLOY.md` | Step by step: go live, then the launch checklist. |

## How it works

* **Three experiences in one site:** job seekers (mobile first, with a swipe deck), employers (dashboard), administrators (verification, moderation, analytics).
* **All business rules run on the server.** Match scores, plan limits, fair-hiring masking and roadmap progress live in Postgres functions, so a user cannot change them from the browser.
* **Fair by design.** Employers see "First L." until they shortlist a candidate. Age, gender, contact details and the résumé file are released only after that, and are never used for scoring.
* **Plans:** Free and Pro for job seekers (₱99 a month or ₱899 a year); Starter, Growth (₱1,499) and Business (₱3,999) for employers; a ₱299 boost for any listing.
* **Features marked with an asterisk in the product spec** are included: in-app chat with report and block, application insights, résumé review, employer messaging, boosted listings, subscription and payment overview, platform analytics, course partner and commission tracking, announcements with push.

## Run it on your computer

The backend is already live, so you only need to serve the `web` folder:

```powershell
cd web
py -m http.server 5173
```

Open http://localhost:5173. With `demoMode: true` in `web/config.js` the sign-in page shows one-click demo accounts.

## Honest limits of this version

* Payments are in **test mode**: upgrades are recorded but no money moves. See DEPLOY.md, section 6, to connect PayMongo.
* Résumé review uses built-in rules until you add an `ANTHROPIC_API_KEY` secret.
* Push notifications need VAPID keys (DEPLOY.md, section 5).
* Confirmation emails use Supabase's built-in sender, which is rate limited. Add your own SMTP before launch.
* The legal pages are a solid starting template, not legal advice. Have a lawyer review them.
