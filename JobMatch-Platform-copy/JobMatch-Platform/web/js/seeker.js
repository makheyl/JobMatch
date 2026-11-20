/* Job seeker: onboarding, profile, deck, job detail, preferred, applications, matches. */
(function () {
  const JM = window.JM, ic = JM.icon, esc = JM.esc;
  const EDU = ['Elementary', 'Junior high school', 'Senior high school', 'Vocational / TESDA', 'College undergraduate', 'College graduate', 'Post-graduate'];
  const TYPES = ['Full-time', 'Part-time', 'Internship / OJT', 'Contract'];
  const LEVELS = [[40, 'Beginner'], [70, 'Intermediate'], [95, 'Advanced']];
  JM.EDU = EDU; JM.TYPES = TYPES;

  JM.loadRef = async function () {
    const r = await Promise.all([
      JM.q(JM.sb.from('areas').select('id,name').order('name')),
      JM.q(JM.sb.from('skills').select('name').eq('active', true).order('name')),
      JM.q(JM.sb.from('career_roles').select('id,title,category').eq('active', true).order('title'))]);
    JM.areas = r[0]; JM.skillList = r[1].map(function (s) { return s.name; }); JM.roles = r[2];
    JM.categories = Array.from(new Set(r[2].map(function (x) { return x.category; }))).sort();
  };
  const areaOpts = function (sel) { return (JM.areas || []).map(function (a) { return '<option value="' + a.id + '"' + (a.id === sel ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join(''); };

  // ---------- draft (onboarding + profile) ----------
  JM.initDraft = function () {
    const m = JM.me, s = m.seeker, sk = {}; (s.skills || []).forEach(function (k) { sk[k.name] = k.level; });
    JM.draft = { full_name: m.full_name, phone: m.phone, birth_year: s.birth_year || '', gender: s.gender || '', edu_level: s.edu_level || '', school: s.school || '', course: s.course || '', grad_year: s.grad_year || '',
      experience: JSON.parse(JSON.stringify(s.experience || [])), interests: (s.interests || []).slice(), goal_role: s.goal_role || '', goal_text: s.goal_text || '', area_id: s.area_id, commute_km: s.commute_km,
      salary_min: s.salary_min || '', job_types: (s.job_types || []).slice(), resume_summary: s.resume_summary || '', resume_path: s.resume_path || null, resume_mode: s.resume_mode, open_to_employers: !!s.open_to_employers, skills: sk };
  };
  JM.drawDraft = function () { const r = document.getElementById('draft-root'); if (r && JM.draftRender) r.innerHTML = JM.draftRender(); };
  JM.inputs.d = function (el) { const k = el.dataset.d; JM.draft[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' || el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value; if (k === 'commute_km') { const o = document.getElementById('km-out'); if (o) o.textContent = el.value + ' km'; } };
  JM.inputs.skilllvl = function (el) { JM.draft.skills[el.dataset.skill] = Number(el.value); };
  JM.inputs.exp = function (el) { JM.draft.experience[Number(el.dataset.i)][el.dataset.k] = el.value; };
  JM.inputs.skillq = function (el) { const q = el.value.toLowerCase(); document.querySelectorAll('[data-skillname]').forEach(function (c) { c.classList.toggle('hide', q && c.dataset.skillname.toLowerCase().indexOf(q) < 0); }); };
  JM.inputs.resume = async function (el) {
    const f = el.files[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { JM.toast('File is larger than 5 MB.', 'bad'); el.value = ''; return; }
    const ext = (f.name.split('.').pop() || 'pdf').toLowerCase();
    if (['pdf', 'doc', 'docx'].indexOf(ext) < 0) { JM.toast('Upload a PDF or Word file.', 'bad'); el.value = ''; return; }
    const path = JM.me.id + '/resume-' + Date.now() + '.' + ext;
    try {
      const r = await JM.sb.storage.from('resumes').upload(path, f, { contentType: f.type || undefined });
      if (r.error) throw r.error;
      if (JM.draft.resume_path) JM.sb.storage.from('resumes').remove([JM.draft.resume_path]);
      JM.draft.resume_path = path; JM.draft.resume_mode = 'uploaded'; JM.draft.resume_name = f.name; JM.drawDraft(); JM.toast('Résumé uploaded.', 'ok');
    } catch (e) { JM.toast(JM.err(e), 'bad'); }
  };
  JM.actions.dt = function (el) {
    const arr = JM.draft[el.dataset.d], v = el.dataset.v, i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1); else arr.push(v); JM.drawDraft();
  };
  JM.actions.skilladd = function (el) { const n = el.dataset.v; if (JM.draft.skills[n] != null) delete JM.draft.skills[n]; else JM.draft.skills[n] = 70; JM.drawDraft(); };
  JM.actions.skillrm = function (el) { delete JM.draft.skills[el.dataset.v]; JM.drawDraft(); };
  JM.actions.expadd = function () { JM.draft.experience.push({ role: '', org: '', years: '' }); JM.drawDraft(); };
  JM.actions.exprm = function (el) { JM.draft.experience.splice(Number(el.dataset.i), 1); JM.drawDraft(); };
  JM.actions.resumerm = function () { if (JM.draft.resume_path) JM.sb.storage.from('resumes').remove([JM.draft.resume_path]); JM.draft.resume_path = null; JM.draft.resume_mode = 'built'; JM.drawDraft(); };

  const field = function (label, inner, help) { return '<div class="field"><label class="label">' + label + '</label>' + inner + (help ? '<div class="help">' + help + '</div>' : '') + '</div>'; };
  const chipBtn = function (d, v, on) { return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-act="dt" data-d="' + d + '" data-v="' + esc(v) + '" aria-pressed="' + !!on + '">' + esc(v) + '</button>'; };

  const SEC = {
    about: function (d) {
      return '<div class="grid g2">' + field('Full name', '<input type="text" data-in="d" data-d="full_name" value="' + esc(d.full_name) + '" autocomplete="name">') +
        field('Mobile number', '<input type="tel" data-in="d" data-d="phone" value="' + esc(d.phone) + '" placeholder="09XX XXX XXXX" autocomplete="tel">', 'Shared only with employers who shortlist you.') +
        field('Year of birth', '<input type="number" data-in="d" data-d="birth_year" value="' + esc(d.birth_year) + '" min="1940" max="2015" placeholder="e.g. 2003">', 'Never used for matching or ranking. Shown only after a shortlist.') +
        field('Gender (optional)', '<select data-in="d" data-d="gender">' + ['', 'Female', 'Male', 'Other'].map(function (g) { return '<option value="' + g + '"' + (d.gender === g ? ' selected' : '') + '>' + (g || 'Prefer not to say') + '</option>'; }).join('') + '</select>', 'Never used for matching or ranking.') +
        field('Where do you live?', '<select data-in="d" data-d="area_id">' + areaOpts(d.area_id) + '</select>') +
        field('Willing to commute: <b id="km-out">' + d.commute_km + ' km</b>', '<input type="range" min="1" max="60" step="1" value="' + d.commute_km + '" data-in="d" data-d="commute_km">') + '</div>';
    },
    edu: function (d) {
      return '<div class="grid g2">' + field('Highest education', '<select data-in="d" data-d="edu_level"><option value="">Select</option>' + EDU.map(function (e) { return '<option' + (d.edu_level === e ? ' selected' : '') + '>' + e + '</option>'; }).join('') + '</select>') +
        field('School', '<input type="text" data-in="d" data-d="school" value="' + esc(d.school) + '">') +
        field('Course or strand', '<input type="text" data-in="d" data-d="course" value="' + esc(d.course) + '">') +
        field('Year graduated (or expected)', '<input type="number" data-in="d" data-d="grad_year" value="' + esc(d.grad_year) + '" min="1980" max="2035">') + '</div>';
    },
    skills: function (d) {
      const chosen = Object.keys(d.skills);
      return field('Search skills', '<input type="search" data-in="skillq" placeholder="Type to filter, e.g. cash, Excel, barista">') +
        '<div class="chips" style="max-height:176px;overflow:auto;padding:2px">' + (JM.skillList || []).map(function (n) { return '<button type="button" class="chip' + (d.skills[n] != null ? ' on' : '') + '" data-skillname="' + esc(n) + '" data-act="skilladd" data-v="' + esc(n) + '">' + esc(n) + '</button>'; }).join('') + '</div>' +
        '<div class="mt">' + (chosen.length ? '<div class="label">Your level in each skill (' + chosen.length + ')</div>' + chosen.map(function (n) {
          return '<div class="row" style="padding:7px 0;border-top:1px solid var(--line)"><span class="grow">' + esc(n) + '</span><select style="width:150px;height:34px" data-in="skilllvl" data-skill="' + esc(n) + '">' + LEVELS.map(function (l) { return '<option value="' + l[0] + '"' + (d.skills[n] === l[0] ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') + '</select><button type="button" class="iconbtn" data-act="skillrm" data-v="' + esc(n) + '" aria-label="Remove ' + esc(n) + '" style="width:34px;height:34px">' + ic('x', 16) + '</button></div>';
        }).join('') : '<p class="small muted">Pick at least three skills you can honestly claim. Be accurate: your level shapes your match scores.</p>') + '</div>';
    },
    resume: function (d) {
      const exp = d.experience.map(function (x, i) {
        return '<div class="card flat card-b mb" style="padding:14px"><div class="grid g3 keep" style="gap:10px"><input type="text" placeholder="Role" data-in="exp" data-i="' + i + '" data-k="role" value="' + esc(x.role) + '"><input type="text" placeholder="Business or school" data-in="exp" data-i="' + i + '" data-k="org" value="' + esc(x.org) + '"><input type="text" placeholder="Years, e.g. 1.5" data-in="exp" data-i="' + i + '" data-k="years" value="' + esc(x.years) + '"></div><button type="button" class="btn ghost sm mt" data-act="exprm" data-i="' + i + '">' + ic('trash', 15) + 'Remove</button></div>';
      }).join('');
      const file = d.resume_path ? '<div class="row card flat" style="padding:10px 14px">' + ic('file') + '<span class="grow small">' + esc(d.resume_name || d.resume_path.split('/').pop()) + '</span><button type="button" class="btn ghost sm" data-act="resumerm">Remove</button></div>' : '<input type="file" accept=".pdf,.doc,.docx,application/pdf" data-in="resume">';
      return field('Short summary', '<textarea data-in="d" data-d="resume_summary" maxlength="600" placeholder="Two or three sentences: who you are, what you do well, and the role you want.">' + esc(d.resume_summary) + '</textarea>', 'Employers read this before anything else.') +
        '<div class="label">Experience (work, OJT, volunteer or school projects)</div>' + exp + '<button type="button" class="btn secondary sm mb" data-act="expadd">' + ic('plus', 16) + 'Add experience</button>' +
        field('Résumé file (optional)', file, 'PDF or Word, up to 5 MB. Shared only with employers who shortlist you.');
    },
    goal: function (d) {
      return field('Career goal', '<select data-in="d" data-d="goal_role"><option value="">Select a role</option>' + (JM.roles || []).map(function (r) { return '<option value="' + r.id + '"' + (d.goal_role === r.id ? ' selected' : '') + '>' + esc(r.title) + '</option>'; }).join('') + '</select>', 'Your roadmap and readiness score are built around this role.') +
        field('In your own words (optional)', '<input type="text" data-in="d" data-d="goal_text" value="' + esc(d.goal_text) + '" maxlength="140" placeholder="e.g. Become a store supervisor in two years">') +
        field('Fields that interest you', '<div class="chips">' + (JM.categories || []).map(function (c) { return chipBtn('interests', c, d.interests.indexOf(c) >= 0); }).join('') + '</div>') +
        field('Job types you accept', '<div class="chips">' + TYPES.map(function (c) { return chipBtn('job_types', c, d.job_types.indexOf(c) >= 0); }).join('') + '</div>') +
        field('Minimum monthly pay (₱)', '<input type="number" data-in="d" data-d="salary_min" value="' + esc(d.salary_min) + '" min="0" step="500" placeholder="e.g. 12000">') +
        '<label class="check"><input type="checkbox" data-in="d" data-d="open_to_employers"' + (d.open_to_employers ? ' checked' : '') + '><span class="small"><b>Let Business-plan employers find me.</b><br><span class="muted">They see your masked name and skills, never your contact details, and can invite you to apply.</span></span></label>';
    }
  };

  JM.saveDraft = async function (finish) {
    const d = JM.draft, uid = JM.me.id;
    const phone = String(d.phone || '').trim();
    await JM.q(JM.sb.from('profiles').update({ full_name: String(d.full_name || '').trim(), phone: phone }).eq('id', uid));
    const exp = d.experience.filter(function (x) { return x.role || x.org; });
    const patch = { birth_year: d.birth_year === '' ? null : d.birth_year, gender: d.gender, edu_level: d.edu_level, school: d.school.trim(), course: d.course.trim(), grad_year: d.grad_year === '' ? null : d.grad_year,
      experience: exp, interests: d.interests, goal_role: d.goal_role || null, goal_text: d.goal_text.trim(), area_id: d.area_id, commute_km: d.commute_km, salary_min: d.salary_min === '' ? 0 : d.salary_min,
      job_types: d.job_types, resume_mode: d.resume_path ? 'uploaded' : 'built', resume_summary: d.resume_summary.trim(), resume_path: d.resume_path, open_to_employers: d.open_to_employers };
    if (finish) patch.onboarded = true;
    await JM.q(JM.sb.from('seeker_profiles').update(patch).eq('user_id', uid));
    await JM.q(JM.sb.from('seeker_skills').delete().eq('user_id', uid));
    const rows = Object.keys(d.skills).map(function (n) { return { user_id: uid, skill: n, level: d.skills[n] }; });
    if (rows.length) await JM.q(JM.sb.from('seeker_skills').insert(rows));
    await JM.loadMe();
  };

  // ---------- onboarding ----------
  const STEPS = [['about', 'About you', 'Basic details help us find jobs within your reach.'], ['edu', 'Education', 'Tell us where you studied.'], ['skills', 'Skills', 'These drive 55 percent of your match scores.'], ['resume', 'Résumé', 'A short summary and any experience you have.'], ['goal', 'Goals', 'What do you want next?']];
  function checkStep(i) {
    const d = JM.draft;
    if (i === 0) { if (!String(d.full_name).trim()) return 'Enter your name.'; if (!d.birth_year || d.birth_year < 1940 || d.birth_year > 2015) return 'Enter a valid year of birth.'; }
    if (i === 1 && !d.edu_level) return 'Select your highest education.';
    if (i === 2 && Object.keys(d.skills).length < 3) return 'Pick at least three skills.';
    if (i === 4) { if (!d.goal_role) return 'Choose a career goal.'; if (!d.interests.length) return 'Pick at least one field of interest.'; if (!d.job_types.length) return 'Pick at least one job type.'; }
    return '';
  }
  function onboardHtml() {
    if (JM.me.seeker.onboarded) { JM.go('/deck'); return ''; }
    if (!JM.draft) JM.initDraft(); if (JM.obStep == null) JM.obStep = 0;
    JM.draftRender = function () {
      const i = JM.obStep, s = STEPS[i];
      return '<div class="steps" role="list">' + STEPS.map(function (_, k) { return '<button type="button" class="' + (k < i ? 'done' : k === i ? 'on' : '') + '" ' + (k < i ? 'data-act="obgo" data-i="' + k + '"' : 'tabindex="-1"') + ' aria-label="Step ' + (k + 1) + '"></button>'; }).join('') + '</div>' +
        '<div class="xs muted bold" style="letter-spacing:.05em;text-transform:uppercase">Step ' + (i + 1) + ' of ' + STEPS.length + '</div><h2 style="font-size:24px;margin:6px 0 4px">' + s[1] + '</h2><p class="muted mb">' + s[2] + '</p>' +
        '<div class="card card-b">' + SEC[s[0]](JM.draft) + '</div><div class="err hide" id="ob-err" role="alert" style="margin-top:12px"></div>' +
        '<div class="row mt" style="justify-content:space-between">' + (i > 0 ? '<button class="btn secondary" data-act="obback">Back</button>' : '<span></span>') + '<button class="btn" data-act="obnext">' + (i === STEPS.length - 1 ? 'Finish and see my matches' : 'Continue') + '</button></div>';
    };
    return '<div class="auth-main" style="min-height:100vh;background:var(--bg);align-items:flex-start"><div style="width:100%;max-width:640px"><a class="brand" href="#/" style="padding:8px 0 22px"><img src="assets/logo.png" alt="">JobMatch</a><div id="draft-root">' + JM.draftRender() + '</div></div></div>';
  }
  JM.route('/onboarding', { auth: 'seeker', plain: true, pre: true, title: 'Set up your profile', render: onboardHtml });
  JM.actions.obback = function () { JM.obStep--; JM.drawDraft(); window.scrollTo(0, 0); };
  JM.actions.obgo = function (el) { JM.obStep = Number(el.dataset.i); JM.drawDraft(); };
  JM.actions.obnext = async function (el) {
    const msg = checkStep(JM.obStep), box = document.getElementById('ob-err');
    if (msg) { box.textContent = msg; box.classList.remove('hide'); return; }
    if (JM.obStep < STEPS.length - 1) { JM.obStep++; JM.drawDraft(); window.scrollTo(0, 0); return; }
    await JM.busy(el, async function () { await JM.saveDraft(true); JM.obStep = null; JM.draft = null; JM.go('/deck'); JM.toast('Profile ready. Here are your best matches.', 'ok'); });
  };

  // ---------- profile ----------
  JM.route('/profile', { auth: 'seeker', title: 'Profile', render: function () {
    JM.initDraft();
    JM.draftRender = function () {
      const s = JM.me.seeker, d = JM.draft, done = ['full_name', 'phone', 'birth_year', 'edu_level', 'resume_summary', 'goal_role'].filter(function (k) { return d[k]; }).length + (Object.keys(d.skills).length >= 3 ? 1 : 0);
      const pct = Math.round(done / 7 * 100);
      return JM.pageHead('Your profile', 'Keep this accurate. It shapes every match score.', '<span class="badge ' + (s.plan === 'pro' ? 'star' : '') + '">' + (s.plan === 'pro' ? 'Pro member' : 'Free plan') + '</span>') +
        '<div class="card card-b mb"><div class="row"><div class="grow"><b>Profile strength</b><div class="small muted">' + (pct >= 100 ? 'Complete. Nice work.' : 'Fill the remaining fields to improve your matches.') + '</div></div><b>' + pct + '%</b></div>' + JM.bar(pct, 'ok') + '</div>' +
        [['about', 'About you'], ['edu', 'Education'], ['skills', 'Skills'], ['resume', 'Résumé'], ['goal', 'Goals and preferences']].map(function (x) { return '<div class="card mb"><div class="card-h"><h3>' + x[1] + '</h3></div><div class="card-b">' + SEC[x[0]](d) + '</div></div>'; }).join('') +
        '<div class="row" style="justify-content:flex-end"><button class="btn lg" data-act="profilesave">Save changes</button></div>';
    };
    return '<div class="page narrow" id="draft-root">' + JM.draftRender() + '</div>';
  } });
  JM.actions.profilesave = async function (el) {
    if (!String(JM.draft.full_name).trim()) return JM.toast('Enter your name.', 'bad');
    if (Object.keys(JM.draft.skills).length < 1) return JM.toast('Keep at least one skill.', 'bad');
    await JM.busy(el, async function () { await JM.saveDraft(false); JM.toast('Profile saved.', 'ok'); JM.initDraft(); JM.drawDraft(); });
  };

  // ---------- deck ----------
  const scoreColor = function (s) { return s >= 75 ? '#14804F' : s >= 50 ? '#0C70F8' : '#9A5B00'; };
  JM.skillChips = function (j) {
    const have = (j.match && j.match.have) || [], miss = (j.match && j.match.missing) || [];
    return (j.skills || []).map(function (s) { return '<span class="badge ' + (have.indexOf(s) >= 0 ? 'ok' : miss.indexOf(s) >= 0 ? 'warn' : '') + '">' + (have.indexOf(s) >= 0 ? ic('check', 12) : '') + esc(s) + '</span>'; }).join('');
  };
  function cardHtml(j, pos) {
    const m = j.match || {}, cls = pos === 0 ? 'top' : pos === 1 ? 'b1' : 'b2';
    return '<article class="jcard ' + cls + '" data-id="' + j.id + '" aria-label="' + esc(j.title) + '"><div class="stamp no">PASS</div><div class="stamp yes">SAVE</div><div class="stamp top">TOP PICK</div>' +
      '<div class="row" style="align-items:flex-start"><div class="grow"><div class="row gap-s wrap">' + (j.boosted ? JM.badge('Featured', 'star') : '') + JM.badge(j.type, 'brand') + '</div>' +
      '<h2 style="font-size:21px;margin-top:10px">' + esc(j.title) + '</h2><div class="row gap-s small muted" style="margin-top:4px">' + esc(j.company.name) + (j.company.verified ? '<span title="Verified business" style="color:var(--ok);display:inline-flex">' + ic('check', 15) + '</span>' : '') + '</div></div>' + JM.ring(m.score || 0, 58, scoreColor(m.score || 0)) + '</div>' +
      '<div class="row wrap small" style="color:var(--ink2);gap:14px"><span class="row gap-s">' + ic('pin', 15) + esc(JM.area(j.area_id)) + (m.dist != null ? ' · ' + m.dist + ' km' : '') + '</span><span class="bold">' + JM.salary(j) + '</span></div>' +
      '<div class="chips">' + JM.skillChips(j) + '</div><p class="small muted" style="margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">' + esc(j.description) + '</p>' +
      '<div class="why"><b>Why this match:</b> ' + esc((m.why || []).slice(0, 3).join(', ')) + '.</div></article>';
  }
  function drawDeck() {
    const root = document.getElementById('deck'); if (!root) return;
    const items = JM.deckItems, stack = items.slice(0, 3);
    root.innerHTML = stack.length ? stack.map(function (j, i) { return cardHtml(j, i); }).reverse().join('') : '';
    const empty = document.getElementById('deck-empty'); if (empty) empty.classList.toggle('hide', !!stack.length);
    document.getElementById('deck-tools').classList.toggle('hide', !stack.length);
    const stars = document.getElementById('stars-left'); if (stars) { const n = JM.me.seeker.stars_left; stars.textContent = n >= 999 ? 'Unlimited stars' : n + (n === 1 ? ' star left today' : ' stars left today'); }
    bindTop();
  }
  function bindTop() {
    const top = document.querySelector('#deck .jcard.top'); if (!top) return;
    let sx = 0, sy = 0, dx = 0, dy = 0, drag = false;
    const stamps = { no: top.querySelector('.stamp.no'), yes: top.querySelector('.stamp.yes'), top: top.querySelector('.stamp.top') };
    top.addEventListener('pointerdown', function (e) { if (e.button > 0) return; drag = true; sx = e.clientX; sy = e.clientY; dx = dy = 0; top.setPointerCapture(e.pointerId); top.classList.remove('snap', 'fly'); });
    top.addEventListener('pointermove', function (e) {
      if (!drag) return; dx = e.clientX - sx; dy = e.clientY - sy;
      top.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + dx / 20 + 'deg)';
      stamps.yes.style.opacity = Math.max(0, Math.min(1, dx / 90)); stamps.no.style.opacity = Math.max(0, Math.min(1, -dx / 90)); stamps.top.style.opacity = dy < -40 && Math.abs(dx) < 80 ? Math.min(1, -dy / 110) : 0;
    });
    const end = function () {
      if (!drag) return; drag = false;
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) { JM.go('/jobs/' + top.dataset.id); return; }
      if (dy < -110 && Math.abs(dx) < 110) return decide('star');
      if (dx > 100) return decide('right'); if (dx < -100) return decide('left');
      top.classList.add('snap'); top.style.transform = ''; Object.keys(stamps).forEach(function (k) { stamps[k].style.opacity = 0; });
    };
    top.addEventListener('pointerup', end); top.addEventListener('pointercancel', end);
  }
  let busy = false;
  async function decide(dir) {
    if (busy || !JM.deckItems.length) return; busy = true;
    const job = JM.deckItems[0], top = document.querySelector('#deck .jcard.top');
    try {
      if (dir === 'star' && JM.me.seeker.stars_left <= 0) { snapBack(top); return starsModal(); }
      const res = await JM.rpc('swipe_job', { p_job: job.id, p_dir: dir });
      if (!res.ok) {
        snapBack(top);
        if (res.reason === 'nostars') starsModal(); else { JM.toast('That job is no longer available.', 'bad'); JM.deckItems.shift(); drawDeck(); }
        return;
      }
      JM.me.seeker.stars_left = res.stars_left;
      if (top) { top.classList.add('fly'); top.style.transform = dir === 'star' ? 'translate(0,-640px)' : 'translate(' + (dir === 'right' ? 640 : -640) + 'px,60px) rotate(' + (dir === 'right' ? 18 : -18) + 'deg)'; top.style.opacity = 0; }
      JM.lastSwipe = true;
      await new Promise(function (r) { setTimeout(r, 230); });
      JM.deckItems.shift(); drawDeck();
      if (dir === 'right') JM.toast('Saved to Preferred');
      if (dir === 'star') JM.toast('Starred as a top pick', 'ok');
      if (JM.deckItems.length < 3 && !JM.deckLoading) refill();
    } catch (e) { snapBack(top); JM.toast(JM.err(e), 'bad'); } finally { busy = false; }
  }
  function snapBack(top) { if (!top) return; top.classList.add('snap'); top.style.transform = ''; top.querySelectorAll('.stamp').forEach(function (s) { s.style.opacity = 0; }); }
  function starsModal() {
    JM.modal('<h2>You are out of stars for today</h2><p class="muted mt">Free accounts get 3 stars a day. A star tells an employer you really want the job, and it resets at midnight. Pro gives you unlimited stars.</p><div class="row mt-l" style="justify-content:flex-end"><button class="btn secondary" data-act="close">Maybe later</button><a class="btn" href="#/pro" data-act="close">See Pro</a></div>');
  }
  async function refill() {
    JM.deckLoading = true;
    try {
      const have = {}; JM.deckItems.forEach(function (j) { have[j.id] = 1; });
      const more = await JM.rpc('get_deck', { p_limit: 30 });
      more.forEach(function (j) { if (!have[j.id]) JM.deckItems.push(j); }); drawDeck();
    } finally { JM.deckLoading = false; }
  }
  JM.actions.swipe = function (el) { decide(el.dataset.dir); };
  JM.actions.undo = async function (el) {
    if (busy) return;
    await JM.busy(el, async function () {
      const r = await JM.rpc('undo_swipe');
      if (!r.ok) return JM.toast(r.reason === 'applied' ? 'You already applied to that job.' : 'Nothing to undo.');
      JM.me.seeker.stars_left = r.stars_left;
      const j = await JM.rpc('get_job', { p_job: r.job_id });
      if (j) { JM.deckItems = JM.deckItems.filter(function (x) { return x.id !== j.id; }); JM.deckItems.unshift(j); }
      drawDeck();
    });
  };
  JM.actions.deckrefresh = async function (el) { await JM.busy(el, async function () { JM.deckItems = await JM.rpc('get_deck', { p_limit: 30 }); drawDeck(); }); };
  JM.actions.filters = function () {
    const f = JM.me.seeker.filters || {};
    JM.modal('<h2>Filter jobs</h2><form data-form="filters" class="mt"><label class="check mb"><input type="checkbox" name="nearMe"' + (f.nearMe ? ' checked' : '') + '><span class="small"><b>Only jobs within my commute limit</b><br><span class="muted">Currently ' + JM.me.seeker.commute_km + ' km from ' + esc(JM.area(JM.me.seeker.area_id)) + '</span></span></label>' +
      '<div class="field"><label class="label">Job type</label><select name="type"><option value="">Any</option>' + TYPES.map(function (t) { return '<option' + (f.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label class="label">Pays at least (₱ per month)</label><input type="number" name="minSalary" min="0" step="500" value="' + (f.minSalary || 0) + '"></div>' +
      '<div class="row" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn" type="submit">Apply filters</button></div></form>');
  };
  JM.forms.filters = async function (form, d) {
    const f = { nearMe: !!d.nearMe, type: d.type || '', minSalary: Number(d.minSalary) || 0 };
    await JM.q(JM.sb.from('seeker_profiles').update({ filters: f }).eq('user_id', JM.me.id));
    JM.me.seeker.filters = f; JM.close(); JM.deckItems = await JM.rpc('get_deck', { p_limit: 30 }); drawDeck();
  };
  document.addEventListener('keydown', function (e) {
    if (location.hash !== '#/deck' || document.getElementById('overlay-root').classList.contains('open')) return;
    if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
    if (e.key === 'ArrowRight') decide('right'); else if (e.key === 'ArrowLeft') decide('left'); else if (e.key === 'ArrowUp') { e.preventDefault(); decide('star'); }
  });
  JM.route('/deck', { auth: 'seeker', title: 'Discover', render: async function () {
    JM.deckItems = await JM.rpc('get_deck', { p_limit: 30 }); JM.me.seeker.stars_left = (await JM.rpc('me')).seeker.stars_left;
    const f = JM.me.seeker.filters || {}, nf = (f.nearMe ? 1 : 0) + (f.type ? 1 : 0) + (f.minSalary ? 1 : 0);
    return '<div class="page narrow"><div class="row between mb"><div><h1 style="font-size:22px">Discover</h1><div class="small muted" id="stars-left"></div></div><button class="btn secondary sm" data-act="filters">' + ic('sliders', 16) + 'Filters' + (nf ? ' (' + nf + ')' : '') + '</button></div>' +
      '<div class="deckwrap"><div class="deck" id="deck"></div>' +
      '<div class="actions" id="deck-tools"><button class="rbtn sm" data-act="undo" aria-label="Undo last swipe">' + ic('undo') + '</button><button class="rbtn no" data-act="swipe" data-dir="left" aria-label="Pass">' + ic('x') + '</button><button class="rbtn star" data-act="swipe" data-dir="star" aria-label="Star as top pick">' + ic('star') + '</button><button class="rbtn yes" data-act="swipe" data-dir="right" aria-label="Save to preferred">' + ic('heart') + '</button></div>' +
      '<p class="xs muted center" id="deck-hint">Swipe right to save, left to pass, up to star. Tap a card for details. Arrow keys work too.</p>' +
      '<div id="deck-empty" class="hide">' + JM.empty('layers', 'You are all caught up', nf ? 'No more jobs match your filters. Loosen them or check back later.' : 'You have seen every job for now. New listings appear here as employers post them.',
        '<div class="row" style="justify-content:center">' + (nf ? '<button class="btn secondary" data-act="filters">Change filters</button>' : '') + '<button class="btn" data-act="deckrefresh">Refresh</button></div>') + '</div></div></div>';
  }, after: drawDeck });

  // ---------- job detail ----------
  JM.route('/jobs/:id', { auth: 'seeker', title: 'Job details', render: async function (p) {
    const j = await JM.rpc('get_job', { p_job: p.id });
    if (!j) return '<div class="page narrow">' + JM.empty('briefcase', 'This job is no longer available', 'The employer may have closed it.', '<a class="btn" href="#/deck">Back to Discover</a>') + '</div>';
    JM.cur = j; const m = j.match || {}, parts = m.parts || {}, ap = j.application;
    const part = function (l, v, w) { return '<div class="skill"><div class="row between small"><span>' + l + ' <span class="muted">(' + w + '% of score)</span></span><b class="num">' + v + '%</b></div>' + JM.bar(v, v >= 70 ? 'ok' : '') + '</div>'; };
    const cta = ap ? '<div class="notice ok">' + ic('check') + '<div><b>You applied ' + JM.ago(ap.created_at) + '.</b> Status: ' + esc(ap.status) + '. <a href="#/applications">See your applications</a></div></div>' :
      '<div class="row wrap"><button class="btn lg" data-act="apply" data-id="' + j.id + '">Apply now</button>' + (j.swipe === 'right' || j.swipe === 'star' ? '<span class="badge brand">' + ic('heart', 12) + 'Saved</span>' : '<button class="btn secondary lg" data-act="savejob" data-id="' + j.id + '">' + ic('heart', 16) + 'Save</button>') + '</div>';
    return '<div class="page narrow"><a class="small row gap-s" href="#/deck" style="margin-bottom:14px">' + ic('left', 16) + 'Back</a>' +
      '<div class="card card-b"><div class="row" style="align-items:flex-start"><div class="grow"><div class="row gap-s wrap">' + (j.boosted ? JM.badge('Featured', 'star') : '') + JM.badge(j.type, 'brand') + (j.company.verified ? JM.badge('Verified business', 'ok') : '') + '</div><h1 style="margin-top:12px">' + esc(j.title) + '</h1><p class="muted mt" style="margin-bottom:0">' + esc(j.company.name) + ' · ' + esc(JM.area(j.area_id)) + '</p></div>' + JM.ring(m.score || 0, 64, scoreColor(m.score || 0)) + '</div>' +
      '<div class="row wrap mt" style="gap:20px"><div><div class="xs muted">Pay</div><b>' + JM.salary(j) + '</b></div><div><div class="xs muted">Distance</div><b>' + (m.dist != null ? m.dist + ' km' : 'n/a') + '</b></div><div><div class="xs muted">Posted</div><b>' + JM.ago(j.posted_at) + '</b></div></div><div class="mt-l">' + cta + '</div></div>' +
      '<div class="card mt"><div class="card-h"><h3>Why you match</h3></div><div class="card-b">' + part('Skills', parts.skills || 0, 55) + part('Location', parts.location || 0, 20) + part('Interests', parts.interest || 0, 15) + part('Pay', parts.salary || 0, 10) +
      '<div class="divider"></div><div class="label">Skills for this job</div><div class="chips">' + JM.skillChips(j) + '</div>' + ((m.missing || []).length ? '<p class="small muted mt" style="margin-bottom:0">Skills in amber are not at a hiring level yet. ' + (j.role_id ? '<a href="#/career/job/' + j.id + '">See how to close the gap</a>.' : '') + '</p>' : '') + '</div></div>' +
      '<div class="card mt"><div class="card-h"><h3>About the job</h3></div><div class="card-b" style="white-space:pre-wrap">' + esc(j.description) + '</div></div>' +
      '<div class="card mt"><div class="card-h"><h3>About ' + esc(j.company.name) + '</h3></div><div class="card-b"><p>' + esc(j.company.about || 'No description yet.') + '</p><p class="small muted" style="margin:0">' + esc(j.company.type || '') + '. Contact details are shared when the employer shortlists you.</p></div></div>' +
      '<p class="center small mt"><button class="btn ghost sm" data-act="reportjob" data-id="' + j.id + '">' + ic('flag', 15) + 'Report this listing</button></p></div>';
  } });
  JM.actions.savejob = async function (el) { await JM.busy(el, async function () { const r = await JM.rpc('swipe_job', { p_job: el.dataset.id, p_dir: 'right' }); if (!r.ok) return JM.toast('That job is no longer available.', 'bad'); JM.toast('Saved to Preferred'); JM.render(); }); };
  JM.actions.apply = async function (el) {
    await JM.busy(el, async function () {
      const r = await JM.rpc('apply_job', { p_job: el.dataset.id });
      if (!r.ok) return JM.toast(r.reason === 'profile' ? 'Finish your profile first.' : 'That job is no longer available.', 'bad');
      JM.toast(r.existing ? 'You already applied.' : 'Application sent. Good luck!', 'ok'); JM.loadMe().then(JM.updateBadges); JM.render();
    });
  };
  JM.actions.reportjob = function (el) {
    JM.modal('<h2>Report this listing</h2><p class="muted mt">Tell us what is wrong. An administrator will review it.</p><form data-form="report" data-kind="job" data-target="' + el.dataset.id + '" class="mt"><div class="field"><textarea name="reason" minlength="3" maxlength="1000" placeholder="For example: asks for a fee, misleading pay, or discriminatory wording" required></textarea></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn danger" type="submit">Send report</button></div></form>');
  };
  JM.forms.report = async function (form, d) {
    if (String(d.reason || '').trim().length < 3) return JM.toast('Add a short reason.', 'bad');
    await JM.rpc('report_content', { p_kind: form.dataset.kind, p_target: form.dataset.target, p_reason: d.reason });
    JM.close(); JM.toast('Report sent. Thank you.', 'ok');
  };

  // ---------- preferred ----------
  JM.route('/preferred', { auth: 'seeker', title: 'Preferred', render: async function () {
    const items = await JM.rpc('get_preferred');
    const rows = items.map(function (x) {
      const j = x.job, ap = x.application;
      return '<div class="li"><a href="#/jobs/' + j.id + '" class="row grow" style="color:inherit;gap:14px"><div class="avatar sq">' + esc(JM.initials(j.company.name)) + '</div><div class="grow"><div class="bold">' + esc(j.title) + (x.starred ? ' <span style="color:var(--star)">' + ic('star', 14) + '</span>' : '') + '</div><div class="small muted">' + esc(j.company.name) + ' · ' + JM.salary(j) + '</div></div></a>' +
        '<b class="num" style="color:' + scoreColor(j.match.score) + '">' + j.match.score + '%</b>' + (ap ? JM.badge(ap.status, ap.status === 'rejected' ? 'bad' : 'ok') : j.status === 'published' ? '<button class="btn sm" data-act="apply" data-id="' + j.id + '">Apply</button>' : JM.badge('Closed')) +
        '<button class="iconbtn" data-act="unprefer" data-id="' + j.id + '" aria-label="Remove from preferred" style="width:32px;height:32px">' + ic('x', 16) + '</button></div>';
    }).join('');
    return '<div class="page narrow">' + JM.pageHead('Preferred jobs', 'Jobs you saved. Starred jobs stay on top.') + (items.length ? '<div class="card list">' + rows + '</div>' : '<div class="card">' + JM.empty('heart', 'Nothing saved yet', 'Swipe right on jobs you like and they will wait here.', '<a class="btn" href="#/deck">Browse jobs</a>') + '</div>') + '</div>';
  } });
  JM.actions.unprefer = async function (el) { await JM.busy(el, async function () { await JM.rpc('remove_preferred', { p_job: el.dataset.id }); JM.render(); }); };

  // ---------- applications ----------
  const STATUS = { applied: ['Applied', ''], shortlisted: ['Shortlisted', 'ok'], hired: ['Hired', 'ok'], rejected: ['Not selected', 'bad'] };
  JM.route('/applications', { auth: 'seeker', title: 'Applications', render: async function () {
    const items = await JM.rpc('my_applications');
    const rows = items.map(function (a) {
      const st = STATUS[a.status];
      return '<div class="li" style="align-items:flex-start;flex-wrap:wrap"><div class="avatar sq">' + esc(JM.initials(a.job.company)) + '</div><div class="grow"><a class="bold" href="#/jobs/' + a.job.id + '" style="color:var(--ink)">' + esc(a.job.title) + '</a><div class="small muted">' + esc(a.job.company) + ' · applied ' + JM.ago(a.created_at) + ' · ' + (a.viewed ? 'viewed by employer' : 'not viewed yet') + '</div>' +
        (a.status === 'rejected' && a.job.role_id ? '<div class="small mt"><a href="#/career/job/' + a.job.id + '">See what to improve for roles like this</a></div>' : '') + '</div>' +
        JM.badge(st[0], st[1]) + (a.conversation_id ? '<a class="btn secondary sm" href="#/messages/' + a.conversation_id + '">' + ic('chat', 15) + 'Chat</a>' : '') + '<button class="btn ghost sm" data-act="insights" data-id="' + a.id + '">Insights' + (JM.me.seeker.plan === 'pro' ? '' : ic('lock', 13)) + '</button></div>';
    }).join('');
    return '<div class="page narrow">' + JM.pageHead('Applications', 'Track every job you applied to.') + (items.length ? '<div class="card list">' + rows + '</div>' : '<div class="card">' + JM.empty('briefcase', 'No applications yet', 'Apply to a job and its progress shows up here.', '<a class="btn" href="#/deck">Find jobs</a>') + '</div>') + '</div>';
  } });
  JM.actions.insights = async function (el) {
    if (JM.me.seeker.plan !== 'pro') return JM.modal('<h2>Application insights</h2><p class="muted mt">See how you rank among applicants, the median score, and how fast this employer replies. Included with JobMatch Pro.</p><div class="row mt-l" style="justify-content:flex-end"><button class="btn secondary" data-act="close">Close</button><a class="btn" href="#/pro" data-act="close">See Pro</a></div>');
    await JM.busy(el, async function () {
      const r = await JM.rpc('application_insights', { p_app: el.dataset.id });
      const stat = function (n, l) { return '<div class="card flat stat"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>'; };
      JM.modal('<h2>Application insights</h2><div class="grid g2 keep mt">' + stat('#' + r.rank + ' of ' + r.total, 'Your rank by match score') + stat(r.score + '%', 'Your match score') + stat(r.median_score + '%', 'Median applicant score') + stat(r.avg_response_hours == null ? 'No data yet' : r.avg_response_hours + ' h', 'Average employer response') + '</div>' +
        '<p class="small muted mt">' + (r.viewed_at ? 'Viewed by the employer ' + JM.ago(r.viewed_at) + '.' : 'The employer has not opened your application yet.') + '</p><div class="row mt" style="justify-content:flex-end"><button class="btn" data-act="close">Done</button></div>');
    });
  };

  // ---------- matches ----------
  JM.route('/matches', { auth: 'seeker', title: 'Matches', render: async function () {
    const items = await JM.rpc('my_matches');
    const cards = items.map(function (x) {
      const c = x.company;
      return '<div class="card card-b"><div class="row" style="align-items:flex-start"><div class="avatar lg sq">' + esc(JM.initials(c.name)) + '</div><div class="grow"><div class="row gap-s wrap"><h3>' + esc(c.name) + '</h3>' + JM.badge(x.status === 'hired' ? 'Hired' : 'Shortlisted', 'ok') + '</div><div class="muted small">' + esc(x.job.title) + ' · ' + JM.ago(x.matched_at) + '</div></div></div>' +
        '<div class="divider"></div><div class="small col gap-s"><div class="row gap-s">' + ic('user', 15) + esc(c.contact_name || 'Hiring team') + '</div>' + (c.contact_phone ? '<div class="row gap-s">' + ic('mail', 15) + esc(c.contact_phone) + '</div>' : '') + (c.contact_email ? '<div class="row gap-s">' + ic('mail', 15) + '<a href="mailto:' + esc(c.contact_email) + '">' + esc(c.contact_email) + '</a></div>' : '') + (c.address ? '<div class="row gap-s">' + ic('pin', 15) + esc(c.address) + '</div>' : '') + '</div>' +
        (x.conversation_id ? '<a class="btn block mt" href="#/messages/' + x.conversation_id + '">' + ic('chat', 16) + 'Message ' + esc(c.name) + '</a>' : '') + '</div>';
    }).join('');
    return '<div class="page">' + JM.pageHead('Matches', 'Employers who shortlisted you. They can now see your full profile and contact details.') + (items.length ? '<div class="grid g2">' + cards + '</div>' : '<div class="card">' + JM.empty('users', 'No matches yet', 'When an employer shortlists you, they show up here and a chat opens. Keep applying and building your skills.', '<a class="btn" href="#/deck">Find jobs</a>') + '</div>') + '</div>';
  } });

  // celebration when an employer shortlists the seeker
  let lastCheck = 0;
  JM.checkMatch = async function (force) {
    if (!JM.me || JM.me.role !== 'seeker' || (!force && Date.now() - lastCheck < 20000) || document.getElementById('overlay-root').classList.contains('open')) return; lastCheck = Date.now();
    try {
      const m = await JM.rpc('take_unseen_match'); if (!m) return;
      JM.modal('<div class="ic" style="width:auto;height:auto;margin-bottom:10px">' + ic('star', 40) + '</div><h1>It is a Match!</h1><p style="margin:12px 0 24px;opacity:.9">' + esc(m.company) + ' shortlisted you for ' + esc(m.job_title) + '. They can now see your full profile and message you.</p><div class="col"><a class="btn secondary block" href="#/matches" data-act="close">See my matches</a><button class="btn ghost block" style="color:#fff" data-act="close">Keep browsing</button></div>', 'celebrate');
      JM.loadMe().then(JM.updateBadges);
    } catch (e) { /* ignore */ }
  };
})();
