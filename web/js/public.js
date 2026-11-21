/* Public pages: landing, auth, role, consent, legal. */
(function () {
  const JM = window.JM, ic = JM.icon, esc = JM.esc;
  const SUPPORT = JM.cfg.supportEmail;

  // ---------- landing ----------
  function nav() {
    const homeHref = '#' + JM.home();
    return '<header class="lnav"><div class="lwrap"><a class="brand" href="' + homeHref + '" data-act="brandhome" style="padding:0"><img src="assets/logo.png" alt="">JobMatch</a>' +
      '<nav aria-label="Sections"><a href="#/" data-scroll="how">How it works</a><a href="#/" data-scroll="employers">For employers</a><a href="#/" data-scroll="pricing">Pricing</a><a href="#/" data-scroll="faq">FAQ</a></nav>' +
      '<div class="grow"></div><a class="btn ghost sm" href="#/login">Sign in</a><a class="btn sm" href="#/signup">Get started</a></div></header>';
  }
  function footer() {
    return '<footer class="foot"><div class="lwrap row wrap between"><div><b style="color:var(--ink)">JobMatch</b><br>Job matching and career guidance for Biñan, Laguna.</div>' +
      '<div class="row wrap" style="gap:22px"><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a><a href="mailto:' + esc(SUPPORT) + '">' + esc(SUPPORT) + '</a></div></div></footer>';
  }
  JM.publicNav = nav; JM.publicFooter = footer;

  function phoneMock() {
    return '<div class="phone" aria-hidden="true"><div class="phone-top"><span class="phone-pill">Discover</span><span class="xs muted">3 stars left today</span></div>' +
      '<div class="mini-card"><div class="row between"><div><div class="bold" style="font-size:17px">Sales Associate</div><div class="small muted">Kape Biñan · Poblacion</div></div>' +
      JM.ring(87, 54, '#0C70F8') + '</div>' +
      '<div class="row wrap gap-s mt"><span class="badge brand">Full-time</span><span class="badge">₱14,000 – 16,000</span><span class="badge ok">2.1 km</span></div>' +
      '<div class="skill mt"><div class="row between small"><span>Customer service</span><b class="num">90%</b></div>' + JM.bar(90, 'ok') + '</div>' +
      '<div class="skill"><div class="row between small"><span>POS system</span><b class="num">45%</b></div>' + JM.bar(45, 'star') + '</div>' +
      '<div class="why"><b>Why this match:</b> your skills (Customer service, Communication), 2.1 km commute, pay meets your goal.</div></div>' +
      '<div class="actions" style="margin-top:14px"><span class="rbtn sm no">' + ic('x') + '</span><span class="rbtn star" style="width:52px;height:52px">' + ic('star') + '</span><span class="rbtn sm yes">' + ic('heart') + '</span></div></div>';
  }

  function landing() {
    const feats = [
      ['layers', 'Swipe to discover', 'Jobs from verified Biñan employers, ranked for you. Swipe right to save, left to pass, or star your top choice.'],
      ['sliders', 'A score you can read', 'Every match shows why: your skills, commute, interests and pay. No black box, and never age, gender or photos.'],
      ['award', 'See the skill gap', 'Pick a job and see what you have and what is missing, with a week by week plan, quizzes and partner courses.'],
      ['shield', 'Fair by design', 'Employers see "Maria R." until they shortlist you. Contact details and your résumé file are shared only after that.'],
      ['check', 'Verified employers', 'Every business is checked by hand against its permit and ID before its first listing goes live.'],
      ['chat', 'Chat after a match', 'When an employer shortlists you, a private chat opens. You can report or block anyone at any time.']
    ];
    const steps = [
      ['1', 'Build your profile', 'Add your skills, area, pay goal and a short summary. It takes about five minutes.'],
      ['2', 'Swipe and apply', 'Save jobs you like, star the ones you want most, and apply in one tap.'],
      ['3', 'Close the gap', 'If you are not ready yet, your Career Breakdown tells you what to learn next.']
    ];
    const faq = [
      ['Is JobMatch free for job seekers?', 'Yes. Swiping, applying, chat and week one of your roadmap are free. Pro adds unlimited stars, the full roadmap, application insights and résumé review.'],
      ['How is my match score calculated?', 'Skills count for 55 percent, location 20, interests 15 and pay 10. Your swipe history nudges the ranking slightly. Age, gender and photos are never used.'],
      ['What do employers see before they shortlist me?', 'A first name and last initial, your skills, education and experience. Your full name, age, contact details and résumé file stay hidden until a shortlist.'],
      ['How do you verify employers?', 'Owners upload a business permit and a valid ID. A JobMatch admin reviews both before any listing can be published.'],
      ['Which payment methods do you support?', 'Paid plans will be billed through GCash, Maya and cards. Until billing goes live, upgrades in this version run in a test mode and charge nothing.'],
      ['Can I delete my account?', 'Yes. In Settings you can download everything we hold about you or delete your account and files permanently.']
    ];
    const li = function (t) { return '<li>' + ic('check') + '<span>' + t + '</span></li>'; };
    return nav() + '<main id="main">' +
      '<section class="lwrap hero"><div><span class="eyebrow">Biñan, Laguna</span><h1>Find work that fits, and see exactly how to get there.</h1>' +
      '<p class="lead">JobMatch ranks local jobs by how well they suit your skills, commute and pay, then shows you the skills to build when a job is just out of reach.</p>' +
      '<div class="row wrap"><a class="btn lg" href="#/signup">Create a free account</a><a class="btn lg secondary" href="#/signup?role=employer">I am hiring</a></div>' +
      '<p class="small muted mt">Free for job seekers. Every employer is verified by hand.</p></div><div class="mock">' + phoneMock() + '</div></section>' +

      '<section class="sec" id="how"><div class="lwrap"><span class="eyebrow">How it works</span><h2>From profile to interview in three steps</h2><p class="sub">Built for first-time and early-career job seekers who are tired of sending résumés into silence.</p>' +
      '<div class="grid g3">' + steps.map(function (s) { return '<div class="card feat"><div class="avatar">' + s[0] + '</div><h3>' + s[1] + '</h3><p>' + s[2] + '</p></div>'; }).join('') + '</div></div></section>' +

      '<section class="sec"><div class="lwrap"><span class="eyebrow">What you get</span><h2>Clear matches, honest guidance</h2><p class="sub">Every number on screen has a reason you can read.</p>' +
      '<div class="grid g3">' + feats.map(function (f) { return '<div class="card feat"><div class="avatar">' + ic(f[0]) + '</div><h3>' + f[1] + '</h3><p>' + f[2] + '</p></div>'; }).join('') + '</div></div></section>' +

      '<section class="sec" id="employers"><div class="lwrap grid g2" style="align-items:center;gap:48px"><div><span class="eyebrow">For employers</span><h2>Hire people who are ready, not just available</h2>' +
      '<p class="sub" style="margin-bottom:20px">Post a role in minutes and review applicants ranked by fit. Pay only when you need more reach.</p>' +
      '<ul class="price" style="padding:0;margin:0 0 24px;list-style:none"><li style="display:flex;gap:9px;margin-bottom:9px">' + ic('check') + '<span>Applicants ranked by match score and skill fit (Growth and up)</span></li>' +
      '<li style="display:flex;gap:9px;margin-bottom:9px">' + ic('check') + '<span>Search candidates who opted in and invite them to apply (Business)</span></li>' +
      '<li style="display:flex;gap:9px;margin-bottom:9px">' + ic('check') + '<span>Boost a listing to the top of every deck for seven days</span></li>' +
      '<li style="display:flex;gap:9px">' + ic('check') + '<span>Verified badge builds trust with candidates</span></li></ul><a class="btn" href="#/signup?role=employer">Register your business</a></div>' +
      '<div class="card" style="padding:18px"><div class="row between mb"><b>Applicants · Barista</b><span class="badge ok">Growth plan</span></div>' +
      [['Maria R.', 94, true], ['Jun S.', 88, false], ['Joy B.', 76, false], ['Carlo R.', 61, false]].map(function (a) {
        return '<div class="row" style="padding:10px 0;border-top:1px solid var(--line)">' + JM.avatar(a[0]) + '<div class="grow"><div class="bold">' + a[0] + (a[2] ? ' ' + JM.badge('Starred', 'star') : '') + '</div><div class="xs muted">Applied today</div></div><b class="num">' + a[1] + '%</b></div>';
      }).join('') + '</div></div></section>' +

      '<section class="sec" id="pricing"><div class="lwrap"><span class="eyebrow">Pricing</span><h2>Free to start. Pay when it helps.</h2><p class="sub">Prices in Philippine pesos. Cancel any time.</p>' +
      '<h3 class="mb">Job seekers</h3><div class="grid g3 mb"><div class="card price"><b>Free Plan</b><div class="amt">₱0</div><ul>' + li('Swipe and apply to local jobs') + li('3 stars a day') + li('Week 1 of every roadmap') + li('Reply when employers message first') + '</ul><a class="btn secondary block" href="#/signup">Start free</a></div>' +
      '<div class="card price"><b>Monthly Plan</b><div class="amt">₱99<span class="small muted" style="font-weight:500"> / month</span></div><ul>' + li('Unlimited stars &amp; undo swipes') + li('Full roadmap &amp; quiz backtracking') + li('Full application &amp; swipe history') + li('Initiate chat with matches + Résumé review') + '</ul><a class="btn secondary block" href="#/signup">Choose Monthly</a></div>' +
      '<div class="card price pop"><div class="row between"><b>Annual Plan</b>' + JM.badge('Best value · Save 24%', 'ok') + '</div><div class="amt">₱899<span class="small muted" style="font-weight:500"> / year</span></div><ul>' + li('Everything in Monthly Plan') + li('Priority profile badge for employers') + li('Unlimited detailed AI résumé reviews') + li('Early job alerts &amp; downloadable reports') + '</ul><a class="btn block" href="#/signup">Choose Annual</a></div></div>' +
      '<h3 class="mb mt-l">Employers</h3><div class="grid g3"><div class="card price"><b>Starter</b><div class="amt">₱0</div><ul>' + li('2 active listings') + li('Applicants in order received') + li('Verified badge') + '</ul><a class="btn secondary block" href="#/signup?role=employer">Register</a></div>' +
      '<div class="card price pop"><b>Growth</b><div class="amt">₱999<span class="small muted" style="font-weight:500"> / month</span></div><ul>' + li('10 active listings') + li('Ranked applicants and match scores') + li('Full analytics, trends &amp; report exports') + '</ul><a class="btn block" href="#/signup?role=employer">Register</a></div>' +
      '<div class="card price"><b>Business</b><div class="amt">₱2,499<span class="small muted" style="font-weight:500"> / month</span></div><ul>' + li('Unlimited listings') + li('Candidate search, AI overviews &amp; direct chat') + li('Everything in Growth') + '</ul><a class="btn secondary block" href="#/signup?role=employer">Register</a></div></div>' +
      '<p class="small muted mt">Boosted listing: ₱299 for 7 days on any plan.</p></div></section>' +

      '<section class="sec" id="faq"><div class="lwrap" style="max-width:820px"><span class="eyebrow">FAQ</span><h2 class="mb">Questions people ask</h2><div class="faq">' +
      faq.map(function (f) { return '<details><summary>' + f[0] + ic('down') + '</summary><p>' + f[1] + '</p></details>'; }).join('') + '</div></div></section>' +

      '<section class="sec"><div class="lwrap center"><h2 style="margin:0 auto 14px">Ready to see your best matches?</h2><p class="sub" style="margin:0 auto 24px">Create your profile in about five minutes.</p><a class="btn lg" href="#/signup">Create a free account</a></div></section></main>' + footer();
  }
  JM.route('/', { guest: true, title: '', render: landing, after: function () { document.title = 'JobMatch · Find work that fits'; } });

  // ---------- auth ----------
  function authShell(inner, headline, sub) {
    const homeHref = '#' + JM.home();
    return '<div class="auth"><div class="auth-main"><div class="auth-box"><a class="brand" href="' + homeHref + '" data-act="brandhome" style="padding:0 0 28px"><img src="assets/logo.png" alt="">JobMatch</a>' + inner + '</div></div>' +
      '<aside class="auth-side"><a class="brand" href="' + homeHref + '" data-act="brandhome" style="color:#fff;padding:0"><img src="assets/logo.png" alt="">JobMatch</a><div><h1>' + headline + '</h1><p class="mt">' + sub + '</p></div>' +
      '<div class="small" style="color:#9DB4E0">Built in Biñan for StartUP City of Biñan.</div></aside></div>';
  }
  const DEMO = [
    ['demo@jobmatch.demo', 'Seeker – Free plan (Demo)'],
    ['jun@jobmatch.demo', 'Seeker – Free plan (Jun, Barista)'],
    ['ana@jobmatch.demo', 'Seeker – Free plan (Ana, Accounting)'],
    ['maria@jobmatch.demo', 'Seeker – Pro plan (Maria)'],
    ['paolo@jobmatch.demo', 'Seeker – Pro plan (Paolo, IT)'],
    ['casa@jobmatch.demo', 'Employer – Starter plan (CasaBuilt)'],
    ['kape@jobmatch.demo', 'Employer – Growth plan (Kape Biñan)'],
    ['pixel@jobmatch.demo', 'Employer – Business plan (Pixel Hub)'],
    ['sunrise@jobmatch.demo', 'Employer – Pending verification (Sunrise)'],
    ['admin@jobmatch.demo', 'Administrator']
  ];
  function loginHtml() {
    const demo = JM.cfg.demoMode ? '<div class="divider"></div><div class="small muted mb">Demo accounts (fictional data)</div><div class="col gap-s">' +
      DEMO.map(function (d) { return '<button class="btn secondary sm" type="button" data-act="demo" data-email="' + d[0] + '" style="justify-content:space-between"><span>' + d[1] + '</span>' + ic('right', 16) + '</button>'; }).join('') + '</div>' : '';
    return authShell('<h2 style="font-size:24px">Welcome back</h2><p class="muted mt" style="margin-bottom:22px">Sign in to continue.</p>' +
      '<form data-form="login" novalidate><div class="field"><label class="label" for="em">Email</label><input id="em" name="email" type="email" autocomplete="email" required></div>' +
      '<div class="field"><div class="row between"><label class="label" for="pw">Password</label><a class="small" href="#/forgot">Forgot password?</a></div><input id="pw" name="password" type="password" autocomplete="current-password" required></div>' +
      '<div class="err hide" id="form-err" role="alert"></div><button class="btn block lg" type="submit">Sign in</button></form>' +
      '<p class="small muted center mt-l">New to JobMatch? <a href="#/signup">Create an account</a></p>' + demo,
      'Job matches that explain themselves.', 'See why a job fits, what is missing, and exactly how to close the gap.');
  }
  function formErr(form, msg) { const e = form.querySelector('#form-err'); if (e) { e.textContent = msg; e.classList.remove('hide'); } }
  JM.route('/login', { guest: true, title: 'Sign in', render: loginHtml });
  JM.signIn = async function (email, password) {
    const r = await JM.sb.auth.signInWithPassword({ email: email, password: password });
    if (r.error) throw r.error;
    await JM.loadMe(); await JM.afterAuth();
    JM.go(JM.home());
  };
  JM.afterAuth = async function () {
    const want = sessionStorage.getItem('jm.role');
    if (JM.me && !JM.me.role && (want === 'seeker' || want === 'employer')) { try { JM.me = await JM.rpc('set_role', { p_role: want }); } catch (e) { /* user can choose on the next screen */ } }
    sessionStorage.removeItem('jm.role');
  };
  JM.forms.login = async function (form, d) {
    const btn = form.querySelector('[type=submit]');
    if (!d.email || !d.password) return formErr(form, 'Enter your email and password.');
    btn.disabled = true;
    try { await JM.signIn(d.email.trim(), d.password); } catch (e) { formErr(form, JM.err(e)); btn.disabled = false; }
  };
  JM.actions.demo = async function (el) { JM.busy(el, function () { return JM.signIn(el.dataset.email, 'JobMatch#Demo1'); }); };

  function signupHtml() {
    const r = JM.query.role; if (r === 'employer' || r === 'seeker') sessionStorage.setItem('jm.role', r);
    const emp = sessionStorage.getItem('jm.role') === 'employer';
    return authShell('<h2 style="font-size:24px">' + (emp ? 'Register your business' : 'Create your account') + '</h2><p class="muted mt" style="margin-bottom:22px">' + (emp ? 'Start with your login. You will add business details and documents next.' : 'Free for job seekers. It takes a minute.') + '</p>' +
      '<form data-form="signup" novalidate><div class="field"><label class="label" for="nm">' + (emp ? 'Your full name' : 'Full name') + '</label><input id="nm" name="name" type="text" autocomplete="name" required></div>' +
      '<div class="field"><label class="label" for="em">Email</label><input id="em" name="email" type="email" autocomplete="email" required></div>' +
      '<div class="field"><label class="label" for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="new-password" minlength="8" required><div class="help">At least 8 characters.</div></div>' +
      '<div class="err hide" id="form-err" role="alert"></div><button class="btn block lg" type="submit">Continue</button></form>' +
      '<p class="small muted center mt-l">Already have an account? <a href="#/login">Sign in</a></p>',
      emp ? 'Reach job seekers who fit.' : 'Your next job starts with a profile.', emp ? 'Verified businesses get ranked applicants, analytics and a trusted badge.' : 'Tell us your skills and where you can work. We do the matching.');
  }
  JM.route('/signup', { guest: true, title: 'Create account', render: signupHtml });
  JM.forms.signup = async function (form, d) {
    const btn = form.querySelector('[type=submit]');
    if (!d.name || d.name.trim().length < 2) return formErr(form, 'Enter your full name.');
    if (!/^\S+@\S+\.\S+$/.test(d.email || '')) return formErr(form, 'Enter a valid email address.');
    if ((d.password || '').length < 8) return formErr(form, 'Use a password with at least 8 characters.');
    btn.disabled = true;
    try {
      const r = await JM.sb.auth.signUp({ email: d.email.trim(), password: d.password, options: { data: { full_name: d.name.trim() }, emailRedirectTo: location.origin + location.pathname } });
      if (r.error) throw r.error;
      if (r.data.session) { await JM.loadMe(); await JM.afterAuth(); JM.go(JM.home()); return; }
      JM.pendingEmail = d.email.trim();
      document.getElementById('app').innerHTML = authShell('<div class="avatar lg" style="margin-bottom:18px">' + ic('mail', 24) + '</div><h2 style="font-size:24px">Check your inbox</h2><p class="muted mt">We sent a confirmation link to <b>' + esc(JM.pendingEmail) + '</b>. Open it to finish creating your account, then sign in.</p><a class="btn block lg mt-l" href="#/login">Go to sign in</a><p class="small muted center mt">Wrong address? <a href="#/signup">Start over</a></p>', 'Almost there.', 'Confirm your email to keep your account secure.');
    } catch (e) { formErr(form, JM.err(e)); btn.disabled = false; }
  };

  JM.route('/forgot', { guest: true, title: 'Reset password', render: function () {
    return authShell('<h2 style="font-size:24px">Reset your password</h2><p class="muted mt" style="margin-bottom:22px">Enter your email and we will send you a link.</p>' +
      '<form data-form="forgot" novalidate><div class="field"><label class="label" for="em">Email</label><input id="em" name="email" type="email" autocomplete="email" required></div><div class="err hide" id="form-err" role="alert"></div><button class="btn block lg" type="submit">Send reset link</button></form>' +
      '<p class="small center mt-l"><a href="#/login">Back to sign in</a></p>', 'Locked out?', 'It happens. A reset link takes under a minute.');
  } });
  JM.forms.forgot = async function (form, d) {
    if (!/^\S+@\S+\.\S+$/.test(d.email || '')) return formErr(form, 'Enter a valid email address.');
    const r = await JM.sb.auth.resetPasswordForEmail(d.email.trim(), { redirectTo: location.origin + location.pathname + '#/reset' });
    if (r.error) return formErr(form, JM.err(r.error));
    form.innerHTML = '<div class="notice ok">If an account exists for that email, a reset link is on its way.</div>';
  };
  JM.route('/reset', { auth: 'any', plain: true, pre: true, title: 'New password', render: function () {
    return authShell('<h2 style="font-size:24px">Choose a new password</h2><p class="muted mt" style="margin-bottom:22px">Use at least 8 characters.</p>' +
      '<form data-form="reset" novalidate><div class="field"><label class="label" for="pw">New password</label><input id="pw" name="password" type="password" autocomplete="new-password" minlength="8" required></div><div class="err hide" id="form-err" role="alert"></div><button class="btn block lg" type="submit">Save password</button></form>', 'Almost done.', 'Pick something only you would know.');
  } });
  JM.forms.reset = async function (form, d) {
    if ((d.password || '').length < 8) return formErr(form, 'Use at least 8 characters.');
    const r = await JM.sb.auth.updateUser({ password: d.password });
    if (r.error) return formErr(form, JM.err(r.error));
    if (JM.reward) {
      JM.reward({ tier: 1, prop: 'shield', title: 'Password updated securely 🛡️', targetEl: form.querySelector('[type=submit]') });
    } else {
      JM.toast('Password updated.', 'ok');
    }
    JM.go(JM.home());
  };

  // ---------- role + consent ----------
  function welcomeJobiIfConfirmed() {
    if (JM.reward && JM.milestones && !JM.milestones.has('seeker_account_confirmed')) {
      setTimeout(function () {
        JM.reward({
          id: 'seeker_account_confirmed',
          tier: 2,
          repeatTier: null,
          emotion: 'waving',
          prop: 'none',
          animation: 'wave',
          title: "Hi, I'm Jobi!",
          copy: 'Account confirmed! I’ll help you match with verified local jobs.'
        });
      }, 120);
    }
  }
  JM.route('/role', { auth: 'any', plain: true, pre: true, title: 'Choose account type', render: function () {
    if (JM.me.role) { JM.go(JM.home()); return ''; }
    welcomeJobiIfConfirmed();
    const card = function (role, icon, t, p) { return '<button class="card card-b" data-act="pickrole" data-role="' + role + '" style="text-align:left;width:100%;cursor:pointer"><div class="avatar" style="margin-bottom:14px;border-radius:10px;width:42px;height:42px">' + ic(icon) + '</div><h3>' + t + '</h3><p class="muted small" style="margin:6px 0 0">' + p + '</p></button>'; };
    return '<div class="auth-main" style="min-height:100vh;background:var(--bg)"><div class="auth-box" style="max-width:640px"><a class="brand" href="#' + JM.home() + '" data-act="brandhome" style="padding:0 0 24px"><img src="assets/logo.png" alt="">JobMatch</a>' +
      '<h2 style="font-size:24px">How will you use JobMatch?</h2><p class="muted mt mb">This cannot be changed later, so pick the one that fits.</p>' +
      '<div class="grid g2">' + card('seeker', 'user', 'I am looking for a job', 'Get matched to local jobs and a plan to grow your skills.') + card('employer', 'briefcase', 'I am hiring', 'Post jobs and review applicants. Verification required.') + '</div>' +
      '<p class="small center mt-l"><button class="btn ghost sm" data-act="logout">Sign out</button></p></div></div>';
  } });
  JM.actions.pickrole = async function (el) {
    await JM.busy(el, async function () { JM.me = await JM.rpc('set_role', { p_role: el.dataset.role }); JM.go(JM.home()); });
  };
  JM.route('/consent', { auth: 'any', plain: true, pre: true, title: 'Privacy consent', render: function () {
    if (!JM.me.role) { JM.go('/role'); return ''; } if (JM.me.consent_at) { JM.go(JM.home()); return ''; }
    welcomeJobiIfConfirmed();
    return '<div class="auth-main" style="min-height:100vh;background:var(--bg)"><div class="auth-box" style="max-width:560px"><a class="brand" href="#' + JM.home() + '" data-act="brandhome" style="padding:0 0 24px"><img src="assets/logo.png" alt="">JobMatch</a>' +
      '<div class="card card-b"><h2>Before you continue</h2><p class="muted mt">JobMatch collects the information you enter to match you with jobs. We follow the Data Privacy Act of 2012 (RA 10173).</p>' +
      '<ul class="small" style="padding-left:18px;color:var(--ink2);line-height:1.7"><li>Employers see only a first name, last initial, skills and experience until they shortlist you.</li><li>We never use age, gender or photos to rank you.</li><li>You can download or delete your data at any time in Settings.</li></ul>' +
      '<form data-form="consent"><label class="check mt"><input type="checkbox" name="agree" required><span class="small">I have read and agree to the <a href="#/terms" target="_blank">Terms</a> and <a href="#/privacy" target="_blank">Privacy Notice</a>, and I consent to the processing of my personal data as described.</span></label>' +
      '<div class="err hide" id="form-err" role="alert"></div><button class="btn block lg mt" type="submit">Agree and continue</button></form></div>' +
      '<p class="small center mt"><button class="btn ghost sm" data-act="logout">Sign out</button></p></div></div>';
  } });
  JM.forms.consent = async function (form, d) {
    if (!d.agree) return formErr(form, 'Please tick the box to continue.');
    const btn = form.querySelector('[type=submit]');
    await JM.q(JM.sb.from('profiles').update({ consent_at: new Date().toISOString() }).eq('id', JM.me.id));
    if (JM.reward) {
      JM.reward({ id: 'seeker_consent_accepted', tier: 1, emotion: 'wink_thumbs_up', title: 'Consent accepted 👍', targetEl: btn });
    }
    await JM.loadMe(); JM.go(JM.home());
  };

  // ---------- legal ----------
  function legal(title, updated, body) {
    return nav() + '<main id="main"><div class="lwrap" style="max-width:780px;padding-top:48px;padding-bottom:72px"><span class="eyebrow">Legal</span><h1>' + title + '</h1><p class="muted mt">Last updated ' + updated + '</p><div class="legal mt-l">' + body + '</div></div></main>' + footer();
  }
  const sec = function (h, p) { return '<h3 style="margin:28px 0 8px">' + h + '</h3>' + p; };
  JM.route('/privacy', { title: 'Privacy Notice', render: function () {
    return legal('Privacy Notice', 'November 2026',
      '<p>JobMatch is operated by the JobMatch team in Biñan, Laguna, Philippines. This notice explains what personal data we collect, why, and the choices you have under the Data Privacy Act of 2012 (RA 10173).</p>' +
      sec('What we collect', '<p><b>Job seekers:</b> name, mobile number, email, year of birth, optional gender, education, work experience, skills, preferred work area and pay, résumé summary and any résumé file you upload, and your activity in the app such as swipes, applications, quiz results and messages.</p><p><b>Employers:</b> business name and type, address, contact person, business permit and ID documents for verification, job listings, and activity such as applicant decisions and messages.</p>') +
      sec('Why we use it', '<p>To create your account, match job seekers to jobs, show employers relevant applicants, build career roadmaps, verify businesses, prevent abuse, and operate paid plans. We do not sell personal data.</p>') +
      sec('Who sees what', '<p>Before a shortlist, employers see your first name and last initial, skills, education and experience. They cannot see your full name, age, gender, contact details or résumé file. After a shortlist, they can see your full name, age, gender, contact details and résumé file, and a private chat opens. Match scores use skills, location, interests and pay only. Age, gender and photos are never used to rank anyone.</p><p>Employer verification documents are visible only to the employer and JobMatch administrators.</p>') +
      sec('Service providers', '<p>We use Supabase for hosting, authentication and storage (data is stored in Singapore), and, once enabled, payment providers such as PayMongo to process GCash, Maya and card payments. If you use AI résumé review with an AI provider turned on, only the résumé content (not your name, age, gender or photo) is sent for analysis.</p>') +
      sec('How long we keep it', '<p>We keep your data while your account is active. When you delete your account we permanently delete your profile, files, messages and activity. Payment records may be retained as required by tax and accounting rules.</p>') +
      sec('Your rights', '<p>You may access, correct, export, object to the processing of, or erase your personal data. Use <b>Settings</b> to download your data or delete your account, or email us at <a href="mailto:' + esc(SUPPORT) + '">' + esc(SUPPORT) + '</a>. You may also complain to the National Privacy Commission (privacy.gov.ph).</p>') +
      sec('Security', '<p>Data is encrypted in transit, access is limited by row level security rules on every table, and files are stored in private buckets. No system is perfectly secure, so please use a strong, unique password.</p>') +
      sec('Contact', '<p>Questions about this notice: <a href="mailto:' + esc(SUPPORT) + '">' + esc(SUPPORT) + '</a>.</p>'));
  } });
  JM.route('/terms', { title: 'Terms of Use', render: function () {
    return legal('Terms of Use', 'November 2026',
      '<p>By creating an account you agree to these terms.</p>' +
      sec('Using JobMatch', '<p>You must give accurate information and keep your login private. You are responsible for activity under your account. Do not harass others, post misleading or discriminatory listings, collect other users\' data, or attempt to bypass the platform\'s limits.</p>') +
      sec('Job seekers', '<p>JobMatch helps you find and apply for jobs but does not guarantee interviews, offers or income. Match scores and skill readiness are guidance, not a prediction of any employer\'s decision. Some features require a Pro subscription.</p>') +
      sec('Employers', '<p>Employers must be legitimate businesses and pass verification before publishing jobs. Listings must describe real openings with honest pay. We may remove listings or suspend accounts that break these terms or the law. Employers must not charge applicants any fee.</p>') +
      sec('Payments', '<p>Paid plans and boosts are billed in Philippine pesos. Subscriptions renew until cancelled. Fees already paid for a billing period are not refunded unless the law requires it. In this release, upgrades run in a test mode and no money is charged.</p>') +
      sec('Messages and reports', '<p>Chat is for hiring conversations. You can report or block anyone. Reported content may be reviewed by JobMatch administrators.</p>') +
      sec('Changes and contact', '<p>We may update these terms and will notify you of material changes. Contact us at <a href="mailto:' + esc(SUPPORT) + '">' + esc(SUPPORT) + '</a>.</p>'));
  } });

  JM.actions.scroll = function (el, ev) { };
})();
