/* Employer: registration, overview, jobs, applicants, candidate search, analytics, billing, company. */
(function () {
  const JM = window.JM, ic = JM.icon, esc = JM.esc;
  const BIZ = ['Café / restaurant', 'Retail / store', 'Grocery', 'Hardware / construction', 'Healthcare clinic', 'IT services', 'Logistics', 'Accounting / office services', 'Marketing / creative', 'Customer support', 'School / training', 'Manufacturing', 'Other'];
  const PLAN = { starter: { name: 'Starter', posts: 2 }, growth: { name: 'Growth', posts: 10 }, business: { name: 'Business', posts: Infinity } };
  const JSTAT = { draft: ['Draft', ''], published: ['Live', 'ok'], paused: ['Paused', 'warn'], closed: ['Closed', ''], removed: ['Removed', 'bad'] };
  const ASTAT = { applied: ['New', 'brand'], shortlisted: ['Shortlisted', 'ok'], hired: ['Hired', 'ok'], rejected: ['Rejected', 'bad'] };
  const opts = function (arr, sel) { return arr.map(function (x) { return '<option' + (x === sel ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); };
  const areaOpts = function (sel) { return (JM.areas || []).map(function (a) { return '<option value="' + a.id + '"' + (a.id === sel ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join(''); };
  const lock = function (title, text, plan) { return '<div class="card">' + JM.empty('lock', title, text, '<a class="btn" href="#/employer/billing">Upgrade to ' + plan + '</a>') + '</div>'; };
  const stat = function (n, l) { return '<div class="card stat"><div class="n num">' + n + '</div><div class="l">' + l + '</div></div>'; };

  // ---------- verification documents ----------
  async function uploadDoc(file) {
    if (file.size > 5 * 1024 * 1024) throw new Error('File is larger than 5 MB.');
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['pdf', 'jpg', 'jpeg', 'png'].indexOf(ext) < 0) throw new Error('Upload a PDF, JPG or PNG file.');
    const path = JM.me.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.' + ext;
    const r = await JM.sb.storage.from('verification-docs').upload(path, file, { contentType: file.type || undefined });
    if (r.error) throw r.error; return { path: path, name: file.name };
  }
  JM.docs = {};
  JM.inputs.doc = async function (el) {
    const f = el.files[0]; if (!f) return; const k = el.dataset.kind;
    try { JM.docs[k] = Object.assign({ kind: k }, await uploadDoc(f)); const s = document.getElementById('doc-' + k); if (s) s.innerHTML = ic('check', 15) + esc(f.name); } catch (e) { JM.toast(JM.err(e), 'bad'); el.value = ''; }
  };
  const docPick = function (kind, label) { return '<div class="field"><label class="label">' + label + '</label><input type="file" accept=".pdf,.jpg,.jpeg,.png" data-in="doc" data-kind="' + kind + '"><div class="help row gap-s" id="doc-' + kind + '" style="color:var(--ok)"></div></div>'; };

  // ---------- setup ----------
  JM.route('/employer/setup', { auth: 'employer', plain: true, pre: true, title: 'Register your business', render: function () {
    if (JM.me.employer) { JM.go('/employer'); return ''; } JM.docs = {};
    return '<div class="auth-main" style="min-height:100vh;background:var(--bg);align-items:flex-start"><div style="width:100%;max-width:680px"><a class="brand" href="#/" style="padding:8px 0 22px"><img src="assets/logo.png" alt="">JobMatch</a>' +
      '<h2 style="font-size:24px">Register your business</h2><p class="muted mt mb">We verify every employer by hand so job seekers can trust listings. Review usually takes one business day. You can draft jobs while you wait.</p>' +
      '<form data-form="setup" class="card card-b" novalidate><div class="grid g2"><div class="field"><label class="label">Business name</label><input type="text" name="name" required></div><div class="field"><label class="label">Type of business</label><select name="type">' + opts(BIZ) + '</select></div>' +
      '<div class="field"><label class="label">Area</label><select name="area">' + areaOpts('bin-poblacion') + '</select></div><div class="field"><label class="label">Street address</label><input type="text" name="address" required></div>' +
      '<div class="field"><label class="label">Contact person</label><input type="text" name="cname" value="' + esc(JM.me.full_name) + '" required></div><div class="field"><label class="label">Contact mobile</label><input type="tel" name="cphone" required></div></div>' +
      '<div class="field"><label class="label">Contact email</label><input type="email" name="cemail" required></div><div class="field"><label class="label">About the business</label><textarea name="about" maxlength="600" placeholder="What you do and what working here is like."></textarea></div>' +
      '<div class="divider"></div><h3 class="mb">Verification documents</h3><p class="small muted">PDF, JPG or PNG, up to 5 MB each. Only you and JobMatch administrators can see them.</p><div class="grid g2">' + docPick('Business permit', 'Business permit (Mayor\'s permit or DTI/SEC)') + docPick('Valid ID', 'Owner\'s valid government ID') + '</div>' +
      '<div class="err hide" id="form-err" role="alert"></div><div class="row mt" style="justify-content:space-between"><button type="button" class="btn ghost" data-act="logout">Sign out</button><button class="btn lg" type="submit">Submit for verification</button></div></form></div></div>';
  } });
  JM.forms.setup = async function (form, d) {
    const err = function (m) { const e = form.querySelector('#form-err'); e.textContent = m; e.classList.remove('hide'); };
    if (!d.name.trim() || !d.address.trim() || !d.cname.trim() || !d.cphone.trim() || !/^\S+@\S+\.\S+$/.test(d.cemail || '')) return err('Fill in every required field with valid details.');
    if (!JM.docs['Business permit'] || !JM.docs['Valid ID']) return err('Upload both documents to continue.');
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try {
      JM.me = await JM.rpc('register_employer', { p_name: d.name, p_type: d.type, p_area: d.area, p_address: d.address, p_cname: d.cname, p_cemail: d.cemail, p_cphone: d.cphone, p_about: d.about || '', p_docs: Object.keys(JM.docs).map(function (k) { return { kind: k, path: JM.docs[k].path, name: JM.docs[k].name }; }) });
      JM.go('/employer'); JM.toast('Submitted. We will review your documents shortly.', 'ok');
    } catch (e) { err(JM.err(e)); btn.disabled = false; }
  };
  JM.actions.resubmit = function () {
    JM.docs = {}; JM.modal('<h2>Resubmit documents</h2><p class="muted mt">Upload clear copies of both documents.</p><form data-form="resubmit" class="mt">' + docPick('Business permit', 'Business permit') + docPick('Valid ID', 'Owner\'s valid government ID') + '<div class="row" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn" type="submit">Resubmit</button></div></form>');
  };
  JM.forms.resubmit = async function () {
    if (!JM.docs['Business permit'] || !JM.docs['Valid ID']) return JM.toast('Upload both documents.', 'bad');
    JM.me = await JM.rpc('resubmit_docs', { p_docs: Object.keys(JM.docs).map(function (k) { return { kind: k, path: JM.docs[k].path, name: JM.docs[k].name }; }) }); JM.close(); JM.toast('Resubmitted for review.', 'ok'); JM.render();
  };
  function banner() {
    const e = JM.me.employer;
    if (e.verification_status === 'verified') return '';
    if (e.verification_status === 'rejected') return '<div class="notice bad mb">' + ic('flag') + '<div class="grow"><b>Verification was not approved.</b> ' + esc(e.verification_reason || '') + '</div><button class="btn sm" data-act="resubmit">Resubmit documents</button></div>';
    return '<div class="notice warn mb">' + ic('clock') + '<div><b>Verification pending.</b> You can draft jobs now. Publishing unlocks once an administrator approves your documents.</div></div>';
  }

  // ---------- overview ----------
  JM.route('/employer', { auth: 'employer', title: 'Overview', render: async function () {
    const o = await JM.rpc('employer_overview'), e = JM.me.employer, ranked = e.plan !== 'starter';
    return '<div class="page">' + JM.pageHead('Welcome, ' + esc(e.name), 'Here is what is happening with your hiring.', '<a class="btn" href="#/employer/jobs/new">' + ic('plus', 16) + 'Post a job</a>') + banner() +
      '<div class="grid g4 mb">' + stat(o.live, 'Live jobs') + stat(o.applicants, 'Applicants') + stat(o.matched, 'Shortlisted or hired') + stat(o.views, 'Job views') + '</div>' +
      '<div class="grid g2" style="align-items:start"><div class="card"><div class="card-h"><h3 class="grow">Recent applicants</h3></div>' +
      (o.recent.length ? '<div class="list">' + o.recent.map(function (r) { return '<a class="li" href="#/employer/jobs/' + r.job_id + '/applicants" style="color:inherit">' + JM.avatar(r.name) + '<div class="grow"><div class="bold">' + esc(r.name) + (r.starred ? ' ' + JM.badge('Starred', 'star') : '') + '</div><div class="small muted">' + esc(r.job_title) + ' · ' + JM.ago(r.created_at) + '</div></div>' + (r.score != null ? '<b class="num">' + r.score + '%</b>' : '') + ic('right', 16) + '</a>'; }).join('') + '</div>' : JM.empty('users', 'No applicants yet', 'Publish a job and applicants appear here.')) + '</div>' +
      '<div class="card card-b"><div class="row between"><h3>Your plan</h3>' + JM.badge(PLAN[e.plan].name, e.plan === 'starter' ? '' : 'brand') + '</div><p class="small muted mt">' + (ranked ? 'Applicants are ranked by match score, with starred candidates first.' : 'Applicants are shown in the order received. Upgrade to Growth to rank them by match score.') + '</p><a class="btn secondary" href="#/employer/billing">Plans and billing</a></div></div></div>';
  } });

  // ---------- jobs list ----------
  JM.route('/employer/jobs', { auth: 'employer', title: 'Jobs', render: async function () {
    const jobs = await JM.q(JM.sb.from('jobs').select('id,title,status,type,salary_min,salary_max,posted_at,boosted_until,area_id').eq('employer_id', JM.me.id).order('created_at', { ascending: false }));
    const live = jobs.filter(function (j) { return j.status !== 'draft' && j.status !== 'removed'; });
    const counts = {}; await Promise.all(live.map(async function (j) { try { counts[j.id] = (await JM.rpc('employer_applicants', { p_job: j.id })).items.length; } catch (e) { counts[j.id] = 0; } }));
    const e = JM.me.employer, publishedN = jobs.filter(function (j) { return j.status === 'published'; }).length, lim = PLAN[e.plan].posts;
    const rows = jobs.map(function (j) {
      const s = JSTAT[j.status], boosted = j.boosted_until && new Date(j.boosted_until) > new Date();
      const act = j.status === 'published' ? '<button class="btn secondary sm" data-act="jobstatus" data-id="' + j.id + '" data-s="paused">Pause</button><button class="btn secondary sm" data-act="jobstatus" data-id="' + j.id + '" data-s="closed">Close</button>' :
        j.status === 'removed' ? '' : '<button class="btn sm" data-act="jobstatus" data-id="' + j.id + '" data-s="published">' + (j.status === 'draft' ? 'Publish' : 'Reopen') + '</button>' + (j.status === 'draft' ? '<button class="iconbtn" data-act="jobdel" data-id="' + j.id + '" aria-label="Delete draft" style="width:32px;height:32px">' + ic('trash', 15) + '</button>' : '');
      return '<tr><td><a class="bold" href="#/employer/jobs/' + j.id + '/edit" style="color:var(--ink)">' + esc(j.title) + '</a><div class="xs muted">' + esc(j.type) + ' · ' + JM.salary(j) + '</div></td><td>' + JM.badge(s[0], s[1]) + (boosted ? ' ' + JM.badge('Boosted', 'star') : '') + '</td>' +
        '<td class="num">' + (counts[j.id] != null ? '<a href="#/employer/jobs/' + j.id + '/applicants">' + counts[j.id] + '</a>' : '–') + '</td><td><div class="row gap-s" style="justify-content:flex-end">' + act + '<a class="iconbtn" href="#/employer/jobs/' + j.id + '/edit" aria-label="Edit" style="width:32px;height:32px">' + ic('edit', 15) + '</a></div></td></tr>';
    }).join('');
    return '<div class="page">' + JM.pageHead('Jobs', publishedN + ' of ' + (lim === Infinity ? 'unlimited' : lim) + ' live listings used', '<a class="btn" href="#/employer/jobs/new">' + ic('plus', 16) + 'Post a job</a>') + banner() +
      (jobs.length ? '<div class="card"><div class="tablewrap"><table><thead><tr><th>Job</th><th>Status</th><th>Applicants</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' : '<div class="card">' + JM.empty('briefcase', 'No jobs yet', 'Post your first job. It takes about three minutes.', '<a class="btn" href="#/employer/jobs/new">Post a job</a>') + '</div>') + '</div>';
  } });
  JM.actions.jobstatus = async function (el) {
    await JM.busy(el, async function () {
      const r = await JM.rpc('set_job_status', { p_job: el.dataset.id, p_status: el.dataset.s });
      if (!r.ok) {
        if (r.reason === 'verify_required') return JM.toast('Your business must be verified before publishing.', 'bad');
        if (r.reason === 'plan_limit') return JM.modal('<h2>Listing limit reached</h2><p class="muted mt">Your plan allows ' + r.limit + ' live listings. Pause or close one, or upgrade for more.</p><div class="row mt-l" style="justify-content:flex-end"><button class="btn secondary" data-act="close">Close</button><a class="btn" href="#/employer/billing" data-act="close">See plans</a></div>');
      }
      JM.toast(el.dataset.s === 'published' ? 'Job is live.' : 'Job updated.', 'ok'); JM.render();
    });
  };
  JM.actions.jobdel = function (el) { JM.confirm({ title: 'Delete this draft?', text: 'This cannot be undone.', ok: 'Delete', danger: true, onOk: function () { JM.busy(null, async function () { await JM.q(JM.sb.from('jobs').delete().eq('id', el.dataset.id)); JM.render(); }); } }); };

  // ---------- job form ----------
  const blankJob = function () { return { title: '', role_id: '', category: '', type: 'Full-time', salary_min: '', salary_max: '', area_id: JM.me.employer.area_id, description: '', skills: [] }; };
  function jobForm(j, isNew) {
    JM.jd = j; const cats = JM.categories || [];
    JM.draftRender = function () {
      const d = JM.jd;
      return '<div class="card card-b"><div class="field"><label class="label">Job title</label><input type="text" data-in="jd" data-k="title" value="' + esc(d.title) + '" maxlength="120" placeholder="e.g. Barista"></div>' +
        '<div class="grid g2"><div class="field"><label class="label">Career role</label><select data-in="jdrole"><option value="">Select the closest role</option>' + (JM.roles || []).map(function (r) { return '<option value="' + r.id + '"' + (d.role_id === r.id ? ' selected' : '') + '>' + esc(r.title) + '</option>'; }).join('') + '</select><div class="help">Lets applicants see a skill gap and roadmap for this job.</div></div>' +
        '<div class="field"><label class="label">Category</label><select data-in="jd" data-k="category"><option value="">Select</option>' + cats.map(function (c) { return '<option' + (d.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label class="label">Job type</label><select data-in="jd" data-k="type">' + opts(JM.TYPES, d.type) + '</select></div><div class="field"><label class="label">Location</label><select data-in="jd" data-k="area_id">' + areaOpts(d.area_id) + '</select></div>' +
        '<div class="field"><label class="label">Minimum pay (₱ per month)</label><input type="number" data-in="jd" data-k="salary_min" value="' + esc(d.salary_min) + '" min="1" step="500"></div><div class="field"><label class="label">Maximum pay (₱ per month)</label><input type="number" data-in="jd" data-k="salary_max" value="' + esc(d.salary_max) + '" min="1" step="500"></div></div>' +
        '<div class="field"><label class="label">Description</label><textarea data-in="jd" data-k="description" style="min-height:140px" maxlength="5000" placeholder="What the person will do, hours, and what you are looking for.">' + esc(d.description) + '</textarea></div>' +
        '<div class="field"><label class="label">Skills needed (up to 8)</label><div class="chips" style="max-height:170px;overflow:auto">' + (JM.skillList || []).map(function (s) { return '<button type="button" class="chip' + (d.skills.indexOf(s) >= 0 ? ' on' : '') + '" data-act="jskill" data-v="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') + '</div><div class="help">' + d.skills.length + ' selected. Skills drive 55% of every applicant\'s match score.</div></div>' +
        '<div class="err hide" id="form-err" role="alert"></div><div class="row wrap" style="justify-content:flex-end"><a class="btn ghost" href="#/employer/jobs">Cancel</a><button class="btn secondary" data-act="jobsave" data-publish="0">Save draft</button><button class="btn" data-act="jobsave" data-publish="1">' + (isNew || j.status === 'draft' ? 'Publish' : 'Save changes') + '</button></div></div>';
    };
    return '<div class="page narrow">' + JM.pageHead(isNew ? 'Post a job' : 'Edit job') + banner() + '<div id="draft-root">' + JM.draftRender() + '</div></div>';
  }
  JM.inputs.jd = function (el) { JM.jd[el.dataset.k] = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value; };
  JM.inputs.jdrole = async function (el) {
    JM.jd.role_id = el.value; if (!el.value) return;
    const r = (JM.roles || []).find(function (x) { return x.id === el.value; }); if (r && !JM.jd.category) JM.jd.category = r.category; if (r && !JM.jd.title) JM.jd.title = r.title;
    if (!JM.jd.skills.length) { try { const rs = await JM.q(JM.sb.from('role_skills').select('skill,weight').eq('role_id', el.value).order('weight', { ascending: false }).limit(6)); JM.jd.skills = rs.map(function (x) { return x.skill; }); } catch (e) { /* ignore */ } }
    JM.drawDraft();
  };
  JM.actions.jskill = function (el) { const a = JM.jd.skills, i = a.indexOf(el.dataset.v); if (i >= 0) a.splice(i, 1); else if (a.length < 8) a.push(el.dataset.v); else JM.toast('Pick up to 8 skills.'); JM.drawDraft(); };
  JM.route('/employer/jobs/new', { auth: 'employer', title: 'Post a job', render: function () { return jobForm(blankJob(), true); } });
  JM.route('/employer/jobs/:id/edit', { auth: 'employer', title: 'Edit job', render: async function (p) {
    const j = await JM.q(JM.sb.from('jobs').select('*').eq('id', p.id).eq('employer_id', JM.me.id).maybeSingle());
    if (!j) return '<div class="page narrow">' + JM.empty('briefcase', 'Job not found', '', '<a class="btn" href="#/employer/jobs">Back to jobs</a>') + '</div>';
    return jobForm(j, false);
  } });
  JM.actions.jobsave = async function (el) {
    const d = JM.jd, publish = el.dataset.publish === '1', box = document.getElementById('form-err');
    const bad = function (m) { box.textContent = m; box.classList.remove('hide'); box.scrollIntoView({ block: 'center' }); };
    if (String(d.title).trim().length < 3) return bad('Enter a job title.');
    if (!d.category) return bad('Choose a category.');
    if (!d.salary_min || !d.salary_max || d.salary_max < d.salary_min) return bad('Enter a valid pay range (maximum must be at least the minimum).');
    if (String(d.description).trim().length < 20) return bad('Describe the job in at least 20 characters.');
    if (!d.skills.length) return bad('Pick at least one skill.');
    await JM.busy(el, async function () {
      const row = { title: d.title.trim(), role_id: d.role_id || null, category: d.category, type: d.type, salary_min: d.salary_min, salary_max: d.salary_max, area_id: d.area_id, description: d.description.trim(), skills: d.skills };
      let id = d.id;
      if (id) await JM.q(JM.sb.from('jobs').update(row).eq('id', id));
      else { const r = await JM.q(JM.sb.from('jobs').insert(Object.assign({ employer_id: JM.me.id }, row)).select('id').single()); id = r.id; }
      if (publish && (!d.status || d.status === 'draft' || d.status === 'paused' || d.status === 'closed')) {
        const r = await JM.rpc('set_job_status', { p_job: id, p_status: 'published' });
        if (!r.ok) { JM.toast(r.reason === 'verify_required' ? 'Saved as a draft. Publishing unlocks after verification.' : 'Saved as a draft. You reached your live listing limit.', 'bad'); return JM.go('/employer/jobs'); }
        JM.toast('Job is live.', 'ok');
      } else JM.toast('Saved.', 'ok');
      JM.go('/employer/jobs');
    });
  };

  // ---------- applicants ----------
  JM.sel = {};
  JM.route('/employer/jobs/:id/applicants', { auth: 'employer', title: 'Applicants', render: async function (p) {
    const job = await JM.q(JM.sb.from('jobs').select('id,title').eq('id', p.id).eq('employer_id', JM.me.id).maybeSingle());
    if (!job) return '<div class="page">' + JM.empty('briefcase', 'Job not found', '', '<a class="btn" href="#/employer/jobs">Back to jobs</a>') + '</div>';
    const r = await JM.rpc('employer_applicants', { p_job: p.id }); JM.sel = {}; JM.apps = r.items; JM.appJob = p.id; JM.filterStatus = JM.filterStatus || 'all';
    JM.appRanked = r.ranked;
    return '<div class="page"><a class="small row gap-s" href="#/employer/jobs" style="margin-bottom:14px">' + ic('left', 16) + 'Jobs</a>' + JM.pageHead(esc(job.title), r.items.length + ' applicants' + (r.ranked ? ', ranked by match score' : ''), '') +
      (!r.ranked ? '<div class="notice mb">' + ic('sparkle') + '<span>Applicants are in the order received. <a href="#/employer/billing">Upgrade to Growth</a> to rank them by match score and see starred candidates first.</span></div>' : '') +
      '<div class="tabs" id="app-tabs">' + [['all', 'All'], ['applied', 'New'], ['shortlisted', 'Shortlisted'], ['hired', 'Hired'], ['rejected', 'Rejected']].map(function (t) { return '<button data-act="afilter" data-s="' + t[0] + '" class="' + (JM.filterStatus === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div class="row mb hide" id="sel-bar"></div><div id="app-list"></div></div>';
  }, after: function () { drawApps(); } });
  function drawApps() {
    const box = document.getElementById('app-list'); if (!box) return;
    const items = JM.apps.filter(function (a) { return JM.filterStatus === 'all' || a.status === JM.filterStatus; });
    if (!items.length) { box.innerHTML = '<div class="card">' + JM.empty('users', 'No applicants here', JM.apps.length ? 'Try another tab.' : 'Applicants appear as soon as someone applies.') + '</div>'; return; }
    box.innerHTML = '<div class="card list">' + items.map(function (a) {
      const st = ASTAT[a.status];
      return '<div class="li">' + (a.status === 'applied' ? '<input type="checkbox" data-act="selapp" data-id="' + a.id + '" aria-label="Select applicant"' + (JM.sel[a.id] ? ' checked' : '') + '>' : '<span style="width:17px"></span>') +
        '<button class="row grow" data-act="openapp" data-id="' + a.id + '" style="background:none;border:0;text-align:left;gap:12px;padding:0">' + JM.avatar(a.name) + '<div class="grow"><div class="bold">' + esc(a.name) + (a.starred ? ' ' + JM.badge('Starred', 'star') : '') + (a.viewed ? '' : ' ' + JM.badge('New', 'brand')) + '</div><div class="small muted">' + esc((a.skills || []).slice(0, 4).join(', ')) + ' · ' + esc(JM.area(a.area_id)) + ' · ' + JM.ago(a.created_at) + '</div></div></button>' +
        (a.score != null ? '<b class="num" style="min-width:42px;text-align:right">' + a.score + '%</b>' : '') + JM.badge(st[0], st[1]) + '</div>';
    }).join('') + '</div>';
  }
  JM.actions.afilter = function (el) { JM.filterStatus = el.dataset.s; document.querySelectorAll('#app-tabs button').forEach(function (b) { b.classList.toggle('on', b === el); }); drawApps(); };
  JM.actions.selapp = function (el) {
    if (el.checked) JM.sel[el.dataset.id] = 1; else delete JM.sel[el.dataset.id];
    const n = Object.keys(JM.sel).length, bar = document.getElementById('sel-bar'); bar.classList.toggle('hide', !n);
    bar.innerHTML = '<b>' + n + ' selected</b><button class="btn sm" data-act="bulk" data-s="shortlisted">Shortlist</button><button class="btn secondary sm danger" data-act="bulk" data-s="rejected">Reject</button>';
  };
  JM.actions.bulk = function (el) {
    const ids = Object.keys(JM.sel), s = el.dataset.s;
    JM.confirm({ title: (s === 'shortlisted' ? 'Shortlist ' : 'Reject ') + ids.length + ' applicants?', text: s === 'shortlisted' ? 'They are notified, you see their full profile and contact details, and a chat opens.' : 'They are notified that they were not selected.', ok: s === 'shortlisted' ? 'Shortlist' : 'Reject', danger: s === 'rejected',
      onOk: function () { JM.busy(null, async function () { for (const id of ids) { try { await JM.rpc('set_application_status', { p_app: id, p_status: s }); } catch (e) { /* skip */ } } JM.toast('Updated ' + ids.length + ' applicants.', 'ok'); JM.render(); }); } });
  };
  JM.actions.openapp = async function (el) {
    await JM.busy(el, async function () {
      const a = await JM.rpc('employer_application', { p_app: el.dataset.id }); JM.curApp = a;
      const lvl = function (l) { return l >= 90 ? 'Advanced' : l >= 60 ? 'Intermediate' : 'Beginner'; };
      const exp = (a.experience || []).map(function (x) { return '<div class="row" style="padding:6px 0"><span class="grow"><b>' + esc(x.role || '') + '</b> <span class="muted">' + esc(x.org || '') + '</span></span><span class="small muted">' + esc(x.years || '') + ' yr</span></div>'; }).join('') || '<span class="muted small">No experience listed.</span>';
      const next = a.status === 'applied' ? '<button class="btn" data-act="appstatus" data-s="shortlisted">Shortlist</button><button class="btn secondary danger" data-act="appstatus" data-s="rejected">Reject</button>' : a.status === 'shortlisted' ? '<button class="btn ok" data-act="appstatus" data-s="hired">Mark as hired</button><button class="btn secondary danger" data-act="appstatus" data-s="rejected">Reject</button>' : '';
      const st = ASTAT[a.status];
      JM.drawer('<div class="row" style="align-items:flex-start">' + JM.avatar(a.name, 'lg') + '<div class="grow"><h2>' + esc(a.name) + '</h2><div class="small muted">' + esc(a.job.title) + ' · applied ' + JM.ago(a.created_at) + '</div><div class="row gap-s mt">' + JM.badge(st[0], st[1]) + (a.starred ? JM.badge('Starred top choice', 'star') : '') + '</div></div><button class="iconbtn" data-act="close" aria-label="Close">' + ic('x') + '</button></div>' +
        (a.score != null ? '<div class="card flat card-b mt">' + '<div class="row">' + JM.ring(a.score, 56, '#0C70F8') + '<div class="grow"><b>Match score</b><div class="small muted">' + esc(((a.why || []).slice(0, 3)).join(', ')) + '</div></div></div>' + ((a.missing || []).length ? '<p class="small muted mt" style="margin:10px 0 0">Missing: ' + a.missing.map(esc).join(', ') + '</p>' : '') + '</div>' : '<div class="notice mt">' + ic('lock') + '<span>Match score and ranking come with the Growth plan.</span></div>') +
        '<h4 class="mt-l mb">Skills</h4><div class="chips">' + a.skills.map(function (s) { return '<span class="badge ' + (a.job.skills.indexOf(s.name) >= 0 ? 'ok' : '') + '">' + esc(s.name) + ' · ' + lvl(s.level) + '</span>'; }).join('') + '</div>' +
        '<h4 class="mt-l mb">Education</h4><p class="small" style="margin:0">' + esc([a.education.level, a.education.course, a.education.school].filter(Boolean).join(' · ') || 'Not provided') + '</p>' +
        '<h4 class="mt-l mb">Experience</h4>' + exp + (a.resume_summary ? '<h4 class="mt-l mb">Summary</h4><p class="small" style="margin:0;white-space:pre-wrap">' + esc(a.resume_summary) + '</p>' : '') +
        '<div class="divider"></div>' + (a.named ? '<h4 class="mb">Contact</h4><div class="small col gap-s"><div>' + esc(a.contact.full_name) + (a.age ? ' · ' + a.age + ' years old' : '') + (a.gender ? ' · ' + esc(a.gender) : '') + '</div>' + (a.contact.phone ? '<div>' + esc(a.contact.phone) + '</div>' : '') + (a.contact.email ? '<div><a href="mailto:' + esc(a.contact.email) + '">' + esc(a.contact.email) + '</a></div>' : '') + '</div>' + (a.resume_path ? '<button class="btn secondary sm mt" data-act="resumedl" data-path="' + esc(a.resume_path) + '">' + ic('download', 15) + 'Download résumé</button>' : '') :
          '<div class="notice">' + ic('shield') + '<span>Full name, age, contact details and résumé file are hidden until you shortlist this applicant. This keeps hiring fair.</span></div>') +
        '<div class="row wrap mt-l">' + next + (a.conversation_id ? '<a class="btn secondary" href="#/messages/' + a.conversation_id + '" data-act="close">' + ic('chat', 16) + 'Message</a>' : '') + '</div>');
      if (JM.apps) { const x = JM.apps.find(function (q) { return q.id === a.id; }); if (x) { x.viewed = true; drawApps(); } }
    });
  };
  JM.actions.appstatus = function (el) {
    const s = el.dataset.s, a = JM.curApp;
    JM.confirm({ title: s === 'shortlisted' ? 'Shortlist this applicant?' : s === 'hired' ? 'Mark as hired?' : 'Reject this applicant?', text: s === 'shortlisted' ? 'They are notified, you see their full profile and contact details, and a chat opens.' : s === 'hired' ? 'They are notified. Close the job if the position is filled.' : 'They are notified that they were not selected.', ok: s === 'rejected' ? 'Reject' : 'Confirm', danger: s === 'rejected',
      onOk: function () { JM.busy(null, async function () { await JM.rpc('set_application_status', { p_app: a.id, p_status: s }); JM.toast('Updated.', 'ok'); JM.close(); JM.render(); }); } });
  };
  JM.actions.resumedl = async function (el) {
    await JM.busy(el, async function () { const r = await JM.sb.storage.from('resumes').createSignedUrl(el.dataset.path, 120); if (r.error) throw r.error; window.open(r.data.signedUrl, '_blank', 'noopener'); });
  };

  // ---------- candidate search ----------
  JM.route('/employer/candidates', { auth: 'employer', title: 'Candidate search', render: async function () {
    const e = JM.me.employer; if (e.plan !== 'business') return '<div class="page">' + JM.pageHead('Candidate search', 'Find candidates who opted in and invite them to apply.') + lock('Candidate search is a Business feature', 'Search opted-in candidates by skill and area, see how well they fit your job, and invite them to apply.', 'Business') + '</div>';
    const jobs = await JM.q(JM.sb.from('jobs').select('id,title').eq('employer_id', JM.me.id).eq('status', 'published'));
    JM.cs = { jobs: jobs };
    return '<div class="page">' + JM.pageHead('Candidate search', 'These candidates chose to be discoverable. You see a masked name and skills until they apply and you shortlist them.') +
      '<form data-form="csearch" class="card card-b mb"><div class="grid g3"><div class="field" style="margin:0"><label class="label">Skill</label><input type="search" name="q" placeholder="e.g. Customer service"></div><div class="field" style="margin:0"><label class="label">Area</label><select name="area"><option value="">Anywhere in Biñan</option>' + areaOpts('') + '</select></div><div class="field" style="margin:0"><label class="label">Rank against job</label><select name="job"><option value="">No job selected</option>' + jobs.map(function (j) { return '<option value="' + j.id + '">' + esc(j.title) + '</option>'; }).join('') + '</select></div></div><div class="row mt" style="justify-content:flex-end"><button class="btn" type="submit">' + ic('search', 16) + 'Search</button></div></form><div id="cs-out"></div></div>';
  }, after: function () { if (JM.me.employer.plan === 'business') JM.forms.csearch(document.querySelector('[data-form=csearch]'), { q: '', area: '', job: '' }); } });
  JM.forms.csearch = async function (form, d) {
    const out = document.getElementById('cs-out'); out.innerHTML = '<div class="skel" style="height:120px"></div>';
    const r = await JM.rpc('candidate_search', { p_q: d.q || '', p_area: d.area || '', p_job: d.job || null }); JM.cs.job = d.job || null;
    out.innerHTML = r.length ? '<div class="grid g2">' + r.map(function (c) {
      return '<div class="card card-b"><div class="row" style="align-items:flex-start">' + JM.avatar(c.name) + '<div class="grow"><b>' + esc(c.name) + '</b><div class="small muted">' + esc(JM.area(c.area_id)) + (c.education ? ' · ' + esc(c.education) : '') + '</div></div>' + (c.score != null ? '<b class="num">' + c.score + '%</b>' : '') + '</div><div class="chips mt">' + c.skills.slice(0, 6).map(function (s) { return JM.badge(s.name); }).join('') + '</div>' +
        '<div class="mt">' + (c.invited ? '<span class="badge ok">Invited</span>' : '<button class="btn secondary sm" data-act="invite" data-id="' + c.id + '">Invite to apply</button>') + '</div></div>';
    }).join('') + '</div>' : '<div class="card">' + JM.empty('search', 'No candidates found', 'Try a different skill or area.') + '</div>';
  };
  JM.actions.invite = async function (el) {
    if (!JM.cs.job) return JM.toast('Pick a job in "Rank against job" first, then invite.', 'bad');
    await JM.busy(el, async function () { await JM.rpc('invite_candidate', { p_seeker: el.dataset.id, p_job: JM.cs.job }); el.outerHTML = '<span class="badge ok">Invited</span>'; JM.toast('Invitation sent.', 'ok'); });
  };

  // ---------- analytics ----------
  JM.route('/employer/analytics', { auth: 'employer', title: 'Analytics', render: async function () {
    if (JM.me.employer.plan === 'starter') return '<div class="page">' + JM.pageHead('Analytics', 'See how each listing performs.') + lock('Analytics come with Growth', 'Track views, saves, stars, applications and matches for every listing.', 'Growth') + '</div>';
    const rows = await JM.rpc('employer_analytics'), mx = Math.max.apply(null, [1].concat(rows.map(function (r) { return r.views; })));
    return '<div class="page">' + JM.pageHead('Analytics', 'How seekers react to your listings.') + (rows.length ? '<div class="card mb"><div class="card-h"><h3>Funnel by listing</h3></div><div class="tablewrap"><table><thead><tr><th>Listing</th><th class="num">Views</th><th class="num">Passed</th><th class="num">Saved</th><th class="num">Starred</th><th class="num">Applied</th><th class="num">Matched</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td><b>' + esc(r.title) + '</b> ' + JM.badge(r.status === 'published' ? 'Live' : r.status) + '</td><td class="num">' + r.views + '</td><td class="num">' + r.left + '</td><td class="num">' + r.right + '</td><td class="num">' + r.star + '</td><td class="num">' + r.applications + '</td><td class="num">' + r.matched + '</td></tr>'; }).join('') + '</tbody></table></div></div>' +
      '<div class="card card-b"><h3 class="mb">Views per listing</h3>' + rows.map(function (r) { return '<div class="skill"><div class="row between small"><span>' + esc(r.title) + '</span><b class="num">' + r.views + '</b></div>' + JM.bar(Math.round(r.views / mx * 100)) + '</div>'; }).join('') + '</div>' : '<div class="card">' + JM.empty('chart', 'No data yet', 'Publish a job to start collecting insights.') + '</div>') + '</div>';
  } });

  // ---------- billing ----------
  JM.route('/employer/billing', { auth: 'employer', title: 'Plans and billing', render: async function () {
    const e = JM.me.employer, jobs = await JM.q(JM.sb.from('jobs').select('id,title,boosted_until').eq('employer_id', JM.me.id).eq('status', 'published')), pays = await JM.q(JM.sb.from('payments').select('*').order('created_at', { ascending: false }).limit(12));
    const li = function (t) { return '<li style="display:flex;gap:8px">' + ic('check', 16) + '<span>' + t + '</span></li>'; };
    const card = function (k, price, perks, item) {
      const cur = e.plan === k;
      return '<div class="card price' + (k === 'growth' ? ' pop' : '') + '"><div class="row between"><b>' + PLAN[k].name + '</b>' + (cur ? JM.badge('Current plan', 'ok') : '') + '</div><div class="amt">' + price + '</div><ul>' + perks.map(li).join('') + '</ul>' +
        (cur ? '<button class="btn secondary block" disabled>' + (e.plan_renews_at ? 'Renews ' + JM.date(e.plan_renews_at) : 'Free forever') + '</button>' : k === 'starter' ? '<div class="small muted center">Your plan returns to Starter when a paid plan ends.</div>' : '<button class="btn block" data-act="buy" data-item="' + item + '" data-label="' + PLAN[k].name + ' plan (monthly)" data-amount="' + (k === 'growth' ? 1499 : 3999) + '">' + (e.plan === 'business' && k === 'growth' ? 'Switch to Growth' : 'Choose ' + PLAN[k].name) + '</button>') + '</div>';
    };
    const boostable = jobs.map(function (j) { const on = j.boosted_until && new Date(j.boosted_until) > new Date(); return '<div class="li"><div class="grow"><b>' + esc(j.title) + '</b><div class="small muted">' + (on ? 'Boosted until ' + JM.date(j.boosted_until) : 'Not boosted') + '</div></div><button class="btn secondary sm" data-act="buy" data-item="boost" data-job="' + j.id + '" data-label="Boost: ' + esc(j.title) + '" data-amount="299">' + (on ? 'Extend 7 days' : 'Boost for ₱299') + '</button></div>'; }).join('');
    return '<div class="page">' + JM.pageHead('Plans and billing', 'Prices in Philippine pesos. Cancel any time.') +
      '<div class="grid g3 mb">' + card('starter', '₱0', ['2 active listings', 'Applicants in order received', 'Verified badge'], '') + card('growth', '₱1,499<span class="small muted" style="font-weight:500"> / mo</span>', ['10 active listings', 'Ranked applicants and match scores', 'Starred candidates first', 'Listing analytics'], 'employer_growth') + card('business', '₱3,999<span class="small muted" style="font-weight:500"> / mo</span>', ['Unlimited listings', 'Candidate search and invites', 'Everything in Growth'], 'employer_business') + '</div>' +
      '<div class="card mb"><div class="card-h"><h3>Boost a listing</h3><span class="small muted">Top of every deck for 7 days. ₱299.</span></div>' + (jobs.length ? '<div class="list">' + boostable + '</div>' : '<div class="card-b small muted">Publish a job to boost it.</div>') + '</div>' +
      '<div class="card"><div class="card-h"><h3>Payment history</h3></div>' + (pays.length ? '<div class="tablewrap"><table><tbody>' + pays.map(function (p) { return '<tr><td>' + JM.date(p.created_at) + '</td><td>' + esc(p.item) + '</td><td class="xs muted">' + esc(p.provider_ref) + '</td><td>' + JM.badge(p.status, p.status === 'paid' ? 'ok' : '') + '</td><td style="text-align:right">' + JM.peso(p.amount) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="card-b small muted">No payments yet.</div>') + '</div>' +
      (JM.cfg.paymentsMode !== 'live' ? '<p class="small muted mt">Billing is in test mode in this version. Upgrades are recorded but no money moves.</p>' : '') + '</div>';
  } });

  // ---------- company ----------
  JM.route('/employer/company', { auth: 'employer', title: 'Company and team', render: async function () {
    const e = JM.me.employer, team = await JM.q(JM.sb.from('employer_team').select('*').eq('employer_id', JM.me.id).order('name')), n = e.notif || {};
    const sw = function (k, t) { return '<label class="row" style="padding:12px 0;border-top:1px solid var(--line)"><b class="grow">' + t + '</b><span class="switch"><input type="checkbox" data-act="enotif" data-k="' + k + '"' + (n[k] !== false ? ' checked' : '') + '><i></i></span></label>'; };
    return '<div class="page narrow">' + JM.pageHead('Company and team') +
      '<div class="card mb"><div class="card-h"><h3 class="grow">Business profile</h3>' + (e.verification_status === 'verified' ? JM.badge('Verified', 'ok') : JM.badge(e.verification_status === 'pending' ? 'Pending review' : 'Not approved', e.verification_status === 'pending' ? 'warn' : 'bad')) + '</div><form data-form="company" class="card-b"><div class="grid g2"><div class="field"><label class="label">Business name</label><input type="text" name="name" value="' + esc(e.name) + '" required></div><div class="field"><label class="label">Type</label><select name="type">' + opts(BIZ, e.type) + '</select></div>' +
      '<div class="field"><label class="label">Area</label><select name="area_id">' + areaOpts(e.area_id) + '</select></div><div class="field"><label class="label">Address</label><input type="text" name="address" value="' + esc(e.address) + '"></div>' +
      '<div class="field"><label class="label">Contact person</label><input type="text" name="contact_name" value="' + esc(e.contact_name) + '"></div><div class="field"><label class="label">Contact mobile</label><input type="tel" name="contact_phone" value="' + esc(e.contact_phone) + '"></div></div>' +
      '<div class="field"><label class="label">Contact email</label><input type="email" name="contact_email" value="' + esc(e.contact_email) + '"></div><div class="field"><label class="label">About</label><textarea name="about" maxlength="600">' + esc(e.about) + '</textarea></div><button class="btn" type="submit">Save changes</button></form></div>' +
      '<div class="card mb"><div class="card-h"><h3 class="grow">Team</h3><button class="btn secondary sm" data-act="addmember">' + ic('plus', 15) + 'Add member</button></div><div class="list">' + team.map(function (t) { return '<div class="li">' + JM.avatar(t.name) + '<div class="grow"><b>' + esc(t.name) + '</b><div class="small muted">' + esc(t.email) + '</div></div>' + JM.badge(t.role) + (t.role === 'Owner' ? '' : '<button class="iconbtn" data-act="rmmember" data-id="' + t.id + '" aria-label="Remove ' + esc(t.name) + '" style="width:32px;height:32px">' + ic('trash', 15) + '</button>') + '</div>'; }).join('') + '</div><div class="card-b small muted">Team members are listed for your reference. They sign in with their own JobMatch accounts in a future update.</div></div>' +
      '<div class="card mb"><div class="card-h"><h3>Notifications</h3></div><div class="card-b" style="padding-top:0">' + sw('applicants', 'New applicants') + sw('messages', 'New messages') + sw('weekly', 'Weekly summary') + '</div></div>' + JM.accountCards() + '</div>';
  } });
  JM.forms.company = async function (form, d) {
    await JM.q(JM.sb.from('employers').update({ name: d.name.trim(), type: d.type, area_id: d.area_id, address: d.address.trim(), contact_name: d.contact_name.trim(), contact_phone: d.contact_phone.trim(), contact_email: d.contact_email.trim(), about: d.about.trim() }).eq('user_id', JM.me.id));
    await JM.loadMe(); JM.toast('Saved.', 'ok');
  };
  JM.actions.enotif = async function (el) { const n = Object.assign({}, JM.me.employer.notif || {}); n[el.dataset.k] = el.checked; try { await JM.q(JM.sb.from('employers').update({ notif: n }).eq('user_id', JM.me.id)); JM.me.employer.notif = n; } catch (e) { el.checked = !el.checked; JM.toast(JM.err(e), 'bad'); } };
  JM.actions.addmember = function () { JM.modal('<h2>Add team member</h2><form data-form="member" class="mt"><div class="field"><label class="label">Name</label><input type="text" name="name" required></div><div class="field"><label class="label">Email</label><input type="email" name="email" required></div><div class="field"><label class="label">Role</label><select name="role"><option>Recruiter</option><option>Admin</option></select></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn" type="submit">Add</button></div></form>'); };
  JM.forms.member = async function (form, d) { await JM.q(JM.sb.from('employer_team').insert({ employer_id: JM.me.id, name: d.name.trim(), email: d.email.trim(), role: d.role })); JM.close(); JM.render(); };
  JM.actions.rmmember = async function (el) { await JM.busy(el, async function () { await JM.q(JM.sb.from('employer_team').delete().eq('id', el.dataset.id)); JM.render(); }); };
  JM.route('/employer/help', { auth: 'employer', title: 'Help', render: function () { return JM.helpPage('employer'); } });
})();
