# Deploying JobMatch

The backend project already exists: **jobmatch**, Supabase organization DICT-StartUp, region Singapore, project ref `repxbwvcylwbscdklyli`. Migrations, reference data, storage buckets and the four edge functions are deployed. What is left is hosting the site and the launch settings below.

## 1. Host the website

Upload the `web` folder to any static host. The site uses hash routes (`/#/deck`), so no rewrite rules are needed.

**Cloudflare Pages or Netlify (simplest):** create a project, choose "upload", drag the `web` folder in. The `_headers` file in it applies the security headers automatically.

**Vercel:** import the web folder from a GitHub repository (Framework Preset: Other, no build command, output directory .). web/vercel.json carries the same headers.

**Firebase Hosting:** from this folder run `firebase init hosting` (public directory `web`, single page app: no), then `firebase deploy`. `firebase.json` already carries the same headers.

Use HTTPS (every host above does). The installable app and push notifications require it.

## 2. Tell Supabase where the site lives

Dashboard, Authentication, URL Configuration:

* **Site URL:** `https://your-domain/`
* **Redirect URLs:** add `https://your-domain/` and, for local work, `http://localhost:5173/`

Without this, confirmation and password-reset links point to the wrong place.

If your final domain is not the one in `web/_headers` and `firebase.json`, nothing changes there: the CSP only names the Supabase project, not your domain.

## 3. Authentication settings (do these before launch)

1. **Custom SMTP.** Authentication, Emails, SMTP Settings. The built-in sender allows only a few emails an hour. Use Resend, Brevo, SendGrid or Gmail Workspace.
2. **Leaked password protection.** Authentication, Sign In / Providers, Email: enable "Prevent use of leaked passwords". (The security advisor flags this until it is on.)
3. **Confirm email** stays on. Edit the email templates so the wording says JobMatch.
4. Raise the minimum password length to 8 or more.

## 4. Create the real administrator

1. Open the site, choose Get started, sign up with the admin's email and confirm it.
2. In the SQL editor run:

```sql
update public.profiles
   set role = 'admin', consent_at = now()
 where id = (select id from auth.users where email = 'admin@yourdomain.ph');
```

3. Sign in again. The administrator sees the admin console.

## 5. Optional secrets

Dashboard, Edge Functions, Secrets (or `supabase secrets set NAME=value`).

| Secret | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Turns on AI résumé review. Without it the built-in rule review is used. Optional `ANTHROPIC_MODEL`. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push. Generate keys once with `npx web-push generate-vapid-keys`. `VAPID_SUBJECT` looks like `mailto:support@yourdomain.ph`. Also paste the **public** key into `vapidPublicKey` in `web/config.js`. |
| `PAYMENTS_MODE` | `sandbox` (default) or `live`. See section 6. |

## 6. Take real payments (PayMongo)

Until this is done the site records upgrades but charges nothing, and says so on screen.

1. Create a PayMongo account and get your secret key and a webhook secret. GCash, Maya and cards are supported.
2. In `supabase/functions/checkout/index.ts`, fill in `createLiveCheckout()`: create a PayMongo checkout session for the item and return its URL. Store the pending payment.
3. Add a small `paymongo-webhook` function that verifies PayMongo's signature and, on a paid event, calls the database functions that already exist: `svc_record_payment`, then `svc_activate_pro`, `svc_activate_employer_plan` or `svc_boost_job`. They are executable only by the service role.
4. Set `PAYMENTS_MODE=live` and, in `web/config.js`, `paymentsMode: 'live'`. Redeploy.
5. Test with PayMongo's test keys before switching to live keys.

## 7. Switch from demo to real

1. In `web/config.js` set `demoMode: false` and replace `supportEmail`. Re-upload.
2. Remove the fictional data (employers, jobs, seekers, chats, admin):

```sql
delete from auth.users where email like '%@jobmatch.demo';
```

3. Have a lawyer review the Privacy Notice and Terms (`web/js/public.js`). Register as a personal information controller with the National Privacy Commission if the law requires it for your size and data.

## 8. Launch checklist

- [ ] Site on HTTPS, Supabase Site URL and Redirect URLs set
- [ ] Custom SMTP working (sign up with a fresh email and receive the link)
- [ ] Leaked password protection on
- [ ] Real admin created, demo data removed, `demoMode: false`
- [ ] Payments decision made: stay in test mode, or complete section 6
- [ ] Backups: Supabase Pro plan adds daily backups and point-in-time recovery. The free plan does not back up for you.
- [ ] Run the security advisor again (Dashboard, Advisors). The "signed-in users can execute SECURITY DEFINER function" notices are expected: every function checks the caller itself and the browser can only reach them while signed in.

## Re-creating the backend in a new project

Run `supabase/migrations/001` to `005` in order in the SQL editor, deploy the four functions in `supabase/functions` (JWT verification off: they check the token themselves), update the URL and publishable key in `web/config.js` and the two project URLs in `web/_headers` and `firebase.json`.
