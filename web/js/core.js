/* JobMatch core: Supabase client, formatting, icons, overlays, router, app shell,
   JM.img (with URL caching & fallbacks), JM.typeahead, JM.skillPicker, JM.rolePicker. */
(function () {
  const CFG = window.JM_CONFIG; const JM = window.JM = window.JM || {};
  JM.cfg = CFG;
  JM.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'jobmatch.auth' } });

  // ---------- data access ----------
  const FRIENDLY = {
    pro_required: 'Upgrade to the Monthly or Annual plan to use this feature.', plan_required: 'Your plan does not include this. See Plans and billing.',
    plan_limit: 'You reached your plan limit for active posts.', verify_required: 'Your business must be verified first.',
    blocked: 'You cannot message this person.', slow_down: 'You are doing that too quickly. Wait a moment.',
    invalid_transition: 'That step is no longer available for this applicant.', 'not authenticated': 'Please sign in again.',
    resume_required: 'Please upload a résumé file, provide a résumé link, or paste your résumé text first.',
    quiz_prereq_required: 'Complete all preliminary tasks in this week before taking the quiz.',
    free_chat_restricted: 'Free plan users can only reply after an employer contacts them first. Upgrade to Monthly or Annual to initiate chats.',
    not_matched: 'Messaging opens once an application is shortlisted.',
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

  // ---------- formatting & normalization ----------
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  JM.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); };
  JM.norm = function (s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); };
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
  JM.SETUPS = ['On-site', 'Hybrid', 'Remote'];

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
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/><path d="M9 22v-4h6v4"/>',
    shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
    globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    reply: '<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
    more: '<circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'
  };
  JM.icon = function (n, size) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"' + (size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '') + '>' + (P[n] || '') + '</svg>'; };
  const ic = JM.icon;
  JM.setupIcon = function (s) { return s === 'Remote' ? 'globe' : s === 'Hybrid' ? 'shuffle' : 'building'; };
  JM.setupBadge = function (setup, days) {
    const s = setup || 'On-site';
    const label = s === 'Hybrid' && days ? 'Hybrid · ' + days + 'd on-site' : s;
    return '<span class="badge ' + (s === 'Remote' ? 'brand' : '') + '">' + ic(JM.setupIcon(s), 12) + JM.esc(label) + '</span>';
  };
  JM.ring = function (pct, size, color) {
    size = size || 52; const r = (size - 7) / 2, c = 2 * Math.PI * r, off = c * (1 - pct / 100), m = size / 2;
    return '<span class="ring" style="width:' + size + 'px;height:' + size + 'px"><svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true"><circle cx="' + m + '" cy="' + m + '" r="' + r + '" fill="none" stroke="#E6ECF4" stroke-width="5"/><circle cx="' + m + '" cy="' + m + '" r="' + r + '" fill="none" stroke="' + (color || '#14804F') + '" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + off + '" transform="rotate(-90 ' + m + ' ' + m + ')"/></svg><b>' + pct + '%</b></span>';
  };
  JM.bar = function (pct, cls) { return '<div class="bar ' + (cls || '') + '" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>'; };
  JM.badge = function (t, cls) { return '<span class="badge ' + (cls || '') + '">' + JM.esc(t) + '</span>'; };
  JM.empty = function (icon, title, text, btn) { return '<div class="empty">' + ic(icon || 'inbox') + '<h3>' + JM.esc(title) + '</h3><p>' + JM.esc(text || '') + '</p>' + (btn || '') + '</div>'; };
  JM.skeleton = function () { return '<div class="page"><div class="skel" style="height:30px;width:240px;margin-bottom:22px"></div><div class="grid g3"><div class="skel" style="height:110px"></div><div class="skel" style="height:110px"></div><div class="skel" style="height:110px"></div></div><div class="skel" style="height:240px;margin-top:16px"></div></div>'; };
  JM.pageHead = function (title, sub, actions) { return '<div class="page-h"><div class="grow"><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (actions ? '<div class="row wrap">' + actions + '</div>' : '') + '</div>'; };
  JM.summaryBlock = function (text, cls) {
    const t = String(text || '').trim();
    if (!t) return '';
    const long = t.length > 260 || t.split('\n').length > 4;
    return '<div class="sum-wrap' + (long ? ' clamped' : '') + ' ' + (cls || '') + '"><p class="small sum-text">' + JM.esc(t) + '</p>' +
      (long ? '<button type="button" class="btn ghost sm sum-toggle" data-act="sumtoggle" style="padding:0 4px;height:26px">Read more</button>' : '') + '</div>';
  };

  // ---------- clean image helper + URL cache (Section 8.3) ----------
  const PUB_BUCKETS = { 'company-logos': 1, 'job-photos': 1 };
  JM.urlCache = {};
  JM.publicUrl = function (bucket, path) {
    if (!bucket || !path) return '';
    const k = bucket + '/' + path;
    if (JM.urlCache[k]) return JM.urlCache[k].url;
    const u = JM.sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    JM.urlCache[k] = { url: u, exp: Infinity };
    return u;
  };
  JM.getUrl = async function (bucket, path, force) {
    if (!bucket || !path) return '';
    const k = bucket + '/' + path;
    const cached = JM.urlCache[k];
    if (!force && cached && cached.exp > Date.now()) return cached.url;
    if (PUB_BUCKETS[bucket]) {
      const u = JM.sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      const finalUrl = force ? u + (u.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now() : u;
      JM.urlCache[k] = { url: finalUrl, exp: Infinity };
      return finalUrl;
    }
    const r = await JM.sb.storage.from(bucket).createSignedUrl(path, 3600);
    if (r.error || !r.data || !r.data.signedUrl) return '';
    JM.urlCache[k] = { url: r.data.signedUrl, exp: Date.now() + 50 * 60 * 1000 };
    return r.data.signedUrl;
  };
  JM.img = function (o) {
    o = o || {};
    const shape = o.shape || 'rounded'; // circle | rounded | cover43 | portrait
    const size = o.size ? Number(o.size) : null;
    const sizeStyle = size ? 'width:' + size + 'px;height:' + size + 'px;' : '';
    const focusStyle = o.focus ? 'object-position:' + JM.esc(o.focus) + ';' : '';
    const ph = o.fallback === 'icon'
      ? '<span class="jm-img-ph">' + ic(o.icon || 'image', size ? Math.round(size * 0.44) : 24) + '</span>'
      : o.fallback === 'placeholder'
        ? '<span class="jm-img-ph jm-img-coverph">' + ic(o.icon || 'briefcase', 30) + (o.name ? '<small>' + JM.esc(o.name) + '</small>' : '') + '</span>'
        : '<span class="jm-img-ph">' + JM.esc(JM.initials(o.name || o.alt || '?')) + '</span>';
    const hasMedia = !!(o.directUrl || (o.bucket && o.path));
    let immediateSrc = o.directUrl || '';
    if (!immediateSrc && o.bucket && o.path) {
      const k = o.bucket + '/' + o.path;
      if (PUB_BUCKETS[o.bucket]) immediateSrc = JM.publicUrl(o.bucket, o.path);
      else if (JM.urlCache[k] && JM.urlCache[k].exp > Date.now()) immediateSrc = JM.urlCache[k].url;
    }
    const actAttrs = o.act ? ' data-act="' + JM.esc(o.act) + '" data-bucket="' + JM.esc(o.bucket || '') + '" data-path="' + JM.esc(o.path || '') + '" data-title="' + JM.esc(o.title || o.alt || 'Preview') + '"' + (o.desc ? ' data-desc="' + JM.esc(o.desc) + '"' : '') + (o.directUrl ? ' data-src="' + JM.esc(o.directUrl) + '"' : '') + ' role="button" tabindex="0"' : '';
    const dataAttrs = hasMedia ? ' data-jm-bucket="' + JM.esc(o.bucket || '') + '" data-jm-path="' + JM.esc(o.path || '') + '"' + (o.directUrl ? ' data-jm-direct="' + JM.esc(o.directUrl) + '"' : '') : '';
    const imgTag = hasMedia
      ? '<img class="jm-img-el"' + (immediateSrc ? ' src="' + JM.esc(immediateSrc) + '"' : '') + ' alt="' + JM.esc(o.alt || o.name || '') + '" loading="lazy" decoding="async" draggable="false" style="' + focusStyle + '">'
      : '';
    return '<span class="jm-img jm-img-' + shape + (o.act ? ' clickable' : '') + (o.cls ? ' ' + o.cls : '') + '" style="' + sizeStyle + (o.style || '') + '"' + dataAttrs + actAttrs + '>' + ph + imgTag + (o.extra || '') + '</span>';
  };
  JM.hydrateImages = async function (root) {
    const scope = root || document;
    const wraps = Array.from(scope.querySelectorAll('.jm-img[data-jm-bucket], .jm-img[data-jm-direct]'));
    if (!wraps.length) return;
    const needByBucket = {};
    const bindImg = function (wrap, img, bucket, path, url) {
      if (!img || !url) return;
      img.onload = function () { wrap.classList.add('loaded'); };
      img.onerror = async function () {
        if (!img.dataset.retried && bucket && path) {
          img.dataset.retried = '1';
          try {
            const fresh = await JM.getUrl(bucket, path, true);
            if (fresh) { img.src = fresh; return; }
          } catch (e) { /* keep fallback */ }
        }
        wrap.classList.remove('loaded');
        img.remove();
      };
      if (img.getAttribute('src') !== url) img.src = url;
      else if (img.complete && img.naturalWidth > 0) wrap.classList.add('loaded');
    };
    wraps.forEach(function (w) {
      const img = w.querySelector('img.jm-img-el');
      if (!img) return;
      if (w.dataset.jmDirect) { bindImg(w, img, '', '', w.dataset.jmDirect); return; }
      const b = w.dataset.jmBucket, p = w.dataset.jmPath;
      if (!b || !p) return;
      if (PUB_BUCKETS[b]) { bindImg(w, img, b, p, JM.publicUrl(b, p)); return; }
      const cached = JM.urlCache[b + '/' + p];
      if (cached && cached.exp > Date.now()) { bindImg(w, img, b, p, cached.url); return; }
      needByBucket[b] = needByBucket[b] || {};
      needByBucket[b][p] = needByBucket[b][p] || [];
      needByBucket[b][p].push({ w: w, img: img });
    });
    const buckets = Object.keys(needByBucket);
    await Promise.all(buckets.map(async function (b) {
      const paths = Object.keys(needByBucket[b]);
      if (!paths.length) return;
      try {
        const res = await JM.sb.storage.from(b).createSignedUrls(paths, 3600);
        const exp = Date.now() + 50 * 60 * 1000;
        (res.data || []).forEach(function (row) {
          if (!row.path || !row.signedUrl) return;
          JM.urlCache[b + '/' + row.path] = { url: row.signedUrl, exp: exp };
          (needByBucket[b][row.path] || []).forEach(function (item) { bindImg(item.w, item.img, b, row.path, row.signedUrl); });
        });
      } catch (e) { /* placeholders stay visible */ }
    }));
  };

  // ---------- overlays ----------
  JM.toast = function (msg, type) {
    const box = document.getElementById('toasts'); const t = document.createElement('div');
    t.className = 'toast ' + (type || ''); t.setAttribute('role', 'status'); t.textContent = msg; box.appendChild(t); setTimeout(function () { t.remove(); }, 4200);
  };
  JM.modal = function (html, cls) {
    const root = document.getElementById('overlay-root');
    root.innerHTML = '<div class="ov" data-ov="1"><div class="modal ' + (cls || '') + '" role="dialog" aria-modal="true">' + html + '</div></div>'; root.classList.add('open');
    JM.mountTypeaheads(root); JM.hydrateImages(root);
    const f = root.querySelector('input:not([type=hidden]),select,textarea'); if (f && !cls) setTimeout(function () { try { f.focus(); } catch (e) {} }, 30);
  };
  JM.drawer = function (html) {
    const root = document.getElementById('overlay-root');
    root.innerHTML = '<div class="ov" data-ov="1" style="align-items:stretch;justify-content:flex-end"><aside class="drawer" role="dialog" aria-modal="true">' + html + '</aside></div>'; root.classList.add('open');
    JM.mountTypeaheads(root); JM.hydrateImages(root);
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

  // ---------- reusable Typeahead component (Section 1.2) ----------
  JM.taReg = {};
  function highlightMatch(label, query) {
    const safe = JM.esc(label);
    const q = JM.norm(query).trim();
    if (!q) return safe;
    // Map normalized indices back to original characters
    const nChars = [];
    const origIdx = [];
    for (let i = 0; i < label.length; i++) {
      const ch = JM.norm(label[i]);
      for (let j = 0; j < ch.length; j++) { nChars.push(ch[j]); origIdx.push(i); }
    }
    const nStr = nChars.join('');
    const pos = nStr.indexOf(q);
    if (pos < 0) return safe;
    const start = origIdx[pos];
    const end = origIdx[Math.min(origIdx.length - 1, pos + q.length - 1)] + 1;
    return JM.esc(label.slice(0, start)) + '<b>' + JM.esc(label.slice(start, end)) + '</b>' + JM.esc(label.slice(end));
  }
  function rankItems(items, query, max) {
    const q = JM.norm(query).trim();
    const list = (items || []).map(function (it) {
      return typeof it === 'string' ? { value: it, label: it } : it;
    });
    if (!q) return list.slice(0, max);
    const scored = [];
    list.forEach(function (it) {
      const nl = JM.norm(it.label);
      const aliases = (it.aliases || []).map(JM.norm);
      let tier = 99;
      if (nl.indexOf(q) === 0) tier = 1;
      else if ((' ' + nl).indexOf(' ' + q) >= 0 || nl.indexOf('– ' + q) >= 0 || nl.indexOf('-' + q) >= 0) tier = 2;
      else if (aliases.some(function (a) { return a.indexOf(q) === 0; })) tier = 2;
      else if (nl.indexOf(q) >= 0 || aliases.some(function (a) { return a.indexOf(q) >= 0; })) tier = 3;
      if (tier < 99) scored.push({ it: it, tier: tier, w: Number(it.weight || 0), nl: nl });
    });
    scored.sort(function (a, b) {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.w !== b.w) return b.w - a.w;
      return a.nl.localeCompare(b.nl);
    });
    return scored.slice(0, max).map(function (s) { return s.it; });
  }
  JM.typeahead = function (o) {
    const id = o.id || ('ta-' + Math.random().toString(36).slice(2, 8));
    JM.taReg[id] = Object.assign({ minChars: 1, max: 8, allowCustom: false, multi: false }, o, { id: id });
    const displayVal = o.label != null ? o.label : (o.value || '');
    const hidden = o.name ? '<input type="hidden" name="' + JM.esc(o.name) + '" value="' + JM.esc(o.value || '') + '" data-ta-val="' + JM.esc(id) + '">' : '';
    return '<div class="ta ' + (o.cls || '') + '" data-ta="' + JM.esc(id) + '">' + hidden +
      '<div class="ta-wrap"><span class="ta-ghost" aria-hidden="true" data-ta-ghost="' + JM.esc(id) + '"></span>' +
      '<input type="text" class="ta-inp" id="' + JM.esc(id) + '" value="' + JM.esc(displayVal) + '" placeholder="' + JM.esc(o.placeholder || 'Type to search…') + '" autocomplete="off" role="combobox" aria-autocomplete="both" aria-expanded="false" aria-controls="' + JM.esc(id) + '-list"' + (o.required ? ' required' : '') + ' ' + (o.inputAttrs || '') + '></div>' +
      '<div class="ta-list hide" id="' + JM.esc(id) + '-list" role="listbox"></div></div>';
  };
  JM.mountTypeaheads = function (root) {
    const scope = root || document;
    scope.querySelectorAll('.ta[data-ta]').forEach(function (box) {
      if (box._taBound) return;
      box._taBound = true;
      const id = box.dataset.ta, cfg = JM.taReg[id];
      if (!cfg) return;
      const inp = box.querySelector('input.ta-inp');
      const hid = box.querySelector('input[data-ta-val]');
      const listEl = box.querySelector('.ta-list');
      const ghostEl = box.querySelector('.ta-ghost');
      let items = [], active = -1, timer = null, reqId = 0, completion = '';
      const isMobile = window.matchMedia && window.matchMedia('(max-width: 767px)').matches;

      function setGhost(q, topItem) {
        completion = '';
        if (!ghostEl) return;
        if ((cfg.multi && isMobile) || !q || !topItem) { ghostEl.innerHTML = ''; return; }
        const nq = JM.norm(q), nl = JM.norm(topItem.label);
        if (nl.indexOf(nq) === 0 && topItem.label.length > q.length) {
          completion = topItem.label;
          ghostEl.innerHTML = '<span style="visibility:hidden">' + JM.esc(q) + '</span><span>' + JM.esc(topItem.label.slice(q.length)) + '</span>';
        } else {
          ghostEl.innerHTML = '';
        }
      }
      function close() {
        listEl.classList.add('hide');
        listEl.classList.remove('ta-up');
        inp.setAttribute('aria-expanded', 'false');
        active = -1;
        setGhost('', null);
      }
      function positionList() {
        const rect = inp.getBoundingClientRect();
        const below = window.innerHeight - rect.bottom;
        listEl.classList.toggle('ta-up', below < 240 && rect.top > below);
      }
      function renderList(q, loading) {
        if (loading) {
          listEl.innerHTML = '<div class="ta-empty">Searching…</div>';
          positionList(); listEl.classList.remove('hide'); inp.setAttribute('aria-expanded', 'true');
          return;
        }
        const rows = items.slice();
        const trimmed = q.trim();
        const exact = rows.some(function (x) { return JM.norm(x.label) === JM.norm(trimmed); });
        if (cfg.allowCustom && trimmed.length >= 1 && !exact) {
          rows.push({ value: trimmed, label: trimmed, _custom: true, group: 'Custom' });
        }
        if (cfg.extraOption) rows.push(cfg.extraOption);
        if (!rows.length) {
          listEl.innerHTML = '<div class="ta-empty">' + (cfg.allowCustom && trimmed ? 'No matches. Press Enter to add "' + JM.esc(trimmed) + '"' : 'No matches') + '</div>';
          setGhost('', null);
        } else {
          setGhost(q, rows[0]._custom || rows[0]._extra ? null : rows[0]);
          listEl.innerHTML = rows.map(function (it, i) {
            const lbl = it._custom
              ? (cfg.customLabel ? JM.esc(cfg.customLabel.replace('{q}', it.label)) : 'Add "<b>' + JM.esc(it.label) + '</b>"')
              : it._extra ? '<b>' + JM.esc(it.label) + '</b>'
              : highlightMatch(it.label, q);
            return '<div class="ta-item' + (i === active ? ' on' : '') + (it._extra ? ' ta-extra' : '') + '" role="option" aria-selected="' + (i === active) + '" data-ti="' + i + '">' +
              '<span class="ta-lbl">' + lbl + (it.hint ? '<small class="xs muted"> · ' + JM.esc(it.hint) + '</small>' : '') + '</span>' +
              (it.group ? '<span class="ta-group">' + JM.esc(it.group) + '</span>' : '') + '</div>';
          }).join('');
        }
        box._rows = rows;
        positionList();
        listEl.classList.remove('hide');
        inp.setAttribute('aria-expanded', 'true');
      }
      function pick(item) {
        if (!item) return;
        if (cfg.multi) {
          inp.value = '';
          if (hid) hid.value = '';
        } else {
          inp.value = item._extra ? '' : item.label;
          if (hid) hid.value = item.value;
        }
        close();
        if (cfg.onPick) cfg.onPick(item, inp);
      }
      async function search(q, forceOpen) {
        const trimmed = q.trim();
        if (!forceOpen && trimmed.length < cfg.minChars) { close(); return; }
        if (typeof cfg.source === 'function') {
          const myReq = ++reqId;
          clearTimeout(timer);
          renderList(q, true);
          timer = setTimeout(async function () {
            try {
              const res = await cfg.source(trimmed);
              if (myReq !== reqId) return;
              items = rankItems(res, trimmed, cfg.max);
              active = items.length ? 0 : -1;
              renderList(q, false);
            } catch (e) { if (myReq === reqId) close(); }
          }, 200);
        } else {
          items = rankItems(cfg.source || [], trimmed, cfg.max);
          active = items.length ? 0 : -1;
          renderList(q, false);
        }
      }
      inp.addEventListener('input', function () {
        if (hid && !cfg.multi) {
          hid.value = cfg.allowCustom ? inp.value.trim() : '';
        }
        if (cfg.allowCustom && cfg.onType) cfg.onType(inp.value);
        search(inp.value, false);
      });
      inp.addEventListener('focus', function () {
        if (cfg.minChars === 0 || inp.value.trim().length >= cfg.minChars) search(inp.value, true);
      });
      inp.addEventListener('keydown', function (e) {
        const open = !listEl.classList.contains('hide');
        const rows = box._rows || [];
        if (e.key === 'Tab' && completion && inp.value.trim() && JM.norm(completion) !== JM.norm(inp.value)) {
          e.preventDefault();
          const top = rows[0];
          if (top && !top._custom) pick(top); else { inp.value = completion; setGhost('', null); }
          return;
        }
        if (e.key === 'ArrowRight' && completion && inp.selectionStart === inp.value.length && rows[0] && !rows[0]._custom) {
          e.preventDefault(); pick(rows[0]); return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (!open) { search(inp.value, true); return; }
          if (!rows.length) return;
          active = (active + 1) % rows.length;
          renderList(inp.value, false);
          const aEl = listEl.querySelector('.ta-item.on'); if (aEl) aEl.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
          if (!open || !rows.length) return;
          e.preventDefault();
          active = active <= 0 ? rows.length - 1 : active - 1;
          renderList(inp.value, false);
          const aEl = listEl.querySelector('.ta-item.on'); if (aEl) aEl.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
          if (open && rows.length) {
            e.preventDefault();
            pick(rows[active >= 0 ? active : 0]);
          } else if (cfg.allowCustom && inp.value.trim()) {
            e.preventDefault();
            pick({ value: inp.value.trim(), label: inp.value.trim(), _custom: true });
          }
        } else if (e.key === 'Escape') {
          if (open) { e.preventDefault(); e.stopPropagation(); close(); }
        }
      });
      listEl.addEventListener('pointerdown', function (e) {
        const row = e.target.closest('.ta-item');
        if (!row) return;
        e.preventDefault();
        pick((box._rows || [])[Number(row.dataset.ti)]);
      });
      inp.addEventListener('blur', function () {
        setTimeout(function () {
          if (!box.contains(document.activeElement)) close();
        }, 140);
      });
    });
  };

  // ---------- reusable Categorized Skill Picker (Section 5.4) ----------
  JM.spReg = {};
  JM.spState = JM.spState || {};
  JM.skillCatName = function (skillName) {
    const sk = (JM.skillsMap || {})[skillName];
    if (!sk || !sk.category) return 'Other';
    const c = (JM.skillCatMap || {})[sk.category];
    return c ? c.name : sk.category;
  };
  JM.skillPicker = function (o) {
    const id = o.id || 'sp-main';
    JM.spReg[id] = o;
    const isSeeker = o.mode === 'seeker';
    const selectedMap = isSeeker ? (o.selected || {}) : null;
    const selectedArr = isSeeker ? Object.keys(selectedMap) : (o.selected || []);
    const has = function (n) { return isSeeker ? selectedMap[n] != null : selectedArr.indexOf(n) >= 0; };
    const cats = (JM.skillCategories && JM.skillCategories.length)
      ? JM.skillCategories
      : [{ id: 'all', name: 'All skills', icon: 'sparkle' }];
    const byCat = JM.skillsByCat || { all: (JM.skillList || []).map(function (n) { return { name: n, category: 'all', aliases: [] }; }) };
    const st = JM.spState[id] = JM.spState[id] || { tab: null, open: {} };

    // Build typeahead source across names + aliases
    const taSource = (JM.skillsRaw || []).map(function (s) {
      const cat = (JM.skillCatMap || {})[s.category];
      return { value: s.name, label: s.name, group: cat ? cat.name : 'General', aliases: s.aliases || [] };
    });
    const taHtml = JM.typeahead({
      id: id + '-ta',
      multi: true,
      allowCustom: true,
      customLabel: 'Add "{q}" as a new skill',
      placeholder: 'Search 300+ skills (e.g. Excel, Barista, React, Driving)…',
      source: taSource,
      onPick: async function (item) {
        let name = item.value;
        if (item._custom) {
          try {
            const r = await JM.rpc('add_custom_skill', { p_name: name, p_category: st.tab || 'core' });
            name = r.name || name;
            if (JM.skillList.indexOf(name) < 0) {
              JM.skillList.push(name);
              const skObj = { name: name, category: r.category || st.tab || 'core', aliases: [] };
              JM.skillsRaw.push(skObj);
              JM.skillsMap[name] = skObj;
              JM.skillsByCat[skObj.category] = JM.skillsByCat[skObj.category] || [];
              JM.skillsByCat[skObj.category].push(skObj);
            }
            JM.toast(r.existing ? 'Matched existing skill: ' + name : 'Added new skill: ' + name, 'ok');
          } catch (e) { JM.toast(JM.err(e), 'bad'); return; }
        }
        if (o.onAdd) o.onAdd(name);
      }
    });

    // Suggested row
    const suggested = (o.suggested || []).filter(function (s, i, a) { return s && a.indexOf(s) === i; }).slice(0, 10);
    const sugHtml = suggested.length
      ? '<div class="sp-sug"><div class="xs muted bold mb" style="margin-bottom:6px">' + ic('sparkle', 13) + ' Suggested for you</div><div class="chips">' +
        suggested.map(function (s) {
          return '<button type="button" class="chip' + (has(s) ? ' on' : '') + '" data-act="sptoggle" data-sp="' + JM.esc(id) + '" data-v="' + JM.esc(s) + '">' + (has(s) ? ic('check', 12) : ic('plus', 12)) + JM.esc(s) + '</button>';
        }).join('') + '</div></div>'
      : '';

    // Determine default open categories
    const openCats = {};
    cats.forEach(function (c) {
      const list = byCat[c.id] || [];
      const selCount = list.filter(function (s) { return has(s.name); }).length;
      if (selCount > 0 || (o.defaultCats || []).indexOf(c.id) >= 0) openCats[c.id] = true;
    });
    if (!st.tab) {
      const firstOpen = cats.find(function (c) { return openCats[c.id]; }) || cats[0];
      st.tab = firstOpen ? firstOpen.id : 'core';
    }

    // Mobile horizontal tabs + active category list
    const mTabs = '<div class="sp-mtabs" role="tablist">' + cats.map(function (c) {
      const list = byCat[c.id] || [];
      if (!list.length) return '';
      const cnt = list.filter(function (s) { return has(s.name); }).length;
      return '<button type="button" role="tab" aria-selected="' + (st.tab === c.id) + '" class="chip' + (st.tab === c.id ? ' on' : '') + '" data-act="sptab" data-sp="' + JM.esc(id) + '" data-cat="' + JM.esc(c.id) + '">' + JM.esc(c.name) + (cnt ? ' (' + cnt + ')' : '') + '</button>';
    }).join('') + '</div>';
    const activeList = (byCat[st.tab] || []);
    const mBody = '<div class="sp-mbody"><div class="chips">' + activeList.map(function (s) {
      return '<button type="button" class="chip' + (has(s.name) ? ' on' : '') + '" data-act="sptoggle" data-sp="' + JM.esc(id) + '" data-v="' + JM.esc(s.name) + '">' + JM.esc(s.name) + '</button>';
    }).join('') + '</div></div>';

    // Desktop collapsible accordions
    const dAcc = '<div class="sp-dacc">' + cats.map(function (c) {
      const list = byCat[c.id] || [];
      if (!list.length) return '';
      const cnt = list.filter(function (s) { return has(s.name); }).length;
      const isOpen = st.open[c.id] != null ? st.open[c.id] : !!openCats[c.id];
      return '<details class="sp-cat" data-sp="' + JM.esc(id) + '" data-cat="' + JM.esc(c.id) + '"' + (isOpen ? ' open' : '') + '>' +
        '<summary>' + ic(c.icon || 'sparkle', 15) + '<span class="grow">' + JM.esc(c.name) + '</span>' +
        '<span class="xs ' + (cnt ? 'bold' : 'muted') + '" style="' + (cnt ? 'color:var(--brand)' : '') + '">' + cnt + '/' + list.length + '</span>' + ic('down', 15) + '</summary>' +
        '<div class="sp-cat-b chips">' + list.map(function (s) {
          return '<button type="button" class="chip' + (has(s.name) ? ' on' : '') + '" data-act="sptoggle" data-sp="' + JM.esc(id) + '" data-v="' + JM.esc(s.name) + '">' + JM.esc(s.name) + '</button>';
        }).join('') + '</div></details>';
    }).join('') + '</div>';

    // Selected tray grouped by category
    const LEVELS = [[40, 'Beginner'], [70, 'Intermediate'], [95, 'Advanced']];
    const groups = {};
    selectedArr.forEach(function (n) {
      const cn = JM.skillCatName(n);
      groups[cn] = groups[cn] || [];
      groups[cn].push(n);
    });
    const groupKeys = Object.keys(groups).sort();
    const trayHtml = '<div class="sp-tray mt">' +
      '<div class="row between mb" style="margin-bottom:8px"><b class="small">Selected skills (' + selectedArr.length + (o.max ? ' / ' + o.max : '') + ')</b>' +
      (o.min ? '<span class="xs muted">Minimum ' + o.min + '</span>' : '') + '</div>' +
      (selectedArr.length ? groupKeys.map(function (gk) {
        return '<div class="sp-tgrp"><div class="xs muted bold" style="margin-bottom:4px">' + JM.esc(gk) + '</div>' +
          (isSeeker
            ? groups[gk].map(function (n) {
                return '<div class="row" style="padding:6px 0;border-top:1px solid var(--line)"><span class="grow small">' + JM.esc(n) + '</span>' +
                  '<select style="width:142px;height:32px;font-size:13px" data-in="splevel" data-sp="' + JM.esc(id) + '" data-skill="' + JM.esc(n) + '">' +
                  LEVELS.map(function (l) { return '<option value="' + l[0] + '"' + (selectedMap[n] === l[0] ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') +
                  '</select><button type="button" class="iconbtn" data-act="spremove" data-sp="' + JM.esc(id) + '" data-v="' + JM.esc(n) + '" aria-label="Remove ' + JM.esc(n) + '" style="width:32px;height:32px">' + ic('x', 15) + '</button></div>';
              }).join('')
            : '<div class="chips" style="margin-bottom:8px">' + groups[gk].map(function (n) {
                return '<span class="badge brand">' + JM.esc(n) + ' <button type="button" class="sp-x" data-act="spremove" data-sp="' + JM.esc(id) + '" data-v="' + JM.esc(n) + '" aria-label="Remove ' + JM.esc(n) + '">×</button></span>';
              }).join('') + '</div>') +
          '</div>';
      }).join('') : '<p class="small muted" style="margin:0">' + JM.esc(o.emptyHint || 'Pick skills above or search to add.') + '</p>') + '</div>';

    return '<div class="sp" data-sp-root="' + JM.esc(id) + '">' + taHtml + sugHtml + mTabs + mBody + dAcc + trayHtml + '</div>';
  };
  JM.actions.sptoggle = function (el) {
    const o = JM.spReg[el.dataset.sp]; if (o && o.onToggle) o.onToggle(el.dataset.v);
  };
  JM.actions.spremove = function (el) {
    const o = JM.spReg[el.dataset.sp]; if (o && o.onRemove) o.onRemove(el.dataset.v); else if (o && o.onToggle) o.onToggle(el.dataset.v);
  };
  JM.actions.sptab = function (el) {
    const id = el.dataset.sp;
    JM.spState[id] = JM.spState[id] || { tab: null, open: {} };
    JM.spState[id].tab = el.dataset.cat;
    const o = JM.spReg[id]; if (o && o.onRedraw) o.onRedraw();
  };
  JM.inputs.splevel = function (el) {
    const o = JM.spReg[el.dataset.sp]; if (o && o.onLevel) o.onLevel(el.dataset.skill, Number(el.value));
  };
  document.addEventListener('toggle', function (e) {
    const d = e.target;
    if (d && d.classList && d.classList.contains('sp-cat')) {
      const id = d.dataset.sp;
      JM.spState[id] = JM.spState[id] || { tab: null, open: {} };
      JM.spState[id].open[d.dataset.cat] = d.open;
    }
  }, true);

  // ---------- reusable Categorized Role Picker (Section 6.4) ----------
  JM.rpReg = {};
  JM.rolePicker = function (o) {
    const id = o.id || 'rp-main';
    JM.rpReg[id] = o;
    const cur = (JM.roles || []).find(function (r) { return r.id === o.value; });
    const popIds = JM.popularRoles || [];
    const popRoles = popIds.map(function (rid) { return (JM.roles || []).find(function (r) { return r.id === rid; }); }).filter(Boolean).slice(0, 6);
    const source = (JM.roles || []).map(function (r) {
      return { value: r.id, label: r.title, group: r.category, aliases: r.aliases || [], hint: r.level && r.level !== 'Entry' ? r.level : '' };
    });
    const ta = JM.typeahead({
      id: id + '-ta',
      value: o.value || '',
      label: cur ? cur.title : (o.isOther ? 'Other / not listed' : ''),
      minChars: 0,
      max: 12,
      placeholder: o.placeholder || 'Search 100+ career roles (e.g. Barista, Web Dev, Cashier)…',
      source: source,
      extraOption: { value: '__other__', label: 'Other / not listed – specify', group: 'Custom', _extra: true },
      onPick: function (item) {
        if (item.value === '__other__') { if (o.onOther) o.onOther(); }
        else if (o.onPick) o.onPick(item.value);
      }
    });
    const popHtml = popRoles.length
      ? '<div class="xs muted mt" style="margin-top:8px;margin-bottom:4px">Popular near you:</div><div class="chips">' +
        popRoles.map(function (r) {
          return '<button type="button" class="chip' + (o.value === r.id ? ' on' : '') + '" data-act="rppop" data-rp="' + JM.esc(id) + '" data-v="' + JM.esc(r.id) + '">' + JM.esc(r.title) + '</button>';
        }).join('') +
        '<button type="button" class="chip' + (o.isOther ? ' on' : '') + '" data-act="rppop" data-rp="' + JM.esc(id) + '" data-v="__other__">Other / specify</button></div>'
      : '';
    return '<div class="rp">' + ta + popHtml + '</div>';
  };
  JM.actions.rppop = function (el) {
    const o = JM.rpReg[el.dataset.rp]; if (!o) return;
    if (el.dataset.v === '__other__') { if (o.onOther) o.onOther(); }
    else if (o.onPick) o.onPick(el.dataset.v);
  };

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
  JM.shellAvatar = function (size) {
    const me = JM.me; if (!me) return '';
    if (me.role === 'seeker' && me.seeker && me.seeker.avatar_path) {
      return JM.img({ bucket: 'seeker-media', path: me.seeker.avatar_path, shape: 'circle', size: size || 36, name: me.full_name, alt: me.full_name });
    }
    if (me.role === 'employer' && me.employer && me.employer.logo_path) {
      return JM.img({ bucket: 'company-logos', path: me.employer.logo_path, shape: 'circle', size: size || 36, name: me.employer.name, alt: me.employer.name });
    }
    const nm = me.role === 'employer' && me.employer ? me.employer.name : me.full_name;
    return JM.img({ shape: 'circle', size: size || 36, name: nm, alt: nm });
  };
  JM.shellHtml = function () {
    const me = JM.me, role = me.role, items = NAV[role], name = role === 'employer' && me.employer ? me.employer.name : me.full_name;
    const sub = role === 'seeker' ? (me.seeker.plan === 'pro' ? (me.seeker.plan_period === 'yearly' ? 'Annual Plan' : 'Monthly Plan') : 'Free Plan') : role === 'employer' ? (me.employer.plan[0].toUpperCase() + me.employer.plan.slice(1) + ' Plan') : 'Administrator';
    const links = items.map(function (n) {
      if (n[0] === 'H') return '<div class="nav-h">' + n[1] + '</div>';
      const badge = n[0] === '/messages' ? '<span class="count hide" id="nb-msg"></span>' : '';
      return '<a class="nav" data-nav="' + n[0] + '" href="#' + n[0] + '">' + ic(n[1]) + '<span>' + n[2] + '</span>' + badge + '</a>';
    }).join('');
    const tabs = role === 'seeker' ? '<nav class="tabbar" aria-label="Main">' + TABS.map(function (n) { return '<a data-tab="' + n[0] + '" href="#' + n[0] + '">' + ic(n[1], 21) + '<span>' + n[2] + '</span>' + (n[0] === '/matches' ? '<span class="dot hide" id="nb-match"></span>' : '') + '</a>'; }).join('') + '</nav>' : '';
    const menu = role !== 'seeker' ? '<button class="iconbtn menu" data-act="menu" aria-label="Open menu">' + ic('menu') + '</button>' : '';
    return '<div class="shell" id="shell" data-role="' + role + '"><aside class="sidebar" aria-label="Navigation"><div class="brand"><img src="assets/logo.png" alt="">JobMatch</div>' + links +
      '<div class="grow"></div><div class="userbox"><span id="shell-av">' + JM.shellAvatar(36) + '</span><div class="grow"><div class="bold small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + JM.esc(name) + '</div><div class="xs muted">' + sub + '</div></div><button class="iconbtn" data-act="logout" aria-label="Sign out" title="Sign out">' + ic('logout') + '</button></div></aside><div class="scrim" data-act="menu"></div>' +
      '<div class="main"><header class="topbar">' + menu + '<span class="mbrand"><img src="assets/logo.png" alt="">JobMatch</span><div class="title" id="ptitle"></div>' +
      (role === 'seeker' ? '<a class="iconbtn" href="#/messages" aria-label="Messages">' + ic('chat') + '<span class="dot hide" id="tb-msg"></span></a>' : '') +
      '<a class="iconbtn" href="#/notifications" aria-label="Notifications">' + ic('bell') + '<span class="dot hide" id="tb-bell"></span></a>' +
      (role === 'seeker' ? '<a href="#/profile" aria-label="Profile" id="tb-av" style="display:inline-flex">' + JM.shellAvatar(32) + '</a>' : '') +
      '</header><main id="main"><div id="view"></div></main></div>' + tabs + '</div>';
  };
  JM.refreshShellAvatar = function () {
    const a = document.getElementById('shell-av'), b = document.getElementById('tb-av');
    if (a) { a.innerHTML = JM.shellAvatar(36); JM.hydrateImages(a); }
    if (b) { b.innerHTML = JM.shellAvatar(32); JM.hydrateImages(b); }
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
    if (JM.closeMsgMenu) JM.closeMsgMenu();
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
        JM.refreshShellAvatar();
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
    JM.mountTypeaheads(app);
    JM.hydrateImages(app);
    if (route.after) route.after(params);
    if (JM.afterRender) JM.afterRender(path);
  };
  JM.actions.menu = function () { const s = document.getElementById('shell'); if (s) s.classList.toggle('drawer-open'); };
  JM.actions.reload = function () { JM.render(); };
  JM.actions.close = function () { JM.close(); };
  JM.actions.okconfirm = function () { const cb = JM._ok; JM.close(); if (cb) cb(); };
  JM.actions.sumtoggle = function (el) {
    const w = el.closest('.sum-wrap'); if (!w) return;
    const clamped = w.classList.toggle('clamped');
    el.textContent = clamped ? 'Read more' : 'Show less';
  };

  // ---------- creative upload buttons + preview/crop/compress (Section 8.4) ----------
  JM.isHeic = function (file) {
    const n = (file && file.name || '').toLowerCase(), t = (file && file.type || '').toLowerCase();
    return /\.heic$|\.heif$/.test(n) || t.indexOf('heic') >= 0 || t.indexOf('heif') >= 0;
  };
  JM.HEIC_MSG = 'Please choose a JPG, PNG or WEBP. On iPhone: Settings → Camera → Formats → Most Compatible.';
  JM.uploadBtn = function (o) {
    const attrs = 'data-in="' + JM.esc(o.in) + '"' + (o.kind ? ' data-kind="' + JM.esc(o.kind) + '"' : '') +
      (o.preview != null ? ' data-preview="' + JM.esc(o.preview) + '"' : '') +
      (o.shape ? ' data-shape="' + JM.esc(o.shape) + '"' : '') +
      (o.pvtitle ? ' data-pvtitle="1"' : '');
    const input = '<input type="file" class="upl-input" accept="' + JM.esc(o.accept || '') + '" ' + attrs + '>';
    if (o.size === 'sm') return '<label class="upl-btn">' + ic('upload', 15) + '<span>' + JM.esc(o.label || 'Upload') + '</span>' + input + '</label>';
    return '<label class="upl"><span class="upl-ic">' + ic('upload', 22) + '</span><span class="upl-tx"><b>' + JM.esc(o.label || 'Upload') + '</b><small>' + JM.esc(o.hint || 'Click to browse or drag and drop a file here') + '</small></span><span class="upl-cta">Upload</span>' + input + '</label>';
  };
  JM.fileSize = function (n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; };

  JM.compressCrop = function (imgEl, opts) {
    return new Promise(function (resolve) {
      const shape = opts.shape || 'contain';
      const zoom = Number(opts.zoom || 1);
      const fx = Number(opts.fx != null ? opts.fx : 50) / 100;
      const fy = Number(opts.fy != null ? opts.fy : 50) / 100;
      const nw = imgEl.naturalWidth || 800, nh = imgEl.naturalHeight || 600;
      let tw, th;
      if (shape === 'circle') { tw = 512; th = 512; }
      else if (shape === 'cover43') { tw = Math.min(1600, nw); th = Math.round(tw * 3 / 4); if (tw < 800) { tw = 1200; th = 900; } }
      else {
        const scale = Math.min(1, 1600 / Math.max(nw, nh));
        tw = Math.max(1, Math.round(nw * scale)); th = Math.max(1, Math.round(nh * scale));
      }
      const canvas = document.createElement('canvas');
      canvas.width = tw; canvas.height = th;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, tw, th);
      if (shape === 'circle' || shape === 'cover43') {
        const targetRatio = tw / th, srcRatio = nw / nh;
        let sw, sh;
        if (srcRatio > targetRatio) { sh = nh / zoom; sw = sh * targetRatio; }
        else { sw = nw / zoom; sh = sw / targetRatio; }
        const sx = Math.max(0, Math.min(nw - sw, (nw - sw) * fx));
        const sy = Math.max(0, Math.min(nh - sh, (nh - sh) * fy));
        ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, tw, th);
      } else {
        ctx.drawImage(imgEl, 0, 0, tw, th);
      }
      const mime = 'image/webp';
      canvas.toBlob(function (blob) {
        if (blob && blob.type === 'image/webp') return resolve({ blob: blob, ext: 'webp', type: 'image/webp' });
        canvas.toBlob(function (jb) { resolve({ blob: jb, ext: 'jpg', type: 'image/jpeg' }); }, 'image/jpeg', 0.86);
      }, mime, 0.85);
    });
  };

  JM.previewFile = function (file, o) {
    if (JM.isHeic(file)) {
      JM.toast(JM.HEIC_MSG, 'bad');
      if (o.onCancel) o.onCancel();
      return;
    }
    const isImg = /^image\//.test(file.type || '') || /\.(jpe?g|png|webp)$/i.test(file.name || '');
    const url = isImg ? URL.createObjectURL(file) : '';
    const shape = o.shape || 'contain';
    const canCrop = isImg && (shape === 'circle' || shape === 'cover43');
    const preTitle = (document.getElementById('cert-title') && document.getElementById('cert-title').value.trim()) || file.name.replace(/\.[^.]+$/, '');
    const preDesc = (document.getElementById('cert-desc') && document.getElementById('cert-desc').value.trim()) || '';
    JM._pv = { o: o, url: url, file: file, shape: shape, zoom: 1, fx: 50, fy: 50 };
    const pvVisual = isImg
      ? (canCrop
          ? '<div class="pv-crop-wrap mt"><div class="pv-frame pv-' + shape + '" id="pv-frame"><img class="pv-crop-img" id="pv-img" src="' + url + '" alt="Selected image preview" draggable="false"></div>' +
            '<div class="row gap-s mt" style="width:100%;max-width:340px"><span class="xs muted">Zoom</span><input type="range" id="pv-zoom" min="1" max="2.5" step="0.05" value="1"><span class="xs muted" id="pv-zoom-lbl">1.0×</span></div>' +
            '<div class="xs muted">Drag photo to adjust framing · auto-optimized before upload</div></div>'
          : '<div class="pv-box mt"><img class="pv-img" id="pv-img" src="' + url + '" alt="Selected image preview"></div>') +
        '<div class="xs muted mt">' + JM.esc(file.name) + ' · ' + JM.fileSize(file.size) + '</div>'
      : '<div class="pv-file mt"><span class="upl-ic">' + ic('file', 22) + '</span><div class="grow"><b>' + JM.esc(file.name) + '</b><div class="xs muted">' + JM.fileSize(file.size) + ' · ' + JM.esc(file.type || 'document') + '</div></div></div>';
    JM.modal('<h2>' + JM.esc(o.title || 'Preview before uploading') + '</h2><p class="small muted mt">Check how it looks, then confirm the upload.</p>' +
      pvVisual +
      (o.titleField ? '<div class="field mt"><label class="label">Certificate title</label><input type="text" id="pv-title" maxlength="120" value="' + JM.esc(preTitle) + '" placeholder="e.g. TESDA NC II Barista"></div><div class="field"><label class="label">Details / description (optional)</label><textarea id="pv-desc" rows="2" maxlength="300" placeholder="e.g. Issued by TESDA Laguna · Completed May 2026">' + JM.esc(preDesc) + '</textarea></div>' : '') +
      '<div class="row mt-l" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="pvcancel">Cancel</button><button type="button" class="btn" data-act="pvconfirm">' + ic('upload', 16) + 'Confirm upload</button></div>', 'wide');

    if (canCrop) {
      const frame = document.getElementById('pv-frame'), img = document.getElementById('pv-img'), zInp = document.getElementById('pv-zoom'), zLbl = document.getElementById('pv-zoom-lbl');
      const apply = function () {
        if (!JM._pv || !img) return;
        img.style.objectPosition = JM._pv.fx + '% ' + JM._pv.fy + '%';
        img.style.transform = 'scale(' + JM._pv.zoom + ')';
        if (zLbl) zLbl.textContent = Number(JM._pv.zoom).toFixed(1) + '×';
      };
      if (zInp) zInp.addEventListener('input', function () { if (JM._pv) { JM._pv.zoom = Number(zInp.value); apply(); } });
      let drag = false, sx = 0, sy = 0, sfx = 50, sfy = 50;
      if (frame) {
        frame.addEventListener('pointerdown', function (e) { drag = true; sx = e.clientX; sy = e.clientY; sfx = JM._pv.fx; sfy = JM._pv.fy; frame.setPointerCapture(e.pointerId); });
        frame.addEventListener('pointermove', function (e) {
          if (!drag || !JM._pv) return;
          JM._pv.fx = Math.max(0, Math.min(100, Math.round(sfx - (e.clientX - sx) * 0.4)));
          JM._pv.fy = Math.max(0, Math.min(100, Math.round(sfy - (e.clientY - sy) * 0.4)));
          apply();
        });
        const stop = function () { drag = false; };
        frame.addEventListener('pointerup', stop); frame.addEventListener('pointercancel', stop);
      }
    }
  };
  JM.actions.pvcancel = function () {
    const p = JM._pv; JM._pv = null;
    if (p && p.url) URL.revokeObjectURL(p.url);
    JM.close();
    if (p && p.o.onCancel) p.o.onCancel();
  };
  JM.actions.pvconfirm = async function (el) {
    const p = JM._pv; if (!p) { JM.close(); return; }
    const t = document.getElementById('pv-title'), ds = document.getElementById('pv-desc'), imgEl = document.getElementById('pv-img');
    JM._pv = null; el.disabled = true; el.textContent = 'Uploading…';
    let outFile = p.file;
    try {
      if (imgEl && imgEl.complete && imgEl.naturalWidth > 0 && (p.shape === 'circle' || p.shape === 'cover43' || p.file.size > 1500000)) {
        const res = await JM.compressCrop(imgEl, { shape: p.shape, zoom: p.zoom, fx: p.fx, fy: p.fy });
        if (res && res.blob) {
          const base = (p.file.name || 'image').replace(/\.[^.]+$/, '');
          outFile = new File([res.blob], base + '.' + res.ext, { type: res.type });
        }
      }
      if (outFile.size > 5 * 1024 * 1024) {
        JM.toast('Image is still larger than 5 MB after compression. Try a smaller photo.', 'bad');
        el.disabled = false; el.textContent = 'Confirm upload';
        return;
      }
      await p.o.onConfirm({
        file: outFile,
        focus: p.fx + '% ' + p.fy + '%',
        blobUrl: p.url,
        title: t ? t.value.trim() : '',
        desc: ds ? ds.value.trim() : ''
      });
    } finally {
      setTimeout(function () { if (p.url) URL.revokeObjectURL(p.url); }, 2000);
    }
    if (document.querySelector('[data-act=pvconfirm]')) JM.close();
  };
  JM.actions.imgview = async function (el) {
    let src = el.dataset.src || '';
    if (!src && el.dataset.bucket && el.dataset.path) {
      src = await JM.getUrl(el.dataset.bucket, el.dataset.path, false);
    }
    if (!src) return JM.toast('Image unavailable.', 'bad');
    const desc = el.dataset.desc || '';
    JM.modal('<h2>' + JM.esc(el.dataset.title || 'Preview') + '</h2>' + (desc ? '<p class="small muted mt">' + JM.esc(desc) + '</p>' : '') +
      '<div class="pv-box mt"><img class="pv-img" src="' + JM.esc(src) + '" alt="Preview"></div><div class="row mt-l" style="justify-content:flex-end"><button class="btn secondary" data-act="close">Close</button></div>', 'wide');
  };
  JM.actions.mediaview = async function (el) {
    await JM.busy(el, async function () {
      const bucket = el.dataset.bucket || 'seeker-media', path = el.dataset.path;
      const url = await JM.getUrl(bucket, path, false);
      if (!url) throw new Error('Could not load file.');
      const isPdf = /\.pdf(\?|$)/i.test(path), desc = el.dataset.desc || '';
      JM.modal('<h2>' + JM.esc(el.dataset.title || 'Preview') + '</h2>' + (desc ? '<p class="small muted mt">' + JM.esc(desc) + '</p>' : '') +
        (isPdf ? '<p class="muted mt">PDF document ready to view.</p><a class="btn mt" href="' + JM.esc(url) + '" target="_blank" rel="noopener">Open PDF</a>'
          : '<div class="pv-box mt"><img class="pv-img" src="' + JM.esc(url) + '" alt="Preview"></div>') +
        '<div class="row mt-l" style="justify-content:flex-end"><button class="btn secondary" data-act="close">Close</button></div>', 'wide');
    });
  };

  // ---------- unified payment modal ----------
  const PAY_METHODS = [
    { id: 'gcash', name: 'GCash', sub: 'Instant e-wallet', color: '#007DFE', badge: 'GC', steps: 'Enter your GCash-registered mobile number or confirm payment via GCash app.' },
    { id: 'maya', name: 'Maya', sub: 'Wallet or QR Ph', color: '#00B65E', badge: 'MY', steps: 'Approve the payment request in your Maya wallet app.' },
    { id: 'card', name: 'Credit / Debit Card', sub: 'Visa · Mastercard', color: '#1E293B', badge: 'CD', steps: 'Securely authorize your Visa or Mastercard with 3DS verification.' },
    { id: 'bank', name: 'Online Banking', sub: 'BPI · BDO · UnionBank', color: '#7C3AED', badge: 'BK', steps: 'Authorize direct bank transfer via InstaPay / PESONet.' }
  ];
  JM.openPaymentModal = function (opts) {
    JM._payOpts = opts;
    const test = JM.cfg.paymentsMode !== 'live';
    const methods = PAY_METHODS.map(function (m, i) {
      return '<label class="pay-opt"><input type="radio" name="method" value="' + m.id + '"' + (i === 0 ? ' checked' : '') + '><span class="pay-ic" style="background:' + m.color + '">' + m.badge + '</span><span class="grow"><b class="small">' + m.name + '</b><div class="xs muted">' + m.sub + '</div></span></label>';
    }).join('');
    JM.modal(
      '<h2>Complete your upgrade</h2>' +
      '<div class="card flat tint card-b mt" style="padding:14px"><div class="row between"><div><div class="xs muted">Selected plan</div><b>' + JM.esc(opts.label) + '</b></div><div style="text-align:right"><div class="xs muted">' + JM.esc(opts.period || 'One-time / Monthly') + '</div><b style="font-size:20px">' + JM.peso(opts.amount) + '</b></div></div></div>' +
      '<form data-form="paycheckout" class="mt">' +
      '<div class="label">1. Select payment method</div><div class="pay-grid">' + methods + '</div>' +
      '<div class="card flat card-b small muted" style="padding:12px"><b>2. How it works:</b> Choose your payment method, click <b>Confirm &amp; Pay</b>, and your plan activates immediately once payment verification succeeds.' + (test ? ' <i>(Sandbox mode active — no real money is charged.)</i>' : '') + '</div>' +
      '<div class="row mt-l" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn" type="submit">Confirm &amp; Pay ' + JM.peso(opts.amount) + '</button></div></form>',
      'wide'
    );
  };
  JM.forms.paycheckout = async function (form, d) {
    const o = JM._payOpts; if (!o) return;
    const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Verifying payment…';
    try {
      const r = await JM.fn('checkout', { item: o.item, job_id: o.jobId || undefined, payment_method: d.method || 'gcash' });
      if (r.mode === 'live' && r.url) { location.href = r.url; return; }
      if (r.status === 'pending') {
        JM.modal('<div class="center"><div class="avatar lg" style="margin:0 auto 12px;background:var(--warn-t);color:var(--warn)">' + ic('clock', 24) + '</div><h2>Payment pending</h2><p class="muted mt">Reference <b>' + JM.esc(r.reference) + '</b> is awaiting confirmation. Plan features will activate automatically once verified.</p><button class="btn mt" data-act="close" data-then="render">Done</button></div>');
        return;
      }
      if (!r.ok || r.status === 'failed') {
        JM.modal('<div class="center"><div class="avatar lg" style="margin:0 auto 12px;background:var(--bad-t);color:var(--bad)">' + ic('x', 24) + '</div><h2>Payment failed</h2><p class="muted mt">Your payment could not be verified. No plan changes were made. Please try again.</p><button class="btn mt" data-act="close">Close</button></div>');
        return;
      }
      await JM.loadMe(); JM.updateBadges();
      JM.modal('<div class="center"><div class="avatar lg" style="margin:0 auto 12px;background:var(--ok-t);color:var(--ok)">' + ic('check', 24) + '</div><h2>Payment successful!</h2><p class="muted mt"><b>' + JM.esc(o.label) + '</b> is now active.<br>Reference: <span class="bold">' + JM.esc(r.reference) + '</span> · Paid via ' + JM.esc((r.payment_method || d.method || '').toUpperCase()) + '</p><button class="btn mt" data-act="close" data-then="render">Continue</button></div>');
    } catch (e) {
      JM.toast(JM.err(e), 'bad'); btn.disabled = false; btn.textContent = 'Confirm & Pay ' + JM.peso(o.amount);
    }
  };
  JM.actions.logout = function () {
    JM.confirm({
      title: 'Sign out?',
      text: 'Are you sure you want to sign out of JobMatch?',
      ok: 'Sign out',
      onOk: async function () {
        await JM.sb.auth.signOut();
        JM.me = null;
        if (JM.unsubscribe) JM.unsubscribe();
        JM.go('/');
      }
    });
  };
})();
