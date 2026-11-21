/* Admin: overview, verification, moderation, users, career data, payments, analytics, course partners, announcements. */
(function () {
  const JM = window.JM, ic = JM.icon, esc = JM.esc;
  const stat = function (n, l) { return '<div class="card stat"><div class="n num">' + n + '</div><div class="l">' + l + '</div></div>'; };
  const bars = function (rows, key, label) {
    const mx = Math.max.apply(null, [1].concat(rows.map(function (r) { return r[key]; })));
    return '<div class="bars" role="img" aria-label="' + label + '">' + rows.map(function (r) { return '<div class="b" title="' + r.day + ': ' + r[key] + '"><span>' + r[key] + '</span><i style="height:' + Math.max(2, Math.round(r[key] / mx * 100)) + '%"></i></div>'; }).join('') + '</div>';
  };

  // ---------- overview ----------
  JM.route('/admin', { auth: 'admin', title: 'Overview', render: async function () {
    const o = await JM.rpc('admin_overview');
    return '<div class="page">' + JM.pageHead('Overview', 'Platform health at a glance.') + '<div class="grid g4 mb">' + stat(o.seekers, 'Job seekers') + stat(o.employers, 'Employers') + stat(o.live_jobs, 'Live jobs') + stat(o.applications, 'Applications') + '</div>' +
      '<div class="grid g4 mb">' + stat(o.matches, 'Shortlisted or hired') + stat(o.hires, 'Hires') + '<a class="card stat" href="#/admin/verification" style="color:inherit"><div class="n num">' + o.pending_verification + '</div><div class="l">Awaiting verification</div></a><a class="card stat" href="#/admin/moderation" style="color:inherit"><div class="n num">' + o.open_reports + '</div><div class="l">Open reports</div></a></div>' +
      '<div class="card"><div class="card-h"><h3>Recent support messages</h3></div>' + (o.tickets.length ? '<div class="list">' + o.tickets.map(function (t) { return '<div class="li" style="align-items:flex-start"><div class="avatar">' + ic(t.kind === 'problem' ? 'flag' : 'help', 16) + '</div><div class="grow"><div class="row gap-s"><b>' + esc(t.subject) + '</b>' + JM.badge(t.kind === 'problem' ? 'Problem' : 'Question', t.kind === 'problem' ? 'warn' : '') + '</div><div class="small muted">' + esc(t.user) + ' · ' + JM.ago(t.created_at) + '</div><div class="small mt">' + esc(t.message) + '</div></div></div>'; }).join('') + '</div>' : JM.empty('inbox', 'No messages', 'Support requests appear here.')) + '</div></div>';
  } });

  // ---------- verification ----------
  JM.route('/admin/verification', { auth: 'admin', title: 'Verification', render: async function () {
    const q = await JM.rpc('admin_verification_queue'), pending = q.filter(function (e) { return e.status === 'pending'; });
    const card = function (e) {
      const st = e.status === 'verified' ? ['Verified', 'ok'] : e.status === 'rejected' ? ['Rejected', 'bad'] : ['Pending', 'warn'];
      return '<div class="card card-b mb"><div class="row wrap" style="align-items:flex-start">' +
        JM.img({ bucket: 'company-logos', path: e.logo_path, shape: 'circle', size: 52, name: e.name, act: e.logo_path ? 'imgview' : '', title: e.name }) +
        '<div class="grow"><div class="row gap-s wrap"><h3>' + esc(e.name) + '</h3>' + JM.badge(st[0], st[1]) + '</div><div class="small muted">' + esc(e.type) + ' · submitted ' + JM.ago(e.submitted_at) + '</div><div class="small mt">' + esc(e.address) + '<br>' + esc(e.contact_name) + ' · ' + esc(e.contact_phone) + ' · ' + esc(e.contact_email) + '</div>' + (e.reason ? '<div class="small mt" style="color:var(--bad)">Reason: ' + esc(e.reason) + '</div>' : '') + '</div></div>' +
        '<div class="row wrap mt">' + e.docs.map(function (d) { return '<button class="btn secondary sm" data-act="mediaview" data-bucket="verification-docs" data-path="' + esc(d.path) + '" data-title="' + esc(e.name + ' – ' + d.kind) + '">' + ic('file', 15) + esc(d.kind) + '</button>'; }).join('') + '</div>' +
        '<div class="row wrap mt">' + (e.status === 'pending' ? '<button class="btn ok" data-act="approve" data-id="' + e.user_id + '" data-name="' + esc(e.name) + '">Approve</button><button class="btn secondary danger" data-act="reject" data-id="' + e.user_id + '">Reject</button>' : e.status === 'verified' ? '<button class="btn secondary danger sm" data-act="revoke" data-id="' + e.user_id + '" data-name="' + esc(e.name) + '">Revoke verification</button>' : '') + '</div></div>';
    };
    return '<div class="page narrow">' + JM.pageHead('Employer verification', pending.length + ' awaiting review') + (q.length ? q.map(card).join('') : '<div class="card">' + JM.empty('shield', 'Nothing to review', 'New employer registrations appear here.') + '</div>') + '</div>';
  } });
  JM.actions.viewdoc = async function (el) { await JM.busy(el, async function () { const r = await JM.sb.storage.from('verification-docs').createSignedUrl(el.dataset.path, 120); if (r.error) throw r.error; window.open(r.data.signedUrl, '_blank', 'noopener'); }); };
  JM.actions.approve = function (el) {
    JM.confirm({
      title: 'Approve ' + el.dataset.name + '?',
      text: 'They can publish jobs immediately and get a verified badge.',
      ok: 'Approve',
      onOk: function () {
        JM.busy(null, async function () {
          await JM.rpc('admin_review_employer', { p_employer: el.dataset.id, p_approve: true });
          if (JM.reward) {
            JM.reward({
              id: 'admin_approve_emp_' + el.dataset.id,
              tier: 2,
              repeatTier: 1,
              emotion: 'proud',
              prop: 'stamp',
              animation: 'peek',
              title: el.dataset.name + ' verified!',
              copy: 'They now carry the Verified badge and can publish job listings.'
            });
          } else {
            JM.toast('Approved.', 'ok');
          }
          JM.render();
        });
      }
    });
  };
  JM.actions.reject = function (el) { JM.modal('<h2>Reject registration</h2><p class="muted mt">The employer sees your reason and can resubmit documents.</p><form data-form="reject" data-id="' + el.dataset.id + '" class="mt"><div class="field"><textarea name="reason" placeholder="For example: the permit is expired or the ID is not readable" required></textarea></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn danger" type="submit">Reject</button></div></form>'); };
  JM.forms.reject = async function (form, d) { await JM.rpc('admin_review_employer', { p_employer: form.dataset.id, p_approve: false, p_reason: d.reason }); JM.close(); JM.toast('Rejected.'); JM.render(); };
  JM.actions.revoke = function (el) { JM.confirm({ title: 'Revoke verification for ' + el.dataset.name + '?', text: 'Their live jobs are paused and they return to pending review.', ok: 'Revoke', danger: true, onOk: function () { JM.busy(null, async function () { await JM.rpc('admin_revoke_employer', { p_employer: el.dataset.id }); JM.toast('Revoked.'); JM.render(); }); } }); };

  // ---------- moderation ----------
  JM.route('/admin/moderation', { auth: 'admin', title: 'Moderation', render: async function () {
    const rs = await JM.rpc('admin_reports'), open = rs.filter(function (r) { return r.status === 'open'; });
    const card = function (r) {
      const isOpen = r.status === 'open', ctx = r.job ? '<div class="card flat card-b mt" style="padding:12px"><b>' + esc(r.job.title) + '</b> <span class="muted small">by ' + esc(r.job.employer) + ' · ' + esc(r.job.status) + '</span><div class="small muted mt" style="margin:6px 0 0;white-space:pre-wrap">' + esc(String(r.job.description).slice(0, 300)) + '</div></div>' : r.message ? '<div class="card flat card-b mt" style="padding:12px"><span class="muted small">Message from ' + esc(r.message.sender) + ':</span><div class="mt" style="margin-top:4px">' + esc(r.message.body) + '</div></div>' : '';
      return '<div class="card card-b mb"><div class="row gap-s wrap">' + JM.badge(r.kind, 'brand') + JM.badge(isOpen ? 'Open' : r.status, isOpen ? 'warn' : '') + '<span class="small muted">reported by ' + esc(r.reporter) + ' · ' + JM.ago(r.created_at) + '</span></div><p class="mt" style="margin-bottom:0"><b>Reason:</b> ' + esc(r.reason) + '</p>' + ctx +
        (isOpen ? '<div class="row wrap mt"><button class="btn secondary sm" data-act="resolve" data-id="' + r.id + '" data-a="dismiss">Dismiss</button>' + (r.kind === 'job' ? '<button class="btn secondary danger sm" data-act="resolve" data-id="' + r.id + '" data-a="remove_job">Remove listing</button>' : '') + '<button class="btn danger sm" data-act="resolve" data-id="' + r.id + '" data-a="suspend">Suspend account</button></div>' : '') + '</div>';
    };
    return '<div class="page narrow">' + JM.pageHead('Moderation', open.length + ' open reports') + (rs.length ? rs.map(card).join('') : '<div class="card">' + JM.empty('flag', 'No reports', 'Reported listings, messages and users appear here.') + '</div>') + '</div>';
  } });
  JM.actions.resolve = function (el) {
    const a = el.dataset.a, t = { dismiss: 'Dismiss this report?', remove_job: 'Remove this listing?', suspend: 'Suspend this account?' }[a];
    // Guardrail: never use mascot/sparkles on moderation reports or suspensions
    JM.confirm({ title: t, text: a === 'dismiss' ? 'No action is taken.' : a === 'remove_job' ? 'The listing is removed and the employer is notified.' : 'The user is signed out and cannot sign in. Their live jobs are paused.', ok: 'Confirm', danger: a !== 'dismiss', onOk: function () { JM.busy(null, async function () { await JM.rpc('admin_resolve_report', { p_report: el.dataset.id, p_action: a }); JM.toast('Done.'); JM.render(); }); } });
  };

  // ---------- users ----------
  JM.route('/admin/users', { auth: 'admin', title: 'Users', render: async function () {
    const users = await JM.rpc('admin_users', { p_q: JM.uq || '', p_role: JM.ur || '' });
    return '<div class="page">' + JM.pageHead('Users', users.length + ' accounts') + '<form data-form="usersearch" class="row wrap mb"><input type="search" name="q" value="' + esc(JM.uq || '') + '" placeholder="Search name or email" style="max-width:300px"><select name="role" style="width:160px"><option value="">All roles</option>' + ['seeker', 'employer', 'admin'].map(function (r) { return '<option value="' + r + '"' + (JM.ur === r ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select><button class="btn secondary" type="submit">Search</button></form>' +
      '<div class="card"><div class="tablewrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Plan</th><th>Joined</th><th></th></tr></thead><tbody>' + users.map(function (u) {
        return '<tr><td><b>' + esc(u.name || '(no name)') + '</b>' + (u.suspended ? ' ' + JM.badge('Suspended', 'bad') : '') + '</td><td class="small">' + esc(u.email) + '</td><td>' + esc(u.role || 'not chosen') + '</td><td>' + esc(u.plan || '–') + '</td><td class="small muted">' + JM.date(u.created_at) + '</td><td>' + (u.role === 'admin' ? '' : '<div class="row gap-s" style="justify-content:flex-end"><button class="btn secondary sm" data-act="suspend" data-id="' + u.id + '" data-v="' + (!u.suspended) + '">' + (u.suspended ? 'Reactivate' : 'Suspend') + '</button><button class="iconbtn" data-act="deluser" data-id="' + u.id + '" data-name="' + esc(u.name || u.email) + '" aria-label="Delete account" style="width:32px;height:32px">' + ic('trash', 15) + '</button></div>') + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>';
  } });
  JM.forms.usersearch = function (form, d) { JM.uq = d.q || ''; JM.ur = d.role || ''; JM.render(); };
  JM.actions.suspend = async function (el) { await JM.busy(el, async function () { await JM.rpc('admin_set_suspended', { p_user: el.dataset.id, p_value: el.dataset.v === 'true' }); JM.toast('Account status updated.'); JM.render(); }); };
  JM.actions.deluser = function (el) { JM.confirm({ title: 'Delete ' + el.dataset.name + '?', text: 'This permanently deletes the account, files and activity. It cannot be undone.', ok: 'Delete permanently', danger: true, onOk: function () { JM.busy(null, async function () { await JM.fn('delete-account', { user_id: el.dataset.id }); JM.toast('Account deleted.'); JM.render(); }); } }); };

  // ---------- payments ----------
  JM.route('/admin/payments', { auth: 'admin', title: 'Payments', render: async function () {
    const p = await JM.rpc('admin_payments_overview'), kind = { pro: 'Pro subscriptions', employer_plan: 'Employer plans', boost: 'Boosted listings' };
    return '<div class="page">' + JM.pageHead('Payments', 'Subscriptions and boosts.') + (JM.cfg.paymentsMode !== 'live' ? '<div class="notice warn mb">' + ic('flag') + '<span>Payments are in <b>test mode</b>. These amounts are recorded but no money moved.</span></div>' : '') +
      '<div class="grid g4 mb">' + stat(JM.peso(p.total), 'Total recorded') + stat(p.pro_subscribers, 'Pro subscribers') + stat(p.paying_employers, 'Paying employers') + stat(p.by_kind.reduce(function (a, k) { return a + k.count; }, 0), 'Payments') + '</div>' +
      '<div class="grid g3 mb">' + p.by_kind.map(function (k) { return '<div class="card stat"><div class="n num">' + JM.peso(k.amount) + '</div><div class="l">' + (kind[k.kind] || k.kind) + ' · ' + k.count + '</div></div>'; }).join('') + '</div>' +
      '<div class="card"><div class="card-h"><h3>Recent payments</h3></div><div class="tablewrap"><table><thead><tr><th>Date</th><th>Customer</th><th>Item</th><th>Reference</th><th>Status</th><th style="text-align:right">Amount</th></tr></thead><tbody>' + p.recent.map(function (r) { return '<tr><td class="small">' + JM.date(r.created_at) + '</td><td>' + esc(r.who) + '</td><td>' + esc(r.item) + '</td><td class="xs muted">' + esc(r.ref) + '</td><td>' + JM.badge(r.status, r.status === 'paid' ? 'ok' : '') + ' ' + (r.provider === 'sandbox' ? JM.badge('test', 'dash') : '') + '</td><td style="text-align:right">' + JM.peso(r.amount) + '</td></tr>'; }).join('') + '</tbody></table></div></div></div>';
  } });

  // ---------- analytics ----------
  JM.route('/admin/analytics', { auth: 'admin', title: 'Analytics', render: async function () {
    const a = await JM.rpc('admin_platform_analytics'), mx = Math.max.apply(null, [1].concat(a.jobs_by_category.map(function (c) { return c.n; })));
    return '<div class="page">' + JM.pageHead('Platform analytics', 'Adoption, matching and learning.') + '<div class="grid g4 mb">' + stat(a.users, 'Total users') + stat(a.applications_per_user, 'Applications per seeker') + stat(a.match_rate + '%', 'Applications shortlisted') + stat(a.skill_course_users, 'Seekers who passed a quiz') + '</div>' +
      '<div class="grid g2 mb"><div class="card card-b"><h3 class="mb">New sign-ups, last 14 days</h3>' + bars(a.daily, 'signups', 'Daily sign-ups') + '</div><div class="card card-b"><h3 class="mb">Applications, last 14 days</h3>' + bars(a.daily, 'applications', 'Daily applications') + '</div></div>' +
      '<div class="card card-b"><h3 class="mb">Live jobs by category</h3>' + (a.jobs_by_category.length ? a.jobs_by_category.map(function (c) { return '<div class="skill"><div class="row between small"><span>' + esc(c.category) + '</span><b class="num">' + c.n + '</b></div>' + JM.bar(Math.round(c.n / mx * 100)) + '</div>'; }).join('') : '<p class="muted">No live jobs yet.</p>') + '</div></div>';
  } });

  // ---------- course partners ----------
  JM.route('/admin/courses', { auth: 'admin', title: 'Course partners', render: async function () {
    const o = await JM.rpc('admin_course_overview'), tot = o.partners.reduce(function (a, p) { return a + Number(p.commission); }, 0);
    return '<div class="page">' + JM.pageHead('Course partners', 'Clicks, sales and commission earned from partner links.') + '<div class="grid g4 mb">' + stat(o.partners.reduce(function (a, p) { return a + p.clicks; }, 0), 'Course clicks') + stat(o.partners.reduce(function (a, p) { return a + p.conversions; }, 0), 'Conversions') + stat(JM.peso(o.partners.reduce(function (a, p) { return a + Number(p.sales); }, 0)), 'Partner sales') + stat(JM.peso(tot), 'Commission earned') + '</div>' +
      '<div class="card mb"><div class="card-h"><h3>Partners</h3></div><div class="tablewrap"><table><thead><tr><th>Provider</th><th>Commission</th><th class="num">Clicks</th><th class="num">Conversions</th><th class="num">Sales</th><th class="num">Commission</th><th></th></tr></thead><tbody>' + o.partners.map(function (p) { return '<tr><td><b>' + esc(p.provider) + '</b> ' + (p.active ? '' : JM.badge('Inactive')) + '</td><td>' + Math.round(p.rate * 100) + '%</td><td class="num">' + p.clicks + '</td><td class="num">' + p.conversions + '</td><td class="num">' + JM.peso(p.sales) + '</td><td class="num">' + JM.peso(p.commission) + '</td><td><button class="btn secondary sm" data-act="editpartner" data-p="' + esc(p.provider) + '" data-r="' + p.rate + '" data-a="' + p.active + '">Edit</button></td></tr>'; }).join('') + '</tbody></table></div></div>' +
      '<div class="grid g2" style="align-items:start"><div class="card"><div class="card-h"><h3>Most clicked courses</h3></div>' + (o.top_courses.length ? '<div class="list">' + o.top_courses.map(function (c) { return '<div class="li"><div class="grow"><b>' + esc(c.title) + '</b><div class="xs muted">' + esc(c.provider) + '</div></div><b class="num">' + c.clicks + '</b></div>'; }).join('') + '</div>' : JM.empty('book', 'No clicks yet', '')) + '</div>' +
      '<div class="card"><div class="card-h"><h3>Log a conversion</h3></div><form data-form="conversion" class="card-b"><p class="small muted">Record a sale reported by a partner. Commission is calculated from the partner\'s rate.</p><div class="field"><label class="label">Partner</label><select name="provider">' + o.partners.map(function (p) { return '<option>' + esc(p.provider) + '</option>'; }).join('') + '</select></div><div class="field"><label class="label">Course</label><input type="text" name="title" required></div><div class="grid g2 keep"><div class="field"><label class="label">Sale amount (₱)</label><input type="number" name="sale" min="0" step="0.01" required></div><div class="field"><label class="label">Date</label><input type="date" name="date" value="' + new Date().toISOString().slice(0, 10) + '"></div></div><button class="btn" type="submit">Log conversion</button></form></div></div>' +
      (o.conversions.length ? '<div class="card mt"><div class="card-h"><h3>Recent conversions</h3></div><div class="tablewrap"><table><tbody>' + o.conversions.map(function (c) { return '<tr><td>' + JM.date(c.occurred_at) + '</td><td>' + esc(c.provider) + '</td><td>' + esc(c.course_title) + '</td><td class="num">' + JM.peso(c.sale_amount) + '</td><td class="num">' + JM.peso(c.commission) + '</td></tr>'; }).join('') + '</tbody></table></div></div>' : '') + '</div>';
  } });
  JM.forms.conversion = async function (form, d) { await JM.rpc('admin_log_conversion', { p_provider: d.provider, p_title: d.title.trim(), p_sale: Number(d.sale), p_date: d.date || null, p_notes: '' }); JM.toast('Logged.', 'ok'); JM.render(); };
  JM.actions.editpartner = function (el) { JM.modal('<h2>' + esc(el.dataset.p) + '</h2><form data-form="partner" data-p="' + esc(el.dataset.p) + '" class="mt"><div class="field"><label class="label">Commission rate (%)</label><input type="number" name="rate" min="0" max="100" step="0.5" value="' + Math.round(el.dataset.r * 1000) / 10 + '"></div><label class="check mb"><input type="checkbox" name="active"' + (el.dataset.a === 'true' ? ' checked' : '') + '><span>Active partner</span></label><div class="row" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn" type="submit">Save</button></div></form>'); };
  JM.forms.partner = async function (form, d) { await JM.q(JM.sb.from('course_partners').update({ commission_rate: Number(d.rate) / 100, active: !!d.active }).eq('provider', form.dataset.p)); JM.close(); JM.render(); };

  // ---------- announcements ----------
  JM.route('/admin/announcements', { auth: 'admin', title: 'Announcements', render: async function () {
    const past = await JM.q(JM.sb.from('announcements').select('*').order('created_at', { ascending: false }).limit(20));
    return '<div class="page narrow">' + JM.pageHead('Announcements', 'Send an in-app notification to users, with an optional push.') +
      '<form data-form="announce" class="card card-b mb"><div class="field"><label class="label">Title</label><input type="text" name="title" maxlength="80" required></div><div class="field"><label class="label">Message</label><textarea name="body" maxlength="400" required></textarea></div><div class="grid g2 keep"><div class="field"><label class="label">Audience</label><select name="audience"><option value="all">Everyone</option><option value="seekers">Job seekers</option><option value="employers">Employers</option></select></div><label class="check" style="align-self:end;margin-bottom:16px"><input type="checkbox" name="push"><span class="small">Also send a push notification</span></label></div><button class="btn" type="submit">' + ic('megaphone', 16) + 'Send announcement</button></form>' +
      '<h3 class="mb">Sent</h3>' + (past.length ? '<div class="card list">' + past.map(function (a) { return '<div class="li" style="align-items:flex-start"><div class="grow"><b>' + esc(a.title) + '</b><div class="small muted">' + esc(a.body) + '</div><div class="xs muted mt">' + JM.ago(a.created_at) + ' · ' + esc(a.audience) + ' · ' + a.recipients + ' recipients' + (a.push ? ' · push' : '') + '</div></div></div>'; }).join('') + '</div>' : '<div class="card">' + JM.empty('megaphone', 'Nothing sent yet', '') + '</div>') + '</div>';
  } });
  JM.forms.announce = async function (form, d) {
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const r = await JM.rpc('admin_send_announcement', { p_title: d.title, p_body: d.body, p_audience: d.audience, p_push: !!d.push });
      let msg = 'Sent to ' + r.recipients + ' users.';
      if (d.push) { try { const p = await JM.fn('send-push', { announcement_id: r.id }); msg += p.configured ? ' Push sent to ' + p.sent + ' devices.' : ' Push is not configured yet (add VAPID keys).'; } catch (e) { msg += ' Push failed.'; } }
      JM.toast(msg, 'ok'); JM.render();
    } finally { btn.disabled = false; }
  };

  // ---------- career data ----------
  JM.cdTab = 'roles'; JM.cdRoleCat = ''; JM.cdSkillCat = '';
  JM.route('/admin/career', { auth: 'admin', title: 'Career data', render: async function () {
    const t = JM.cdTab;
    const tabs = '<div class="tabs">' + [['roles', 'Roles'], ['skills', 'Skills'], ['quiz', 'Quiz questions']].map(function (x) { return '<button class="' + (t === x[0] ? 'on' : '') + '" data-act="cdtab" data-t="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
    let body = '';
    if (t === 'roles') {
      const roles = await JM.q(JM.sb.from('career_roles').select('id,title,category,level,salary_min,salary_max,active').order('title'));
      let reqs = []; try { reqs = await JM.rpc('admin_custom_role_requests'); } catch (e) { reqs = []; }
      const cats = Array.from(new Set(roles.map(function (r) { return r.category; }))).sort();
      const filtered = JM.cdRoleCat ? roles.filter(function (r) { return r.category === JM.cdRoleCat; }) : roles;
      const reqBox = reqs.length ? '<div class="card mb"><div class="card-h"><h3>Custom role requests (' + reqs.length + ')</h3><span class="xs muted">Submitted via "Other / specify"</span></div><div class="list">' +
        reqs.slice(0, 15).map(function (rq) {
          return '<div class="li"><div class="grow"><b>' + esc(rq.label) + '</b> <span class="xs muted">· ' + esc(rq.source) + ' (' + rq.count + ')</span></div><button class="btn secondary sm" data-act="editrole" data-id="" data-prefill="' + esc(rq.label) + '">Promote to role</button></div>';
        }).join('') + '</div></div>' : '';
      body = reqBox + '<div class="row between wrap mb"><div class="row gap-s wrap"><span class="muted small">' + filtered.length + ' of ' + roles.length + ' roles</span><select data-in="cdrcat" style="width:200px;height:34px"><option value="">All categories</option>' + cats.map(function (c) { return '<option' + (JM.cdRoleCat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div><button class="btn" data-act="editrole" data-id="">' + ic('plus', 16) + 'Add role</button></div>' +
        '<div class="card"><div class="tablewrap"><table><thead><tr><th>Role</th><th>Category</th><th>Level</th><th>Typical pay</th><th>Status</th><th></th></tr></thead><tbody>' +
        filtered.map(function (r) { return '<tr><td><b>' + esc(r.title) + '</b></td><td>' + esc(r.category) + '</td><td class="small">' + esc(r.level || 'Entry') + '</td><td class="small">' + JM.peso(r.salary_min) + ' – ' + Number(r.salary_max).toLocaleString('en-PH') + '</td><td>' + JM.badge(r.active ? 'Active' : 'Hidden', r.active ? 'ok' : '') + '</td><td><button class="btn secondary sm" data-act="editrole" data-id="' + r.id + '">Edit</button></td></tr>'; }).join('') + '</tbody></table></div></div>';
    } else if (t === 'skills') {
      const sk = await JM.q(JM.sb.from('skills').select('name,category,is_custom,active').order('name'));
      const cats = JM.skillCategories || [];
      const custom = sk.filter(function (s) { return s.is_custom; });
      const filtered = JM.cdSkillCat ? sk.filter(function (s) { return s.category === JM.cdSkillCat; }) : sk;
      const customBox = custom.length ? '<div class="card mb"><div class="card-h"><h3>Custom skills review (' + custom.length + ')</h3><span class="xs muted">Added by users</span></div><div class="list">' +
        custom.map(function (s) {
          return '<div class="li" style="flex-wrap:wrap"><b class="grow">' + esc(s.name) + '</b><select data-in="skcatupd" data-n="' + esc(s.name) + '" style="width:210px;height:32px;font-size:12.5px">' +
            cats.map(function (c) { return '<option value="' + esc(c.id) + '"' + (s.category === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') +
            '</select><button class="btn secondary sm" data-act="toggleskill" data-n="' + esc(s.name) + '" data-a="' + s.active + '">' + (s.active ? 'Hide' : 'Show') + '</button></div>';
        }).join('') + '</div></div>' : '';
      body = customBox + '<form data-form="addskill" class="row wrap mb"><input type="text" name="name" placeholder="New skill name" maxlength="60" required style="max-width:260px">' +
        '<select name="category" style="max-width:240px">' + cats.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('') + '</select>' +
        '<button class="btn" type="submit">Add skill</button>' +
        '<select data-in="cdscat" style="max-width:220px;margin-left:auto"><option value="">All categories (' + sk.length + ')</option>' + cats.map(function (c) { return '<option value="' + esc(c.id) + '"' + (JM.cdSkillCat === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></form>' +
        '<div class="card card-b"><div class="chips">' + filtered.map(function (s) { return '<button class="chip" style="' + (s.active ? '' : 'opacity:.5;text-decoration:line-through') + '" data-act="toggleskill" data-n="' + esc(s.name) + '" data-a="' + s.active + '" title="' + esc(JM.skillCatName(s.name)) + ' · Click to ' + (s.active ? 'hide' : 'show') + '">' + esc(s.name) + '</button>'; }).join('') + '</div><p class="help mt">Click a skill to hide or show it. Hidden skills cannot be picked by new profiles or listings.</p></div>';
    } else {
      const skills = await JM.q(JM.sb.from('skills').select('name').order('name')); JM.cdSkill = JM.cdSkill || skills[0].name;
      const qs = await JM.q(JM.sb.from('quiz_questions').select('*').eq('skill', JM.cdSkill).order('id'));
      const skillTa = JM.typeahead({ id: 'cd-skill-ta', value: JM.cdSkill, label: JM.cdSkill, minChars: 0, max: 12, placeholder: 'Search skill…', source: skills.map(function (s) { return { value: s.name, label: s.name, group: JM.skillCatName(s.name) }; }), onPick: function (it) { JM.cdSkill = it.value; JM.render(); } });
      body = '<div class="row wrap mb"><div style="min-width:260px">' + skillTa + '</div><button class="btn" data-act="addq">' + ic('plus', 16) + 'Add question</button><span class="small muted">Up to 5 questions per skill are used in quizzes.</span></div>' +
        (qs.length ? '<div class="card list">' + qs.map(function (q) { return '<div class="li" style="align-items:flex-start"><div class="grow"><b>' + esc(q.question) + '</b><div class="small muted mt">' + q.options.map(function (o, i) { return (i === q.answer ? '<b style="color:var(--ok)">' : '') + esc(o) + (i === q.answer ? ' (correct)</b>' : '') ; }).join(' · ') + '</div></div><button class="iconbtn" data-act="delq" data-id="' + q.id + '" aria-label="Delete question" style="width:32px;height:32px">' + ic('trash', 15) + '</button></div>'; }).join('') + '</div>' : '<div class="card">' + JM.empty('book', 'No questions for this skill', 'Quizzes fall back to a self-rating until you add questions.') + '</div>');
    }
    return '<div class="page">' + JM.pageHead('Career data', 'Manage the roles, skills and quiz questions that power matching and roadmaps.') + tabs + body + '</div>';
  } });
  JM.actions.cdtab = function (el) { JM.cdTab = el.dataset.t; JM.render(); };
  JM.inputs.cdrcat = function (el) { JM.cdRoleCat = el.value; JM.render(); };
  JM.inputs.cdscat = function (el) { JM.cdSkillCat = el.value; JM.render(); };
  JM.inputs.skcatupd = async function (el) {
    await JM.q(JM.sb.from('skills').update({ category: el.value, is_custom: false }).eq('name', el.dataset.n));
    await JM.loadRef(); JM.toast('Skill categorized.', 'ok'); JM.render();
  };
  JM.inputs.cdskill = function (el) { JM.cdSkill = el.value; JM.render(); };
  JM.forms.addskill = async function (form, d) { await JM.q(JM.sb.from('skills').insert({ name: d.name.trim(), category: d.category || 'core' })); await JM.loadRef(); JM.toast('Added.', 'ok'); JM.render(); };
  JM.actions.toggleskill = async function (el) { await JM.busy(el, async function () { await JM.q(JM.sb.from('skills').update({ active: el.dataset.a !== 'true' }).eq('name', el.dataset.n)); await JM.loadRef(); JM.render(); }); };
  JM.actions.addq = function () {
    JM.modal('<h2>Add question for ' + esc(JM.cdSkill) + '</h2><form data-form="addq" class="mt"><div class="field"><label class="label">Question</label><input type="text" name="question" required></div><div class="field"><label class="label">Answer options (one per line, 2 to 5)</label><textarea name="options" required></textarea></div><div class="field"><label class="label">Number of the correct option (1 is the first line)</label><input type="number" name="answer" min="1" max="5" value="1" required></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn" type="submit">Add</button></div></form>');
  };
  JM.forms.addq = async function (form, d) {
    const opts = d.options.split('\n').map(function (x) { return x.trim(); }).filter(Boolean), ans = Number(d.answer) - 1;
    if (opts.length < 2 || opts.length > 5) return JM.toast('Enter 2 to 5 options.', 'bad'); if (ans < 0 || ans >= opts.length) return JM.toast('The correct option number is out of range.', 'bad');
    await JM.q(JM.sb.from('quiz_questions').insert({ skill: JM.cdSkill, question: d.question.trim(), options: opts, answer: ans })); JM.close(); JM.render();
  };
  JM.actions.delq = function (el) { JM.confirm({ title: 'Delete this question?', text: '', ok: 'Delete', danger: true, onOk: function () { JM.busy(null, async function () { await JM.q(JM.sb.from('quiz_questions').delete().eq('id', el.dataset.id)); JM.render(); }); } }); };
  JM.actions.editrole = async function (el) {
    await JM.busy(el, async function () {
      const id = el.dataset.id, prefill = el.dataset.prefill || '';
      const slug = prefill ? prefill.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '';
      let r = { id: slug, title: prefill, category: (JM.categories || [])[0] || '', level: 'Entry', aliases: [], salary_min: 14000, salary_max: 22000, overview: '', duties: [], growth: [], courses: [], active: true }, rs = [];
      if (id) { r = await JM.q(JM.sb.from('career_roles').select('*').eq('id', id).single()); rs = await JM.q(JM.sb.from('role_skills').select('skill,weight').eq('role_id', id).order('weight', { ascending: false })); }
      const catTa = JM.typeahead({ id: 'adm-cat-ta', name: 'category', value: r.category, label: r.category, allowCustom: true, minChars: 0, placeholder: 'Select or type category…', source: (JM.categories || []).map(function (c) { return { value: c, label: c }; }), required: true });
      JM.modal('<h2>' + (id ? 'Edit role' : 'Add role') + '</h2><form data-form="role" data-id="' + esc(id) + '" class="mt">' +
        (id ? '' : '<div class="field"><label class="label">ID (short, lowercase, hyphens)</label><input type="text" name="id" value="' + esc(r.id) + '" pattern="[a-z0-9-]+" required></div>') +
        '<div class="grid g2"><div class="field"><label class="label">Title</label><input type="text" name="title" value="' + esc(r.title) + '" required></div><div class="field"><label class="label">Category</label>' + catTa + '</div>' +
        '<div class="field"><label class="label">Level</label><select name="level">' + ['Entry', 'Mid', 'Senior', 'Lead'].map(function (l) { return '<option' + ((r.level || 'Entry') === l ? ' selected' : '') + '>' + l + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label class="label">Aliases (comma-separated)</label><input type="text" name="aliases" value="' + esc((r.aliases || []).join(', ')) + '" placeholder="e.g. CSR, Call Center Agent"></div>' +
        '<div class="field"><label class="label">Typical pay, minimum (₱)</label><input type="number" name="salary_min" value="' + r.salary_min + '" min="1" required></div><div class="field"><label class="label">Typical pay, maximum (₱)</label><input type="number" name="salary_max" value="' + r.salary_max + '" min="1" required></div></div>' +
        '<div class="field"><label class="label">Overview</label><textarea name="overview">' + esc(r.overview) + '</textarea></div><div class="field"><label class="label">Duties (one per line)</label><textarea name="duties">' + esc((r.duties || []).join('\n')) + '</textarea></div>' +
        '<div class="field"><label class="label">Skills and weight (one per line: Skill, 25)</label><textarea name="skills">' + esc(rs.map(function (x) { return x.skill + ', ' + x.weight; }).join('\n')) + '</textarea></div>' +
        '<div class="field"><label class="label">Growth path (one per line: Level | Title | min | max)</label><textarea name="growth">' + esc((r.growth || []).map(function (g) { return [g.level, g.title, g.min, g.max].join(' | '); }).join('\n')) + '</textarea></div>' +
        '<div class="field"><label class="label">Courses (one per line: Title | Provider | URL)</label><textarea name="courses">' + esc((r.courses || []).map(function (c) { return [c.title, c.provider, c.url].join(' | '); }).join('\n')) + '</textarea></div>' +
        '<label class="check mb"><input type="checkbox" name="active"' + (r.active ? ' checked' : '') + '><span>Active (visible to job seekers and employers)</span></label><div class="err hide" id="form-err"></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn" type="submit">Save</button></div></form>', 'wide');
    });
  };
  JM.forms.role = async function (form, d) {
    const id = form.dataset.id || d.id, lines = function (s) { return String(s || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean); };
    const growth = lines(d.growth).map(function (l) { const p = l.split('|').map(function (x) { return x.trim(); }); return { level: p[0], title: p[1], min: Number(p[2]), max: Number(p[3]) }; });
    const courses = lines(d.courses).map(function (l) { const p = l.split('|').map(function (x) { return x.trim(); }); return { title: p[0], provider: p[1], url: p[2] }; });
    const skills = lines(d.skills).map(function (l) { const p = l.split(','); return { skill: p[0].trim(), weight: Number(p[1]) || 20 }; });
    const aliases = String(d.aliases || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    const unknown = skills.filter(function (s) { return JM.skillList.indexOf(s.skill) < 0; });
    if (unknown.length) return JM.toast('Unknown skill: ' + unknown[0].skill + '. Add it on the Skills tab first.', 'bad');
    if (Number(d.salary_max) < Number(d.salary_min)) return JM.toast('Maximum pay must be at least the minimum.', 'bad');
    const row = { title: d.title.trim(), category: d.category.trim(), level: d.level || 'Entry', aliases: aliases, salary_min: Number(d.salary_min), salary_max: Number(d.salary_max), overview: d.overview.trim(), duties: lines(d.duties), growth: growth, courses: courses, active: !!d.active };
    if (form.dataset.id) await JM.q(JM.sb.from('career_roles').update(row).eq('id', id)); else await JM.q(JM.sb.from('career_roles').insert(Object.assign({ id: id }, row)));
    await JM.q(JM.sb.from('role_skills').delete().eq('role_id', id));
    if (skills.length) await JM.q(JM.sb.from('role_skills').insert(skills.map(function (s) { return { role_id: id, skill: s.skill, weight: s.weight }; })));
    await JM.loadRef(); JM.close(); JM.toast('Saved.', 'ok'); JM.render();
  };
})();
