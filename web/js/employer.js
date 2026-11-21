/* Employer: registration, overview, jobs, applicants, candidate search, analytics, billing, company. */
(function () {
  const JM = window.JM, ic = JM.icon, esc = JM.esc;
  const BIZ_ITEMS = [
    ['Retail / store', 'Retail'], ['Grocery / supermarket', 'Retail'], ['Hardware / construction supply', 'Retail'], ['Pharmacy / drugstore', 'Retail'], ['E-commerce / online shop', 'Retail'],
    ['Café / restaurant', 'Food & Beverage'], ['Bakery / pastry shop', 'Food & Beverage'], ['Fast food / commissary', 'Food & Beverage'], ['Catering / events', 'Food & Beverage'],
    ['BPO / contact center', 'BPO & IT'], ['IT services / software', 'BPO & IT'], ['Digital / creative agency', 'BPO & IT'],
    ['Manufacturing / electronics', 'Manufacturing'], ['Food manufacturing', 'Manufacturing'], ['Packaging / assembly', 'Manufacturing'],
    ['Healthcare clinic', 'Healthcare'], ['Dental clinic', 'Healthcare'], ['Hospital / diagnostics', 'Healthcare'],
    ['School / university', 'Education'], ['Training center / tutorial', 'Education'],
    ['Construction / engineering', 'Construction'], ['Real estate / property', 'Construction'],
    ['Logistics / trucking', 'Logistics'], ['Warehousing / courier', 'Logistics'],
    ['Accounting / office services', 'Professional Services'], ['Legal / consulting', 'Professional Services'], ['HR / staffing', 'Professional Services'], ['Beauty salon / spa / wellness', 'Professional Services'],
    ['Government / LGU', 'Government / NGO'], ['Non-profit / NGO', 'Government / NGO']
  ].map(function (x) { return { value: x[0], label: x[0], group: x[1] }; });
  const SETUPS = ['On-site', 'Hybrid', 'Remote'];
  const SETUP_HELP = {
    'On-site': 'Work at your business location',
    'Hybrid': 'Mix of on-site and remote',
    'Remote': 'Work from anywhere'
  };
  const PLAN = { starter: { name: 'Starter', posts: 2 }, growth: { name: 'Growth', posts: 10 }, business: { name: 'Business', posts: Infinity } };
  const JSTAT = { draft: ['Draft', ''], published: ['Live', 'ok'], paused: ['Paused', 'warn'], closed: ['Closed', ''], removed: ['Removed', 'bad'] };
  const ASTAT = { applied: ['New', 'brand'], shortlisted: ['Shortlisted', 'ok'], hired: ['Hired', 'ok'], rejected: ['Rejected', 'bad'] };
  const opts = function (arr, sel) { return arr.map(function (x) { return '<option' + (x === sel ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); };
  const lock = function (title, text, plan) { return '<div class="card">' + JM.empty('lock', title, text, '<a class="btn" href="#/employer/billing">Upgrade to ' + plan + '</a>') + '</div>'; };
  const stat = function (n, l) { return '<div class="card stat"><div class="n num">' + n + '</div><div class="l">' + l + '</div></div>'; };

  // ---------- verification documents ----------
  async function uploadDoc(file) {
    if (JM.isHeic(file)) throw new Error(JM.HEIC_MSG);
    if (file.size > 5 * 1024 * 1024) throw new Error('File is larger than 5 MB.');
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['pdf', 'jpg', 'jpeg', 'png'].indexOf(ext) < 0) throw new Error('Upload a PDF, JPG or PNG file.');
    const path = JM.me.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.' + ext;
    const r = await JM.sb.storage.from('verification-docs').upload(path, file, { contentType: file.type || undefined });
    if (r.error) throw r.error;
    if (ext !== 'pdf') await JM.seedUrl('verification-docs', path);
    return { path: path, name: file.name };
  }
  JM.docs = {};
  JM.inputs.doc = async function (el) {
    const f = (el._pvExtra && el._pvExtra.file) || el.files[0]; if (!f) return; const k = el.dataset.kind;
    const blobUrl = el._pvExtra && el._pvExtra.blobUrl;
    try { JM.docs[k] = Object.assign({ kind: k }, await uploadDoc(f)); const s = document.getElementById('doc-' + k); if (s) s.innerHTML = ic('check', 15) + esc(f.name); } catch (e) { JM.toast(JM.err(e), 'bad'); }
    finally { if (blobUrl) URL.revokeObjectURL(blobUrl); el.value = ''; }
  };
  const docPick = function (kind, label) { return '<div class="field"><label class="label">' + label + '</label>' + JM.uploadBtn({ in: 'doc', kind: kind, target: 'vdoc', label: 'Upload ' + label, hint: 'PDF, JPG or PNG · max 5 MB · preview before saving', preview: 'Preview: ' + label }) + '<div class="help row gap-s" id="doc-' + kind + '" style="color:var(--ok)"></div></div>'; };
  const nextBill = function (e) {
    if (!e.plan_renews_at) return null;
    const d = new Date(e.plan_renews_at), now = new Date(), cap = new Date(now);
    cap.setMonth(cap.getMonth() + 1); cap.setDate(cap.getDate() + 1);
    if (d > cap || d < now) { const n = new Date(now); n.setMonth(n.getMonth() + 1); return n; }
    return d;
  };

  // ---------- setup ----------
  JM.route('/employer/setup', { auth: 'employer', plain: true, pre: true, title: 'Register your business', render: function () {
    if (JM.me.employer) { JM.go('/employer'); return ''; } JM.docs = {};
    const bizTa = JM.typeahead({ id: 'setup-biz-ta', name: 'type', value: '', allowCustom: true, minChars: 0, placeholder: 'Select or type business type (e.g. Café, Retail, BPO)…', source: BIZ_ITEMS, required: true });
    const areaTa = JM.typeahead({ id: 'setup-area-ta', name: 'area', value: 'bin-poblacion', label: JM.area('bin-poblacion'), minChars: 0, placeholder: 'Type city or barangay…', source: JM.areaItems || [], required: true });
    return '<div class="auth-main" style="min-height:100vh;background:var(--bg);align-items:flex-start"><div style="width:100%;max-width:680px"><a class="brand" href="#/" style="padding:8px 0 22px"><img src="assets/logo.png" alt="">JobMatch</a>' +
      '<h2 style="font-size:24px">Register your business</h2><p class="muted mt mb">We verify every employer by hand so job seekers can trust listings. Review usually takes one business day. You can draft jobs while you wait.</p>' +
      '<form data-form="setup" class="card card-b" novalidate><div class="grid g2"><div class="field"><label class="label">Business name</label><input type="text" name="name" required></div><div class="field"><label class="label">Type of business</label>' + bizTa + '</div>' +
      '<div class="field"><label class="label">Area</label>' + areaTa + '</div><div class="field"><label class="label">Street address</label><input type="text" name="address" required></div>' +
      '<div class="field"><label class="label">Contact person</label><input type="text" name="cname" value="' + esc(JM.me.full_name) + '" required></div><div class="field"><label class="label">Contact mobile</label><input type="tel" name="cphone" required></div></div>' +
      '<div class="field"><label class="label">Contact email</label><input type="email" name="cemail" required></div><div class="field"><label class="label">About the business</label><textarea name="about" maxlength="600" placeholder="What you do and what working here is like."></textarea></div>' +
      '<div class="divider"></div><h3 class="mb">Verification documents</h3><p class="small muted">Upload clear photos (JPG, PNG, WEBP) or PDFs, up to 5 MB each. Only you and JobMatch administrators can see them.</p><div class="grid g2">' + docPick('DTI certificate', 'DTI / SEC / CDA Certificate') + docPick("Mayor's permit", "Mayor's / Business Permit") + '</div>' + docPick('Valid ID', "Owner's valid government ID") +
      '<div class="err hide" id="form-err" role="alert"></div><div class="row mt" style="justify-content:space-between"><button type="button" class="btn ghost" data-act="logout">Sign out</button><button class="btn lg" type="submit">Submit for verification</button></div></form></div></div>';
  } });
  JM.forms.setup = async function (form, d) {
    const err = function (m) { const e = form.querySelector('#form-err'); e.textContent = m; e.classList.remove('hide'); };
    if (!d.name.trim() || !String(d.type || '').trim() || !String(d.area || '').trim() || !d.address.trim() || !d.cname.trim() || !d.cphone.trim() || !/^\S+@\S+\.\S+$/.test(d.cemail || '')) return err('Fill in every required field with valid details.');
    if (!JM.docs['DTI certificate'] || !JM.docs["Mayor's permit"] || !JM.docs['Valid ID']) return err('Upload your DTI certificate, Mayor\'s permit, and valid ID to continue.');
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try {
      JM.me = await JM.rpc('register_employer', { p_name: d.name, p_type: d.type.trim(), p_area: d.area, p_address: d.address, p_cname: d.cname, p_cemail: d.cemail, p_cphone: d.cphone, p_about: d.about || '', p_docs: Object.keys(JM.docs).map(function (k) { return { kind: k, path: JM.docs[k].path, name: JM.docs[k].name }; }) });
      JM.go('/employer'); JM.toast('Submitted. We will review your documents shortly.', 'ok');
    } catch (e) { err(JM.err(e)); btn.disabled = false; }
  };
  JM.actions.resubmit = function () {
    JM.docs = {}; JM.modal('<h2>Resubmit documents</h2><p class="muted mt">Upload clear photos (JPG, PNG) or PDFs of all required documents.</p><form data-form="resubmit" class="mt">' + docPick('DTI certificate', 'DTI / SEC / CDA Certificate') + docPick("Mayor's permit", "Mayor's / Business Permit") + docPick('Valid ID', "Owner's valid government ID") + '<div class="row" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn" type="submit">Resubmit</button></div></form>');
  };
  JM.forms.resubmit = async function () {
    if (!JM.docs['DTI certificate'] || !JM.docs["Mayor's permit"] || !JM.docs['Valid ID']) return JM.toast('Upload DTI certificate, Mayor\'s permit, and valid ID.', 'bad');
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
    let interviews = [];
    try { interviews = await JM.rpc('employer_interviews'); } catch (x) { interviews = []; }
    const upcomingIv = interviews.filter(function (iv) { return iv.status !== 'cancelled' && iv.status !== 'completed'; });
    const ivCard = '<div class="card mt"><div class="card-h"><h3 class="grow">Scheduled Interviews</h3><span class="badge brand">' + upcomingIv.length + ' upcoming</span></div>' +
      (upcomingIv.length ? '<div class="list">' + upcomingIv.map(function (iv) {
        const stCls = iv.status === 'confirmed' ? 'ok' : iv.status === 'rescheduled' ? 'warn' : 'brand';
        return '<div class="li" style="flex-wrap:wrap"><div class="grow"><b>' + esc(iv.applicant_name) + '</b> <span class="small muted">· ' + esc(iv.job_title) + '</span><div class="xs muted">' + JM.date(iv.scheduled_date) + ' at ' + esc(iv.scheduled_time) + ' · ' + esc(iv.interview_type) + (iv.location_or_link ? ' · ' + esc(iv.location_or_link) : '') + '</div></div>' +
          JM.badge(iv.status, stCls) + '<button class="btn secondary sm" data-act="empivstatus" data-id="' + iv.id + '" data-s="completed">Complete</button><button class="btn ghost sm danger" data-act="empivstatus" data-id="' + iv.id + '" data-s="cancelled">Cancel</button></div>';
      }).join('') + '</div>' : '<div class="card-b small muted">No upcoming interviews scheduled. Open any shortlisted applicant to schedule an interview.</div>') + '</div>';
    return '<div class="page">' + JM.pageHead('Welcome, ' + esc(e.name), 'Here is what is happening with your hiring.', '<a class="btn" href="#/employer/jobs/new">' + ic('plus', 16) + 'Post a job</a>') + banner() +
      '<div class="grid g4 mb">' + stat(o.live, 'Live jobs') + stat(o.applicants, 'Applicants') + stat(o.matched, 'Shortlisted or hired') + stat(o.views, 'Job views') + '</div>' +
      '<div class="grid g2" style="align-items:start"><div class="card"><div class="card-h"><h3 class="grow">Recent applicants</h3></div>' +
      (o.recent.length ? '<div class="list">' + o.recent.map(function (r) { return '<a class="li" href="#/employer/jobs/' + r.job_id + '/applicants" style="color:inherit">' + JM.avatar(r.name) + '<div class="grow"><div class="bold">' + esc(r.name) + (r.starred ? ' ' + JM.badge('Starred', 'star') : '') + '</div><div class="small muted">' + esc(r.job_title) + ' · ' + JM.ago(r.created_at) + '</div></div>' + (r.score != null ? '<b class="num">' + r.score + '%</b>' : '') + ic('right', 16) + '</a>'; }).join('') + '</div>' : JM.empty('users', 'No applicants yet', 'Publish a job and applicants appear here.')) + '</div>' +
      '<div class="card card-b"><div class="row between"><h3>Your plan</h3>' + JM.badge(PLAN[e.plan].name, e.plan === 'starter' ? '' : 'brand') + '</div><p class="small muted mt">' + (ranked ? 'Applicants are ranked by match score, with starred candidates first.' : 'Applicants are shown in the order received. Upgrade to Growth to rank them by match score.') + '</p><a class="btn secondary" href="#/employer/billing">Plans and billing</a></div></div>' + ivCard + '</div>';
  } });
  JM.actions.empivstatus = async function (el) {
    await JM.busy(el, async function () {
      await JM.rpc('update_interview_status', { p_id: el.dataset.id, p_status: el.dataset.s });
      JM.toast('Interview marked ' + el.dataset.s + '.', 'ok'); JM.render();
    });
  };

  // ---------- jobs list ----------
  JM.route('/employer/jobs', { auth: 'employer', title: 'Jobs', render: async function () {
    const jobs = await JM.q(JM.sb.from('jobs').select('id,title,status,type,work_setup,onsite_days,salary_min,salary_max,posted_at,boosted_until,area_id').eq('employer_id', JM.me.id).order('created_at', { ascending: false }));
    const live = jobs.filter(function (j) { return j.status !== 'draft' && j.status !== 'removed'; });
    const counts = {}; await Promise.all(live.map(async function (j) { try { counts[j.id] = (await JM.rpc('employer_applicants', { p_job: j.id })).items.length; } catch (e) { counts[j.id] = 0; } }));
    const e = JM.me.employer, publishedN = jobs.filter(function (j) { return j.status === 'published'; }).length, lim = PLAN[e.plan].posts;
    const rows = jobs.map(function (j) {
      const s = JSTAT[j.status], boosted = j.boosted_until && new Date(j.boosted_until) > new Date();
      const act = j.status === 'published' ? '<button class="btn secondary sm" data-act="jobstatus" data-id="' + j.id + '" data-s="paused">Pause</button><button class="btn secondary sm" data-act="jobstatus" data-id="' + j.id + '" data-s="closed">Close</button>' :
        j.status === 'removed' ? '' : '<button class="btn sm" data-act="jobstatus" data-id="' + j.id + '" data-s="published">' + (j.status === 'draft' ? 'Publish' : 'Reopen') + '</button>' + (j.status === 'draft' ? '<button class="iconbtn" data-act="jobdel" data-id="' + j.id + '" aria-label="Delete draft" style="width:32px;height:32px">' + ic('trash', 15) + '</button>' : '');
      return '<tr><td><a class="bold" href="#/employer/jobs/' + j.id + '/edit" style="color:var(--ink)">' + esc(j.title) + '</a><div class="xs muted row gap-s wrap" style="margin-top:3px"><span>' + esc(j.type) + ' · ' + JM.salary(j) + '</span>' + JM.setupBadge(j.work_setup, j.onsite_days) + '</div></td><td>' + JM.badge(s[0], s[1]) + (boosted ? ' ' + JM.badge('Boosted', 'star') : '') + '</td>' +
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

  // ---------- job form (Work setup + 4:3 photo + categorized skillPicker + rolePicker + typeaheads) ----------
  const blankJob = function () {
    return {
      title: '', role_id: '', custom_role: '', role_other: false, category: '', type: 'Full-time',
      work_setup: 'On-site', onsite_days: 3, photo_path: null, photo_focus: '50% 50%',
      salary_min: '', salary_max: '', area_id: JM.me.employer.area_id, description: '',
      intern_requirements: '', skills: [], _roleSkills: []
    };
  };
  async function applyJobRole(rid) {
    JM.jd.role_id = rid; JM.jd.role_other = false;
    const r = (JM.roles || []).find(function (x) { return x.id === rid; });
    if (r && !JM.jd.category) JM.jd.category = r.category;
    if (r && !JM.jd.title) JM.jd.title = r.title;
    try {
      const rs = await JM.q(JM.sb.from('role_skills').select('skill,weight').eq('role_id', rid).order('weight', { ascending: false }).limit(8));
      JM.jd._roleSkills = rs.map(function (x) { return x.skill; });
      if (!JM.jd.skills.length) JM.jd.skills = JM.jd._roleSkills.slice(0, 6);
    } catch (e) { /* ignore */ }
    JM.drawDraft();
  }
  function jobForm(j, isNew) {
    JM.jd = Object.assign(blankJob(), j, { role_other: !j.role_id && !!j.custom_role });
    JM.jerr = {};
    const req = '<span class="req" aria-hidden="true">*</span>';
    const ferr = function (k) { return JM.jerr && JM.jerr[k] ? '<div class="ferr">' + esc(JM.jerr[k]) + '</div>' : ''; };
    const fcls = function (k) { return JM.jerr && JM.jerr[k] ? ' field-err' : ''; };
    JM.draftRender = function () {
      const d = JM.jd, emp = JM.me.employer;
      const rolePk = JM.rolePicker({
        id: 'job-role-rp',
        value: d.role_id,
        isOther: !!d.role_other,
        placeholder: 'Search 100+ career roles (auto-fills category & skills)…',
        onPick: function (rid) { applyJobRole(rid); },
        onOther: function () { JM.jd.role_id = ''; JM.jd.role_other = true; JM.jd._roleSkills = []; JM.drawDraft(); }
      });
      const catTa = JM.typeahead({
        id: 'job-cat-ta',
        value: d.category || '',
        label: d.category || '',
        allowCustom: true,
        minChars: 0,
        placeholder: 'Select or type a category…',
        source: (JM.categories || []).map(function (c) { return { value: c, label: c }; }),
        onType: function (v) { JM.jd.category = v; },
        onPick: function (it) { JM.jd.category = it.value; }
      });
      const areaTa = JM.typeahead({
        id: 'job-area-ta',
        value: d.area_id,
        label: JM.area(d.area_id),
        minChars: 0,
        placeholder: 'Type city or barangay…',
        source: JM.areaItems || [],
        onPick: function (it) { JM.jd.area_id = it.value; }
      });
      const setupSeg = '<div class="grid g3">' + SETUPS.map(function (s) {
        return '<label class="opt setup-opt"><input type="radio" name="work_setup" value="' + s + '" data-in="jdsetup"' + ((d.work_setup || 'On-site') === s ? ' checked' : '') + '>' +
          '<span><b class="row gap-s">' + ic(JM.setupIcon(s), 15) + s + '</b><small class="xs muted" style="display:block;margin-top:2px">' + SETUP_HELP[s] + '</small></span></label>';
      }).join('') + '</div>';
      const hybridDays = d.work_setup === 'Hybrid'
        ? '<div class="row gap-s mt" style="margin-top:8px"><span class="small bold">On-site days per week:</span>' +
          '<button type="button" class="btn secondary sm" data-act="jddays" data-d="-1">−</button>' +
          '<b class="num" style="min-width:24px;text-align:center">' + (d.onsite_days || 3) + '</b>' +
          '<button type="button" class="btn secondary sm" data-act="jddays" data-d="1">+</button>' +
          '<span class="xs muted">days on-site</span></div>'
        : '';
      const photoPreview = '<div class="jmedia jmedia-form">' +
        JM.img({ bucket: 'job-photos', path: d.photo_path, directUrl: d._photoBlob, uploading: !!d._photoUploading, shape: 'cover43', focus: d.photo_focus || '50% 50%', fallback: 'placeholder', name: d.category || d.title || 'Listing preview', icon: 'image', alt: 'Job listing photo preview' }) +
        '<div class="jlogo">' + JM.img({ bucket: 'company-logos', path: emp.logo_path, shape: 'circle', size: 54, name: emp.name }) + '</div></div>';
      const photoBlock = '<div class="field"><label class="label">Listing photo (shown on Discover cards, 4:3)</label>' +
        '<div class="grid g2" style="align-items:center">' + photoPreview + '<div>' +
        JM.uploadBtn({ in: 'jobphoto', target: 'jobphoto', label: d.photo_path ? 'Replace photo' : 'Upload listing photo', hint: 'JPG, PNG or WEBP · 4:3 crop & optimize · max 5 MB', preview: 'Crop listing photo (4:3)', size: d.photo_path ? 'sm' : '' }) +
        (d.photo_path ? ' <button type="button" class="btn ghost sm danger" data-act="jobphotorm">Remove</button>' : '') +
        (!emp.logo_path ? '<div class="xs muted mt">Tip: You haven\'t uploaded a company logo yet. <a href="#/employer/company">Add one on Company &amp; team</a> so it appears in the circle badge.</div>' : '<div class="xs muted mt">Preview shows your 4:3 photo with your company logo circle.</div>') +
        '</div></div></div>';
      const skillPk = JM.skillPicker({
        id: 'job-sp',
        mode: 'job',
        selected: d.skills,
        max: 8,
        min: 1,
        suggested: d._roleSkills || [],
        emptyHint: 'Select 1 to 8 skills. Skills drive 55% of every applicant\'s match score.',
        onAdd: function (name) {
          if (JM.jd.skills.indexOf(name) >= 0) return;
          if (JM.jd.skills.length >= 8) return JM.toast('Pick up to 8 skills.');
          JM.jd.skills.push(name); JM.drawDraft();
        },
        onToggle: function (name) {
          const i = JM.jd.skills.indexOf(name);
          if (i >= 0) JM.jd.skills.splice(i, 1);
          else if (JM.jd.skills.length < 8) JM.jd.skills.push(name);
          else return JM.toast('Pick up to 8 skills.');
          JM.drawDraft();
        },
        onRemove: function (name) {
          const i = JM.jd.skills.indexOf(name);
          if (i >= 0) JM.jd.skills.splice(i, 1);
          JM.drawDraft();
        },
        onRedraw: function () { JM.drawDraft(); }
      });

      return '<div class="card card-b"><p class="xs muted mb">Fields marked with <span class="req">*</span> are required.</p>' +
        '<div class="field' + fcls('title') + '"><label class="label">Job title ' + req + '</label><input type="text" data-in="jd" data-k="title" value="' + esc(d.title) + '" maxlength="120" placeholder="e.g. Barista">' + ferr('title') + '</div>' +
        '<div class="field"><label class="label">Career role</label>' + rolePk +
        (d.role_other || d.custom_role ? '<input type="text" class="mt" style="margin-top:8px" data-in="jd" data-k="custom_role" value="' + esc(d.custom_role || '') + '" maxlength="120" placeholder="Specify custom career role">' : '') +
        '<div class="help">Pick a role for automatic roadmaps and skill suggestions, or pick "Other / not listed" to specify.</div></div>' +
        '<div class="field' + fcls('work_setup') + '"><label class="label">Work setup ' + req + '</label>' + setupSeg + hybridDays + ferr('work_setup') + '</div>' +
        '<div class="grid g2"><div class="field' + fcls('category') + '"><label class="label">Category ' + req + '</label>' + catTa + ferr('category') + '</div>' +
        '<div class="field"><label class="label">Employment type ' + req + '</label><select data-in="jd" data-k="type">' + opts(JM.TYPES, d.type) + '</select></div>' +
        '<div class="field' + fcls('area_id') + '"><label class="label">' + (d.work_setup === 'Remote' ? 'Hiring area / company base' : 'Location') + ' ' + req + '</label>' + areaTa + (d.work_setup === 'Remote' ? '<div class="help">Remote jobs are shown to seekers regardless of commute distance.</div>' : '') + ferr('area_id') + '</div>' +
        '<div class="grid g2 keep" style="gap:10px"><div class="field' + fcls('salary_min') + '"><label class="label">Min pay (₱/mo) ' + req + '</label><input type="number" data-in="jd" data-k="salary_min" value="' + esc(d.salary_min) + '" min="1" step="500">' + ferr('salary_min') + '</div><div class="field' + fcls('salary_max') + '"><label class="label">Max pay (₱/mo) ' + req + '</label><input type="number" data-in="jd" data-k="salary_max" value="' + esc(d.salary_max) + '" min="1" step="500">' + ferr('salary_max') + '</div></div></div>' +
        photoBlock +
        '<div class="field"><label class="label">Specific requirements / Intern &amp; OJT details (optional)</label><input type="text" data-in="jd" data-k="intern_requirements" value="' + esc(d.intern_requirements || '') + '" maxlength="300" placeholder="e.g. BSIT/ABM students, 300 OJT hours, or specific shift/credential"></div>' +
        '<div class="field' + fcls('description') + '"><label class="label">Description ' + req + '</label><textarea data-in="jd" data-k="description" style="min-height:140px" maxlength="5000" placeholder="What the person will do, hours, and what you are looking for.">' + esc(d.description) + '</textarea>' + ferr('description') + '</div>' +
        '<div class="field' + fcls('skills') + '"><label class="label">Skills needed (1 to 8) ' + req + '</label>' + skillPk + ferr('skills') + '</div>' +
        '<div class="notice bad hide" id="form-err" role="alert"></div><div class="row wrap mt" style="justify-content:flex-end"><a class="btn ghost" href="#/employer/jobs">Cancel</a><button class="btn secondary" data-act="jobsave" data-publish="0">Save draft</button><button class="btn" data-act="jobsave" data-publish="1">' + (isNew || j.status === 'draft' ? 'Publish' : 'Save changes') + '</button></div></div>';
    };
    return '<div class="page narrow">' + JM.pageHead(isNew ? 'Post a job' : 'Edit job') + banner() + '<div id="draft-root">' + JM.draftRender() + '</div></div>';
  }
  JM.inputs.jd = function (el) { JM.jd[el.dataset.k] = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value; };
  JM.inputs.jdsetup = function (el) { JM.jd.work_setup = el.value; if (el.value === 'Hybrid' && !JM.jd.onsite_days) JM.jd.onsite_days = 3; JM.drawDraft(); };
  JM.actions.jddays = function (el) { JM.jd.onsite_days = Math.max(1, Math.min(5, Number(JM.jd.onsite_days || 3) + Number(el.dataset.d))); JM.drawDraft(); };
  JM.inputs.jobphoto = async function (el) {
    const f = (el._pvExtra && el._pvExtra.file) || el.files[0]; if (!f) return;
    const blobUrl = el._pvExtra && el._pvExtra.blobUrl;
    if (JM.isHeic(f)) { if (blobUrl) URL.revokeObjectURL(blobUrl); JM.toast(JM.HEIC_MSG, 'bad'); el.value = ''; return; }
    if (f.size > 5 * 1024 * 1024) { if (blobUrl) URL.revokeObjectURL(blobUrl); JM.toast('Photo must be under 5 MB.', 'bad'); el.value = ''; return; }
    const ext = (f.name.split('.').pop() || 'webp').toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp'].indexOf(ext) < 0) { if (blobUrl) URL.revokeObjectURL(blobUrl); JM.toast('Upload JPG, PNG or WEBP.', 'bad'); el.value = ''; return; }
    const oldPath = JM.jd.photo_path;
    JM.jd._photoBlob = blobUrl || null;
    JM.jd._photoUploading = true;
    JM.drawDraft();
    const path = JM.me.id + '/job-' + Date.now() + '.' + ext;
    try {
      const r = await JM.sb.storage.from('job-photos').upload(path, f, { contentType: f.type || undefined });
      if (r.error) throw r.error;
      const pubUrl = await JM.seedUrl('job-photos', path);
      await JM.preloadUrl(pubUrl);
      if (oldPath && oldPath !== path) {
        delete JM.urlCache['job-photos/' + oldPath];
        JM.sb.storage.from('job-photos').remove([oldPath]);
      }
      JM.jd.photo_path = path;
      JM.jd.photo_focus = '50% 50%';
      JM.jd._photoBlob = null;
      JM.jd._photoUploading = false;
      JM.drawDraft();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      JM.toast('Listing photo uploaded.', 'ok');
    } catch (e) {
      JM.jd._photoBlob = null;
      JM.jd._photoUploading = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      JM.drawDraft();
      JM.toast(JM.err(e), 'bad');
    } finally {
      el.value = '';
    }
  };
  JM.actions.jobphotorm = function () {
    JM.confirm({ title: 'Remove listing photo?', text: 'The card will show a clean category placeholder instead.', ok: 'Remove', danger: true, onOk: function () {
      if (JM.jd.photo_path) JM.sb.storage.from('job-photos').remove([JM.jd.photo_path]);
      JM.jd.photo_path = null; JM.jd.photo_focus = '50% 50%'; JM.drawDraft();
    } });
  };
  JM.route('/employer/jobs/new', { auth: 'employer', title: 'Post a job', render: function () { return jobForm(blankJob(), true); }, after: function () { JM.mountTypeaheads(); JM.hydrateImages(); } });
  JM.route('/employer/jobs/:id/edit', { auth: 'employer', title: 'Edit job', render: async function (p) {
    const j = await JM.q(JM.sb.from('jobs').select('*').eq('id', p.id).eq('employer_id', JM.me.id).maybeSingle());
    if (!j) return '<div class="page narrow">' + JM.empty('briefcase', 'Job not found', '', '<a class="btn" href="#/employer/jobs">Back to jobs</a>') + '</div>';
    return jobForm(j, false);
  }, after: function () { JM.mountTypeaheads(); JM.hydrateImages(); } });
  JM.actions.jobsave = async function (el) {
    const d = JM.jd, publish = el.dataset.publish === '1', errs = {};
    if (String(d.title || '').trim().length < 3) errs.title = 'Job title is required (at least 3 characters).';
    if (SETUPS.indexOf(d.work_setup) < 0) errs.work_setup = 'Choose On-site, Hybrid, or Remote.';
    if (!String(d.category || '').trim()) errs.category = 'Category is required. Select one or type your own.';
    if (!String(d.area_id || '').trim()) errs.area_id = 'Select a location from the list.';
    if (!d.salary_min || Number(d.salary_min) <= 0) errs.salary_min = 'Enter a valid minimum monthly pay greater than ₱0.';
    if (!d.salary_max || Number(d.salary_max) <= 0) errs.salary_max = 'Enter a valid maximum monthly pay greater than ₱0.';
    else if (d.salary_min && Number(d.salary_max) < Number(d.salary_min)) errs.salary_max = 'Maximum pay (' + JM.peso(d.salary_max) + ') cannot be lower than minimum pay (' + JM.peso(d.salary_min) + ').';
    const descLen = String(d.description || '').trim().length;
    if (descLen < 20) errs.description = 'Description must be at least 20 characters (currently ' + descLen + ').';
    if (!d.skills || !d.skills.length) errs.skills = 'Select at least 1 required skill for matching.';
    JM.jerr = errs;
    const keys = Object.keys(errs);
    if (keys.length) {
      JM.drawDraft();
      const box = document.getElementById('form-err');
      if (box) {
        box.innerHTML = ic('flag') + '<div><b>Please fix the following before continuing:</b><ul style="margin:6px 0 0;padding-left:18px">' + keys.map(function (k) { return '<li>' + esc(errs[k]) + '</li>'; }).join('') + '</ul></div>';
        box.classList.remove('hide');
        box.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      return;
    }
    await JM.busy(el, async function () {
      const row = {
        title: d.title.trim(), role_id: d.role_id || null, custom_role: (d.custom_role || '').trim(),
        intern_requirements: (d.intern_requirements || '').trim(), category: d.category.trim(),
        type: d.type, work_setup: d.work_setup || 'On-site',
        onsite_days: d.work_setup === 'Hybrid' ? Number(d.onsite_days || 3) : null,
        photo_path: d.photo_path || null, photo_focus: d.photo_focus || '50% 50%',
        salary_min: d.salary_min, salary_max: d.salary_max, area_id: d.area_id,
        description: d.description.trim(), skills: d.skills
      };
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
    const job = await JM.q(JM.sb.from('jobs').select('id,title,work_setup,onsite_days').eq('id', p.id).eq('employer_id', JM.me.id).maybeSingle());
    if (!job) return '<div class="page">' + JM.empty('briefcase', 'Job not found', '', '<a class="btn" href="#/employer/jobs">Back to jobs</a>') + '</div>';
    const r = await JM.rpc('employer_applicants', { p_job: p.id }); JM.sel = {}; JM.apps = r.items; JM.appJob = p.id; JM.filterStatus = JM.filterStatus || 'all';
    JM.appRanked = r.ranked;
    return '<div class="page"><a class="small row gap-s" href="#/employer/jobs" style="margin-bottom:14px">' + ic('left', 16) + 'Jobs</a>' + JM.pageHead(esc(job.title) + ' ' + JM.setupBadge(job.work_setup, job.onsite_days), r.items.length + ' applicants' + (r.ranked ? ', ranked by match score' : ''), '') +
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
      const avEl = a.named && a.avatar_path
        ? JM.img({ bucket: 'seeker-media', path: a.avatar_path, shape: 'circle', size: 52, name: a.name, act: 'mediaview', title: a.name })
        : JM.avatar(a.name, 'lg');
      const setupsHtml = (a.work_setups && a.work_setups.length)
        ? '<h4 class="mt-l mb">Accepted work setups</h4><div class="chips">' + a.work_setups.map(function (ws) { return JM.setupBadge(ws); }).join('') + '</div>' : '';
      const certsHtml = (a.named && Array.isArray(a.certificates) && a.certificates.length)
        ? '<h4 class="mt-l mb">Certificates &amp; credentials</h4><div class="col gap-s">' + a.certificates.map(function (c) {
            return '<div class="row card flat" style="padding:8px 10px">' + ic('award', 15) + '<div class="grow small"><b>' + esc(c.title || c.name) + '</b>' + (c.desc ? '<div class="xs muted">' + esc(c.desc) + '</div>' : '') + '</div><button type="button" class="btn secondary sm" data-act="mediaview" data-bucket="seeker-media" data-path="' + esc(c.path) + '" data-title="' + esc(c.title || 'Certificate') + '">View</button></div>';
          }).join('') + '</div>' : '';
      JM.drawer('<div class="row" style="align-items:flex-start">' + avEl + '<div class="grow"><h2>' + esc(a.name) + '</h2><div class="small muted">' + esc(a.job.title) + ' · applied ' + JM.ago(a.created_at) + '</div><div class="row gap-s mt">' + JM.badge(st[0], st[1]) + (a.starred ? JM.badge('Starred top choice', 'star') : '') + '</div></div><button class="iconbtn" data-act="close" aria-label="Close">' + ic('x') + '</button></div>' +
        (a.score != null ? '<div class="card flat card-b mt">' + '<div class="row">' + JM.ring(a.score, 56, '#0C70F8') + '<div class="grow"><b>Match score</b><div class="small muted">' + esc(((a.why || []).slice(0, 3)).join(', ')) + '</div></div></div>' + ((a.missing || []).length ? '<p class="small muted mt" style="margin:10px 0 0">Missing: ' + a.missing.map(esc).join(', ') + '</p>' : '') + '</div>' : '<div class="notice mt">' + ic('lock') + '<span>Match score and ranking come with the Growth plan.</span></div>') +
        setupsHtml +
        '<h4 class="mt-l mb">Skills</h4><div class="chips">' + a.skills.map(function (s) { return '<span class="badge ' + (a.job.skills.indexOf(s.name) >= 0 ? 'ok' : '') + '">' + esc(s.name) + ' · ' + lvl(s.level) + '</span>'; }).join('') + '</div>' +
        '<h4 class="mt-l mb">Education</h4><p class="small" style="margin:0">' + esc([a.education.level, a.education.course, a.education.school].filter(Boolean).join(' · ') || 'Not provided') + '</p>' +
        '<h4 class="mt-l mb">Experience</h4>' + exp + (a.resume_summary ? '<h4 class="mt-l mb">Professional summary</h4>' + JM.summaryBlock(a.resume_summary) : '') +
        certsHtml +
        '<div class="divider"></div>' + (a.named ? '<h4 class="mb">Contact</h4><div class="small col gap-s"><div>' + esc(a.contact.full_name) + (a.age ? ' · ' + a.age + ' years old' : '') + (a.gender ? ' · ' + esc(a.gender) : '') + '</div>' + (a.contact.phone ? '<div>' + esc(a.contact.phone) + '</div>' : '') + (a.contact.email ? '<div><a href="mailto:' + esc(a.contact.email) + '">' + esc(a.contact.email) + '</a></div>' : '') + '</div><div class="row wrap gap-s mt">' + (a.resume_path ? '<button class="btn secondary sm" data-act="resumedl" data-path="' + esc(a.resume_path) + '">' + ic('download', 15) + 'Download résumé</button>' : '') + (a.resume_link ? '<a class="btn secondary sm" href="' + esc(a.resume_link) + '" target="_blank" rel="noopener">' + ic('ext', 15) + 'Open résumé link</a>' : '') + (a.photo_path ? '<button class="btn secondary sm" data-act="mediaview" data-bucket="seeker-media" data-path="' + esc(a.photo_path) + '" data-title="Professional photo">' + ic('eye', 15) + 'Professional photo</button>' : '') + '</div>' :
          '<div class="notice">' + ic('shield') + '<span>Full name, photo, age, contact details and résumé file are hidden until you shortlist this applicant. This keeps hiring fair.</span></div>') +
        '<div class="row wrap mt-l">' + next + (a.status === 'shortlisted' ? '<button class="btn secondary" data-act="schediv" data-app="' + a.id + '" data-name="' + esc(a.name) + '">' + ic('clock', 16) + 'Schedule Interview</button>' : '') + (a.conversation_id ? '<a class="btn secondary" href="#/messages/' + a.conversation_id + '" data-act="close">' + ic('chat', 16) + 'Message</a>' : '') + '</div>');
      if (JM.apps) { const x = JM.apps.find(function (q) { return q.id === a.id; }); if (x) { x.viewed = true; drawApps(); } }
    });
  };
  JM.actions.schediv = function (el) {
    const today = new Date().toISOString().slice(0, 10);
    JM.modal('<h2>Schedule Interview</h2><p class="small muted mt">Schedule an interview with <b>' + esc(el.dataset.name) + '</b>. They will be notified immediately and see it on their dashboard.</p>' +
      '<form data-form="schediv" data-app="' + el.dataset.app + '" class="mt">' +
      '<div class="grid g2"><div class="field"><label class="label">Interview date <span class="req">*</span></label><input type="date" name="date" min="' + today + '" value="' + today + '" required></div><div class="field"><label class="label">Interview time <span class="req">*</span></label><input type="time" name="time" value="10:00" required></div></div>' +
      '<div class="field"><label class="label">Interview type <span class="req">*</span></label><div class="grid g2 keep"><label class="opt"><input type="radio" name="type" value="Online" checked><span>Online</span></label><label class="opt"><input type="radio" name="type" value="On-site"><span>On-site</span></label></div></div>' +
      '<div class="field"><label class="label">Location or meeting link <span class="req">*</span></label><input type="text" name="location" placeholder="e.g. Google Meet link or store address" required></div>' +
      '<div class="field"><label class="label">Notes (optional)</label><textarea name="notes" placeholder="e.g. Please bring a printed copy of your résumé"></textarea></div>' +
      '<div class="row mt" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn" type="submit">Send invite</button></div></form>');
  };
  JM.forms.schediv = async function (form, d) {
    if (!d.date || !d.time || !String(d.location || '').trim()) return JM.toast('Fill in date, time, and location/link.', 'bad');
    await JM.rpc('schedule_interview', { p_app: form.dataset.app, p_date: d.date, p_time: d.time, p_type: d.type || 'Online', p_location: d.location, p_notes: d.notes || '' });
    JM.close(); JM.toast('Interview scheduled and applicant notified!', 'ok');
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
    const qSource = (JM.skillsRaw || []).map(function (s) { return { value: s.name, label: s.name, group: JM.skillCatName(s.name), aliases: s.aliases || [] }; })
      .concat((JM.roles || []).map(function (r) { return { value: r.title, label: r.title, group: 'Role · ' + r.category, aliases: r.aliases || [] }; }));
    const qTa = JM.typeahead({ id: 'cs-q-ta', name: 'q', value: '', allowCustom: true, minChars: 1, placeholder: 'e.g. Excel, Barista, React…', source: qSource });
    const areaTa = JM.typeahead({ id: 'cs-area-ta', name: 'area', value: '', minChars: 0, placeholder: 'Anywhere (or type area)…', source: [{ value: '', label: 'Anywhere' }].concat(JM.areaItems || []) });
    return '<div class="page">' + JM.pageHead('Candidate search', 'These candidates chose to be discoverable. You see a masked name and skills until they apply and you shortlist them.') +
      '<form data-form="csearch" class="card card-b mb"><div class="grid g4"><div class="field" style="margin:0"><label class="label">Skill or role</label>' + qTa + '</div><div class="field" style="margin:0"><label class="label">Area</label>' + areaTa + '</div>' +
      '<div class="field" style="margin:0"><label class="label">Work setup</label><select name="setup"><option value="">Any setup</option>' + SETUPS.map(function (s) { return '<option>' + s + '</option>'; }).join('') + '</select></div>' +
      '<div class="field" style="margin:0"><label class="label">Match against job</label><select name="job">' + (jobs.length ? jobs.map(function (j, i) { return '<option value="' + j.id + '"' + (i === 0 ? ' selected' : '') + '>' + esc(j.title) + '</option>'; }).join('') : '<option value="">No published jobs yet</option>') + '</select></div></div><div class="row mt" style="justify-content:flex-end"><button class="btn" type="submit">' + ic('search', 16) + 'Search</button></div></form><div id="cs-out"></div></div>';
  }, after: function () { if (JM.me.employer.plan === 'business') JM.forms.csearch(document.querySelector('[data-form=csearch]'), { q: '', area: '', setup: '', job: (JM.cs.jobs[0] && JM.cs.jobs[0].id) || '' }); } });
  const csScoreCol = function (s) { return s >= 75 ? '#14804F' : s >= 50 ? '#0C70F8' : '#9A5B00'; };
  const csMatchRow = function (title, score, on) { return '<div class="skill"><div class="row between small"><span>' + (on ? '<b>' + esc(title) + '</b> ' + JM.badge('Selected', 'brand') : esc(title)) + '</span><b class="num" style="color:' + csScoreCol(score) + '">' + score + '%</b></div>' + JM.bar(score, score >= 70 ? 'ok' : '') + '</div>'; };
  JM.forms.csearch = async function (form, d) {
    const out = document.getElementById('cs-out'); out.innerHTML = '<div class="skel" style="height:120px"></div>';
    const r = await JM.rpc('candidate_search', { p_q: d.q || '', p_area: d.area || '', p_job: d.job || null, p_setup: d.setup || '' });
    JM.cs.job = d.job || (r[0] && r[0].ref_job_id) || null;
    JM.cs.results = r;
    const jobT = ((JM.cs.jobs || []).find(function (j) { return j.id === JM.cs.job; }) || {}).title || 'your latest job';
    JM.cs.jobTitle = jobT;
    const head = JM.cs.job
      ? '<div class="notice mb">' + ic('sparkle') + '<span>Match rates are calculated against <b>' + esc(jobT) + '</b> using skills (55%), location (20%), interests (15%) and pay (10%), the same scoring job seekers see. Change "Match against job" to compare another role.</span></div>'
      : '<div class="notice warn mb">' + ic('flag') + '<span>Publish a job to see each candidate\'s match rate for that position.</span></div>';
    out.innerHTML = head + (r.length ? '<div class="grid g2">' + r.map(function (c, idx) {
      const m = c.match || {}, have = m.have || [], miss = m.missing || [], p = m.parts;
      const scoreBox = c.score != null ? '<div class="center" style="flex:none">' + JM.ring(c.score, 52, csScoreCol(c.score)) + '<div class="xs muted" style="margin-top:2px">match</div></div>' : '<span class="badge dash">No job selected</span>';
      const setupChips = (c.work_setups || []).length ? '<div class="chips" style="margin-top:8px">' + c.work_setups.map(function (ws) { return JM.setupBadge(ws); }).join('') + '</div>' : '';
      return '<div class="card card-b" style="cursor:pointer" data-act="opencand" data-i="' + idx + '"><div class="row" style="align-items:flex-start">' + JM.avatar(c.name) + '<div class="grow"><b>' + esc(c.name) + '</b><div class="small muted">' + esc(JM.area(c.area_id)) + (c.education ? ' · ' + esc(c.education) : '') + '</div></div>' + scoreBox + '</div>' +
        (c.score != null ? '<div class="xs mt" style="color:var(--ink2)"><b>' + c.score + '% match</b> for ' + esc(jobT) + (p ? ' · Skills ' + p.skills + '% · Location ' + p.location + '% · Interests ' + p.interest + '% · Pay ' + p.salary + '%' : '') + '</div>' + (miss.length ? '<div class="xs muted">Missing for this job: ' + esc(miss.join(', ')) + '</div>' : '') : '') +
        setupChips +
        '<div class="chips mt">' + c.skills.slice(0, 6).map(function (s) { return JM.badge(s.name, have.indexOf(s.name) >= 0 ? 'ok' : ''); }).join('') + '</div>' +
        (c.resume_summary ? '<p class="xs muted mt" style="margin-bottom:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + esc(c.resume_summary) + '</p>' : '') +
        '<div class="row wrap gap-s mt">' + (c.invited ? '<span class="badge ok">Invited</span>' : '<button type="button" class="btn secondary sm" data-act="invite" data-id="' + c.id + '">Invite to apply</button>') + '<button type="button" class="btn sm" data-act="msgcand" data-id="' + c.id + '">' + ic('chat', 14) + 'Message</button><span class="xs muted" style="margin-left:auto">Click card for AI overview →</span></div></div>';
    }).join('') + '</div>' : '<div class="card">' + JM.empty('search', 'No candidates found', 'Try a different skill, area, or work setup.') + '</div>');
  };
  JM.actions.opencand = async function (el, ev) {
    if (ev && ev.target.closest('button')) return;
    const c = (JM.cs && JM.cs.results || [])[Number(el.dataset.i)];
    if (!c) return;
    const jobId = JM.cs.job || c.ref_job_id || null, jobT = JM.cs.jobTitle || 'Selected job', p = c.match && c.match.parts;
    const breakdown = p ? '<div class="card flat card-b mt" style="padding:12px"><div class="xs muted bold mb" style="margin-bottom:8px">Why ' + c.score + '% for ' + esc(jobT) + '</div>' + [['Skills', p.skills, 55], ['Location', p.location, 20], ['Interests', p.interest, 15], ['Pay', p.salary, 10]].map(function (x) { return '<div class="skill" style="margin-bottom:8px"><div class="row between xs"><span>' + x[0] + ' <span class="muted">(' + x[2] + '% weight)</span></span><b>' + x[1] + '%</b></div>' + JM.bar(x[1], x[1] >= 70 ? 'ok' : '') + '</div>'; }).join('') + '</div>' : '';
    const exp = (c.experience || []).map(function (x) { return '<div class="row" style="padding:5px 0"><span class="grow small"><b>' + esc(x.role || '') + '</b> <span class="muted">' + esc(x.org || '') + '</span></span><span class="xs muted">' + esc(x.years || '') + ' yr</span></div>'; }).join('') || '<span class="small muted">No prior experience listed.</span>';
    JM.drawer('<div class="row" style="align-items:flex-start">' + JM.avatar(c.name, 'lg') + '<div class="grow"><h2>' + esc(c.name) + '</h2><div class="small muted">' + esc(JM.area(c.area_id)) + '</div></div>' + (c.score != null ? JM.ring(c.score, 54, '#0C70F8') : '') + '<button class="iconbtn" data-act="close" aria-label="Close">' + ic('x') + '</button></div>' +
      '<div class="card flat tint card-b mt" id="ai-cand-box"><div class="row gap-s">' + ic('sparkle', 16) + '<b>AI-Powered Applicant Overview</b></div><p class="small muted mt" style="margin-bottom:0">Generating suitability overview…</p></div>' +
      '<h4 class="mt-l mb">Match by job position</h4><div id="cand-jobmatch">' + (c.score != null ? csMatchRow(jobT, c.score, true) : '<p class="small muted">Loading match rates…</p>') + '</div>' + breakdown +
      '<h4 class="mt-l mb">Skills</h4><div class="chips">' + (c.skills || []).map(function (s) { return JM.badge(s.name + ' · ' + (s.level >= 90 ? 'Advanced' : s.level >= 60 ? 'Intermediate' : 'Beginner')); }).join('') + '</div>' +
      ((c.work_setups && c.work_setups.length) ? '<h4 class="mt-l mb">Accepted work setups</h4><div class="chips">' + c.work_setups.map(function (ws) { return JM.setupBadge(ws); }).join('') + '</div>' : '') +
      '<h4 class="mt-l mb">Education</h4><p class="small" style="margin:0">' + esc([c.education, c.course, c.school].filter(Boolean).join(' · ') || 'Not provided') + '</p>' +
      '<h4 class="mt-l mb">Work Experience</h4>' + exp +
      (c.resume_summary ? '<h4 class="mt-l mb">Professional summary</h4>' + JM.summaryBlock(c.resume_summary) : '') +
      '<div class="row wrap mt-l">' + (c.invited ? '<span class="badge ok">Invited</span>' : '<button class="btn secondary" data-act="invite" data-id="' + c.id + '">Invite to apply</button>') + '<button class="btn" data-act="msgcand" data-id="' + c.id + '">' + ic('chat', 16) + 'Direct Message</button></div>');
    JM.rpc('candidate_job_matches', { p_seeker: c.id }).then(function (rows) {
      const box = document.getElementById('cand-jobmatch'); if (!box) return;
      box.innerHTML = rows.length ? rows.map(function (x) { return csMatchRow(x.title + (x.status === 'paused' ? ' (paused)' : ''), x.score, x.job_id === jobId); }).join('') : '<p class="small muted">Publish a job to see this candidate\'s match rate.</p>';
    }).catch(function () {
      const box = document.getElementById('cand-jobmatch');
      if (box && c.score == null) box.innerHTML = '<p class="small muted">Select a job position in the search filters to see the match rate.</p>';
    });
    try {
      const ov = await JM.fn('candidate-overview', { seeker_id: c.id, job_id: jobId });
      const box = document.getElementById('ai-cand-box');
      if (box) {
        box.innerHTML = '<div class="row between"><span class="row gap-s">' + ic('sparkle', 16) + '<b>AI Applicant Overview</b></span>' + JM.badge((ov.suitability || 'Good') + ' fit', ov.suitability === 'High' ? 'ok' : 'brand') + '</div>' +
          '<p class="small mt" style="margin-bottom:8px">' + esc(ov.overview) + '</p>' +
          (ov.highlights && ov.highlights.length ? '<ul class="xs" style="margin:0;padding-left:16px;color:var(--ink2);line-height:1.6">' + ov.highlights.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ul>' : '') +
          (ov.gaps && ov.gaps.length ? '<div class="xs muted mt" style="margin-top:6px"><b>Note:</b> ' + esc(ov.gaps.join('; ')) + '</div>' : '');
      }
    } catch (e) {
      const box = document.getElementById('ai-cand-box');
      if (box) box.innerHTML = '<div class="row gap-s">' + ic('sparkle', 16) + '<b>Applicant Overview</b></div><p class="small mt" style="margin-bottom:0">' + esc([c.education, c.course, c.school].filter(Boolean).join(' · ') || 'Candidate profile') + '. Skills: ' + esc((c.skills || []).slice(0, 5).map(function (s) { return s.name; }).join(', ')) + '.</p>';
    }
  };
  JM.actions.msgcand = async function (el, ev) {
    if (ev) ev.stopPropagation();
    const jobId = (JM.cs && JM.cs.job) || null;
    await JM.busy(el, async function () {
      const r = await JM.rpc('start_employer_conversation', { p_seeker: el.dataset.id, p_job: jobId });
      JM.close();
      JM.go('/messages/' + r.id);
    });
  };
  JM.actions.invite = async function (el, ev) {
    if (ev) ev.stopPropagation();
    if (!JM.cs.job) return JM.toast('Publish a job and select it in "Match against job position" first, then invite.', 'bad');
    await JM.busy(el, async function () { await JM.rpc('invite_candidate', { p_seeker: el.dataset.id, p_job: JM.cs.job }); el.outerHTML = '<span class="badge ok">Invited</span>'; JM.toast('Invitation sent.', 'ok'); });
  };

  // ---------- analytics (v2: real DB data, trends chart, insights, exports) ----------
  JM.anRange = JM.anRange || { preset: '30', start: '', end: '' };
  function rangeDates() {
    const today = new Date(), fmt = function (d) { return d.toISOString().slice(0, 10); };
    if (JM.anRange.preset === 'custom' && JM.anRange.start && JM.anRange.end) return { start: JM.anRange.start, end: JM.anRange.end };
    const days = Number(JM.anRange.preset) || 30;
    const st = new Date(today.getTime() - (days - 1) * 86400000);
    return { start: fmt(st), end: fmt(today) };
  }
  function svgLineChart(trends) {
    if (!trends.length) return '<p class="small muted">No trend data for this date range.</p>';
    const W = 680, H = 200, PL = 36, PR = 16, PT = 16, PB = 28, iw = W - PL - PR, ih = H - PT - PB;
    const mx = Math.max(1, Math.max.apply(null, trends.map(function (t) { return Math.max(t.views, t.applications); })));
    const pt = function (i, v) {
      const x = PL + (trends.length > 1 ? (i / (trends.length - 1)) * iw : iw / 2);
      const y = PT + ih - (v / mx) * ih;
      return x.toFixed(1) + ',' + y.toFixed(1);
    };
    const vPts = trends.map(function (t, i) { return pt(i, t.views); }).join(' ');
    const aPts = trends.map(function (t, i) { return pt(i, t.applications); }).join(' ');
    const step = Math.max(1, Math.ceil(trends.length / 6));
    const labels = trends.map(function (t, i) {
      if (i % step !== 0 && i !== trends.length - 1) return '';
      const x = PL + (trends.length > 1 ? (i / (trends.length - 1)) * iw : iw / 2);
      return '<text x="' + x.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10.5" fill="#64748B">' + t.day.slice(5) + '</text>';
    }).join('');
    return '<div class="linechart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Views and applications over time">' +
      '<line x1="' + PL + '" y1="' + PT + '" x2="' + (W - PR) + '" y2="' + PT + '" stroke="#E3E8EF" stroke-dasharray="3"/>' +
      '<line x1="' + PL + '" y1="' + (PT + ih / 2) + '" x2="' + (W - PR) + '" y2="' + (PT + ih / 2) + '" stroke="#E3E8EF" stroke-dasharray="3"/>' +
      '<line x1="' + PL + '" y1="' + (PT + ih) + '" x2="' + (W - PR) + '" y2="' + (PT + ih) + '" stroke="#CBD5E1"/>' +
      '<text x="' + (PL - 6) + '" y="' + (PT + 4) + '" text-anchor="end" font-size="10.5" fill="#64748B">' + mx + '</text>' +
      '<text x="' + (PL - 6) + '" y="' + (PT + ih + 4) + '" text-anchor="end" font-size="10.5" fill="#64748B">0</text>' +
      '<polyline fill="none" stroke="#0C70F8" stroke-width="2.5" stroke-linejoin="round" points="' + vPts + '"/>' +
      '<polyline fill="none" stroke="#14804F" stroke-width="2.5" stroke-linejoin="round" points="' + aPts + '"/>' +
      labels + '</svg></div>' +
      '<div class="row gap-l mt xs muted"><span class="row gap-s"><i style="width:12px;height:3px;background:#0C70F8;display:inline-block"></i>Job Views</span><span class="row gap-s"><i style="width:12px;height:3px;background:#14804F;display:inline-block"></i>Applications</span></div>';
  }
  JM.route('/employer/analytics', { auth: 'employer', title: 'Analytics', render: async function () {
    if (JM.me.employer.plan === 'starter') return '<div class="page">' + JM.pageHead('Analytics', 'See how each listing performs.') + lock('Analytics come with Growth', 'Track views, saves, stars, applications, trends, insights and report exports for every listing.', 'Growth') + '</div>';
    const rng = rangeDates();
    let data;
    try {
      data = await JM.rpc('employer_analytics_v2', { p_start: rng.start, p_end: rng.end });
    } catch (e) {
      const legacy = await JM.rpc('employer_analytics');
      const tv = legacy.reduce(function (a, r) { return a + r.views; }, 0), ta = legacy.reduce(function (a, r) { return a + r.applications; }, 0), ts = legacy.reduce(function (a, r) { return a + r.right + r.star; }, 0);
      data = { range: rng, summary: { views: tv, applications: ta, saved: ts, app_rate: tv ? Math.round(ta / tv * 1000) / 10 : 0 }, trends: [], listings: legacy.map(function (r) { return Object.assign({}, r, { skipped: r.left, saved: r.right, starred: r.star, app_rate: r.views ? Math.round(r.applications / r.views * 1000) / 10 : 0, conv_rate: r.applications ? Math.round(r.matched / r.applications * 1000) / 10 : 0 }); }) };
    }
    JM.anData = data;
    const rows = data.listings || [], s = data.summary || { views: 0, applications: 0, saved: 0, app_rate: 0 };
    const mxV = Math.max.apply(null, [1].concat(rows.map(function (r) { return r.views; })));
    const topBy = function (fn) { return rows.slice().sort(function (a, b) { return fn(b) - fn(a); })[0]; };
    const mostViewed = topBy(function (r) { return r.views; });
    const mostSaved = topBy(function (r) { return r.saved + r.starred; });
    const mostApplied = topBy(function (r) { return r.applications; });
    const highestRate = topBy(function (r) { return r.app_rate; });
    const zeroApps = rows.filter(function (r) { return r.applications === 0; });
    const suggestions = [];
    zeroApps.forEach(function (z) {
      if (z.views >= 3) suggestions.push('"' + z.title + '" has ' + z.views + ' views but 0 applications — consider reviewing its job description, qualifications, or salary range.');
      else suggestions.push('"' + z.title + '" has 0 applications so far — consider boosting the listing or adding clearer skills.');
    });
    if (highestRate && highestRate.app_rate >= 20) suggestions.push('"' + highestRate.title + '" leads with a ' + highestRate.app_rate + '% application rate — reuse its clear format for future posts.');
    if (!suggestions.length && rows.length) suggestions.push('Your listings are receiving steady engagement across ' + rng.start + ' to ' + rng.end + '.');
    JM.anData.insights = { mostViewed: mostViewed, mostSaved: mostSaved, mostApplied: mostApplied, highestRate: highestRate, zeroApps: zeroApps, suggestions: suggestions };

    const rangeBar = '<div class="row wrap gap-s mb">' +
      [['7', 'Last 7 Days'], ['30', 'Last 30 Days'], ['90', 'Last 90 Days']].map(function (p) {
        return '<button type="button" class="chip' + (JM.anRange.preset === p[0] ? ' on' : '') + '" data-act="anpreset" data-p="' + p[0] + '">' + p[1] + '</button>';
      }).join('') +
      '<form data-form="ancustom" class="row gap-s wrap" style="margin-left:auto"><input type="date" name="start" value="' + esc(rng.start) + '" style="height:32px;width:140px"><span class="xs muted">to</span><input type="date" name="end" value="' + esc(rng.end) + '" style="height:32px;width:140px"><button class="btn secondary sm" type="submit">Apply</button></form></div>';

    const exportBar = '<div class="row gap-s wrap"><button class="btn secondary sm" data-act="anexport" data-fmt="pdf">' + ic('download', 14) + 'PDF</button><button class="btn secondary sm" data-act="anexport" data-fmt="xls">' + ic('download', 14) + 'Excel</button><button class="btn secondary sm" data-act="anexport" data-fmt="csv">' + ic('download', 14) + 'CSV</button></div>';

    return '<div class="page print">' + JM.pageHead('Analytics', 'Recruitment performance (' + rng.start + ' to ' + rng.end + ')', exportBar) + rangeBar +
      '<div class="grid g4 mb">' + stat(s.views, 'Total Job Views') + stat(s.applications, 'Total Applications') + stat(s.saved, 'Total Saved Jobs') + stat(s.app_rate + '%', 'Application Rate') + '</div>' +
      '<div class="card card-b mb"><h3 class="mb">Application Trends</h3>' + svgLineChart(data.trends || []) + '</div>' +
      (rows.length ? '<div class="card mb"><div class="card-h"><h3 class="grow">Funnel by Listing</h3><span class="xs muted">Click any job title for detailed metrics</span></div><div class="tablewrap"><table><thead><tr><th>Listing</th><th class="num" title="Unique seekers who viewed this listing">Views</th><th class="num" title="Seekers who swiped left / skipped">Skipped</th><th class="num" title="Seekers who saved to Preferred">Saved</th><th class="num" title="Seekers who starred as top choice">Starred</th><th class="num" title="Total applications received">Applied</th><th class="num" title="Shortlisted or hired applicants">Matched</th><th class="num" title="Applied / Views">App Rate</th><th class="num" title="Matched / Applied">Conv Rate</th></tr></thead><tbody>' +
        rows.map(function (r, i) { return '<tr><td><button type="button" class="btn ghost sm" style="padding:0 4px;height:auto;font-weight:600;color:var(--brand)" data-act="anjob" data-i="' + i + '">' + esc(r.title) + '</button> ' + JM.badge(r.status === 'published' ? 'Live' : r.status) + '</td><td class="num">' + r.views + '</td><td class="num">' + r.skipped + '</td><td class="num">' + r.saved + '</td><td class="num">' + r.starred + '</td><td class="num">' + r.applications + '</td><td class="num">' + r.matched + '</td><td class="num bold">' + r.app_rate + '%</td><td class="num">' + r.conv_rate + '%</td></tr>'; }).join('') +
        '</tbody></table></div></div>' +
        '<div class="grid g2 mb"><div class="card card-b"><h3 class="mb">Job Performance Comparison</h3>' + rows.map(function (r) {
          return '<div class="skill"><div class="row between small"><b>' + esc(r.title) + '</b><span class="xs muted">' + r.views + ' views · ' + r.applications + ' apps · <b>' + r.app_rate + '%</b></span></div>' + JM.bar(Math.round(r.views / mxV * 100)) + '</div>';
        }).join('') + '</div>' +
        '<div class="card card-b"><h3 class="mb">Candidate Engagement Insights</h3><div class="col gap-s small">' +
        '<div><b>Most Viewed:</b> ' + esc(mostViewed ? mostViewed.title + ' (' + mostViewed.views + ')' : '–') + '</div>' +
        '<div><b>Most Saved:</b> ' + esc(mostSaved ? mostSaved.title + ' (' + (mostSaved.saved + mostSaved.starred) + ')' : '–') + '</div>' +
        '<div><b>Most Applied:</b> ' + esc(mostApplied ? mostApplied.title + ' (' + mostApplied.applications + ')' : '–') + '</div>' +
        '<div><b>Highest App Rate:</b> ' + esc(highestRate ? highestRate.title + ' (' + highestRate.app_rate + '%)' : '–') + '</div>' +
        '<div><b>Zero Applications:</b> ' + (zeroApps.length ? esc(zeroApps.map(function (z) { return z.title; }).join(', ')) : 'None') + '</div>' +
        '<div class="divider"></div><div class="bold">Automated Suggestions</div><ul class="xs muted" style="margin:0;padding-left:16px;line-height:1.6">' + suggestions.map(function (sg) { return '<li>' + esc(sg) + '</li>'; }).join('') + '</ul></div></div></div>' : '<div class="card">' + JM.empty('chart', 'No data yet', 'Publish a job to start collecting insights.') + '</div>') + '</div>';
  } });
  JM.actions.anpreset = function (el) { JM.anRange = { preset: el.dataset.p, start: '', end: '' }; JM.render(); };
  JM.forms.ancustom = function (form, d) {
    if (!d.start || !d.end || d.end < d.start) return JM.toast('Select a valid start and end date.', 'bad');
    JM.anRange = { preset: 'custom', start: d.start, end: d.end }; JM.render();
  };
  JM.actions.anjob = function (el) {
    const r = (JM.anData && JM.anData.listings || [])[Number(el.dataset.i)];
    if (!r) return;
    JM.modal('<h2>' + esc(r.title) + '</h2><p class="small muted mt">' + esc(r.category || '') + ' · ' + esc(r.type || '') + ' · ' + esc(r.status) + '</p>' +
      '<div class="grid g3 keep mt">' + stat(r.views, 'Views') + stat(r.applications, 'Applied') + stat(r.app_rate + '%', 'App Rate') + '</div>' +
      '<div class="grid g3 keep mt">' + stat(r.skipped, 'Skipped') + stat(r.saved + r.starred, 'Saved/Starred') + stat(r.conv_rate + '%', 'Conv Rate') + '</div>' +
      '<div class="row mt-l" style="justify-content:space-between"><a class="btn secondary sm" href="#/employer/jobs/' + r.job_id + '/applicants" data-act="close">View applicants</a><button class="btn" data-act="close">Close</button></div>', 'wide');
  };
  JM.actions.anexport = function (el) {
    const fmt = el.dataset.fmt, d = JM.anData;
    if (!d) return;
    if (fmt === 'pdf') { window.print(); return; }
    const rows = [['JobMatch Employer Analytics Report (' + d.range.start + ' to ' + d.range.end + ')'], [],
      ['Total Views', d.summary.views], ['Total Applications', d.summary.applications], ['Total Saved', d.summary.saved], ['Application Rate (%)', d.summary.app_rate], [],
      ['Listing', 'Status', 'Views', 'Skipped', 'Saved', 'Starred', 'Applied', 'Matched', 'App Rate (%)', 'Conv Rate (%)']];
    (d.listings || []).forEach(function (r) { rows.push([r.title, r.status, r.views, r.skipped, r.saved, r.starred, r.applications, r.matched, r.app_rate, r.conv_rate]); });
    rows.push([], ['Date', 'Views', 'Applications']);
    (d.trends || []).forEach(function (t) { rows.push([t.day, t.views, t.applications]); });
    const csv = rows.map(function (line) { return line.map(function (cell) { return '"' + String(cell == null ? '' : cell).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    const isXls = fmt === 'xls';
    const blob = isXls
      ? new Blob(['<table>' + rows.map(function (l) { return '<tr>' + l.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>'], { type: 'application/vnd.ms-excel' })
      : new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'jobmatch-analytics-' + d.range.start + '-to-' + d.range.end + (isXls ? '.xls' : '.csv');
    a.click();
    URL.revokeObjectURL(a.href);
    JM.toast('Report downloaded (' + fmt.toUpperCase() + ').', 'ok');
  };

  // ---------- billing ----------
  JM.route('/employer/billing', { auth: 'employer', title: 'Plans and billing', render: async function () {
    const e = JM.me.employer, jobs = await JM.q(JM.sb.from('jobs').select('id,title,boosted_until').eq('employer_id', JM.me.id).eq('status', 'published')), pays = await JM.q(JM.sb.from('payments').select('*').order('created_at', { ascending: false }).limit(12));
    const li = function (t) { return '<li style="display:flex;gap:8px">' + ic('check', 16) + '<span>' + t + '</span></li>'; };
    const yes = '<span style="color:var(--ok)">' + ic('check', 17) + '</span>', no = '<span class="muted">–</span>';
    const cmp = function (a, b, c, d) { return '<tr><td>' + a + '</td><td class="center">' + b + '</td><td class="center">' + c + '</td><td class="center">' + d + '</td></tr>'; };
    const card = function (k, price, perks, item) {
      const cur = e.plan === k, amt = k === 'growth' ? 999 : 2499;
      return '<div class="card price' + (k === 'growth' ? ' pop' : '') + '"><div class="row between"><b>' + PLAN[k].name + '</b>' + (cur ? JM.badge('Current plan', 'ok') : '') + '</div><div class="amt">' + price + '</div><ul>' + perks.map(li).join('') + '</ul>' +
        (cur ? '<button class="btn secondary block" disabled>' + (e.plan_renews_at ? 'Next billing: ' + JM.date(nextBill(e)) : 'Free forever') + '</button>' + (e.plan_renews_at ? '<label class="row mt small" style="cursor:pointer"><span class="grow">Auto-renew monthly</span><span class="switch"><input type="checkbox" data-act="empautorenew"' + (e.auto_renew !== false ? ' checked' : '') + '><i></i></span></label>' : '') : k === 'starter' ? '<div class="small muted center">Your plan returns to Starter when a paid plan ends.</div>' : '<button class="btn block" data-act="buy" data-item="' + item + '" data-label="' + PLAN[k].name + ' Plan (monthly)" data-amount="' + amt + '" data-period="Billed monthly">' + (e.plan === 'business' && k === 'growth' ? 'Switch to Growth' : 'Choose ' + PLAN[k].name) + '</button>') + '</div>';
    };
    const boostable = jobs.map(function (j) { const on = j.boosted_until && new Date(j.boosted_until) > new Date(); return '<div class="li"><div class="grow"><b>' + esc(j.title) + '</b><div class="small muted">' + (on ? 'Boosted until ' + JM.date(j.boosted_until) : 'Not boosted') + '</div></div><button class="btn secondary sm" data-act="buy" data-item="boost" data-job="' + j.id + '" data-label="Boost: ' + esc(j.title) + '" data-amount="299" data-period="7-day boost">' + (on ? 'Extend 7 days' : 'Boost for ₱299') + '</button></div>'; }).join('');
    return '<div class="page">' + JM.pageHead('Plans and billing', 'Prices in Philippine pesos. Cancel any time.') +
      '<div class="grid g3 mb">' + card('starter', '₱0', ['2 active listings', 'Applicants in order received', 'Verified badge'], '') + card('growth', '₱999<span class="small muted" style="font-weight:500"> / mo</span>', ['10 active listings', 'Ranked applicants and match scores', 'Starred candidates first', 'Full analytics, trends &amp; exports'], 'employer_growth') + card('business', '₱2,499<span class="small muted" style="font-weight:500"> / mo</span>', ['Unlimited listings', 'Candidate search &amp; AI overviews', 'Direct candidate messaging &amp; invites', 'Everything in Growth'], 'employer_business') + '</div>' +
      '<div class="card mb"><div class="card-h"><h3>Employer Plan Comparison</h3></div><div class="tablewrap"><table><thead><tr><th>Feature</th><th class="center">Starter (₱0)</th><th class="center">Growth (₱999)</th><th class="center">Business (₱2,499)</th></tr></thead><tbody>' +
      cmp('Active job listings', '2', '10', 'Unlimited') +
      cmp('Ranked applicants &amp; match scores', no, yes, yes) +
      cmp('Analytics, trends &amp; CSV/Excel/PDF export', no, yes, yes) +
      cmp('Interview scheduling', yes, yes, yes) +
      cmp('Candidate search &amp; AI Applicant Overview', no, no, yes) +
      cmp('Direct messaging from Candidate Search', no, no, yes) +
      '</tbody></table></div></div>' +
      '<div class="card mb"><div class="card-h"><h3>Boost a listing</h3><span class="small muted">Top of every deck for 7 days. ₱299.</span></div>' + (jobs.length ? '<div class="list">' + boostable + '</div>' : '<div class="card-b small muted">Publish a job to boost it.</div>') + '</div>' +
      '<div class="card"><div class="card-h"><h3>Payment history</h3></div>' + (pays.length ? '<div class="tablewrap"><table><tbody>' + pays.map(function (p) { return '<tr><td>' + JM.date(p.created_at) + '</td><td>' + esc(p.item) + '</td><td class="xs muted">' + esc(p.provider_ref) + (p.payment_method ? ' · ' + esc(p.payment_method.toUpperCase()) : '') + '</td><td>' + JM.badge(p.status, p.status === 'paid' ? 'ok' : p.status === 'pending' ? 'warn' : 'bad') + '</td><td style="text-align:right">' + JM.peso(p.amount) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="card-b small muted">No payments yet.</div>') + '</div></div>';
  } });

  // ---------- company ----------
  JM.route('/employer/company', { auth: 'employer', title: 'Company and team', render: async function () {
    const e = JM.me.employer, team = await JM.q(JM.sb.from('employer_team').select('*').eq('employer_id', JM.me.id).order('name')), docs = await JM.q(JM.sb.from('employer_docs').select('*').eq('employer_id', JM.me.id).order('created_at')), n = e.notif || {};
    const sw = function (k, t) { return '<label class="row" style="padding:12px 0;border-top:1px solid var(--line)"><b class="grow">' + t + '</b><span class="switch"><input type="checkbox" data-act="enotif" data-k="' + k + '"' + (n[k] !== false ? ' checked' : '') + '><i></i></span></label>'; };
    const findDoc = function (k) { return docs.find(function (d) { return d.kind === k; }); };
    const docRow = function (kind, label) {
      const doc = findDoc(kind);
      return '<div class="li" style="flex-wrap:wrap"><div class="grow"><b>' + label + '</b><div class="xs muted">' + (doc ? esc(doc.file_name) : 'Not uploaded yet') + '</div></div>' +
        (doc ? JM.badge('Uploaded', 'ok') + '<button type="button" class="btn secondary sm" data-act="mediaview" data-bucket="verification-docs" data-path="' + esc(doc.file_path) + '" data-title="' + esc(label) + '">View</button>' : JM.badge('Missing', 'warn')) +
        JM.uploadBtn({ in: 'compdoc', kind: kind, target: 'vdoc', label: doc ? 'Replace' : 'Upload', size: 'sm', preview: 'Preview: ' + label }) + '</div>';
    };
    const bizTa = JM.typeahead({ id: 'comp-biz-ta', name: 'type', value: e.type || '', label: e.type || '', allowCustom: true, minChars: 0, placeholder: 'Select or type business type…', source: BIZ_ITEMS });
    const areaTa = JM.typeahead({ id: 'comp-area-ta', name: 'area_id', value: e.area_id, label: JM.area(e.area_id), minChars: 0, placeholder: 'Type city or barangay…', source: JM.areaItems || [] });
    return '<div class="page narrow">' + JM.pageHead('Company and team') +
      '<div class="card mb"><div class="card-h"><h3 class="grow">Business profile</h3>' + (e.verification_status === 'verified' ? JM.badge('Verified', 'ok') : JM.badge(e.verification_status === 'pending' ? 'Pending review' : 'Not approved', e.verification_status === 'pending' ? 'warn' : 'bad')) + '</div><div class="card-b">' +
      '<div class="row wrap mb" style="padding-bottom:14px;border-bottom:1px solid var(--line)"><span id="emp-logo-slot">' + JM.img({ bucket: 'company-logos', path: e.logo_path, directUrl: JM._logoBlob, uploading: !!JM._logoUploading, shape: 'circle', size: 72, name: e.name, alt: 'Company logo', act: (e.logo_path && !JM._logoUploading) ? 'imgview' : '', title: 'Company logo' }) + '</span><div class="grow"><b>Company Logo</b><div class="xs muted">JPG, PNG or WEBP · square/circle crop · max 5 MB. Shown on your Discover cards and profile.</div></div>' + JM.uploadBtn({ in: 'emplogo', target: 'logo', label: e.logo_path ? 'Change logo' : 'Upload logo', size: 'sm', preview: 'Crop company logo' }) + '</div>' +
      '<form data-form="company"><div class="grid g2"><div class="field"><label class="label">Business name</label><input type="text" name="name" value="' + esc(e.name) + '" required></div><div class="field"><label class="label">Type</label>' + bizTa + '</div>' +
      '<div class="field"><label class="label">Area</label>' + areaTa + '</div><div class="field"><label class="label">Address</label><input type="text" name="address" value="' + esc(e.address) + '"></div>' +
      '<div class="field"><label class="label">Contact person</label><input type="text" name="contact_name" value="' + esc(e.contact_name) + '"></div><div class="field"><label class="label">Contact mobile</label><input type="tel" name="contact_phone" value="' + esc(e.contact_phone) + '"></div></div>' +
      '<div class="field"><label class="label">Contact email</label><input type="email" name="contact_email" value="' + esc(e.contact_email) + '"></div><div class="field"><label class="label">About</label><textarea name="about" maxlength="600">' + esc(e.about) + '</textarea></div><button class="btn" type="submit">Save changes</button></form></div></div>' +
      '<div class="card mb"><div class="card-h"><h3 class="grow">Company Documents (BIR, DTI, Mayor\'s Permit)</h3>' + (e.verification_status === 'rejected' ? '<button class="btn sm" data-act="resubmit">Resubmit</button>' : '') + '</div><div class="list">' +
      docRow('BIR certificate', 'BIR Registration Document') +
      docRow('DTI certificate', 'DTI Registration Document') +
      docRow("Mayor's permit", "Mayor's Permit") +
      '</div></div>' +
      '<div class="card mb"><div class="card-h"><h3 class="grow">Team</h3><button class="btn secondary sm" data-act="addmember">' + ic('plus', 15) + 'Add member</button></div><div class="list">' + team.map(function (t) { return '<div class="li">' + JM.avatar(t.name) + '<div class="grow"><b>' + esc(t.name) + '</b><div class="small muted">' + esc(t.email) + '</div></div>' + JM.badge(t.role) + (t.role === 'Owner' ? '' : '<button class="iconbtn" data-act="rmmember" data-id="' + t.id + '" data-name="' + esc(t.name) + '" aria-label="Remove ' + esc(t.name) + '" style="width:32px;height:32px">' + ic('trash', 15) + '</button>') + '</div>'; }).join('') + '</div><div class="card-b small muted">Team members are listed for your reference. They sign in with their own JobMatch accounts in a future update.</div></div>' +
      '<div class="card mb"><div class="card-h"><h3>Notifications</h3></div><div class="card-b" style="padding-top:0">' + sw('applicants', 'New applicants') + sw('messages', 'New messages') + sw('weekly', 'Weekly summary') + '</div></div>' + JM.accountCards() + '</div>';
  } });
  JM.actions.empviewdoc = async function (el) { await JM.busy(el, async function () { const r = await JM.sb.storage.from('verification-docs').createSignedUrl(el.dataset.path, 120); if (r.error) throw r.error; window.open(r.data.signedUrl, '_blank', 'noopener'); }); };
  JM.actions.empautorenew = async function (el) {
    try {
      await JM.q(JM.sb.from('employers').update({ auto_renew: el.checked }).eq('user_id', JM.me.id));
      await JM.loadMe();
      JM.toast(el.checked ? 'Auto-renew on. Your plan renews monthly.' : 'Auto-renew off. Your plan stays active until the next billing date.');
    } catch (e) { el.checked = !el.checked; JM.toast(JM.err(e), 'bad'); }
  };
  function refreshEmpLogoSlot() {
    const slot = document.getElementById('emp-logo-slot');
    if (!slot || !JM.me || !JM.me.employer) return;
    const e = JM.me.employer;
    slot.innerHTML = JM.img({ bucket: 'company-logos', path: e.logo_path, directUrl: JM._logoBlob, uploading: !!JM._logoUploading, shape: 'circle', size: 72, name: e.name, alt: 'Company logo', act: (e.logo_path && !JM._logoUploading) ? 'imgview' : '', title: 'Company logo' });
    JM.hydrateImages(slot);
  }
  JM.inputs.emplogo = async function (el) {
    const f = (el._pvExtra && el._pvExtra.file) || el.files[0]; if (!f) return;
    const blobUrl = el._pvExtra && el._pvExtra.blobUrl;
    if (JM.isHeic(f)) { if (blobUrl) URL.revokeObjectURL(blobUrl); JM.toast(JM.HEIC_MSG, 'bad'); el.value = ''; return; }
    if (f.size > 5 * 1024 * 1024) { if (blobUrl) URL.revokeObjectURL(blobUrl); JM.toast('Logo must be under 5 MB.', 'bad'); el.value = ''; return; }
    const ext = (f.name.split('.').pop() || 'webp').toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp'].indexOf(ext) < 0) { if (blobUrl) URL.revokeObjectURL(blobUrl); JM.toast('Upload JPG, PNG or WEBP.', 'bad'); el.value = ''; return; }
    const oldPath = JM.me.employer && JM.me.employer.logo_path;
    JM._logoBlob = blobUrl || null;
    JM._logoUploading = true;
    JM._shellAvatarBlob = blobUrl || null;
    JM._shellAvatarUploading = true;
    refreshEmpLogoSlot();
    JM.refreshShellAvatar();
    const path = JM.me.id + '/logo-' + Date.now() + '.' + ext;
    try {
      const r = await JM.sb.storage.from('company-logos').upload(path, f, { contentType: f.type || undefined });
      if (r.error) throw r.error;
      await JM.q(JM.sb.from('employers').update({ logo_path: path }).eq('user_id', JM.me.id));
      if (oldPath && oldPath !== path) {
        delete JM.urlCache['company-logos/' + oldPath];
        JM.sb.storage.from('company-logos').remove([oldPath]);
      }
      const pubUrl = await JM.seedUrl('company-logos', path);
      await JM.preloadUrl(pubUrl);
      await JM.loadMe();
      JM._logoBlob = null;
      JM._logoUploading = false;
      JM._shellAvatarBlob = null;
      JM._shellAvatarUploading = false;
      refreshEmpLogoSlot();
      JM.refreshShellAvatar();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      JM.toast('Company logo updated.', 'ok');
    } catch (e) {
      JM._logoBlob = null;
      JM._logoUploading = false;
      JM._shellAvatarBlob = null;
      JM._shellAvatarUploading = false;
      refreshEmpLogoSlot();
      JM.refreshShellAvatar();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      JM.toast(JM.err(e), 'bad');
    } finally {
      el.value = '';
    }
  };
  JM.inputs.compdoc = async function (el) {
    const f = (el._pvExtra && el._pvExtra.file) || el.files[0]; if (!f) return;
    const blobUrl = el._pvExtra && el._pvExtra.blobUrl;
    try {
      const up = await uploadDoc(f);
      await JM.rpc('employer_upsert_doc', { p_kind: el.dataset.kind, p_path: up.path, p_name: up.name });
      JM.toast(el.dataset.kind + ' uploaded.', 'ok'); JM.render();
    } catch (e) { JM.toast(JM.err(e), 'bad'); }
    finally { if (blobUrl) URL.revokeObjectURL(blobUrl); el.value = ''; }
  };
  JM.forms.company = async function (form, d) {
    await JM.q(JM.sb.from('employers').update({ name: d.name.trim(), type: d.type, area_id: d.area_id, address: d.address.trim(), contact_name: d.contact_name.trim(), contact_phone: d.contact_phone.trim(), contact_email: d.contact_email.trim(), about: d.about.trim() }).eq('user_id', JM.me.id));
    await JM.loadMe(); JM.toast('Saved.', 'ok');
  };
  JM.actions.enotif = async function (el) { const n = Object.assign({}, JM.me.employer.notif || {}); n[el.dataset.k] = el.checked; try { await JM.q(JM.sb.from('employers').update({ notif: n }).eq('user_id', JM.me.id)); JM.me.employer.notif = n; } catch (e) { el.checked = !el.checked; JM.toast(JM.err(e), 'bad'); } };
  JM.actions.addmember = function () { JM.modal('<h2>Add team member</h2><form data-form="member" class="mt"><div class="field"><label class="label">Name</label><input type="text" name="name" required></div><div class="field"><label class="label">Email</label><input type="email" name="email" required></div><div class="field"><label class="label">Role</label><select name="role"><option>Recruiter</option><option>Admin</option></select></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn" type="submit">Add</button></div></form>'); };
  JM.forms.member = async function (form, d) { await JM.q(JM.sb.from('employer_team').insert({ employer_id: JM.me.id, name: d.name.trim(), email: d.email.trim(), role: d.role })); JM.close(); JM.render(); };
  JM.actions.rmmember = function (el) {
    JM.confirm({
      title: 'Remove ' + (el.dataset.name || 'team member') + '?',
      text: 'This removes them from your team list.',
      ok: 'Remove',
      danger: true,
      onOk: function () { JM.busy(null, async function () { await JM.q(JM.sb.from('employer_team').delete().eq('id', el.dataset.id)); JM.toast('Removed.'); JM.render(); }); }
    });
  };
  JM.route('/employer/help', { auth: 'employer', title: 'Help', render: function () { return JM.helpPage('employer'); } });
})();
