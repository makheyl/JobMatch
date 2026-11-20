-- JobMatch 005: hardening found by the security advisor after the first deploy.
-- Pins the search path on three helper functions and documents job_views.

alter function app.today() set search_path = '';
alter function app.plan_posts(text) set search_path = '';
alter function app.mask_name(text, boolean) set search_path = '';

comment on table public.job_views is 'Read only through security definer functions (employer analytics). No client policies are needed.';
