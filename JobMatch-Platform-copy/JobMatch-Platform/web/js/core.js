/* JobMatch core: Supabase client, formatting, icons, overlays, router and app shell. */
(function () {
  const CFG = window.JM_CONFIG; const JM = window.JM = window.JM || {};
  JM.cfg = CFG;
  JM.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'jobmatch.auth' } });

  // ---------- data access ----------
  const FRIENDLY = {
    pro_required: 'This is a Pro feature.', plan_required: 'Your plan does not include this. See Plans and billing.',
    plan_limit: 'You reached your plan limit for active posts.', verify_required: 'Your business must be verified first.',
    blocked: 'You cannot message this person.', slow_down: 'You are sending messages too quickly. Wait a moment.',
    invalid_transition: 'That step is no longer available for this applicant.', 'not authenticated': 'Please sign in again.',
    forbidden: 'You do not have access to this.', 'Invalid login credentials': 'Email or password is incorrect.',
    'Email not confirmed': 'Please confirm your email first. Check your inbox.', 'User already registered': 'An account with this email already exists.',
    'Failed to fetch': 'Cannot reach the server. Check your connection.'
  };
  JM.err = function (e) { const m = (e && e.message) || String(e || 'Something went wrong'); for (const k in FRIENDLY) if (m.indexOf(k) >= 0) return FRIENDLY[k]; return m; };
  JM.rpc = async function (fn, args) {
    const r = await JM.sb.rpc(fn, args || {});
    if (r.error) { const e = new Error(r.error.message); e.code = r.error.code; throw e; }
    return r.data;
  };
  JM.q = async function (builder) { const r = await builder; if (r.error) { const e = new Error(r.error.message); e.code = r.error.code; throw e; } return r.data; };
  JM.fn = async function (name, body) {
    const { data: s } = await JM.sb.auth.getSession();
    const res = await fetch(CFG.supabaseUrl + '/functions/v1/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.supabaseKey, Authorization: 'Bearer ' + (s.session ? s.session.access_token : CFG.supabaseKey) }, body: JSON.stringify(body || {}) });
    const out = await res.json().catch(function () { return {}; });
    if (!res.ok) { const e = new Error(out.error || out.message || 'Request failed'); e.status = res.status; e.body = out; throw e; }
    return out;
  };
  JM.loadMe = async function () { JM.me = await JM.rpc('me'); return JM.me; };

  // ---------- formatting ----------
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  JM.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); };
  JM.peso = function (n) { return '₱' + Number(n || 0).toLocaleString('en-PH'); };
  JM.salary = function (j) { return JM.peso(j.salary_min) + ' – ' + Number(j.salary_max).toLocaleString('en-PH') + ' / mo'; };
  JM.ago = function (ts) {
    const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago';
    const d = Math.round(s / 86400); return d < 30 ? d + (d === 1 ? ' day ago' : ' days ago') : JM.date(ts);
  };
  JM.date = function (ts) { return new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }); };
  JM.initials = function (n) { return String(n || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); };
  JM.area = function (id) { const a = (JM.areas || []).find(function (x) { return x.id === id; }); return a ? a.name : id || ''; };
  JM.avatar = function (name, cls) { return '<span class="avatar ' + (cls || '') + '">' + JM.esc(JM.initials(name)) + '</span>'; };

  // ---------- icons ----------
  const P = {
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>',
    award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', check: '<polyline points="20 6 9 17 4 12"/>',
    left: '<polyline points="15 18 9 12 15 6"/>', right: '<polyline points="9 18 15 12 9 6"/>', down: '<polyline points="6 9 12 15 18 9"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>', briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', undo: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>', file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    chart: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>', card: '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>', upload: '<polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>',
    ext: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', crown: '<path d="M2 7l4 5 6-8 6 8 4-5v12H2z"/>',
    mail: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/>', book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>', trend: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>', flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>', download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
    play: '<polygon points="5 3 19 12 5 21 5 3"/>', zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 8a5 5 0 0 1 0 8"/>', list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'
  };
  JM.icon = function (n, size) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"' + (size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '') + '>' + (P[n] || '') + '</svg>'; };
  const ic = JM.icon;
  JM.ring = function (pct, size, color) {
    size = size || 52; const r = (size - 7) / 2, c = 2 * Math.PI * r, off = c * (1 - pct / 100), m = size / 2;
    return '<span class="ring" style="width:' + size + 'px;height:' + size + 'px"><svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true"><circle cx="' + m + '" cy="' + m + '" r="' + r + '" fill="none" stroke="#E6ECF4" stroke-width="5"/><circle cx="' + m + '" cy="' + m + '" r="' + r + '" fill="none" stroke="' + (color || '#14804F') + '" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + off + '" transform="rotate(-90 ' + m + ' ' + m + ')"/></svg><b>' + pct + '%</b></span>';
  };
  JM.bar = function (pct, cls) { return '<div class="bar ' + (cls || '') + '" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>'; };
  JM.badge = function (t, cls) { return '<span class="badge ' + (cls || '') + '">' + JM.esc(t) + '</span>'; };
  JM.empty = function (icon, title, text, btn) { return '<div class="empty">' + ic(icon || 'inbox') + '<h3>' + JM.esc(title) + '</h3><p>' + JM.esc(text || '') + '</p>' + (btn || '') + '</div>'; };
  JM.skeleton = function () { return '<div class="page"><div class="skel" style="height:30px;width:240px;margin-bottom:22px"></div><div class="grid g3"><div class="skel" style="height:110px"></div><div class="skel" style="height:110px"></div><div class="skel" style="height:110px"></div></div><div class="skel" style="height:240px;margin-top:16px"></div></div>'; };
  JM.pageHead = function (title, sub, actions) { return '<div class="page-h"><div class="grow"><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (actions ? '<div class="row wrap">' + actions + '</div>' : '') + '</div>'; };

  // ---------- overlays ----------
  JM.toast = function (msg, type) {
    const box = document.getElementById('toasts'); const t = document.createElement('div');
    t.className = 'toast ' + (type || ''); t.setAttribute('role', 'status'); t.textContent = msg; box.appendChild(t); setTimeout(function () { t.remove(); }, 4200);
  };
  JM.modal = function (html, cls) {
    const root = document.getElementById('overlay-root');
    root.innerHTML = '<div class="ov" data-ov="1"><div class="modal ' + (cls || '') + '" role="dialog" aria-modal="true">' + html + '</div></div>'; root.classList.add('open');
    const f = root.querySelector('input:not([type=hidden]),select,textarea'); if (f && !cls) setTimeout(function () { try { f.focus(); } catch (e) {} }, 30);
  };
  JM.drawer = function (html) {
    const root = document.getElementById('overlay-root');
    root.innerHTML = '<div class="ov" data-ov="1" style="align-items:stretch;justify-content:flex-end"><aside class="drawer" role="dialog" aria-modal="true">' + html + '</aside></div>'; root.classList.add('open');
  };
  JM.close = function () { const r = document.getElementById('overlay-root'); r.classList.remove('open'); r.innerHTML = ''; };
  JM.confirm = function (o) {
    JM._ok = o.onOk;
    JM.modal('<h2>' + JM.esc(o.title) + '</h2><p class="muted mt">' + JM.esc(o.text || '') + '</p><div class="row mt-l" style="justify-content:flex-end"><button class="btn secondary" data-act="close">Cancel</button><button class="btn ' + (o.danger ? 'danger' : '') + '" data-act="okconfirm">' + JM.esc(o.ok || 'Confirm') + '</button></div>');
  };
  JM.busy = async function (btn, fn) {
    if (btn) btn.disabled = true;
    try { return await fn(); } catch (e) { JM.toast(JM.err(e), 'bad'); } finally { if (btn) btn.disabled = false; }
  };

  // ---------- handler registries ----------
  JM.actions = {}; JM.forms = {}; JM.inputs = {};
  JM.go = function (path) { if (location.hash === '#' + path) JM.render(); else location.hash = path; };

  // ---------- shells ----------
  const NAV = {
    seeker: [['/deck', 'layers', 'Discover'], ['/preferred', 'heart', 'Preferred'], ['/matches', 'users', 'Matches'], ['/messages', 'chat', 'Messages'], ['/career', 'award', 'Career'],
      ['H', 'More'], ['/applications', 'briefcase', 'Applications'], ['/resume-review', 'sparkle', 'Résumé review'], ['/checklist', 'file', 'First-time jobseeker'], ['/pro', 'crown', 'JobMatch Pro'], ['/profile', 'user', 'Profile'], ['/settings', 'settings', 'Settings'], ['/help', 'help', 'Help']],
    employer: [['/employer', 'home', 'Overview'], ['/employer/jobs', 'briefcase', 'Jobs'], ['/messages', 'chat', 'Messages'], ['/employer/candidates', 'search', 'Candidate search'], ['/employer/analytics', 'chart', 'Analytics'],
      ['H', 'Account'], ['/employer/billing', 'card', 'Plans and billing'], ['/employer/company', 'settings', 'Company and team'], ['/employer/help', 'help', 'Help']],
    admin: [['/admin', 'home', 'Overview'], ['/admin/verification', 'shield', 'Verification'], ['/admin/moderation', 'flag', 'Moderation'], ['/admin/users', 'users', 'Users'],
      ['H', 'Platform'], ['/admin/career', 'book', 'Career data'], ['/admin/payments', 'card', 'Payments'], ['/admin/analytics', 'chart', 'Analytics'], ['/admin/courses', 'dollar', 'Course partners'], ['/admin/announcements', 'megaphone', 'Announcements']]
  };
  const TABS = [['/deck', 'layers', 'Discover'], ['/preferred', 'heart', 'Preferred'], ['/matches', 'users', 'Matches'], ['/career', 'award', 'Career'], ['/profile', 'user', 'Profile']];
  JM.activeNav = function (path, items) {
    let best = null;
    items.forEach(function (n) { if (n[0] !== 'H' && (path === n[0] || (n[0] !== '/employer' && n[0] !== '/admin' && path.indexOf(n[0] + '/') === 0))) { if (!best || n[0].length > best.length) best = n[0]; } });
    return best;
  };
  JM.shellHtml = function () {
    const me = JM.me, role = me.role, items = NAV[role], name = role === 'employer' && me.employer ? me.employer.name : me.full_name;
    const sub = role === 'seeker' ? (me.seeker.plan === 'pro' ? 'Pro member' : 'Free plan') : role === 'employer' ? (me.employer.plan[0].toUpperCase() + me.employer.plan.slice(1) + ' plan') : 'Administrator';
    const links = items.map(function (n) {
      if (n[0] === 'H') return '<div class="nav-h">' + n[1] + '</div>';
      const badge = n[0] === '/messages' ? '<span class="count hide" id="nb-msg"></span>' : '';
      return '<a class="nav" data-nav="' + n[0] + '" href="#' + n[0] + '">' + ic(n[1]) + '<span>' + n[2] + '</span>' + badge + '</a>';
    }).join('');
    const tabs = role === 'seeker' ? '<nav class="tabbar" aria-label="Main">' + TABS.map(function (n) { return '<a data-tab="' + n[0] + '" href="#' + n[0] + '">' + ic(n[1], 21) + '<span>' + n[2] + '</span>' + (n[0] === '/matches' ? '<span class="dot hide" id="nb-match"></span>' : '') + '</a>'; }).join('') + '</nav>' : '';
    const menu = role !== 'seeker' ? '<button class="iconbtn menu" data-act="menu" aria-label="Open menu">' + ic('menu') + '</button>' : '';
    return '<div class="shell" id="shell" data-role="' + role + '"><aside class="sidebar" aria-label="Navigation"><div class="brand"><img src="assets/logo.png" alt="">JobMatch</div>' + links +
      '<div class="grow"></div><div class="userbox">' + JM.avatar(name) + '<div class="grow"><div class="bold small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + JM.esc(name) + '</div><div class="xs muted">' + sub + '</div></div><button class="iconbtn" data-act="logout" aria-label="Sign out" title="Sign out">' + ic('logout') + '</button></div></aside><div class="scrim" data-act="menu"></div>' +
      '<div class="main"><header class="topbar">' + menu + '<span class="mbrand"><img src="assets/logo.png" alt="">JobMatch</span><div class="title" id="ptitle"></div>' +
      (role === 'seeker' ? '<a class="iconbtn" href="#/messages" aria-label="Messages">' + ic('chat') + '<span class="dot hide" id="tb-msg"></span></a>' : '') +
      '<a class="iconbtn" href="#/notifications" aria-label="Notifications">' + ic('bell') + '<span class="dot hide" id="tb-bell"></span></a></header><main id="main"><div id="view"></div></main></div>' + tabs + '</div>';
  };
  JM.updateBadges = function () {
    const me = JM.me; if (!me) return;
    const set = function (id, n) { const el = document.getElementById(id); if (!el) return; el.textContent = n > 9 ? '9+' : n; el.classList.toggle('hide', !n); };
    set('tb-bell', me.unread || 0); set('tb-msg', me.unread_messages || 0); set('nb-msg', me.unread_messages || 0); set('nb-match', me.seeker && me.unread_matches ? me.unread_matches : 0);
  };
  JM.markNav = function (path, title) {
    const shell = document.getElementById('shell'); if (!shell) return;
    const items = NAV[JM.me.role], act = JM.activeNav(path, items);
    shell.querySelectorAll('[data-nav]').forEach(function (a) { a.classList.toggle('on', a.dataset.nav === act); });
    shell.querySelectorAll('[data-tab]').forEach(function (a) { a.classList.toggle('on', path === a.dataset.tab || path.indexOf(a.dataset.tab + '/') === 0); });
    shell.classList.remove('drawer-open');
    const t = document.getElementById('ptitle'); if (t) t.textContent = title || '';
  };

  // ---------- router ----------
  JM.routes = [];
  JM.route = function (pattern, o) {
    const keys = []; const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, function (m, k) { keys.push(k); return '([^/]+)'; }) + '$');
    JM.routes.push(Object.assign({ re: re, keys: keys, pattern: pattern }, o));
  };
  JM.home = function () {
    const me = JM.me; if (!me) return '/';
    if (me.suspended) return '/login';
    if (!me.role) return '/role'; if (!me.consent_at) return '/consent';
    if (me.role === 'seeker') return me.seeker && me.seeker.onboarded ? '/deck' : '/onboarding';
    if (me.role === 'employer') return me.employer ? '/employer' : '/employer/setup';
    return '/admin';
  };
  let seq = 0, lastPath = null;
  JM.render = async function () {
    const mySeq = ++seq, app = document.getElementById('app');
    const hash = location.hash.slice(1) || '/'; const parts = hash.split('?'), path = parts[0]; JM.query = {};
    new URLSearchParams(parts[1] || '').forEach(function (v, k) { JM.query[k] = v; });
    let route = null, params = {};
    for (let i = 0; i < JM.routes.length; i++) { const m = JM.routes[i].re.exec(path); if (m) { route = JM.routes[i]; JM.routes[i].keys.forEach(function (k, j) { params[k] = decodeURIComponent(m[j + 1]); }); break; } }
    if (!route) { app.innerHTML = '<div class="auth-main" style="min-height:100vh"><div class="auth-box center"><h2>Page not found</h2><p class="muted mt">That page does not exist.</p><a class="btn mt" href="#/">Go home</a></div></div>'; return; }
    const signedIn = !!JM.me;
    if (route.auth) {
      if (!signedIn) { JM.go('/login'); return; }
      const me = JM.me;
      if (me.suspended) { await JM.sb.auth.signOut(); JM.me = null; JM.go('/login'); JM.toast('This account is suspended. Contact support.', 'bad'); return; }
      if (route.auth !== true && route.auth !== 'any' && me.role !== route.auth && !(route.auth === 'both' && (me.role === 'seeker' || me.role === 'employer'))) { JM.go(JM.home()); return; }
      if (!route.pre) {
        if (!me.role) { JM.go('/role'); return; } if (!me.consent_at) { JM.go('/consent'); return; }
        if (me.role === 'seeker' && !(me.seeker && me.seeker.onboarded)) { JM.go('/onboarding'); return; }
        if (me.role === 'employer' && !me.employer) { JM.go('/employer/setup'); return; }
      }
    } else if (route.guest && signedIn) {
      if (JM.me.suspended) { await JM.sb.auth.signOut(); JM.me = null; JM.toast('This account is suspended. Contact support.', 'bad'); }
      else { JM.go(JM.home()); return; }
    }
    const shelled = route.auth && !route.plain;
    try {
      if (shelled) {
        if (!document.getElementById('shell') || document.getElementById('shell').dataset.role !== JM.me.role) app.innerHTML = JM.shellHtml();
        JM.markNav(path, typeof route.title === 'function' ? '' : route.title);
        const view = document.getElementById('view');
        if (path !== lastPath) view.innerHTML = JM.skeleton();
        const html = await route.render(params);
        if (mySeq !== seq) return;
        view.innerHTML = html;
        if (typeof route.title === 'function') JM.markNav(path, route.title(params));
        JM.updateBadges();
      } else {
        const html = await route.render(params); if (mySeq !== seq) return; app.innerHTML = html;
      }
    } catch (e) {
      if (mySeq !== seq) return; console.error(e);
      const view = document.getElementById('view') || app;
      view.innerHTML = '<div class="page narrow">' + JM.empty('flag', 'Something went wrong', JM.err(e), '<button class="btn secondary" data-act="reload">Try again</button>') + '</div>';
      return;
    }
    if (path !== lastPath) window.scrollTo(0, 0); lastPath = path;
    document.title = (typeof route.title === 'string' && route.title ? route.title + ' · ' : '') + 'JobMatch';
    if (route.after) route.after(params);
    if (JM.afterRender) JM.afterRender(path);
  };
  JM.actions.menu = function () { const s = document.getElementById('shell'); if (s) s.classList.toggle('drawer-open'); };
  JM.actions.reload = function () { JM.render(); };
  JM.actions.close = function () { JM.close(); };
  JM.actions.okconfirm = function () { const cb = JM._ok; JM.close(); if (cb) cb(); };
  JM.actions.logout = async function () { await JM.sb.auth.signOut(); JM.me = null; if (JM.unsubscribe) JM.unsubscribe(); JM.go('/'); };
})();
