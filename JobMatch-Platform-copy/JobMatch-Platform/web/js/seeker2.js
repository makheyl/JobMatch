/* Shared and seeker pages: messages, career, quizzes, Pro, résumé review, checklist, notifications, settings, help. */
(function () {
  const JM = window.JM, ic = JM.icon, esc = JM.esc;

  // ---------- messages (seekers and employers) ----------
  JM.route('/messages', { auth: 'both', title: 'Messages', render: function () { return chatPage(null); } });
  JM.route('/messages/:id', { auth: 'both', title: 'Messages', render: function (p) { return chatPage(p.id); } });
  async function chatPage(id) {
    const convs = await JM.rpc('my_conversations'), mine = await JM.q(JM.sb.from('blocks').select('blocked_id'));
    JM.myBlocks = mine.map(function (b) { return b.blocked_id; }); JM.convs = convs;
    const cur = id ? convs.find(function (c) { return c.id === id; }) : null; JM.curConv = cur || null;
    const list = convs.map(function (c) {
      return '<a class="li" href="#/messages/' + c.id + '" style="' + (cur && cur.id === c.id ? 'background:var(--brand-t)' : '') + '">' + JM.avatar(c.other_name) + '<div class="grow"><div class="row between"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.other_name) + '</b><span class="xs muted">' + JM.ago(c.last_at) + '</span></div><div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.job_title) + '</div><div class="small ' + (c.unread ? 'bold' : 'muted') + '" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.last_body || 'No messages yet') + '</div></div>' + (c.unread ? '<span class="badge dark">' + c.unread + '</span>' : '') + '</a>';
    }).join('');
    let thread = '<div class="pane thread-pane">' + JM.empty('chat', 'Select a conversation', 'Chats open when an employer shortlists an applicant.') + '</div>';
    if (id && !cur) thread = '<div class="pane thread-pane">' + JM.empty('chat', 'Conversation not found', 'It may have been removed.') + '</div>';
    if (cur) {
      const msgs = await JM.q(JM.sb.from('messages').select('id,sender_id,body,created_at').eq('conversation_id', id).order('created_at'));
      JM.rpc('mark_conversation_read', { p_conv: id }).then(function () { JM.loadMe().then(JM.updateBadges); });
      const iBlocked = JM.myBlocks.indexOf(cur.other_id) >= 0;
      thread = '<div class="pane thread-pane"><div class="row" style="padding:12px 16px;border-bottom:1px solid var(--line)"><a class="iconbtn chat-back" href="#/messages" aria-label="Back to conversations">' + ic('left') + '</a>' + JM.avatar(cur.other_name) + '<div class="grow"><b>' + esc(cur.other_name) + '</b><div class="xs muted">' + esc(cur.job_title) + '</div></div>' +
        '<button class="iconbtn" data-act="reportuser" data-id="' + cur.other_id + '" aria-label="Report" title="Report">' + ic('flag', 16) + '</button><button class="btn secondary sm" data-act="' + (iBlocked ? 'unblock' : 'block') + '" data-id="' + cur.other_id + '">' + (iBlocked ? 'Unblock' : 'Block') + '</button></div>' +
        '<div class="bubbles" id="bubbles">' + (msgs.length ? msgs.map(bubble).join('') : '<p class="center small muted" style="margin:auto">Say hello. Keep it professional.</p>') + '</div>' +
        (cur.blocked ? '<div class="notice warn" style="margin:12px;border-radius:10px">' + ic('lock') + '<span>Messaging is turned off between you and this person.</span></div>' :
          '<form data-form="send" class="row" style="padding:12px;border-top:1px solid var(--line)"><input type="text" name="body" maxlength="2000" placeholder="Write a message" autocomplete="off" aria-label="Message" style="flex:1"><button class="btn" type="submit" aria-label="Send">' + ic('send', 16) + '</button></form>') + '</div>';
    }
    return '<div class="page"><div class="chat' + (id ? ' has-thread' : '') + '"><div class="pane list-pane"><div class="card-h"><h3>Conversations</h3></div><div class="list" style="overflow:auto">' + (convs.length ? list : JM.empty('chat', 'No conversations yet', 'You can chat once an employer shortlists an applicant.')) + '</div></div>' + thread + '</div></div>';
  }
  function bubble(m) {
    const me = m.sender_id === JM.me.id;
    return '<div class="bub ' + (me ? 'me' : '') + '" data-mid="' + m.id + '">' + esc(m.body) + '<small>' + new Date(m.created_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) + (me ? '' : ' · <button class="chip" style="height:auto;padding:0 6px;font-size:11px;border-radius:6px" data-act="reportmsg" data-id="' + m.id + '">Report</button>') + '</small></div>';
  }
  JM.appendBubble = function (m) {
    const box = document.getElementById('bubbles'); if (!box || box.querySelector('[data-mid="' + m.id + '"]')) return;
    const empty = box.querySelector('p'); if (empty) empty.remove();
    box.insertAdjacentHTML('beforeend', bubble(m)); box.scrollTop = box.scrollHeight;
  };
  JM.afterChat = function () { const b = document.getElementById('bubbles'); if (b) b.scrollTop = b.scrollHeight; };
  JM.forms.send = async function (form, d) {
    const body = String(d.body || '').trim(); if (!body || !JM.curConv) return;
    const input = form.querySelector('input'); input.value = '';
    try {
      const r = await JM.rpc('send_message', { p_conv: JM.curConv.id, p_body: body });
      JM.appendBubble({ id: r.id, sender_id: JM.me.id, body: body, created_at: new Date().toISOString() });
    } catch (e) { input.value = body; JM.toast(JM.err(e), 'bad'); }
  };
  JM.actions.block = function (el) { JM.confirm({ title: 'Block this person?', text: 'Neither of you will be able to message the other. You can unblock later.', ok: 'Block', danger: true, onOk: async function () { await JM.busy(null, async function () { await JM.q(JM.sb.from('blocks').insert({ blocker_id: JM.me.id, blocked_id: el.dataset.id })); JM.toast('Blocked.'); JM.render(); }); } }); };
  JM.actions.unblock = async function (el) { await JM.busy(el, async function () { await JM.q(JM.sb.from('blocks').delete().eq('blocker_id', JM.me.id).eq('blocked_id', el.dataset.id)); JM.toast('Unblocked.'); JM.render(); }); };
  const reportModal = function (kind, id, title) {
    JM.modal('<h2>' + title + '</h2><p class="muted mt">An administrator will review this. Your report is confidential.</p><form data-form="report" data-kind="' + kind + '" data-target="' + id + '" class="mt"><div class="field"><textarea name="reason" minlength="3" maxlength="1000" placeholder="What happened?" required></textarea></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn danger" type="submit">Send report</button></div></form>');
  };
  JM.actions.reportuser = function (el) { reportModal('user', el.dataset.id, 'Report this person'); };
  JM.actions.reportmsg = function (el) { reportModal('message', el.dataset.id, 'Report this message'); };

  // ---------- notifications ----------
  const NICON = { match: 'star', message: 'chat', status: 'briefcase', applicant: 'users', tip: 'sparkle', announcement: 'megaphone', invite: 'mail' };
  JM.route('/notifications', { auth: 'any', title: 'Notifications', render: async function () {
    const items = await JM.q(JM.sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(60));
    const unread = items.filter(function (n) { return !n.read; }).length;
    return '<div class="page narrow">' + JM.pageHead('Notifications', unread ? unread + ' unread' : 'You are all caught up.', unread ? '<button class="btn secondary sm" data-act="readall">Mark all as read</button>' : '') +
      (items.length ? '<div class="card list">' + items.map(function (n) {
        return '<button class="li" data-act="opennotif" data-id="' + n.id + '" data-ref="' + esc(n.ref || '') + '" style="align-items:flex-start;' + (n.read ? '' : 'background:#F5F9FF') + '"><div class="avatar" style="background:' + (n.read ? '#EEF2F7' : 'var(--brand-t)') + '">' + ic(NICON[n.type] || 'bell', 17) + '</div><div class="grow"><div class="bold">' + esc(n.title) + '</div><div class="small muted">' + esc(n.body) + '</div><div class="xs muted" style="margin-top:3px">' + JM.ago(n.created_at) + '</div></div>' + (n.read ? '' : '<span class="badge brand">New</span>') + '</button>';
      }).join('') + '</div>' : '<div class="card">' + JM.empty('bell', 'No notifications yet', 'Matches, messages and updates will appear here.') + '</div>') + '</div>';
  } });
  JM.actions.readall = async function (el) { await JM.busy(el, async function () { await JM.rpc('mark_all_read'); await JM.loadMe(); JM.render(); }); };
  JM.actions.opennotif = async function (el) {
    try { await JM.q(JM.sb.from('notifications').update({ read: true }).eq('id', el.dataset.id)); await JM.loadMe(); JM.updateBadges(); } catch (e) { /* ignore */ }
    const ref = el.dataset.ref; if (ref) JM.go(ref); else JM.render();
  };

  // ---------- career ----------
  const rcol = function (v) { return v >= 70 ? 'ok' : v >= 40 ? '' : 'star'; };
  JM.route('/career', { auth: 'seeker', title: 'Career', render: async function () {
    const o = await JM.rpc('career_overview'), g = o.goal;
    const goal = g ? '<div class="card card-b mb"><div class="row" style="gap:18px;flex-wrap:wrap">' + JM.ring(g.readiness.ready, 72, g.readiness.ready >= 70 ? '#14804F' : '#0C70F8') + '<div class="grow"><div class="xs muted bold" style="text-transform:uppercase;letter-spacing:.05em">Your goal</div><h2>' + esc(g.role.title) + '</h2><p class="muted small" style="margin:4px 0 0">You are ' + g.readiness.ready + '% ready. Finish roadmap tasks to raise it.</p></div><a class="btn" href="#/career/role/' + g.role.id + '">Open roadmap</a></div></div>' :
      '<div class="notice mb">' + ic('award') + '<span>Choose a career goal in your <a href="#/profile">profile</a> to get a personal roadmap.</span></div>';
    const tracked = o.tracked.length ? '<h3 class="mb">Jobs you are going for</h3><div class="card list mb">' + o.tracked.map(function (t) {
      return '<a class="li" href="#/career/job/' + t.job_id + '" style="color:inherit"><div class="avatar sq">' + esc(JM.initials(t.company)) + '</div><div class="grow"><div class="bold">' + esc(t.title) + '</div><div class="small muted">' + esc(t.company) + ' · ' + t.reason + '</div></div><div style="width:110px">' + JM.bar(t.ready, rcol(t.ready)) + '<div class="xs muted" style="margin-top:3px;text-align:right">' + t.ready + '% ready</div></div>' + ic('right', 16) + '</a>';
    }).join('') + '</div>' : '';
    const roles = '<h3 class="mb">Explore roles</h3><div class="grid g3">' + o.roles.map(function (r) {
      return '<a class="card card-b" href="#/career/role/' + r.id + '" style="color:inherit"><div class="xs muted">' + esc(r.category) + '</div><h3 style="margin:4px 0 8px">' + esc(r.title) + '</h3><div class="small" style="color:var(--ink2)">' + JM.peso(r.salary.min) + ' – ' + Number(r.salary.max).toLocaleString('en-PH') + ' / mo</div></a>';
    }).join('') + '</div>';
    return '<div class="page">' + JM.pageHead('Career', 'See what each job needs and build a plan to get there.') + goal + tracked + roles + '</div>';
  } });
  const wt = function (t) { return String(t || '').replace(/^Week\s*\d+\s*:\s*/i, ''); };
  JM.openWeeks = JM.openWeeks || {};
  document.addEventListener('toggle', function (e) { const d = e.target; if (d.classList && d.classList.contains('week')) JM.openWeeks[d.dataset.w] = d.open; }, true);
  async function breakdownPage(kind, id) {
    const b = await JM.rpc('breakdown', { p_kind: kind, p_id: id });
    if (!b) return '<div class="page narrow">' + JM.empty('award', 'No breakdown for this job yet', 'This listing is not linked to a career role.', '<a class="btn" href="#/career">Back to Career</a>') + '</div>';
    JM.bd = b; const r = b.role, rd = b.readiness, s = b.salary, pro = b.pro;
    const needs = rd.skills.filter(function (x) { return x.pct < 70; });
    const weeks = b.weeks.map(function (w) {
      const tasks = w.tasks || [], done = tasks.filter(function (t) { return t.done; }).length, open = JM.openWeeks[kind + id + w.week] != null ? JM.openWeeks[kind + id + w.week] : w.week === (b.weeks.find(function (x) { return !x.locked && (x.tasks || []).some(function (t) { return !t.done; }); }) || { week: 1 }).week;
      if (w.locked) return '<div class="week"><div style="padding:14px 16px" class="row">' + ic('lock', 16) + '<b class="grow">Week ' + w.week + ': ' + esc(wt(w.title)) + '</b><a class="btn sm" href="#/pro">Unlock with Pro</a></div></div>';
      return '<details class="week" data-w="' + kind + id + w.week + '"' + (open ? ' open' : '') + '><summary><span class="grow">Week ' + w.week + ': ' + esc(wt(w.title)) + '</span><span class="small muted">' + done + '/' + tasks.length + '</span>' + ic('down', 16) + '</summary>' + tasks.map(function (t) {
        const quiz = t.type === 'quiz', tag = t.adaptive ? 'Review' : quiz ? 'Quiz' : t.type === 'practice' ? 'Practice' : 'Learn';
        return '<div class="task' + (t.done ? ' done' : '') + '">' + (quiz ? '<span class="avatar" style="width:26px;height:26px;background:' + (t.done ? 'var(--ok-t)' : '#EEF2F7') + ';color:' + (t.done ? 'var(--ok)' : 'var(--muted)') + '">' + ic(t.done ? 'check' : 'zap', 14) + '</span>' :
          '<label class="switch" style="width:34px;height:20px;margin-top:2px"><input type="checkbox" data-act="task" data-id="' + t.id + '"' + (t.done ? ' checked' : '') + ' aria-label="Mark done"><i></i></label>') +
          '<div class="grow"><div class="t">' + esc(t.text) + '</div><div class="row gap-s wrap xs" style="margin-top:5px">' + JM.badge(tag, t.adaptive ? 'warn' : quiz ? 'brand' : '') + '<span class="muted">' + esc(t.skill) + '</span>' + (t.quiz ? '<span class="badge ok">Score ' + t.quiz.score + '/' + t.quiz.total + '</span>' : '') +
          (t.course ? '<a href="' + esc(t.course.url) + '" target="_blank" rel="noopener" data-act="course" data-role="' + r.id + '" data-title="' + esc(t.course.title) + '" data-provider="' + esc(t.course.provider) + '" data-url="' + esc(t.course.url) + '">' + esc(t.course.title) + ' ' + ic('ext', 12) + '</a>' : '') + '</div></div>' +
          (quiz ? '<button class="btn secondary sm" data-act="quiz" data-id="' + t.id + '">' + (t.quiz ? 'Retake' : 'Take quiz') + '</button>' : '') + '</div>';
      }).join('') + '</details>';
    }).join('');
    const growth = pro ? (b.growth || []).map(function (g, i) { return '<div class="row" style="padding:10px 0;border-top:' + (i ? '1px solid var(--line)' : '0') + '"><span class="badge ' + (i === 0 ? 'brand' : '') + '">' + esc(g.level) + '</span><b class="grow">' + esc(g.title) + '</b><span class="small muted">' + JM.peso(g.min) + ' – ' + Number(g.max).toLocaleString('en-PH') + '</span></div>'; }).join('') : '';
    const courses = pro ? (b.courses || []).map(function (c) { return '<a class="li" style="padding:12px 0" href="' + esc(c.url) + '" target="_blank" rel="noopener" data-act="course" data-role="' + r.id + '" data-title="' + esc(c.title) + '" data-provider="' + esc(c.provider) + '" data-url="' + esc(c.url) + '"><div class="grow"><div class="bold">' + esc(c.title) + '</div><div class="xs muted">' + esc(c.provider) + '</div></div>' + ic('ext', 15) + '</a>'; }).join('') : '';
    const lockCard = '<div class="card card-b"><div class="row">' + ic('lock', 20) + '<div class="grow"><b>Growth path and courses</b><div class="small muted">See where this career leads, salary at each level and recommended courses.</div></div><a class="btn sm" href="#/pro">Unlock with Pro</a></div></div>';
    JM.setTitle && JM.setTitle(r.title);
    return '<div class="page"><a class="small row gap-s" href="#/career" style="margin-bottom:14px">' + ic('left', 16) + 'Career</a>' +
      '<div class="card card-b mb"><div class="row" style="gap:18px;flex-wrap:wrap;align-items:flex-start">' + JM.ring(rd.ready, 76, rd.ready >= 70 ? '#14804F' : '#0C70F8') + '<div class="grow" style="min-width:240px"><div class="xs muted">' + esc(r.category) + (b.job ? ' · from ' + esc(b.job.company) : '') + '</div><h1 style="font-size:24px;margin:2px 0 6px">' + esc(r.title) + '</h1><p class="muted" style="margin:0">' + esc(r.overview) + '</p></div>' +
      '<div><div class="xs muted">Typical pay</div><b style="font-size:18px">' + JM.peso(s.min) + ' – ' + Number(s.max).toLocaleString('en-PH') + '</b><div class="xs muted" style="max-width:190px">' + esc(s.source) + '</div></div></div></div>' +
      '<div class="grid g2" style="align-items:start"><div><div class="card mb"><div class="card-h"><h3>Skill readiness</h3></div><div class="card-b">' + rd.skills.map(function (x) { return '<div class="skill"><div class="row between"><span>' + esc(x.name) + '</span><b class="num">' + x.pct + '%</b></div>' + JM.bar(x.pct, rcol(x.pct)) + '</div>'; }).join('') +
      (needs.length ? '<p class="small muted" style="margin:0">Focus on ' + needs.slice(0, 3).map(function (n) { return '<b>' + esc(n.name) + '</b>'; }).join(', ') + ' first.</p>' : '<p class="small" style="margin:0;color:var(--ok)">You meet the bar for every skill. Time to apply.</p>') + '</div></div>' +
      '<div class="card mb"><div class="card-h"><h3>What you will do</h3></div><div class="card-b"><ul class="small" style="margin:0;padding-left:18px;line-height:1.8;color:var(--ink2)">' + (r.duties || []).map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul></div></div></div>' +
      '<div><h3 class="mb">Your roadmap</h3>' + weeks + '<div class="mt">' + (pro ? '<div class="card mb"><div class="card-h"><h3>Growth path</h3></div><div class="card-b">' + growth + '</div></div><div class="card"><div class="card-h"><h3>Recommended courses</h3></div><div class="card-b list" style="padding-top:0;padding-bottom:0">' + courses + '</div></div>' : lockCard) + '</div></div></div></div>';
  }
  JM.route('/career/:kind/:id', { auth: 'seeker', title: 'Career breakdown', render: function (p) { return breakdownPage(p.kind === 'job' ? 'job' : 'role', p.id); } });
  JM.actions.task = async function (el) {
    const on = el.checked;
    try { await JM.rpc('toggle_task', { p_task: el.dataset.id, p_done: on }); JM.render(); } catch (e) { el.checked = !on; JM.toast(JM.err(e), 'bad'); }
  };
  JM.actions.course = function (el) { JM.rpc('save_course_click', { p_role: el.dataset.role, p_title: el.dataset.title, p_provider: el.dataset.provider, p_url: el.dataset.url }).catch(function () {}); };
  JM.actions.quiz = async function (el) {
    await JM.busy(el, async function () {
      const q = await JM.rpc('quiz_for_task', { p_task: el.dataset.id });
      const body = q.questions.length ? q.questions.map(function (x, i) { return '<fieldset style="border:0;padding:0;margin:0 0 16px"><legend class="bold" style="margin-bottom:8px">' + (i + 1) + '. ' + esc(x.question) + '</legend>' + x.options.map(function (o, k) { return '<label class="opt"><input type="radio" name="q' + x.id + '" value="' + k + '" required><span>' + esc(o) + '</span></label>'; }).join('') + '</fieldset>'; }).join('') :
        '<p class="muted">There is no quiz for this skill yet. Rate how confident you feel.</p><div class="chips mb">' + [1, 2, 3, 4, 5].map(function (n) { return '<label class="chip"><input type="radio" name="confidence" value="' + n + '" required style="margin-right:4px">' + n + '</label>'; }).join('') + '</div>';
      JM.modal('<h2>' + esc(q.skill) + ' quiz</h2><p class="muted mt mb">Score 60 percent or more to pass. If you miss, we add a short review task.</p><form data-form="quiz" data-task="' + el.dataset.id + '">' + body + '<div class="row" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn" type="submit">Submit</button></div></form>', 'wide');
    });
  };
  JM.forms.quiz = async function (form, d) {
    const ans = {}; Object.keys(d).forEach(function (k) { if (k[0] === 'q') ans[k.slice(1)] = Number(d[k]); if (k === 'confidence') ans.confidence = Number(d[k]); });
    const r = await JM.rpc('submit_quiz', { p_task: form.dataset.task, p_answers: ans });
    JM.modal('<div class="center"><div class="avatar lg" style="margin:0 auto 14px;background:' + (r.passed ? 'var(--ok-t)' : 'var(--warn-t)') + ';color:' + (r.passed ? 'var(--ok)' : 'var(--warn)') + '">' + ic(r.passed ? 'check' : 'undo', 24) + '</div><h2>' + (r.passed ? 'Nicely done' : 'Not quite yet') + '</h2><p class="muted mt">You scored ' + r.score + ' out of ' + r.total + '. ' + (r.passed ? 'Your readiness went up.' : 'We added a review task to your roadmap. Try again when you are ready.') + '</p><button class="btn mt" data-act="close" data-then="render">Back to roadmap</button></div>');
  };

  // ---------- payments ----------
  JM.checkout = async function (item, jobId, label) {
    const r = await JM.fn('checkout', { item: item, job_id: jobId || undefined });
    if (r.mode === 'live' && r.url) { location.href = r.url; return; }
    await JM.loadMe(); JM.updateBadges();
    JM.toast((r.mode === 'sandbox' ? 'Test payment recorded: ' : 'Paid: ') + (label || r.item), 'ok'); JM.render();
  };
  JM.actions.buy = function (el) {
    const test = JM.cfg.paymentsMode !== 'live';
    JM.confirm({ title: 'Confirm: ' + el.dataset.label, text: JM.peso(el.dataset.amount) + (test ? '. Billing runs in test mode in this version, so nothing is charged.' : '. You will be taken to a secure checkout page.'), ok: test ? 'Activate (test mode)' : 'Continue to payment',
      onOk: function () { JM.busy(null, function () { return JM.checkout(el.dataset.item, el.dataset.job, el.dataset.label); }); } });
  };

  // ---------- Pro ----------
  JM.route('/pro', { auth: 'seeker', title: 'JobMatch Pro', render: async function () {
    const s = JM.me.seeker, pro = s.plan === 'pro';
    const pays = pro ? await JM.q(JM.sb.from('payments').select('*').order('created_at', { ascending: false }).limit(10)) : [];
    const row = function (a, b, c) { return '<tr><td>' + a + '</td><td class="center">' + b + '</td><td class="center">' + c + '</td></tr>'; };
    const yes = '<span style="color:var(--ok)">' + ic('check', 17) + '</span>', no = '<span class="muted">–</span>';
    const status = pro ? '<div class="card card-b mb tint"><div class="row wrap"><div class="grow"><div class="row gap-s">' + ic('crown', 20) + '<h2>You are on Pro</h2></div><p class="small muted" style="margin:6px 0 0">' + (s.auto_renew ? 'Renews ' : 'Ends ') + JM.date(s.plan_renews_at) + ' (' + (s.plan_period === 'yearly' ? 'yearly' : 'monthly') + ').</p></div><label class="row"><span class="small">Auto-renew</span><span class="switch"><input type="checkbox" data-act="autorenew"' + (s.auto_renew ? ' checked' : '') + '><i></i></span></label></div></div>' :
      '<div class="grid g2 mb"><div class="card card-b"><b>Monthly</b><div style="font-size:30px;font-weight:700;letter-spacing:-.03em;margin:6px 0">₱99<span class="small muted" style="font-weight:500"> / month</span></div><button class="btn block" data-act="buy" data-item="pro_monthly" data-label="JobMatch Pro (monthly)" data-amount="99">Choose monthly</button></div>' +
      '<div class="card card-b" style="border-color:var(--brand);box-shadow:0 0 0 1px var(--brand)"><div class="row between"><b>Yearly</b>' + JM.badge('Save 24%', 'ok') + '</div><div style="font-size:30px;font-weight:700;letter-spacing:-.03em;margin:6px 0">₱899<span class="small muted" style="font-weight:500"> / year</span></div><button class="btn block" data-act="buy" data-item="pro_yearly" data-label="JobMatch Pro (yearly)" data-amount="899">Choose yearly</button></div></div>';
    return '<div class="page narrow">' + JM.pageHead('JobMatch Pro', 'Everything in Free, plus the tools that help you close the gap faster.') + status +
      '<div class="card mb"><div class="tablewrap"><table><thead><tr><th>Feature</th><th class="center">Free</th><th class="center">Pro</th></tr></thead><tbody>' + row('Swipe, save and apply', yes, yes) + row('Chat after a shortlist', yes, yes) + row('Stars per day', '3', 'Unlimited') + row('Roadmap', 'Week 1', 'Full plan') + row('Growth path and recommended courses', no, yes) + row('Application insights', no, yes) + row('Résumé review', no, yes) + '</tbody></table></div></div>' +
      (pro && pays.length ? '<h3 class="mb">Payment history</h3><div class="card"><div class="tablewrap"><table><tbody>' + pays.map(function (p) { return '<tr><td>' + JM.date(p.created_at) + '</td><td>' + esc(p.item) + '</td><td class="xs muted">' + esc(p.provider_ref) + '</td><td style="text-align:right">' + JM.peso(p.amount) + '</td></tr>'; }).join('') + '</tbody></table></div></div>' : '') +
      (JM.cfg.paymentsMode !== 'live' ? '<p class="small muted mt">Billing is in test mode in this version. Upgrades are recorded but no money moves.</p>' : '') + '</div>';
  } });
  JM.actions.autorenew = async function (el) {
    try { await JM.q(JM.sb.from('seeker_profiles').update({ auto_renew: el.checked }).eq('user_id', JM.me.id)); await JM.loadMe(); JM.toast(el.checked ? 'Auto-renew on.' : 'Auto-renew off. Pro stays active until the end date.'); JM.render(); } catch (e) { el.checked = !el.checked; JM.toast(JM.err(e), 'bad'); }
  };

  // ---------- résumé review ----------
  JM.route('/resume-review', { auth: 'seeker', title: 'Résumé review', render: async function () {
    const s = JM.me.seeker, pro = s.plan === 'pro';
    const last = pro ? await JM.q(JM.sb.from('resume_reviews').select('*').order('created_at', { ascending: false }).limit(1)) : [];
    const show = function (r) {
      return '<div class="card card-b mt"><div class="row" style="gap:18px;flex-wrap:wrap">' + JM.ring(r.score, 76, r.score >= 80 ? '#14804F' : r.score >= 55 ? '#0C70F8' : '#9A5B00') + '<div class="grow"><h2>' + esc(r.summary) + '</h2><div class="xs muted">' + (r.source === 'ai' ? 'AI review' : 'Automatic checklist review') + ' · ' + JM.ago(r.created_at) + '</div></div></div><div class="divider"></div>' +
        (r.suggestions.length ? r.suggestions.map(function (x) { return '<div class="row" style="align-items:flex-start;padding:8px 0">' + JM.badge(x.area, 'brand') + '<span class="grow small">' + esc(x.tip) + '</span></div>'; }).join('') : '<p class="small" style="color:var(--ok);margin:0">No fixes needed. Great résumé.</p>') + '</div>';
    };
    const body = pro ? '<div class="card card-b"><p class="muted small">We check your profile résumé: summary, skills, experience, education and contact details. You can also paste your résumé text for a deeper review. Your name, age, gender and photo are never sent.</p><form data-form="review"><div class="field"><textarea name="text" placeholder="Optional: paste your résumé text here" style="min-height:120px"></textarea></div><button class="btn" type="submit">' + ic('sparkle', 16) + 'Review my résumé</button></form></div><div id="review-out">' + (last[0] ? show(last[0]) : '') + '</div>' :
      '<div class="card card-b"><div class="lock"><div class="blur"><h2>Score 82 out of 100</h2><p>Add numbers to your achievements. List at least 5 skills. Upload a PDF résumé.</p></div><div class="veil">' + ic('lock', 22) + '<b>Résumé review is part of Pro</b><a class="btn sm" href="#/pro">See Pro</a></div></div></div>';
    JM.showReview = show;
    return '<div class="page narrow">' + JM.pageHead('Résumé review', 'Get a score and specific fixes before employers see your profile.') + body + '</div>';
  } });
  JM.forms.review = async function (form, d) {
    const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Reviewing…';
    try { const r = await JM.fn('resume-review', { text: d.text || '' }); r.created_at = new Date().toISOString(); document.getElementById('review-out').innerHTML = JM.showReview(r); }
    catch (e) { JM.toast(JM.err(e), 'bad'); } finally { btn.disabled = false; btn.innerHTML = ic('sparkle', 16) + 'Review my résumé'; }
  };

  // ---------- first-time jobseeker checklist ----------
  const CHECK = [
    ['cert', 'Barangay Certification', 'Get a certificate from your barangay hall that you are a resident and a first-time jobseeker. Bring a valid ID.'],
    ['oath', 'Oath of Undertaking', 'Sign the oath at the barangay. It confirms this is your first job search and lets you skip fees.'],
    ['police', 'Police clearance', 'Free for first-time jobseekers. Show your Barangay Certification.'],
    ['nbi', 'NBI clearance', 'Free for first-time jobseekers. Show your Barangay Certification.'],
    ['psa', 'PSA birth certificate', 'Request it without paying the fee when you present the certification.'],
    ['gov', 'TIN, SSS, PhilHealth and Pag-IBIG numbers', 'Registration for these IDs is free for first-time jobseekers.'],
    ['med', 'Medical certificate from a public hospital', 'Public health facilities waive the fee with your Barangay Certification.']
  ];
  JM.route('/checklist', { auth: 'seeker', title: 'First-time jobseeker', render: function () {
    const c = JM.me.seeker.checklist || {}, n = CHECK.filter(function (x) { return c[x[0]]; }).length;
    return '<div class="page narrow">' + JM.pageHead('First-time jobseeker checklist', 'Under Republic Act 11261, first-time jobseekers do not pay fees for the documents employers ask for.') +
      '<div class="card card-b mb"><div class="row"><b class="grow">' + n + ' of ' + CHECK.length + ' done</b><span class="small muted">' + Math.round(n / CHECK.length * 100) + '%</span></div>' + JM.bar(n / CHECK.length * 100, 'ok') + '</div>' +
      '<div class="card list">' + CHECK.map(function (x) { return '<label class="li" style="align-items:flex-start;cursor:pointer"><span class="switch" style="width:34px;height:20px;margin-top:2px"><input type="checkbox" data-act="check" data-k="' + x[0] + '"' + (c[x[0]] ? ' checked' : '') + '><i></i></span><div class="grow"><div class="bold">' + x[1] + '</div><div class="small muted">' + x[2] + '</div></div></label>'; }).join('') + '</div>' +
      '<p class="small muted mt">The benefit applies once and the certification is valid for one year. Requirements can change, so confirm with the office before you go.</p></div>';
  } });
  JM.actions.check = async function (el) {
    const c = Object.assign({}, JM.me.seeker.checklist || {}); if (el.checked) c[el.dataset.k] = true; else delete c[el.dataset.k];
    try { await JM.q(JM.sb.from('seeker_profiles').update({ checklist: c }).eq('user_id', JM.me.id)); JM.me.seeker.checklist = c; JM.render(); } catch (e) { el.checked = !el.checked; JM.toast(JM.err(e), 'bad'); }
  };

  // ---------- account (shared by seeker settings and employer company page) ----------
  JM.accountCards = function () {
    const push = JM.cfg.vapidPublicKey && 'serviceWorker' in navigator && 'PushManager' in window ? '<div class="row" style="padding:14px 0;border-top:1px solid var(--line)"><div class="grow"><b>Push notifications</b><div class="small muted">Get alerts on this device even when JobMatch is closed.</div></div><button class="btn secondary sm" data-act="pushon">Enable</button></div>' : '';
    return '<div class="card mb"><div class="card-h"><h3>Security</h3></div><div class="card-b"><form data-form="password" class="grid g2" style="align-items:end"><div class="field" style="margin:0"><label class="label">New password</label><input type="password" name="password" minlength="8" autocomplete="new-password" placeholder="At least 8 characters" required></div><div><button class="btn secondary" type="submit">Change password</button></div></form>' + push + '</div></div>' +
      '<div class="card mb"><div class="card-h"><h3>Your data</h3></div><div class="card-b"><p class="small muted">Download a copy of everything we hold about you, or delete your account. Deleting is permanent: your profile, files, messages and activity are removed.</p><div class="row wrap"><button class="btn secondary" data-act="export">' + ic('download', 16) + 'Download my data</button><button class="btn danger secondary" data-act="deleteacct">' + ic('trash', 16) + 'Delete my account</button></div></div></div>';
  };
  JM.forms.password = async function (form, d) {
    if ((d.password || '').length < 8) return JM.toast('Use at least 8 characters.', 'bad');
    const r = await JM.sb.auth.updateUser({ password: d.password }); if (r.error) throw r.error; form.reset(); JM.toast('Password updated.', 'ok');
  };
  JM.actions.export = async function (el) {
    await JM.busy(el, async function () {
      const data = await JM.rpc('export_my_data'), a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = 'jobmatch-my-data.json'; a.click(); URL.revokeObjectURL(a.href);
    });
  };
  JM.actions.deleteacct = function () {
    JM.modal('<h2>Delete your account?</h2><p class="muted mt">This permanently removes your profile, uploaded files, messages and activity. It cannot be undone. Type <b>DELETE</b> to confirm.</p><form data-form="delete" class="mt"><div class="field"><input type="text" name="confirm" autocomplete="off" placeholder="DELETE"></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn danger" type="submit">Delete forever</button></div></form>');
  };
  JM.forms.delete = async function (form, d) {
    if (d.confirm !== 'DELETE') return JM.toast('Type DELETE to confirm.', 'bad');
    await JM.fn('delete-account', {}); JM.close(); await JM.sb.auth.signOut(); JM.me = null; JM.go('/'); JM.toast('Your account was deleted.');
  };
  JM.actions.pushon = async function (el) {
    await JM.busy(el, async function () {
      const perm = await Notification.requestPermission(); if (perm !== 'granted') return JM.toast('Notifications are blocked in your browser settings.', 'bad');
      const reg = await navigator.serviceWorker.ready; const key = JM.cfg.vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/');
      const raw = atob(key + '='.repeat((4 - key.length % 4) % 4)), arr = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: arr }), j = sub.toJSON();
      await JM.q(JM.sb.from('push_subscriptions').upsert({ user_id: JM.me.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' }));
      JM.toast('Push notifications enabled on this device.', 'ok');
    });
  };

  // ---------- seeker settings ----------
  JM.route('/settings', { auth: 'seeker', title: 'Settings', render: function () {
    const n = JM.me.seeker.notif || {}, sw = function (k, t, d) { return '<label class="row" style="padding:12px 0;border-top:1px solid var(--line)"><div class="grow"><b>' + t + '</b><div class="small muted">' + d + '</div></div><span class="switch"><input type="checkbox" data-act="notif" data-k="' + k + '"' + (n[k] !== false ? ' checked' : '') + '><i></i></span></label>'; };
    return '<div class="page narrow">' + JM.pageHead('Settings') + '<div class="card mb"><div class="card-h"><h3>Notifications</h3></div><div class="card-b" style="padding-top:0">' + sw('matches', 'Matches', 'When an employer shortlists you.') + sw('status', 'Application updates', 'Hired or not selected.') + sw('messages', 'Messages', 'New chat messages.') + sw('tips', 'Tips', 'Career and profile suggestions.') + '</div></div>' +
      '<div class="card mb"><div class="card-h"><h3>Discoverability</h3></div><div class="card-b"><label class="row"><div class="grow"><b>Let Business-plan employers find me</b><div class="small muted">They see a masked name and skills, never contact details.</div></div><span class="switch"><input type="checkbox" data-act="openemp"' + (JM.me.seeker.open_to_employers ? ' checked' : '') + '><i></i></span></label></div></div>' + JM.accountCards() + '</div>';
  } });
  JM.actions.notif = async function (el) {
    const n = Object.assign({}, JM.me.seeker.notif || {}); n[el.dataset.k] = el.checked;
    try { await JM.q(JM.sb.from('seeker_profiles').update({ notif: n }).eq('user_id', JM.me.id)); JM.me.seeker.notif = n; } catch (e) { el.checked = !el.checked; JM.toast(JM.err(e), 'bad'); }
  };
  JM.actions.openemp = async function (el) {
    try { await JM.q(JM.sb.from('seeker_profiles').update({ open_to_employers: el.checked }).eq('user_id', JM.me.id)); JM.me.seeker.open_to_employers = el.checked; } catch (e) { el.checked = !el.checked; JM.toast(JM.err(e), 'bad'); }
  };

  // ---------- help ----------
  const FAQS = [
    ['How does the match score work?', 'Skills 55%, location 20%, interests 15% and pay 10%. Your swipes adjust ranking slightly. Age, gender and photos are never used.'],
    ['What is a star?', 'A star marks a job as a top choice. Employers on ranked plans see starred applicants first. Free accounts get 3 a day.'],
    ['Why can I not see all roadmap weeks?', 'Free accounts include week 1 of every roadmap. Pro unlocks the full plan, growth path and courses.'],
    ['What do employers see before they shortlist me?', 'Your first name and last initial, skills, education, experience and résumé summary. Contact details, age, gender and your résumé file are shared after a shortlist.'],
    ['How do I change my commute distance?', 'Open Profile, then About you, and adjust the commute slider. Save changes.'],
    ['How do I delete my account?', 'Open Settings, scroll to Your data, and choose Delete my account.']
  ];
  JM.helpPage = function (role) {
    return '<div class="page narrow">' + JM.pageHead('Help and support') + '<div class="card mb faq" style="padding:6px 20px">' + (role === 'employer' ? EFAQ : FAQS).map(function (f) { return '<details><summary>' + f[0] + ic('down', 16) + '</summary><p>' + f[1] + '</p></details>'; }).join('') + '</div>' +
      '<div class="card card-b"><h3>Still need help?</h3><p class="small muted mt">Send us a message and we will reply by email.</p><form data-form="ticket" class="mt"><div class="grid g2 keep"><div class="field"><label class="label">Topic</label><select name="kind"><option value="support">Question</option><option value="problem">Report a problem</option></select></div><div class="field"><label class="label">Subject</label><input type="text" name="subject" maxlength="120" required></div></div><div class="field"><label class="label">Message</label><textarea name="message" minlength="3" maxlength="4000" required></textarea></div><button class="btn" type="submit">Send</button></form></div></div>';
  };
  const EFAQ = [
    ['How does verification work?', 'Upload a business permit and a valid ID. An administrator reviews them. You can draft listings while you wait, but cannot publish until you are verified.'],
    ['What does each plan include?', 'Starter: 2 active listings. Growth: 10 listings, ranked applicants and analytics. Business: unlimited listings and candidate search with invites.'],
    ['What do I see about applicants?', 'A first name and last initial, skills, education and experience. After you shortlist someone you see their full name, contact details and résumé file, and a chat opens.'],
    ['What is a boost?', 'A boost puts one listing near the top of job seekers\' decks for 7 days. It costs ₱299 and works on any plan.'],
    ['How do I report a problem?', 'Use the form below or the Report button in any chat.']
  ];
  JM.route('/help', { auth: 'seeker', title: 'Help', render: function () { return JM.helpPage('seeker'); } });
  JM.forms.ticket = async function (form, d) {
    await JM.q(JM.sb.from('tickets').insert({ user_id: JM.me.id, kind: d.kind, subject: String(d.subject).trim(), message: String(d.message).trim() }));
    form.reset(); JM.toast('Message sent. We will reply by email.', 'ok');
  };
})();
