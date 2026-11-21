/* Job seeker: onboarding, profile, Discover deck (with 4:3 photo + logo circle), job detail, preferred, applications, matches. */
(function () {
  const JM = window.JM, ic = JM.icon, esc = JM.esc;
  const EDU = ['Elementary', 'Junior high school', 'Senior high school', 'Vocational / TESDA', 'College undergraduate', 'College graduate', 'Post-graduate'];
  const TYPES = ['Full-time', 'Part-time', 'Internship / OJT', 'Contract'];
  const SETUPS = ['On-site', 'Hybrid', 'Remote'];
  const GOAL_LEVELS = ['', 'Entry', 'Mid', 'Senior', 'Lead'];
  const GOAL_TIMES = ['', 'Within 3 months', '6 months', '1 year', '2+ years'];
  JM.EDU = EDU; JM.TYPES = TYPES; JM.SETUPS = SETUPS;

  function areaGroup(name) {
    if (!name) return '';
    const m = name.split(/\s*[–—-]\s*/);
    if (m.length > 1) return m[0].trim();
    const c = name.split(',');
    return c[0].trim();
  }

  JM.loadRef = async function () {
    const r = await Promise.all([
      JM.q(JM.sb.from('areas').select('id,name').order('name')),
      JM.q(JM.sb.from('skills').select('name,category,aliases').eq('active', true).order('name')),
      JM.q(JM.sb.from('career_roles').select('id,title,category,level,aliases').eq('active', true).order('title')),
      JM.q(JM.sb.from('skill_categories').select('id,name,icon,sort').order('sort')).catch(function () { return []; }),
      JM.q(JM.sb.from('role_categories').select('id,name,icon,sort').order('sort')).catch(function () { return []; })
    ]);
    JM.areas = r[0] || [];
    JM.areaItems = JM.areas.map(function (a) { return { value: a.id, label: a.name, group: areaGroup(a.name) }; });
    JM.skillsRaw = r[1] || [];
    JM.skillList = JM.skillsRaw.map(function (s) { return s.name; });
    JM.skillsMap = {};
    JM.skillsByCat = {};
    JM.skillsRaw.forEach(function (s) {
      const cat = s.category || 'core';
      JM.skillsMap[s.name] = s;
      JM.skillsByCat[cat] = JM.skillsByCat[cat] || [];
      JM.skillsByCat[cat].push(s);
    });
    JM.skillCategories = (r[3] && r[3].length) ? r[3] : [{ id: 'core', name: 'General skills', icon: 'sparkle', sort: 10 }];
    JM.skillCatMap = {};
    JM.skillCategories.forEach(function (c) { JM.skillCatMap[c.id] = c; });
    JM.roles = r[2] || [];
    JM.roleCategories = r[4] || [];
    const catNames = JM.roleCategories.length
      ? JM.roleCategories.map(function (c) { return c.name; })
      : Array.from(new Set(JM.roles.map(function (x) { return x.category; }))).sort();
    JM.categories = Array.from(new Set(catNames.concat(JM.roles.map(function (x) { return x.category; }))));
    try { JM.popularRoles = await JM.rpc('popular_roles'); } catch (e) { JM.popularRoles = []; }
  };

  // ---------- draft (onboarding + profile) ----------
  JM.initDraft = function () {
    const m = JM.me, s = m.seeker, sk = {};
    (s.skills || []).forEach(function (k) { sk[k.name] = k.level; });
    JM.draft = {
      full_name: m.full_name, phone: m.phone, birth_year: s.birth_year || '', gender: s.gender || '',
      edu_level: s.edu_level || '', school: s.school || '', course: s.course || '', grad_year: s.grad_year || '',
      experience: JSON.parse(JSON.stringify(s.experience || [])),
      interests: (s.interests || []).slice(),
      goal_role: s.goal_role || '', goal_text: s.goal_text || '',
      goal_level: s.goal_level || '', goal_timeframe: s.goal_timeframe || '',
      goal_other: !s.goal_role && !!String(s.goal_text || '').trim(),
      area_id: s.area_id, commute_km: s.commute_km, salary_min: s.salary_min || '',
      job_types: (s.job_types || []).slice(),
      work_setups: (s.work_setups && s.work_setups.length) ? s.work_setups.slice() : SETUPS.slice(),
      resume_summary: s.resume_summary || '',
      summary_source: s.summary_source || 'auto',
      resume_path: s.resume_path || null, resume_link: s.resume_link || '', resume_mode: s.resume_mode,
      avatar_path: s.avatar_path || null, photo_path: s.photo_path || null,
      certificates: JSON.parse(JSON.stringify(s.certificates || [])),
      open_to_employers: !!s.open_to_employers, skills: sk,
      _roleSkills: [], _parsedSkills: [], _parsedTools: [], _parsedLangs: [], _parsedCerts: []
    };
    JM._draftSnap = summaryFingerprint(JM.draft);
    if (JM.draft.goal_role) loadRoleSkillsForDraft(JM.draft.goal_role);
  };

  function summaryFingerprint(d) {
    return JSON.stringify({
      edu: [d.edu_level, d.school, d.course, d.grad_year],
      exp: d.experience,
      sk: d.skills,
      goal: [d.goal_role, d.goal_text, d.goal_level],
      certs: (d.certificates || []).map(function (c) { return c.title; }),
      setups: d.work_setups,
      types: d.job_types
    });
  }

  async function loadRoleSkillsForDraft(roleId) {
    if (!roleId || !JM.draft) return;
    try {
      const rs = await JM.q(JM.sb.from('role_skills').select('skill,weight').eq('role_id', roleId).order('weight', { ascending: false }));
      if (JM.draft && JM.draft.goal_role === roleId) {
        JM.draft._roleSkills = rs.map(function (x) { return x.skill; });
        JM.drawDraft();
      }
    } catch (e) { /* ignore */ }
  }

  // ---------- Detailed 6-part Professional Summary composer (Section 7.3) ----------
  function composeSummary(d, parsed) {
    parsed = parsed || {};
    const roleObj = (JM.roles || []).find(function (r) { return r.id === d.goal_role; });
    const roleTitle = roleObj ? roleObj.title : (String(d.goal_text || '').trim() || 'a growth-oriented role');
    const lvlPrefix = d.goal_level ? d.goal_level.toLowerCase() + '-level ' : '';
    const areaName = JM.area(d.area_id) || 'Biñan, Laguna';
    const setups = (d.work_setups && d.work_setups.length) ? d.work_setups : SETUPS;
    const setupPhrase = setups.length === 3 ? 'on-site, hybrid, or remote' : setups.join(' or ').toLowerCase();

    // 1. Headline
    const p1Parts = [];
    const bgTag = d.edu_level
      ? (d.course ? d.edu_level + ' (' + d.course + ')' : d.edu_level + ' candidate')
      : 'Dedicated professional';
    p1Parts.push(bgTag + ' pursuing ' + lvlPrefix + roleTitle + ' opportunities, open to ' + setupPhrase + ' roles based in or near ' + areaName + '.');

    // 2. Education
    if (d.edu_level || d.school || d.course) {
      const eduSeg = [d.edu_level, d.course ? 'in ' + d.course : '', d.school ? 'at ' + d.school : '', d.grad_year ? '(Class of ' + d.grad_year + ')' : ''].filter(Boolean).join(' ');
      p1Parts.push('Academic background includes ' + eduSeg + '.');
    }

    // 3. Experience
    const exp = (d.experience || []).filter(function (x) { return x.role || x.org; });
    let p2 = '';
    if (exp.length) {
      let totalYrs = 0;
      exp.forEach(function (x) { const n = parseFloat(String(x.years || '').replace(/[^\d.]/g, '')); if (!isNaN(n)) totalYrs += n; });
      const yrText = totalYrs > 0 ? (Math.round(totalYrs * 10) / 10) + '+ year' + (totalYrs === 1 ? '' : 's') + ' of hands-on experience' : 'Practical work and OJT experience';
      const roleSummaries = exp.slice(0, 3).map(function (x) {
        let s = (x.role || 'Team Member') + (x.org ? ' at ' + x.org : '') + (x.years ? ' (' + x.years + ' yr)' : '');
        if (Array.isArray(x.highlights) && x.highlights.length) s += ' — ' + x.highlights.slice(0, 2).join('; ');
        return s;
      });
      p2 = yrText + ' across roles including ' + roleSummaries.join('; ') + '.';
    } else {
      p2 = 'Brings strong foundational training, practical project readiness, and eagerness to contribute immediately to team operations.';
    }

    // 4. Skills grouped by category (Advanced & Intermediate first)
    const skEntries = Object.keys(d.skills || {}).map(function (name) {
      return { name: name, level: d.skills[name], cat: JM.skillCatName(name) };
    }).sort(function (a, b) { return b.level - a.level || a.name.localeCompare(b.name); });
    const adv = skEntries.filter(function (x) { return x.level >= 90; }).map(function (x) { return x.name; });
    const mid = skEntries.filter(function (x) { return x.level >= 60 && x.level < 90; }).map(function (x) { return x.name; });
    const beg = skEntries.filter(function (x) { return x.level < 60; }).map(function (x) { return x.name; });
    const skBits = [];
    if (adv.length) skBits.push('advanced in ' + adv.slice(0, 6).join(', '));
    if (mid.length) skBits.push('intermediate in ' + mid.slice(0, 6).join(', '));
    if (!adv.length && !mid.length && beg.length) skBits.push('building proficiency in ' + beg.slice(0, 6).join(', '));
    const tools = (parsed.tools || d._parsedTools || []).filter(Boolean);
    const langs = (parsed.languages || d._parsedLangs || []).filter(Boolean);
    const skCatSet = Array.from(new Set(skEntries.map(function (x) { return x.cat; }))).slice(0, 4);
    let p3Parts = [];
    if (skBits.length) {
      p3Parts.push('Core strengths span ' + (skCatSet.length ? skCatSet.join(', ') + ': ' : '') + skBits.join('; ') + '.');
    }
    if (tools.length) p3Parts.push('Familiar with tools including ' + tools.slice(0, 6).join(', ') + '.');
    if (langs.length) p3Parts.push('Languages: ' + langs.slice(0, 4).join(', ') + '.');

    // 5. Credentials
    const certTitles = (d.certificates || []).map(function (c) { return c.title; }).concat(parsed.certificates || d._parsedCerts || []).filter(Boolean);
    const uniqCerts = Array.from(new Set(certTitles));
    if (uniqCerts.length) {
      p3Parts.push('Credentials and certifications include ' + uniqCerts.slice(0, 5).join(', ') + '.');
    }

    // 6. Availability & preferences
    const jtypes = (d.job_types && d.job_types.length) ? d.job_types.join(', ') : 'Full-time';
    const prefBits = ['Available for ' + jtypes + ' roles (' + setupPhrase + ')'];
    if (d.commute_km) prefBits.push('within a ' + d.commute_km + ' km commute of ' + areaName);
    if (d.goal_timeframe) prefBits.push('targeting next milestone ' + d.goal_timeframe.toLowerCase());
    p3Parts.push(prefBits.join(', ') + '.');

    return [p1Parts.join(' '), p2, p3Parts.join(' ')].filter(Boolean).join('\n\n').slice(0, 2000);
  }
  JM.composeSummary = composeSummary;

  function wordCount(s) {
    const t = String(s || '').trim();
    return t ? t.split(/\s+/).length : 0;
  }

  JM.drawDraft = function () {
    const r = document.getElementById('draft-root');
    if (r && JM.draftRender) {
      r.innerHTML = JM.draftRender();
      JM.mountTypeaheads(r);
      JM.hydrateImages(r);
      const ta = r.querySelector('textarea[data-d="resume_summary"]');
      if (ta) { ta.style.height = 'auto'; ta.style.height = Math.max(150, ta.scrollHeight) + 'px'; }
    }
  };
  JM.inputs.d = function (el) {
    const k = el.dataset.d;
    JM.draft[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' || el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
    if (k === 'commute_km') { const o = document.getElementById('km-out'); if (o) o.textContent = el.value + ' km'; }
    if (k === 'resume_summary') {
      JM.draft.summary_source = 'manual';
      const wc = document.getElementById('sum-wc'); if (wc) wc.textContent = wordCount(el.value) + ' words · ' + el.value.length + '/2000 chars';
      el.style.height = 'auto'; el.style.height = Math.max(150, el.scrollHeight) + 'px';
    }
  };
  JM.inputs.exp = function (el) { JM.draft.experience[Number(el.dataset.i)][el.dataset.k] = el.value; };

  JM.inputs.resume = async function (el) {
    const f = (el._pvExtra && el._pvExtra.file) || el.files[0]; if (!f) return;
    if (JM.isHeic(f)) { JM.toast(JM.HEIC_MSG, 'bad'); el.value = ''; return; }
    if (f.size > 5 * 1024 * 1024) { JM.toast('File is larger than 5 MB.', 'bad'); el.value = ''; return; }
    const ext = (f.name.split('.').pop() || 'pdf').toLowerCase();
    if (['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp', 'txt'].indexOf(ext) < 0) { JM.toast('Upload a PDF, Word, JPG, PNG or WEBP file.', 'bad'); el.value = ''; return; }
    const path = JM.me.id + '/resume-' + Date.now() + '.' + ext;
    try {
      const r = await JM.sb.storage.from('resumes').upload(path, f, { contentType: f.type || undefined });
      if (r.error) throw r.error;
      if (JM.draft.resume_path) JM.sb.storage.from('resumes').remove([JM.draft.resume_path]);
      JM.draft.resume_path = path; JM.draft.resume_mode = 'uploaded'; JM.draft.resume_name = f.name;
      JM._lastResumeText = '';
      if (/\.txt$|\.md$/i.test(f.name)) {
        try { JM._lastResumeText = await f.text(); } catch (x) {}
      }
      if (JM.draft.summary_source !== 'manual' || !String(JM.draft.resume_summary || '').trim()) {
        JM.draft.resume_summary = composeSummary(JM.draft);
      }
      JM.toast('Résumé uploaded! Click "Update All Info" to extract your full details and summary.', 'ok');
      JM.drawDraft();
    } catch (e) { JM.toast(JM.err(e), 'bad'); }
  };

  async function applyParsedResume(parsed) {
    const protectedFields = { full_name: JM.draft.full_name, phone: JM.draft.phone, birth_year: JM.draft.birth_year };
    const updated = [];
    if (parsed.edu_level) { JM.draft.edu_level = parsed.edu_level; updated.push('Education level'); }
    if (parsed.school) { JM.draft.school = parsed.school; updated.push('School'); }
    if (parsed.course) { JM.draft.course = parsed.course; updated.push('Course / strand'); }
    if (parsed.grad_year) { JM.draft.grad_year = parsed.grad_year; updated.push('Graduation year'); }
    if (Array.isArray(parsed.skills) && parsed.skills.length) {
      JM.draft._parsedSkills = parsed.skills.slice();
      parsed.skills.forEach(function (s) { if (JM.draft.skills[s] == null) JM.draft.skills[s] = 70; });
      updated.push('Skills (' + parsed.skills.length + ')');
    }
    if (Array.isArray(parsed.experience) && parsed.experience.length) {
      JM.draft.experience = parsed.experience;
      updated.push('Work / OJT experience (' + parsed.experience.length + ')');
    }
    if (Array.isArray(parsed.tools)) JM.draft._parsedTools = parsed.tools;
    if (Array.isArray(parsed.languages)) JM.draft._parsedLangs = parsed.languages;
    if (Array.isArray(parsed.certificates)) JM.draft._parsedCerts = parsed.certificates;
    if (parsed.goal_text && !JM.draft.goal_text) { JM.draft.goal_text = parsed.goal_text; updated.push('Career goal'); }

    const candidateSummary = (parsed.resume_summary && parsed.resume_summary.length >= 300)
      ? parsed.resume_summary
      : composeSummary(JM.draft, parsed);

    // Strictly restore protected personal information
    JM.draft.full_name = protectedFields.full_name;
    JM.draft.phone = protectedFields.phone;
    JM.draft.birth_year = protectedFields.birth_year;

    const hadManual = JM.draft.summary_source === 'manual' && String(JM.draft.resume_summary || '').trim().length > 0 && JM.draft.resume_summary.trim() !== candidateSummary.trim();
    if (!hadManual) {
      JM.draft.resume_summary = candidateSummary;
      JM.draft.summary_source = 'auto';
      updated.push('Professional summary (' + wordCount(candidateSummary) + ' words)');
    }
    JM.drawDraft();

    if (hadManual) {
      JM._pendingSummary = candidateSummary;
      JM.modal('<h2>Replace your edited summary?</h2>' +
        '<p class="small muted mt">Other sections updated: <b>' + esc(updated.join(', ') || 'Summary ready') + '</b>. You previously edited your summary by hand — choose whether to keep yours or use the refreshed summary.</p>' +
        '<div class="grid g2 mt"><div class="card flat card-b" style="padding:12px"><div class="xs muted bold mb">Current (manual)</div><p class="xs" style="white-space:pre-wrap;margin:0">' + esc(JM.draft.resume_summary) + '</p></div>' +
        '<div class="card flat tint card-b" style="padding:12px"><div class="xs bold mb" style="color:var(--brand)">New from résumé (' + wordCount(candidateSummary) + ' words)</div><p class="xs" style="white-space:pre-wrap;margin:0">' + esc(candidateSummary) + '</p></div></div>' +
        '<div class="notice ok mt">' + ic('shield') + '<div><b>Protected personal details were NOT modified:</b> Full Name, Contact Number, Date of Birth, and Email remain unchanged.</div></div>' +
        '<div class="row mt-l" style="justify-content:flex-end"><button class="btn secondary" data-act="close">Keep my summary</button><button class="btn" data-act="acceptsummary">Use new summary</button></div>', 'wide');
    } else {
      JM.modal('<h2>Profile updated from résumé</h2>' +
        '<p class="small muted mt">Updated sections: <b>' + esc(updated.join(', ')) + '</b>.</p>' +
        '<div class="card flat card-b mt" style="padding:12px"><div class="xs muted bold mb">Updated Professional Summary (' + wordCount(candidateSummary) + ' words)</div><p class="xs" style="white-space:pre-wrap;margin:0">' + esc(candidateSummary) + '</p></div>' +
        '<div class="notice ok mt">' + ic('shield') + '<div><b>Protected personal details were NOT modified:</b> Full Name, Contact Number, Date of Birth, and Email Address remain unchanged.</div></div>' +
        '<p class="xs muted mt">Review your sections and click <b>Save changes</b> when ready.</p>' +
        '<div class="row mt-l" style="justify-content:flex-end"><button class="btn" data-act="close">Got it</button></div>', 'wide');
    }
  }
  JM.actions.acceptsummary = function () {
    if (JM._pendingSummary) {
      JM.draft.resume_summary = JM._pendingSummary;
      JM.draft.summary_source = 'auto';
      JM._pendingSummary = null;
      JM.drawDraft();
      JM.toast('Professional summary updated.', 'ok');
    }
    JM.close();
  };
  JM.actions.updateallinfo = async function (el) {
    if (!JM.draft.resume_path) return JM.toast('Upload a résumé file first.', 'bad');
    await JM.busy(el, async function () {
      let parsed = {};
      try {
        parsed = await JM.fn('parse-resume', { resume_path: JM.draft.resume_path, text: JM._lastResumeText || '' });
      } catch (e) { parsed = {}; }
      if (parsed.needs_text) {
        JM.modal('<h2>Paste your résumé text</h2>' +
          '<p class="small muted mt">We couldn\'t read selectable text from that file (for example, a scanned image or older .doc file). Paste the text from your résumé below to extract your skills, experience, and detailed summary.</p>' +
          '<form data-form="pasteparse" class="mt"><div class="field"><textarea name="text" rows="7" placeholder="Paste your résumé content here…" required></textarea></div>' +
          '<div class="row" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn" type="submit">' + ic('sparkle', 15) + 'Extract &amp; update</button></div></form>', 'wide');
        return;
      }
      await applyParsedResume(parsed);
    });
  };
  JM.forms.pasteparse = async function (form, d) {
    const txt = String(d.text || '').trim();
    if (txt.length < 20) return JM.toast('Paste at least a few lines from your résumé.', 'bad');
    JM._lastResumeText = txt;
    const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Extracting…';
    try {
      const parsed = await JM.fn('parse-resume', { text: txt });
      JM.close();
      await applyParsedResume(parsed);
    } catch (e) { JM.toast(JM.err(e), 'bad'); btn.disabled = false; btn.textContent = 'Extract & update'; }
  };

  JM.inputs.media = async function (el) {
    const f = (el._pvExtra && el._pvExtra.file) || el.files[0]; if (!f) return;
    if (JM.isHeic(f)) { JM.toast(JM.HEIC_MSG, 'bad'); el.value = ''; return; }
    if (f.size > 5 * 1024 * 1024) { JM.toast('File is larger than 5 MB.', 'bad'); el.value = ''; return; }
    const kind = el.dataset.kind, ext = (f.name.split('.').pop() || 'webp').toLowerCase();
    const okExts = kind === 'cert' ? ['jpg', 'jpeg', 'png', 'webp', 'pdf'] : ['jpg', 'jpeg', 'png', 'webp'];
    if (okExts.indexOf(ext) < 0) { JM.toast(kind === 'cert' ? 'Upload JPG, PNG, WEBP or PDF.' : 'Upload a JPG, PNG or WEBP image.', 'bad'); el.value = ''; return; }
    const blobUrl = el._pvExtra && el._pvExtra.blobUrl;
    // Optimistic preview while uploading
    if (kind === 'avatar' && blobUrl) { JM.draft._avatarBlob = blobUrl; JM.drawDraft(); }
    if (kind === 'photo' && blobUrl) { JM.draft._photoBlob = blobUrl; JM.drawDraft(); }
    const path = JM.me.id + '/' + kind + '-' + Date.now() + '.' + ext;
    try {
      const r = await JM.sb.storage.from('seeker-media').upload(path, f, { contentType: f.type || undefined });
      if (r.error) throw r.error;
      if (kind === 'avatar') {
        if (JM.draft.avatar_path) JM.sb.storage.from('seeker-media').remove([JM.draft.avatar_path]);
        JM.draft.avatar_path = path; JM.draft._avatarBlob = null;
        await JM.q(JM.sb.from('seeker_profiles').update({ avatar_path: path }).eq('user_id', JM.me.id));
        if (JM.me && JM.me.seeker) JM.me.seeker.avatar_path = path;
        JM.refreshShellAvatar();
      } else if (kind === 'photo') {
        if (JM.draft.photo_path) JM.sb.storage.from('seeker-media').remove([JM.draft.photo_path]);
        JM.draft.photo_path = path; JM.draft._photoBlob = null;
      } else {
        const ct = document.getElementById('cert-title'), cd = document.getElementById('cert-desc');
        const title = (el._pvExtra && el._pvExtra.title) || (ct && ct.value.trim()) || f.name.replace(/\.[^.]+$/, '');
        const desc = (el._pvExtra && el._pvExtra.desc) || (cd && cd.value.trim()) || '';
        JM.draft.certificates.push({ id: String(Date.now()), title: title, desc: desc, path: path, name: f.name, uploaded_at: new Date().toISOString() });
        if (ct) ct.value = ''; if (cd) cd.value = '';
      }
      JM.toast('Uploaded.', 'ok'); JM.drawDraft();
    } catch (e) {
      JM.draft._avatarBlob = null; JM.draft._photoBlob = null; JM.drawDraft();
      JM.toast(JM.err(e), 'bad');
    }
  };
  JM.actions.dt = function (el) {
    const arr = JM.draft[el.dataset.d], v = el.dataset.v, i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1); else arr.push(v); JM.drawDraft();
  };
  JM.actions.expadd = function () { JM.draft.experience.push({ role: '', org: '', years: '' }); JM.drawDraft(); };
  JM.actions.exprm = function (el) {
    const idx = Number(el.dataset.i);
    JM.confirm({ title: 'Remove experience?', text: 'Remove this experience entry?', ok: 'Remove', danger: true, onOk: function () { JM.draft.experience.splice(idx, 1); JM.drawDraft(); } });
  };
  JM.actions.resumerm = function () {
    JM.confirm({ title: 'Remove résumé file?', text: 'Your uploaded résumé file will be deleted.', ok: 'Remove', danger: true, onOk: function () {
      if (JM.draft.resume_path) JM.sb.storage.from('resumes').remove([JM.draft.resume_path]);
      JM.draft.resume_path = null; JM.draft.resume_mode = 'built'; JM.drawDraft();
    } });
  };
  JM.actions.mediarm = function (el) {
    const k = el.dataset.kind;
    JM.confirm({ title: 'Remove photo?', text: 'Delete this uploaded image?', ok: 'Remove', danger: true, onOk: function () {
      const p = k === 'avatar' ? JM.draft.avatar_path : JM.draft.photo_path;
      if (p) JM.sb.storage.from('seeker-media').remove([p]);
      if (k === 'avatar') { JM.draft.avatar_path = null; if (JM.me && JM.me.seeker) JM.me.seeker.avatar_path = null; JM.refreshShellAvatar(); }
      else JM.draft.photo_path = null;
      JM.drawDraft();
    } });
  };
  JM.actions.certrm = function (el) {
    const idx = Number(el.dataset.i), c = JM.draft.certificates[idx];
    JM.confirm({ title: 'Remove certificate?', text: 'Remove "' + (c ? c.title : 'certificate') + '"?', ok: 'Remove', danger: true, onOk: function () {
      if (c && c.path) JM.sb.storage.from('seeker-media').remove([c.path]);
      JM.draft.certificates.splice(idx, 1); JM.drawDraft();
    } });
  };
  JM.actions.certedit = function (el) {
    const idx = Number(el.dataset.i), c = JM.draft.certificates[idx];
    if (!c) return;
    JM.modal('<h2>Edit credential details</h2><form data-form="certedit" data-i="' + idx + '" class="mt">' +
      '<div class="field"><label class="label">Certificate title</label><input type="text" name="title" maxlength="120" value="' + esc(c.title || '') + '" required></div>' +
      '<div class="field"><label class="label">Details / description</label><textarea name="desc" rows="3" maxlength="300" placeholder="e.g. Issued by TESDA Laguna · Completed May 2026">' + esc(c.desc || '') + '</textarea></div>' +
      '<div class="row mt-l" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn" type="submit">Save</button></div></form>');
  };
  JM.forms.certedit = function (form, d) {
    const c = JM.draft.certificates[Number(form.dataset.i)];
    if (!c) return JM.close();
    c.title = String(d.title || '').trim() || c.name || 'Certificate';
    c.desc = String(d.desc || '').trim();
    JM.close(); JM.drawDraft(); JM.toast('Credential updated. Click Save changes to keep.', 'ok');
  };
  JM.actions.autosummary = function () {
    const next = composeSummary(JM.draft);
    if (JM.draft.summary_source === 'manual' && String(JM.draft.resume_summary || '').trim() && JM.draft.resume_summary.trim() !== next.trim()) {
      JM._pendingSummary = next;
      JM.modal('<h2>Replace your edited summary?</h2><div class="grid g2 mt">' +
        '<div class="card flat card-b" style="padding:12px"><div class="xs muted bold mb">Current</div><p class="xs" style="white-space:pre-wrap;margin:0">' + esc(JM.draft.resume_summary) + '</p></div>' +
        '<div class="card flat tint card-b" style="padding:12px"><div class="xs bold mb" style="color:var(--brand)">Generated (' + wordCount(next) + ' words)</div><p class="xs" style="white-space:pre-wrap;margin:0">' + esc(next) + '</p></div></div>' +
        '<div class="row mt-l" style="justify-content:flex-end"><button class="btn secondary" data-act="close">Keep mine</button><button class="btn" data-act="acceptsummary">Use generated</button></div>', 'wide');
      return;
    }
    JM.draft.resume_summary = next;
    JM.draft.summary_source = 'auto';
    JM._summaryStale = false;
    JM.drawDraft();
    JM.toast('Detailed professional summary generated (' + wordCount(next) + ' words).', 'ok');
  };

  const field = function (label, inner, help) { return '<div class="field"><label class="label">' + label + '</label>' + inner + (help ? '<div class="help">' + help + '</div>' : '') + '</div>'; };
  const chipBtn = function (d, v, on) { return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-act="dt" data-d="' + d + '" data-v="' + esc(v) + '" aria-pressed="' + !!on + '">' + esc(v) + '</button>'; };

  const SEC = {
    about: function (d) {
      const areaTa = JM.typeahead({
        id: 'draft-area-ta',
        value: d.area_id,
        label: JM.area(d.area_id),
        minChars: 0,
        placeholder: 'Type your barangay or city (e.g. Biñan, Santa Rosa)…',
        source: JM.areaItems || [],
        onPick: function (item) { JM.draft.area_id = item.value; }
      });
      return '<div class="grid g2">' +
        field('Full name', '<input type="text" data-in="d" data-d="full_name" value="' + esc(d.full_name) + '" autocomplete="name">') +
        field('Mobile number', '<input type="tel" data-in="d" data-d="phone" value="' + esc(d.phone) + '" placeholder="09XX XXX XXXX" autocomplete="tel">', 'Shared only with employers who shortlist you.') +
        field('Year of birth', '<input type="number" data-in="d" data-d="birth_year" value="' + esc(d.birth_year) + '" min="1940" max="2015" placeholder="e.g. 2003">', 'Never used for matching or ranking. Shown only after a shortlist.') +
        field('Gender (optional)', '<select data-in="d" data-d="gender">' + ['', 'Female', 'Male', 'Other'].map(function (g) { return '<option value="' + g + '"' + (d.gender === g ? ' selected' : '') + '>' + (g || 'Prefer not to say') + '</option>'; }).join('') + '</select>', 'Never used for matching or ranking.') +
        field('Where do you live?', areaTa, 'Start typing your city or barangay to pick from the list.') +
        field('Willing to commute: <b id="km-out">' + d.commute_km + ' km</b>', '<input type="range" min="1" max="60" step="1" value="' + d.commute_km + '" data-in="d" data-d="commute_km">') + '</div>';
    },
    edu: function (d) {
      const schoolTa = JM.typeahead({
        id: 'draft-school-ta',
        value: d.school,
        label: d.school,
        allowCustom: true,
        minChars: 1,
        placeholder: 'e.g. UPHSD Biñan, PUP Biñan, Trimex Colleges…',
        source: async function (q) {
          const rows = await JM.rpc('suggest_text', { p_field: 'school', p_q: q });
          return (rows || []).map(function (s) { return { value: s, label: s }; });
        },
        onType: function (v) { JM.draft.school = v; },
        onPick: function (item) { JM.draft.school = item.value; }
      });
      const courseTa = JM.typeahead({
        id: 'draft-course-ta',
        value: d.course,
        label: d.course,
        allowCustom: true,
        minChars: 1,
        placeholder: 'e.g. BSIT, BSBA, ABM, TVL – ICT…',
        source: async function (q) {
          const rows = await JM.rpc('suggest_text', { p_field: 'course', p_q: q });
          return (rows || []).map(function (s) { return { value: s, label: s }; });
        },
        onType: function (v) { JM.draft.course = v; },
        onPick: function (item) { JM.draft.course = item.value; }
      });
      return '<div class="grid g2">' +
        field('Highest education', '<select data-in="d" data-d="edu_level"><option value="">Select</option>' + EDU.map(function (e) { return '<option' + (d.edu_level === e ? ' selected' : '') + '>' + e + '</option>'; }).join('') + '</select>') +
        field('School', schoolTa) +
        field('Course or strand', courseTa) +
        field('Year graduated (or expected)', '<input type="number" data-in="d" data-d="grad_year" value="' + esc(d.grad_year) + '" min="1980" max="2035">') + '</div>';
    },
    skills: function (d) {
      const suggested = [].concat(d._roleSkills || [], d._parsedSkills || []);
      return JM.skillPicker({
        id: 'seeker-sp',
        mode: 'seeker',
        selected: d.skills,
        min: JM.me.seeker && JM.me.seeker.onboarded ? 1 : 3,
        suggested: suggested,
        defaultCats: ['core'],
        emptyHint: 'Pick at least three skills you can honestly claim. Be accurate: your level shapes your match scores.',
        onAdd: function (name) { if (JM.draft.skills[name] == null) JM.draft.skills[name] = 70; JM.drawDraft(); },
        onToggle: function (name) {
          if (JM.draft.skills[name] != null) delete JM.draft.skills[name];
          else JM.draft.skills[name] = 70;
          JM.drawDraft();
        },
        onRemove: function (name) {
          JM.confirm({ title: 'Remove skill?', text: 'Remove "' + name + '" from your profile?', ok: 'Remove', danger: true, onOk: function () { delete JM.draft.skills[name]; JM.drawDraft(); } });
        },
        onLevel: function (name, lvl) { JM.draft.skills[name] = lvl; },
        onRedraw: function () { JM.drawDraft(); }
      });
    },
    resume: function (d) {
      const exp = d.experience.map(function (x, i) {
        return '<div class="card flat card-b mb" style="padding:14px"><div class="grid g3 keep" style="gap:10px"><input type="text" placeholder="Role" data-in="exp" data-i="' + i + '" data-k="role" value="' + esc(x.role) + '"><input type="text" placeholder="Business or school" data-in="exp" data-i="' + i + '" data-k="org" value="' + esc(x.org) + '"><input type="text" placeholder="Years, e.g. 1.5" data-in="exp" data-i="' + i + '" data-k="years" value="' + esc(x.years) + '"></div><button type="button" class="btn ghost sm mt" data-act="exprm" data-i="' + i + '">' + ic('trash', 15) + 'Remove</button></div>';
      }).join('');
      const file = d.resume_path
        ? '<div class="row wrap card flat" style="padding:10px 14px">' + ic('file') + '<span class="grow small">' + esc(d.resume_name || d.resume_path.split('/').pop()) + '</span><button type="button" class="btn sm" data-act="updateallinfo">' + ic('sparkle', 14) + 'Update All Info</button><button type="button" class="btn secondary sm" data-act="mediaview" data-bucket="resumes" data-path="' + esc(d.resume_path) + '" data-title="Your résumé">Preview</button>' + JM.uploadBtn({ in: 'resume', accept: '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp', label: 'Replace', size: 'sm', preview: 'Preview new résumé' }) + '<button type="button" class="btn ghost sm" data-act="resumerm">Remove</button></div>'
        : JM.uploadBtn({ in: 'resume', accept: '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp', label: 'Upload résumé', hint: 'PDF, DOCX, JPG, PNG or WEBP · max 5 MB · extracts education, skills, experience & summary', preview: 'Preview résumé before uploading' });
      const staleBar = JM._summaryStale
        ? '<div class="notice warn mb" style="margin-bottom:8px">' + ic('sparkle') + '<div class="grow small">Your profile details changed since you edited your summary.</div><button type="button" class="btn secondary sm" data-act="autosummary">Regenerate</button></div>'
        : '';
      return field('Résumé file (PDF, DOCX, or image)', file, 'Upload your résumé, then click "Update All Info" to extract your real education, experience, skills, and detailed professional summary. Personal fields (Full Name, Phone, Birth Year, Email) are never modified.') +
        field('Résumé or portfolio link (optional)', '<input type="url" data-in="d" data-d="resume_link" value="' + esc(d.resume_link || '') + '" placeholder="https://drive.google.com/...">') +
        field('Professional summary <button type="button" class="btn ghost sm" style="height:24px;padding:0 8px;margin-left:6px" data-act="autosummary">' + ic('sparkle', 13) + 'Auto-generate</button> <span class="xs muted" id="sum-wc" style="margin-left:auto;font-weight:400">' + wordCount(d.resume_summary) + ' words · ' + (d.resume_summary || '').length + '/2000 chars</span>',
          staleBar + '<textarea data-in="d" data-d="resume_summary" maxlength="2000" style="min-height:150px" placeholder="A detailed 120–250 word summary covering your target role, education, work/OJT highlights, key skills, credentials, and availability.">' + esc(d.resume_summary) + '</textarea>',
          'Covers your goal, education, experience, skills, credentials and availability (target 120–250 words).') +
        '<div class="label">Experience (work, OJT, volunteer or school projects)</div>' + exp + '<button type="button" class="btn secondary sm mb" data-act="expadd">' + ic('plus', 16) + 'Add experience</button>';
    },
    photos: function (d) {
      const IMG = 'image/jpeg,image/png,image/webp';
      const avBox = '<div class="field" style="margin-bottom:0"><label class="label">Profile picture</label>' +
        ((d.avatar_path || d._avatarBlob)
          ? '<div class="row card flat" style="padding:12px">' +
            JM.img({ bucket: 'seeker-media', path: d.avatar_path, directUrl: d._avatarBlob, shape: 'circle', size: 68, name: d.full_name, alt: 'Profile picture', act: d.avatar_path ? 'mediaview' : '', title: 'Profile picture' }) +
            '<div class="grow row wrap gap-s">' + (d.avatar_path ? '<button type="button" class="btn secondary sm" data-act="mediaview" data-bucket="seeker-media" data-path="' + esc(d.avatar_path) + '" data-title="Profile picture">' + ic('eye', 14) + 'Preview</button>' : '') +
            JM.uploadBtn({ in: 'media', kind: 'avatar', shape: 'circle', accept: IMG, label: 'Replace', size: 'sm', preview: 'Crop profile picture' }) +
            '<button type="button" class="btn ghost sm danger" data-act="mediarm" data-kind="avatar">Remove</button></div></div>'
          : JM.uploadBtn({ in: 'media', kind: 'avatar', shape: 'circle', accept: IMG, label: 'Upload profile picture', hint: 'JPG, PNG or WEBP · square/circle crop · max 5 MB', preview: 'Crop profile picture' })) + '</div>';
      const phBox = '<div class="field" style="margin-bottom:0"><label class="label">Professional photo (3:4 portrait)</label>' +
        ((d.photo_path || d._photoBlob)
          ? '<div class="row card flat" style="padding:12px">' +
            JM.img({ bucket: 'seeker-media', path: d.photo_path, directUrl: d._photoBlob, shape: 'portrait', name: d.full_name, alt: 'Professional photo', act: d.photo_path ? 'mediaview' : '', title: 'Professional photo' }) +
            '<div class="grow row wrap gap-s">' + (d.photo_path ? '<button type="button" class="btn secondary sm" data-act="mediaview" data-bucket="seeker-media" data-path="' + esc(d.photo_path) + '" data-title="Professional photo">' + ic('eye', 14) + 'Preview</button>' : '') +
            JM.uploadBtn({ in: 'media', kind: 'photo', shape: 'contain', accept: IMG, label: 'Replace', size: 'sm', preview: 'Preview professional photo' }) +
            '<button type="button" class="btn ghost sm danger" data-act="mediarm" data-kind="photo">Remove</button></div></div>'
          : JM.uploadBtn({ in: 'media', kind: 'photo', shape: 'contain', accept: IMG, label: 'Upload professional photo', hint: 'JPG, PNG or WEBP · max 5 MB · preview before saving', preview: 'Preview professional photo' })) + '</div>';
      return '<div class="grid g2">' + avBox + phBox + '</div>' +
        '<p class="help mt">Photos are never used for match scoring and stay private until an employer shortlists you.</p>';
    },
    certs: function (d) {
      const certs = (d.certificates || []).map(function (c, i) {
        const isImg = /\.(jpe?g|png|webp)$/i.test(c.path || '');
        const thumb = isImg
          ? JM.img({ bucket: 'seeker-media', path: c.path, shape: 'rounded', size: 46, fallback: 'icon', icon: 'award', alt: c.title, act: 'mediaview', title: c.title, desc: c.desc || '' })
          : '<span class="avatar sq">' + ic('award', 16) + '</span>';
        return '<div class="li" style="padding:10px 0;align-items:flex-start">' + thumb +
          '<div class="grow"><b>' + esc(c.title) + '</b>' + (c.desc ? '<div class="small" style="color:var(--ink2);margin-top:2px">' + esc(c.desc) + '</div>' : '<div class="xs muted" style="margin-top:2px">No description added</div>') + '<div class="xs muted">' + esc(c.name) + '</div></div>' +
          '<div class="row gap-s"><button type="button" class="btn secondary sm" data-act="mediaview" data-bucket="seeker-media" data-path="' + esc(c.path) + '" data-title="' + esc(c.title) + '" data-desc="' + esc(c.desc || '') + '">' + ic('eye', 14) + 'Preview</button><button type="button" class="iconbtn" data-act="certedit" data-i="' + i + '" aria-label="Edit credential" title="Edit title & details" style="width:32px;height:32px">' + ic('edit', 15) + '</button><button type="button" class="iconbtn" data-act="certrm" data-i="' + i + '" aria-label="Remove certificate" style="width:32px;height:32px">' + ic('trash', 15) + '</button></div></div>';
      }).join('');
      return (certs ? '<div class="list mb">' + certs + '</div>' : '<p class="small muted">No certificates uploaded yet.</p>') +
        '<div class="grid g2 mb" style="gap:10px"><div class="field" style="margin-bottom:0"><label class="label">What is this certificate?</label><input type="text" id="cert-title" maxlength="120" placeholder="e.g. TESDA NC II Barista, First Aid, Diploma"></div>' +
        '<div class="field" style="margin-bottom:0"><label class="label">Details / description (optional)</label><input type="text" id="cert-desc" maxlength="300" placeholder="e.g. Issued by TESDA Laguna · May 2026"></div></div>' +
        JM.uploadBtn({ in: 'media', kind: 'cert', accept: '.jpg,.jpeg,.png,.webp,.pdf', label: 'Upload certificate or credential', hint: 'JPG, PNG, WEBP or PDF · max 5 MB · preview before saving', preview: 'Preview certificate', pvtitle: true });
    },
    goal: function (d) {
      const rp = JM.rolePicker({
        id: 'seeker-goal-rp',
        value: d.goal_role,
        isOther: !!d.goal_other,
        placeholder: 'Search 100+ career roles (e.g. Barista, Front-End Dev, Cashier)…',
        onPick: function (rid) {
          JM.draft.goal_role = rid;
          JM.draft.goal_other = false;
          const rObj = (JM.roles || []).find(function (r) { return r.id === rid; });
          if (rObj && rObj.category && JM.draft.interests.indexOf(rObj.category) < 0) JM.draft.interests.push(rObj.category);
          loadRoleSkillsForDraft(rid);
          JM.drawDraft();
        },
        onOther: function () {
          JM.draft.goal_role = '';
          JM.draft.goal_other = true;
          JM.draft._roleSkills = [];
          JM.drawDraft();
        }
      });
      return field('Career goal', rp, 'Your roadmap and readiness score are built around this role. Pick "Other / not listed" to specify your own.') +
        '<div class="grid g2">' +
        field('Target level (optional)', '<select data-in="d" data-d="goal_level">' + GOAL_LEVELS.map(function (l) { return '<option value="' + l + '"' + (d.goal_level === l ? ' selected' : '') + '>' + (l || 'Any level') + '</option>'; }).join('') + '</select>') +
        field('Target timeframe (optional)', '<select data-in="d" data-d="goal_timeframe">' + GOAL_TIMES.map(function (t) { return '<option value="' + t + '"' + (d.goal_timeframe === t ? ' selected' : '') + '>' + (t || 'No specific timeframe') + '</option>'; }).join('') + '</select>') + '</div>' +
        field('In your own words ' + (d.goal_other ? '<span class="req">*</span>' : '(optional)'),
          '<input type="text" data-in="d" data-d="goal_text" value="' + esc(d.goal_text) + '" maxlength="140" placeholder="' + (d.goal_other ? 'Specify your target role, e.g. Drone Operator' : 'e.g. Become a store supervisor in two years') + '">',
          d.goal_other ? 'Required when "Other / not listed" is selected.' : '') +
        field('Fields that interest you', '<div class="chips">' + (JM.categories || []).map(function (c) { return chipBtn('interests', c, d.interests.indexOf(c) >= 0); }).join('') + '</div>') +
        field('Work setups you accept <span class="req">*</span>', '<div class="chips">' + SETUPS.map(function (s) {
          const on = (d.work_setups || []).indexOf(s) >= 0;
          return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-act="dt" data-d="work_setups" data-v="' + esc(s) + '" aria-pressed="' + on + '">' + ic(JM.setupIcon(s), 13) + esc(s) + '</button>';
        }).join('') + '</div>', 'Used in your match score and Discover filters.') +
        field('Employment types you accept <span class="req">*</span>', '<div class="chips">' + TYPES.map(function (c) { return chipBtn('job_types', c, d.job_types.indexOf(c) >= 0); }).join('') + '</div>') +
        field('Minimum monthly pay (₱)', '<input type="number" data-in="d" data-d="salary_min" value="' + esc(d.salary_min) + '" min="0" step="500" placeholder="e.g. 14000">') +
        '<label class="check"><input type="checkbox" data-in="d" data-d="open_to_employers"' + (d.open_to_employers ? ' checked' : '') + '><span class="small"><b>Let Business-plan employers find me.</b><br><span class="muted">They see your masked name and skills, never your contact details, and can invite you to apply.</span></span></label>';
    }
  };

  JM.saveDraft = async function (finish) {
    const d = JM.draft, uid = JM.me.id;
    const changedSinceLoad = JM._draftSnap && summaryFingerprint(d) !== JM._draftSnap;
    if ((finish || changedSinceLoad) && d.summary_source === 'auto') {
      d.resume_summary = composeSummary(d);
    } else if (changedSinceLoad && d.summary_source === 'manual') {
      JM._summaryStale = true;
    }
    const phone = String(d.phone || '').trim();
    await JM.q(JM.sb.from('profiles').update({ full_name: String(d.full_name || '').trim(), phone: phone }).eq('id', uid));
    const exp = d.experience.filter(function (x) { return x.role || x.org; });
    const patch = {
      birth_year: d.birth_year === '' ? null : d.birth_year, gender: d.gender, edu_level: d.edu_level,
      school: d.school.trim(), course: d.course.trim(), grad_year: d.grad_year === '' ? null : d.grad_year,
      experience: exp, interests: d.interests,
      goal_role: d.goal_role || null, goal_text: d.goal_text.trim(),
      goal_level: d.goal_level || '', goal_timeframe: d.goal_timeframe || '',
      area_id: d.area_id, commute_km: d.commute_km, salary_min: d.salary_min === '' ? 0 : d.salary_min,
      job_types: d.job_types,
      work_setups: (d.work_setups && d.work_setups.length) ? d.work_setups : SETUPS.slice(),
      resume_mode: d.resume_path ? 'uploaded' : 'built',
      resume_summary: d.resume_summary.trim().slice(0, 2000),
      summary_source: d.summary_source || 'auto',
      resume_path: d.resume_path, resume_link: (d.resume_link || '').trim(),
      avatar_path: d.avatar_path, photo_path: d.photo_path, certificates: d.certificates || [],
      open_to_employers: d.open_to_employers
    };
    if (finish) patch.onboarded = true;
    await JM.q(JM.sb.from('seeker_profiles').update(patch).eq('user_id', uid));
    await JM.q(JM.sb.from('seeker_skills').delete().eq('user_id', uid));
    const rows = Object.keys(d.skills).map(function (n) { return { user_id: uid, skill: n, level: d.skills[n] }; });
    if (rows.length) await JM.q(JM.sb.from('seeker_skills').insert(rows));
    await JM.loadMe();
    JM.refreshShellAvatar();
    JM._draftSnap = summaryFingerprint(d);
  };

  // ---------- onboarding ----------
  const STEPS = [['about', 'About you', 'Basic details help us find jobs within your reach.'], ['edu', 'Education', 'Tell us where you studied.'], ['skills', 'Skills', 'These drive 55 percent of your match scores.'], ['resume', 'Résumé', 'Upload your résumé or craft a detailed professional summary.'], ['goal', 'Goals', 'What do you want next?']];
  function checkStep(i) {
    const d = JM.draft;
    if (i === 0) { if (!String(d.full_name).trim()) return 'Enter your name.'; if (!d.birth_year || d.birth_year < 1940 || d.birth_year > 2015) return 'Enter a valid year of birth.'; if (!d.area_id) return 'Select where you live from the list.'; }
    if (i === 1 && !d.edu_level) return 'Select your highest education.';
    if (i === 2 && Object.keys(d.skills).length < 3) return 'Pick at least three skills.';
    if (i === 4) {
      if (!d.goal_role && !String(d.goal_text || '').trim()) return 'Choose a career goal or specify your own under "Other".';
      if (!d.interests.length) return 'Pick at least one field of interest.';
      if (!d.work_setups || !d.work_setups.length) return 'Pick at least one work setup (On-site, Hybrid, or Remote).';
      if (!d.job_types.length) return 'Pick at least one employment type.';
    }
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
    return '<div class="auth-main" style="min-height:100vh;background:var(--bg);align-items:flex-start"><div style="width:100%;max-width:680px"><a class="brand" href="#/" style="padding:8px 0 22px"><img src="assets/logo.png" alt="">JobMatch</a><div id="draft-root">' + JM.draftRender() + '</div></div></div>';
  }
  JM.route('/onboarding', { auth: 'seeker', plain: true, pre: true, title: 'Set up your profile', render: onboardHtml, after: function () { JM.mountTypeaheads(); JM.hydrateImages(); } });
  JM.actions.obback = function () { JM.obStep--; JM.drawDraft(); window.scrollTo(0, 0); };
  JM.actions.obgo = function (el) { JM.obStep = Number(el.dataset.i); JM.drawDraft(); };
  JM.actions.obnext = async function (el) {
    const msg = checkStep(JM.obStep), box = document.getElementById('ob-err');
    if (msg) { box.textContent = msg; box.classList.remove('hide'); return; }
    if (JM.obStep < STEPS.length - 1) { JM.obStep++; JM.drawDraft(); window.scrollTo(0, 0); return; }
    await JM.busy(el, async function () { await JM.saveDraft(true); JM.obStep = null; JM.draft = null; JM.go('/deck'); JM.toast('Profile ready. Here are your best matches.', 'ok'); });
  };

  // ---------- profile (Section 8.5 clean circular hero avatar + camera badge) ----------
  JM.route('/profile', { auth: 'seeker', title: 'Profile', render: function () {
    JM.initDraft();
    JM.draftRender = function () {
      const s = JM.me.seeker, d = JM.draft, done = ['full_name', 'phone', 'birth_year', 'edu_level', 'resume_summary', 'goal_role'].filter(function (k) { return d[k] || (k === 'goal_role' && d.goal_text); }).length + (Object.keys(d.skills).length >= 3 ? 1 : 0);
      const pct = Math.round(done / 7 * 100);
      const camBadge = '<label class="av-cam" title="Change profile picture" aria-label="Change profile picture">' + ic('camera', 14) +
        '<input type="file" class="upl-input" accept="image/jpeg,image/png,image/webp" data-in="media" data-kind="avatar" data-shape="circle" data-preview="Crop profile picture"></label>';
      const heroAv = '<div class="av-hero">' +
        JM.img({ bucket: 'seeker-media', path: d.avatar_path, directUrl: d._avatarBlob, shape: 'circle', size: 92, name: d.full_name || 'Profile', alt: 'Profile picture', act: d.avatar_path ? 'mediaview' : '', title: 'Profile picture' }) +
        camBadge + '</div>';
      return JM.pageHead('Your profile', 'Keep this accurate. It shapes every match score.', '<span class="badge ' + (s.plan === 'pro' ? 'star' : '') + '">' + (s.plan === 'pro' ? (s.plan_period === 'yearly' ? 'Annual Plan' : 'Monthly Plan') : 'Free Plan') + '</span>') +
        '<div class="card card-b mb"><div class="row wrap" style="gap:18px">' + heroAv + '<div class="grow"><h2 style="font-size:20px">' + esc(d.full_name || 'Your Profile') + '</h2><div class="small muted mt" style="margin-top:4px">' + esc(JM.area(d.area_id)) + ' · ' + esc((d.work_setups || SETUPS).join(' / ')) + '</div><div class="xs muted" style="margin-top:4px">' + (d.avatar_path ? 'Click your photo to preview full size, or tap the camera badge to change.' : 'Tap the camera badge to add a circular profile picture.') + '</div></div>' + (d.avatar_path ? '<button type="button" class="btn secondary sm" data-act="mediaview" data-bucket="seeker-media" data-path="' + esc(d.avatar_path) + '" data-title="Profile picture">' + ic('eye', 14) + 'Preview</button>' : '') + '</div></div>' +
        '<div class="card card-b mb"><div class="row"><div class="grow"><b>Profile strength</b><div class="small muted">' + (pct >= 100 ? 'Complete. Nice work.' : 'Fill the remaining fields to improve your matches.') + '</div></div><b>' + pct + '%</b></div>' + JM.bar(pct, 'ok') + '</div>' +
        [['photos', 'Profile picture & professional photo'], ['about', 'Personal & contact details'], ['resume', 'Résumé & detailed professional summary'], ['edu', 'Education'], ['skills', 'Skills (categorized)'], ['certs', 'Certificates & credentials'], ['goal', 'Goals, work setup & preferences']].map(function (x) { return '<div class="card mb"><div class="card-h"><h3>' + x[1] + '</h3></div><div class="card-b">' + SEC[x[0]](d) + '</div></div>'; }).join('') +
        '<div class="row" style="justify-content:flex-end"><button class="btn lg" data-act="profilesave">Save changes</button></div>';
    };
    return '<div class="page narrow" id="draft-root">' + JM.draftRender() + '</div>';
  }, after: function () { JM.mountTypeaheads(); JM.hydrateImages(); } });
  JM.actions.profilesave = async function (el) {
    if (!String(JM.draft.full_name).trim()) return JM.toast('Enter your name.', 'bad');
    if (Object.keys(JM.draft.skills).length < 1) return JM.toast('Keep at least one skill.', 'bad');
    if (!JM.draft.work_setups || !JM.draft.work_setups.length) return JM.toast('Select at least one work setup.', 'bad');
    await JM.busy(el, async function () {
      await JM.saveDraft(false);
      JM.toast(JM._summaryStale ? 'Profile saved. Tip: regenerate your manual summary if details changed.' : 'Profile saved.', 'ok');
      const stale = JM._summaryStale;
      JM.initDraft(); JM._summaryStale = stale; JM.drawDraft();
    });
  };

  // ---------- Discover deck (Section 2.4 + Section 3.3 redesign) ----------
  const scoreColor = function (s) { return s >= 75 ? '#14804F' : s >= 50 ? '#0C70F8' : '#9A5B00'; };
  JM.skillChips = function (j, limit) {
    const have = (j.match && j.match.have) || [], miss = (j.match && j.match.missing) || [];
    const list = j.skills || [];
    const shown = limit ? list.slice(0, limit) : list;
    const extra = limit && list.length > limit ? '<span class="badge">+' + (list.length - limit) + '</span>' : '';
    return shown.map(function (s) {
      return '<span class="badge ' + (have.indexOf(s) >= 0 ? 'ok' : miss.indexOf(s) >= 0 ? 'warn' : '') + '">' + (have.indexOf(s) >= 0 ? ic('check', 12) : '') + esc(s) + '</span>';
    }).join('') + extra;
  };
  function cardHtml(j, pos) {
    const m = j.match || {}, cls = pos === 0 ? 'top' : pos === 1 ? 'b1' : 'b2';
    const isRemote = j.work_setup === 'Remote';
    const locStr = isRemote ? 'Remote · ' + esc(JM.area(j.area_id)) : esc(JM.area(j.area_id)) + (m.dist != null ? ' · ' + m.dist + ' km' : '');
    const mediaHtml = '<div class="jmedia">' +
      JM.img({ bucket: 'job-photos', path: j.photo_path, shape: 'cover43', focus: j.photo_focus || '50% 50%', fallback: 'placeholder', name: j.category || j.title, icon: 'briefcase', alt: j.title + ' photo' }) +
      '<div class="jlogo">' + JM.img({ bucket: 'company-logos', path: j.company && j.company.logo_path, shape: 'circle', size: 58, name: j.company && j.company.name, alt: (j.company && j.company.name) + ' logo' }) + '</div></div>';
    return '<article class="jcard ' + cls + '" data-id="' + j.id + '" aria-label="' + esc(j.title) + '"><div class="stamp no">PASS</div><div class="stamp yes">SAVE</div><div class="stamp top">TOP PICK</div>' +
      '<div class="jcard-in">' +
      '<div class="row" style="align-items:flex-start"><div class="grow"><div class="row gap-s wrap">' +
        (j.boosted ? JM.badge('Featured', 'star') : '') + JM.badge(j.type, 'brand') + JM.setupBadge(j.work_setup, j.onsite_days) + (j.custom_role ? JM.badge(j.custom_role) : '') +
      '</div><h2 style="font-size:19.5px;margin-top:8px">' + esc(j.title) + '</h2>' +
      '<div class="row gap-s small muted" style="margin-top:3px">' + esc(j.company.name) + (j.company.verified ? '<span title="Verified business" style="color:var(--ok);display:inline-flex">' + ic('check', 15) + '</span>' : '') + '</div></div>' +
      JM.ring(m.score || 0, 56, scoreColor(m.score || 0)) + '</div>' +
      mediaHtml +
      '<div class="jdetails">' +
      '<div class="row wrap small" style="color:var(--ink2);gap:12px"><span class="row gap-s">' + ic(isRemote ? 'globe' : 'pin', 14) + locStr + '</span><span class="bold">' + JM.salary(j) + '</span></div>' +
      (j.intern_requirements ? '<div class="xs" style="color:var(--brand-d)"><b>Requirements:</b> ' + esc(j.intern_requirements) + '</div>' : '') +
      '<div class="chips">' + JM.skillChips(j, 4) + '</div>' +
      '<p class="small muted" style="margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + esc(j.description) + '</p>' +
      '<div class="why"><b>Why this match:</b> ' + esc((m.why || []).slice(0, 3).join(', ')) + '.</div></div></div></article>';
  }
  function preloadNext(items) {
    items.slice(1, 3).forEach(function (j) {
      if (j.photo_path) { const im = new Image(); im.src = JM.publicUrl('job-photos', j.photo_path); }
      if (j.company && j.company.logo_path) { const im2 = new Image(); im2.src = JM.publicUrl('company-logos', j.company.logo_path); }
    });
  }
  function drawDeck() {
    const root = document.getElementById('deck'); if (!root) return;
    const items = JM.deckItems || [], stack = items.slice(0, 3);
    root.innerHTML = stack.length ? stack.map(function (j, i) { return cardHtml(j, i); }).reverse().join('') : '';
    const empty = document.getElementById('deck-empty'); if (empty) empty.classList.toggle('hide', !!stack.length);
    const tools = document.getElementById('deck-tools'); if (tools) tools.classList.toggle('hide', !stack.length);
    const stars = document.getElementById('stars-left'); if (stars) { const n = JM.me.seeker.stars_left; stars.textContent = n >= 999 ? 'Unlimited stars' : n + (n === 1 ? ' star left today' : ' stars left today'); }
    JM.hydrateImages(root);
    preloadNext(items);
    bindTop();
  }
  function bindTop() {
    const top = document.querySelector('#deck .jcard.top'); if (!top) return;
    const scroller = top.querySelector('.jcard-in');
    let sx = 0, sy = 0, dx = 0, dy = 0, drag = false, mode = null; // mode: 'swipe' | 'scroll'
    const stamps = { no: top.querySelector('.stamp.no'), yes: top.querySelector('.stamp.yes'), top: top.querySelector('.stamp.top') };
    top.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      drag = true; mode = null; sx = e.clientX; sy = e.clientY; dx = dy = 0;
      top.classList.remove('snap', 'fly');
    });
    top.addEventListener('pointermove', function (e) {
      if (!drag) return;
      dx = e.clientX - sx; dy = e.clientY - sy;
      if (!mode && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        const canScroll = scroller && scroller.scrollHeight > scroller.clientHeight + 4;
        if (canScroll && Math.abs(dy) > Math.abs(dx) * 1.2 && ((dy < 0 && scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 2) || (dy > 0 && scroller.scrollTop > 2))) {
          mode = 'scroll';
          return;
        }
        mode = 'swipe';
        try { top.setPointerCapture(e.pointerId); } catch (err) {}
      }
      if (mode !== 'swipe') return;
      top.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + dx / 20 + 'deg)';
      stamps.yes.style.opacity = Math.max(0, Math.min(1, dx / 90));
      stamps.no.style.opacity = Math.max(0, Math.min(1, -dx / 90));
      stamps.top.style.opacity = dy < -40 && Math.abs(dx) < 80 ? Math.min(1, -dy / 110) : 0;
    });
    const end = function () {
      if (!drag) return; drag = false;
      if (mode === 'scroll') { mode = null; return; }
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
      if (top) {
        const st = top.querySelector(dir === 'right' ? '.stamp.yes' : dir === 'left' ? '.stamp.no' : '.stamp.top');
        if (st) st.style.opacity = 1;
        top.classList.add('fly');
        top.style.transform = dir === 'star' ? 'translate(0,-640px)' : 'translate(' + (dir === 'right' ? 640 : -640) + 'px,60px) rotate(' + (dir === 'right' ? 18 : -18) + 'deg)';
        top.style.opacity = 0;
      }
      JM.lastSwipe = true;
      await new Promise(function (r) { setTimeout(r, 230); });
      JM.deckItems.shift(); drawDeck();
      if (dir === 'right') JM.toast('Saved to Preferred');
      if (dir === 'star') JM.toast('Starred as a top pick', 'ok');
      if (JM.deckItems.length < 5 && !JM.deckLoading) refill();
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
      more.forEach(function (j) { if (!have[j.id]) JM.deckItems.push(j); });
      drawDeck();
    } finally { JM.deckLoading = false; }
  }
  JM.actions.swipe = function (el) { decide(el.dataset.dir); };
  JM.actions.quicktype = async function (el) {
    const f = Object.assign({}, JM.me.seeker.filters || {}, { type: el.dataset.t || '' });
    await JM.q(JM.sb.from('seeker_profiles').update({ filters: f }).eq('user_id', JM.me.id));
    JM.me.seeker.filters = f; JM.render();
  };
  JM.actions.quicksetup = async function (el) {
    const f = Object.assign({}, JM.me.seeker.filters || {}, { setup: el.dataset.s || '' });
    await JM.q(JM.sb.from('seeker_profiles').update({ filters: f }).eq('user_id', JM.me.id));
    JM.me.seeker.filters = f; JM.render();
  };
  async function returnPreviousCard(el) {
    if (busy) return;
    await JM.busy(el, async function () {
      const r = await JM.rpc('undo_swipe');
      if (!r.ok) return JM.toast('No more previous cards to return.');
      JM.me.seeker.stars_left = r.stars_left;
      const j = r.job || await JM.rpc('get_job', { p_job: r.job_id });
      if (j) {
        JM.deckItems = (JM.deckItems || []).filter(function (x) { return x.id !== j.id; });
        JM.deckItems.unshift(j);
      }
      drawDeck();
      const top = document.querySelector('#deck .jcard.top');
      if (top) {
        top.style.transform = r.dir === 'right' ? 'translate(120px,10px) rotate(6deg)' : r.dir === 'star' ? 'translate(0,-120px)' : 'translate(-120px,10px) rotate(-6deg)';
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            top.classList.add('snap');
            top.style.transform = '';
          });
        });
      }
    });
  }
  JM.actions.requeue = returnPreviousCard;
  JM.actions.undo = returnPreviousCard;
  JM.actions.requeueall = async function (el) {
    await JM.busy(el, async function () {
      const r = await JM.rpc('requeue_passed_jobs');
      JM.close();
      JM.toast(r.count ? r.count + ' passed job(s) returned to your deck.' : 'No passed jobs to review.', r.count ? 'ok' : '');
      JM.deckItems = await JM.rpc('get_deck', { p_limit: 30 });
      drawDeck();
    });
  };
  JM.actions.swipehistory = async function (el) {
    if (JM.me.seeker.plan !== 'pro') return JM.modal('<h2>Activity &amp; swipe history</h2><p class="muted mt">Swipe and activity history is available on the Monthly and Annual Plans.</p><div class="row mt-l" style="justify-content:flex-end"><button class="btn secondary" data-act="close">Close</button><a class="btn" href="#/pro" data-act="close">View plans</a></div>');
    await JM.busy(el, async function () {
      const rows = await JM.rpc('my_swipe_history');
      const lbl = { left: ['Passed', 'bad'], right: ['Saved', 'brand'], star: ['Starred', 'star'], removed: ['Removed', ''] };
      const list = rows.length ? '<div class="list" style="max-height:55vh;overflow:auto">' + rows.map(function (r) {
        const b = lbl[r.dir] || [r.dir, ''];
        return '<div class="li" style="padding:10px 4px"><div class="grow"><a class="bold" href="#/jobs/' + r.job_id + '" data-act="close">' + esc(r.title) + '</a><div class="xs muted">' + esc(r.company) + ' · ' + esc(r.type) + ' · ' + esc(r.work_setup || 'On-site') + ' · ' + JM.ago(r.swiped_at) + '</div></div>' + (r.score ? '<b class="num small">' + r.score + '%</b>' : '') + JM.badge(b[0], b[1]) + '</div>';
      }).join('') + '</div>' : '<p class="muted mt">No swipes recorded yet.</p>';
      JM.modal('<h2>Swipe history</h2><p class="small muted mt">All jobs you swiped on, including passed listings.</p>' + list + '<div class="row wrap mt-l" style="justify-content:space-between"><button class="btn secondary sm" data-act="requeueall">Re-run passed jobs</button><button class="btn" data-act="close">Close</button></div>', 'wide');
    });
  };
  JM.actions.deckrefresh = async function (el) { await JM.busy(el, async function () { JM.deckItems = await JM.rpc('get_deck', { p_limit: 30 }); drawDeck(); }); };
  JM.actions.filters = function () {
    const f = JM.me.seeker.filters || {};
    const areaTa = JM.typeahead({
      id: 'filter-area-ta',
      name: 'area',
      value: f.area || '',
      label: f.area ? JM.area(f.area) : '',
      minChars: 0,
      placeholder: 'Anywhere (or type a city/barangay)…',
      source: [{ value: '', label: 'Anywhere' }].concat(JM.areaItems || [])
    });
    JM.modal('<h2>Filter jobs</h2><form data-form="filters" class="mt">' +
      '<label class="check mb"><input type="checkbox" name="nearMe"' + (f.nearMe ? ' checked' : '') + '><span class="small"><b>Only jobs within my commute limit</b><br><span class="muted">Currently ' + JM.me.seeker.commute_km + ' km from ' + esc(JM.area(JM.me.seeker.area_id)) + ' (Remote jobs are always included)</span></span></label>' +
      '<div class="grid g2"><div class="field"><label class="label">Work setup</label><select name="setup"><option value="">Any setup</option>' + SETUPS.map(function (s) { return '<option' + (f.setup === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label class="label">Employment type</label><select name="type"><option value="">Any type</option>' + TYPES.map(function (t) { return '<option' + (f.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field"><label class="label">Specific area (optional)</label>' + areaTa + '</div>' +
      '<div class="field"><label class="label">Pays at least (₱ per month)</label><input type="number" name="minSalary" min="0" step="500" value="' + (f.minSalary || 0) + '"></div>' +
      '<div class="row" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn" type="submit">Apply filters</button></div></form>');
  };
  JM.forms.filters = async function (form, d) {
    const f = { nearMe: !!d.nearMe, type: d.type || '', setup: d.setup || '', area: d.area || '', minSalary: Number(d.minSalary) || 0 };
    await JM.q(JM.sb.from('seeker_profiles').update({ filters: f }).eq('user_id', JM.me.id));
    JM.me.seeker.filters = f; JM.close(); JM.deckItems = await JM.rpc('get_deck', { p_limit: 30 }); JM.render();
  };
  document.addEventListener('keydown', function (e) {
    if (location.hash !== '#/deck' || document.getElementById('overlay-root').classList.contains('open')) return;
    if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
    if (e.key === 'ArrowRight') decide('right'); else if (e.key === 'ArrowLeft') decide('left'); else if (e.key === 'ArrowUp') { e.preventDefault(); decide('star'); }
  });
  JM.route('/deck', { auth: 'seeker', title: 'Discover', render: async function () {
    JM.deckItems = await JM.rpc('get_deck', { p_limit: 30 }); JM.me.seeker.stars_left = (await JM.rpc('me')).seeker.stars_left;
    let interviews = [];
    try { interviews = await JM.rpc('my_interviews'); } catch (e) { interviews = []; }
    const upcoming = interviews.filter(function (iv) { return iv.status !== 'cancelled' && iv.status !== 'completed'; });
    const ivBox = upcoming.length ? '<div class="card card-b mb iv-card"><div class="row between mb"><h3>' + ic('clock', 16) + ' Upcoming Interviews</h3><span class="badge brand">' + upcoming.length + ' scheduled</span></div>' +
      upcoming.map(function (iv) {
        const stCls = iv.status === 'confirmed' ? 'ok' : iv.status === 'rescheduled' ? 'warn' : 'brand';
        const loc = iv.location_or_link ? (/^https?:\/\//i.test(iv.location_or_link) ? '<a href="' + esc(iv.location_or_link) + '" target="_blank" rel="noopener">Join meeting link ' + ic('ext', 12) + '</a>' : esc(iv.location_or_link)) : 'Details to follow';
        return '<div class="card flat card-b mb" style="padding:12px;margin-bottom:8px"><div class="row wrap between"><div><b>' + esc(iv.job_title) + '</b> <span class="small muted">· ' + esc(iv.employer_name) + '</span><div class="xs muted mt" style="margin-top:4px">' + JM.date(iv.scheduled_date) + ' at ' + esc(iv.scheduled_time) + ' · ' + JM.badge(iv.interview_type, 'brand') + ' · ' + loc + '</div></div><div class="row gap-s">' + JM.badge(iv.status, stCls) + (iv.status === 'scheduled' ? '<button class="btn ok sm" data-act="ivstatus" data-id="' + iv.id + '" data-s="confirmed">Confirm</button>' : '') + '</div></div></div>';
      }).join('') + '</div>' : '';
    const f = JM.me.seeker.filters || {}, nf = (f.nearMe ? 1 : 0) + (f.type ? 1 : 0) + (f.setup ? 1 : 0) + (f.area ? 1 : 0) + (f.minSalary ? 1 : 0), isPaid = JM.me.seeker.plan === 'pro';
    const setupBar = '<div class="chips" style="margin-bottom:8px">' + [''].concat(SETUPS).map(function (s) {
      return '<button type="button" class="chip' + ((f.setup || '') === s ? ' on' : '') + '" data-act="quicksetup" data-s="' + esc(s) + '">' + (s ? ic(JM.setupIcon(s), 13) + esc(s) : 'All setups') + '</button>';
    }).join('') + '</div>';
    const typeBar = '<div class="chips mb">' + [''].concat(TYPES).map(function (t) {
      return '<button type="button" class="chip' + ((f.type || '') === t ? ' on' : '') + '" data-act="quicktype" data-t="' + esc(t) + '">' + (t || 'All work types') + '</button>';
    }).join('') + '</div>';
    return '<div class="page narrow">' + ivBox + '<div class="row between wrap mb"><div><h1 style="font-size:22px">Discover</h1><div class="small muted" id="stars-left"></div></div><div class="row gap-s wrap"><button class="btn secondary sm" data-act="swipehistory">' + ic(isPaid ? 'clock' : 'lock', 15) + 'History</button><button class="btn secondary sm" data-act="requeue">' + ic('undo', 15) + 'Passed</button><button class="btn secondary sm" data-act="filters">' + ic('sliders', 16) + 'Filters' + (nf ? ' (' + nf + ')' : '') + '</button></div></div>' +
      setupBar + typeBar +
      '<div class="deckwrap"><div class="deck" id="deck"></div>' +
      '<div class="actions" id="deck-tools"><button class="rbtn sm" data-act="undo" aria-label="Undo last swipe">' + ic('undo') + '</button><button class="rbtn no" data-act="swipe" data-dir="left" aria-label="Pass">' + ic('x') + '</button><button class="rbtn star" data-act="swipe" data-dir="star" aria-label="Star as top pick">' + ic('star') + '</button><button class="rbtn yes" data-act="swipe" data-dir="right" aria-label="Save to preferred">' + ic('heart') + '</button></div>' +
      '<p class="xs muted center" id="deck-hint">Swipe right to save, left to pass, up to star. Tap a card for details. Arrow keys work too.</p>' +
      '<div id="deck-empty" class="hide">' + JM.empty('layers', 'You are all caught up', nf ? 'No more jobs match your filters. Loosen them or review passed jobs.' : 'You have seen every job for now. You can review previously passed jobs or check back later.',
        '<div class="row wrap" style="justify-content:center">' + (nf ? '<button class="btn secondary" data-act="filters">Change filters</button>' : '') + '<button class="btn secondary" data-act="requeue">Previous card</button><button class="btn secondary" data-act="requeueall">Review all passed</button><button class="btn" data-act="deckrefresh">Refresh</button></div>') + '</div></div></div>';
  }, after: drawDeck });
  JM.actions.ivstatus = async function (el) {
    await JM.busy(el, async function () {
      await JM.rpc('update_interview_status', { p_id: el.dataset.id, p_status: el.dataset.s });
      JM.toast('Interview updated.', 'ok'); JM.render();
    });
  };

  // ---------- job detail ----------
  JM.route('/jobs/:id', { auth: 'seeker', title: 'Job details', render: async function (p) {
    const j = await JM.rpc('get_job', { p_job: p.id });
    if (!j) return '<div class="page narrow">' + JM.empty('briefcase', 'This job is no longer available', 'The employer may have closed it.', '<a class="btn" href="#/deck">Back to Discover</a>') + '</div>';
    JM.cur = j; const m = j.match || {}, parts = m.parts || {}, ap = j.application;
    const isRemote = j.work_setup === 'Remote';
    const part = function (l, v, w) { return '<div class="skill"><div class="row between small"><span>' + l + ' <span class="muted">(' + w + '% of score)</span></span><b class="num">' + v + '%</b></div>' + JM.bar(v, v >= 70 ? 'ok' : '') + '</div>'; };
    const cta = ap ? '<div class="notice ok">' + ic('check') + '<div><b>You applied ' + JM.ago(ap.created_at) + '.</b> Status: ' + esc(ap.status) + '. <a href="#/applications">See your applications</a></div></div>' :
      '<div class="row wrap"><button class="btn lg" data-act="apply" data-id="' + j.id + '">Apply now</button>' + (j.swipe === 'right' || j.swipe === 'star' ? '<span class="badge brand">' + ic('heart', 12) + 'Saved</span>' : '<button class="btn secondary lg" data-act="savejob" data-id="' + j.id + '">' + ic('heart', 16) + 'Save</button>') + '</div>';
    const mediaHead = '<div class="jmedia jmedia-detail mt">' +
      JM.img({ bucket: 'job-photos', path: j.photo_path, shape: 'cover43', focus: j.photo_focus || '50% 50%', fallback: 'placeholder', name: j.category || j.title, icon: 'briefcase', alt: j.title, act: j.photo_path ? 'imgview' : '', title: j.title }) +
      '<div class="jlogo">' + JM.img({ bucket: 'company-logos', path: j.company && j.company.logo_path, shape: 'circle', size: 64, name: j.company && j.company.name, alt: j.company && j.company.name }) + '</div></div>';
    return '<div class="page narrow"><a class="small row gap-s" href="#/deck" style="margin-bottom:14px">' + ic('left', 16) + 'Back</a>' +
      '<div class="card card-b"><div class="row" style="align-items:flex-start"><div class="grow"><div class="row gap-s wrap">' + (j.boosted ? JM.badge('Featured', 'star') : '') + JM.badge(j.type, 'brand') + JM.setupBadge(j.work_setup, j.onsite_days) + (j.company.verified ? JM.badge('Verified business', 'ok') : '') + '</div><h1 style="margin-top:12px">' + esc(j.title) + '</h1><p class="muted mt" style="margin-bottom:0">' + esc(j.company.name) + ' · ' + esc(JM.area(j.area_id)) + '</p></div>' + JM.ring(m.score || 0, 64, scoreColor(m.score || 0)) + '</div>' +
      mediaHead +
      '<div class="row wrap jdetails" style="gap:20px;margin-top:34px"><div><div class="xs muted">Pay</div><b>' + JM.salary(j) + '</b></div><div><div class="xs muted">Work setup</div><b>' + esc(j.work_setup || 'On-site') + (j.work_setup === 'Hybrid' && j.onsite_days ? ' · ' + j.onsite_days + ' days on-site' : '') + '</b></div><div><div class="xs muted">Distance</div><b>' + (isRemote ? 'Remote' : m.dist != null ? m.dist + ' km' : 'n/a') + '</b></div><div><div class="xs muted">Posted</div><b>' + JM.ago(j.posted_at) + '</b></div></div><div class="mt-l">' + cta + '</div></div>' +
      '<div class="card mt"><div class="card-h"><h3>Why you match</h3></div><div class="card-b">' + part('Skills', parts.skills || 0, 55) + part('Location', parts.location || 0, 20) + part('Interests', parts.interest || 0, 15) + part('Pay', parts.salary || 0, 10) +
      '<div class="divider"></div><div class="label">Skills for this job</div><div class="chips">' + JM.skillChips(j) + '</div>' + ((m.missing || []).length ? '<p class="small muted mt" style="margin-bottom:0">Skills in amber are not at a hiring level yet. ' + (j.role_id ? '<a href="#/career/job/' + j.id + '">See how to close the gap</a>.' : '') + '</p>' : '') + '</div></div>' +
      '<div class="card mt"><div class="card-h"><h3>About the job</h3></div><div class="card-b" style="white-space:pre-wrap">' + (j.intern_requirements ? '<div class="notice mb">' + ic('award') + '<div><b>Specific / Intern Requirements:</b> ' + esc(j.intern_requirements) + '</div></div>' : '') + esc(j.description) + '</div></div>' +
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
      return '<div class="li"><a href="#/jobs/' + j.id + '" class="row grow" style="color:inherit;gap:14px">' +
        JM.img({ bucket: 'company-logos', path: j.company && j.company.logo_path, shape: 'circle', size: 42, name: j.company && j.company.name }) +
        '<div class="grow"><div class="bold">' + esc(j.title) + (x.starred ? ' <span style="color:var(--star)">' + ic('star', 14) + '</span>' : '') + '</div><div class="small muted">' + esc(j.company.name) + ' · ' + JM.salary(j) + ' ' + JM.setupBadge(j.work_setup, j.onsite_days) + '</div></div></a>' +
        '<b class="num" style="color:' + scoreColor(j.match.score) + '">' + j.match.score + '%</b>' + (ap ? JM.badge(ap.status, ap.status === 'rejected' ? 'bad' : 'ok') : j.status === 'published' ? '<button class="btn sm" data-act="apply" data-id="' + j.id + '">Apply</button>' : JM.badge('Closed')) +
        '<button class="iconbtn" data-act="unprefer" data-id="' + j.id + '" aria-label="Remove from preferred" style="width:32px;height:32px">' + ic('x', 16) + '</button></div>';
    }).join('');
    return '<div class="page narrow">' + JM.pageHead('Preferred jobs', 'Jobs you saved. Starred jobs stay on top.') + (items.length ? '<div class="card list">' + rows + '</div>' : '<div class="card">' + JM.empty('heart', 'Nothing saved yet', 'Swipe right on jobs you like and they will wait here.', '<a class="btn" href="#/deck">Browse jobs</a>') + '</div>') + '</div>';
  } });
  JM.actions.unprefer = function (el) {
    JM.confirm({
      title: 'Remove from Preferred?',
      text: 'This removes the job from your Preferred list.',
      ok: 'Remove',
      danger: true,
      onOk: function () { JM.busy(null, async function () { await JM.rpc('remove_preferred', { p_job: el.dataset.id }); JM.toast('Removed from Preferred.'); JM.render(); }); }
    });
  };

  // ---------- applications ----------
  const STATUS = { applied: ['Applied', ''], shortlisted: ['Shortlisted', 'ok'], hired: ['Hired', 'ok'], rejected: ['Not selected', 'bad'] };
  JM.route('/applications', { auth: 'seeker', title: 'Applications', render: async function () {
    if (JM.me.seeker.plan !== 'pro') {
      return '<div class="page narrow">' + JM.pageHead('Applications', 'Track every job you applied to.') + '<div class="card">' + JM.empty('lock', 'Application history is a paid feature', 'Free plan users do not have access to application or activity history. Upgrade to the Monthly or Annual Plan to track all your applications and insights.', '<a class="btn" href="#/pro">View Monthly &amp; Annual Plans</a>') + '</div></div>';
    }
    const items = await JM.rpc('my_applications');
    const rows = items.map(function (a) {
      const st = STATUS[a.status];
      return '<div class="li" style="align-items:flex-start;flex-wrap:wrap">' +
        JM.img({ bucket: 'company-logos', path: a.job.logo_path, shape: 'circle', size: 42, name: a.job.company }) +
        '<div class="grow"><a class="bold" href="#/jobs/' + a.job.id + '" style="color:var(--ink)">' + esc(a.job.title) + '</a> ' + JM.setupBadge(a.job.work_setup, a.job.onsite_days) + '<div class="small muted">' + esc(a.job.company) + ' · applied ' + JM.ago(a.created_at) + ' · ' + (a.viewed ? 'viewed by employer' : 'not viewed yet') + '</div>' +
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
      return '<div class="card card-b"><div class="row" style="align-items:flex-start">' +
        JM.img({ bucket: 'company-logos', path: c.logo_path, shape: 'circle', size: 48, name: c.name }) +
        '<div class="grow"><div class="row gap-s wrap"><h3>' + esc(c.name) + '</h3>' + JM.badge(x.status === 'hired' ? 'Hired' : 'Shortlisted', 'ok') + JM.setupBadge(x.job.work_setup, x.job.onsite_days) + '</div><div class="muted small">' + esc(x.job.title) + ' · ' + JM.ago(x.matched_at) + '</div></div></div>' +
        '<div class="divider"></div><div class="small col gap-s"><div class="row gap-s">' + ic('user', 15) + esc(c.contact_name || 'Hiring team') + '</div>' + (c.contact_phone ? '<div class="row gap-s">' + ic('mail', 15) + esc(c.contact_phone) + '</div>' : '') + (c.contact_email ? '<div class="row gap-s">' + ic('mail', 15) + '<a href="mailto:' + esc(c.contact_email) + '">' + esc(c.contact_email) + '</a></div>' : '') + (c.address ? '<div class="row gap-s">' + ic('pin', 15) + esc(c.address) + '</div>' : '') + '</div>' +
        (x.conversation_id ? '<a class="btn block mt" href="#/messages/' + x.conversation_id + '">' + ic('chat', 16) + 'Message ' + esc(c.name) + '</a>' : '<button class="btn block mt" data-act="startmsg" data-app="' + x.application_id + '">' + ic('chat', 16) + 'Message ' + esc(c.name) + '</button>') + '</div>';
    }).join('');
    return '<div class="page">' + JM.pageHead('Matches', 'Employers who shortlisted you. They can now see your full profile and contact details.') + (items.length ? '<div class="grid g2">' + cards + '</div>' : '<div class="card">' + JM.empty('users', 'No matches yet', 'When an employer shortlists you, they show up here and a chat opens. Keep applying and building your skills.', '<a class="btn" href="#/deck">Find jobs</a>') + '</div>') + '</div>';
  } });
  JM.actions.startmsg = async function (el) {
    await JM.busy(el, async function () {
      const r = await JM.rpc('start_conversation', { p_app: el.dataset.app });
      JM.close();
      JM.go('/messages/' + r.id);
    });
  };

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
