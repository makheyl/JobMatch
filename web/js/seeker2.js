/* Shared and seeker pages: messages, career, quizzes, Pro, résumé review, checklist, notifications, settings, help. */
(function () {
  const JM = window.JM, ic = JM.icon, esc = JM.esc;

  // ---------- messages (seekers and employers — long-press dropdown + real replies) ----------
  JM.route('/messages', { auth: 'both', title: 'Messages', render: function () { return chatPage(null); } });
  JM.route('/messages/:id', { auth: 'both', title: 'Messages', render: function (p) { return chatPage(p.id); } });
  async function chatPage(id) {
    JM.replyTo = null;
    if (JM.closeMsgMenu) JM.closeMsgMenu();
    const convs = await JM.rpc('my_conversations'), mine = await JM.q(JM.sb.from('blocks').select('blocked_id'));
    JM.myBlocks = mine.map(function (b) { return b.blocked_id; }); JM.convs = convs;
    const cur = id ? convs.find(function (c) { return c.id === id; }) : null; JM.curConv = cur || null;
    const convAv = function (c, sz) {
      return JM.img({ bucket: c.other_avatar_bucket || 'company-logos', path: c.other_avatar, shape: 'circle', size: sz || 38, name: c.other_name, alt: c.other_name });
    };
    const list = convs.map(function (c) {
      return '<a class="li" href="#/messages/' + c.id + '" style="' + (cur && cur.id === c.id ? 'background:var(--brand-t)' : '') + '">' + convAv(c, 38) + '<div class="grow"><div class="row between"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.other_name) + '</b><span class="xs muted">' + JM.ago(c.last_at) + '</span></div><div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.job_title) + '</div><div class="small ' + (c.unread ? 'bold' : 'muted') + '" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.last_body || 'No messages yet') + '</div></div>' + (c.unread ? '<span class="badge dark">' + c.unread + '</span>' : '') + '</a>';
    }).join('');
    let thread = '<div class="pane thread-pane">' + JM.empty('chat', 'Select a conversation', 'Chats open when an employer shortlists an applicant.') + '</div>';
    if (id && !cur) thread = '<div class="pane thread-pane">' + JM.empty('chat', 'Conversation not found', 'It may have been removed.') + '</div>';
    const quickMsgs = JM.me.role === 'employer'
      ? ['Hi! Are you available for a short interview this week?', 'Thanks for applying! Please bring a copy of your résumé.', 'What time works best for a quick call?']
      : ['Hi! I am available for an interview.', 'Thank you for shortlisting me! When is a good time to talk?', 'Could you share the exact interview location or link?'];
    if (cur) {
      const rawMsgs = await JM.q(JM.sb.from('messages').select('id,sender_id,body,created_at,edited_at,unsent_at,hidden_by,reply_to').eq('conversation_id', id).order('created_at'));
      const msgs = rawMsgs.filter(function (m) { return !Array.isArray(m.hidden_by) || m.hidden_by.indexOf(JM.me.id) < 0; });
      JM.curMsgs = {}; msgs.forEach(function (m) { JM.curMsgs[m.id] = m; });
      JM.rpc('mark_conversation_read', { p_conv: id }).then(function () { JM.loadMe().then(JM.updateBadges); });
      const iBlocked = JM.myBlocks.indexOf(cur.other_id) >= 0;
      const freeSeekerWait = JM.me.role === 'seeker' && JM.me.seeker.plan !== 'pro' && !rawMsgs.some(function (m) { return m.sender_id !== JM.me.id; });
      let showTip = false;
      try { if (!localStorage.getItem('jm.msgTipSeen')) { showTip = true; localStorage.setItem('jm.msgTipSeen', '1'); } } catch (e) { }
      const tipBar = showTip ? '<div class="msg-tip" id="msg-tip"><span>Tip: press and hold a message (or right-click) for Reply, Copy, Edit, Unsend and more.</span><button type="button" class="iconbtn" style="width:24px;height:24px" data-act="hidemsgtip" aria-label="Dismiss tip">' + ic('x', 13) + '</button></div>' : '';
      thread = '<div class="pane thread-pane"><div class="row" style="padding:12px 16px;border-bottom:1px solid var(--line)"><a class="iconbtn chat-back" href="#/messages" aria-label="Back to conversations">' + ic('left') + '</a>' + convAv(cur, 38) + '<div class="grow"><b>' + esc(cur.other_name) + '</b><div class="xs muted">' + esc(cur.job_title) + '</div></div>' +
        '<button class="iconbtn" data-act="reportuser" data-id="' + cur.other_id + '" aria-label="Report" title="Report">' + ic('flag', 16) + '</button><button class="btn secondary sm" data-act="' + (iBlocked ? 'unblock' : 'block') + '" data-id="' + cur.other_id + '">' + (iBlocked ? 'Unblock' : 'Block') + '</button></div>' +
        tipBar +
        '<div class="bubbles" id="bubbles">' + (msgs.length ? msgs.map(bubble).join('') : '<p class="center small muted" style="margin:auto">Say hello. Keep it professional.</p>') + '</div>' +
        (cur.blocked ? '<div class="notice warn" style="margin:12px;border-radius:10px">' + ic('lock') + '<span>Messaging is turned off between you and this person.</span></div>' :
          freeSeekerWait ? '<div class="notice warn" style="margin:12px;border-radius:10px">' + ic('lock') + '<span>Free plan users can reply once the employer messages first. <a href="#/pro">Upgrade to Monthly or Annual</a> to initiate conversations.</span></div>' :
            '<div class="reply-bar hide" id="reply-bar"></div>' +
            '<div class="quick-msgs">' + quickMsgs.map(function (qm) { return '<button type="button" class="chip" data-act="quickmsg" data-msg="' + esc(qm) + '">' + esc(qm) + '</button>'; }).join('') + '</div>' +
            '<form data-form="send" class="row" style="padding:12px;border-top:1px solid var(--line)"><input type="text" name="body" id="chat-input" maxlength="2000" placeholder="Write a message" autocomplete="off" aria-label="Message" style="flex:1"><button class="btn" type="submit" aria-label="Send">' + ic('send', 16) + '</button></form>') + '</div>';
    }
    const canNew = JM.me.role === 'employer' || (JM.me.seeker && JM.me.seeker.plan === 'pro');
    return '<div class="page"><div class="chat' + (id ? ' has-thread' : '') + '"><div class="pane list-pane"><div class="card-h"><h3 class="grow">Conversations</h3>' + (canNew ? '<button class="btn secondary sm" data-act="newmsg">' + ic('plus', 15) + 'New</button>' : '<a class="btn secondary sm" href="#/pro">' + ic('lock', 14) + 'New</a>') + '</div><div class="list" style="overflow:auto">' + (convs.length ? list : JM.empty('chat', 'No conversations yet', canNew ? 'Start a message with a shortlisted match.' : 'You can reply once an employer messages you first.', canNew ? '<button class="btn sm" data-act="newmsg">Start a message</button>' : '<a class="btn sm" href="#/pro">Upgrade to start chats</a>')) + '</div></div>' + thread + '</div></div>';
  }
  JM.actions.hidemsgtip = function () { const el = document.getElementById('msg-tip'); if (el) el.remove(); };
  JM.actions.quickmsg = function (el) {
    const inp = document.getElementById('chat-input');
    if (inp) { inp.value = el.dataset.msg; inp.focus(); }
  };
  JM.actions.newmsg = async function (el) {
    await JM.busy(el, async function () {
      let items = [];
      if (JM.me.role === 'seeker') {
        items = (await JM.rpc('my_matches')).map(function (m) {
          return { app_id: m.application_id, conv_id: m.conversation_id, name: m.company.name, sub: m.job.title, status: m.status };
        });
      } else {
        const jobs = await JM.q(JM.sb.from('jobs').select('id,title').eq('employer_id', JM.me.id));
        for (let i = 0; i < jobs.length; i++) {
          const r = await JM.rpc('employer_applicants', { p_job: jobs[i].id });
          r.items.filter(function (a) { return a.status === 'shortlisted' || a.status === 'hired'; }).forEach(function (a) {
            items.push({ app_id: a.id, conv_id: null, name: a.name, sub: jobs[i].title, status: a.status });
          });
        }
      }
      const taSearch = items.length ? '<div class="mt">' + JM.typeahead({
        id: 'newmsg-ta',
        minChars: 0,
        placeholder: 'Search matches by name or job…',
        source: items.map(function (x) { return { value: x.conv_id || x.app_id, label: x.name, group: x.sub, _item: x }; }),
        onPick: function (it) {
          const x = it._item; if (!x) return;
          if (x.conv_id) { JM.close(); JM.go('/messages/' + x.conv_id); }
          else JM.actions.startmsg({ dataset: { app: x.app_id } });
        }
      }) + '</div>' : '';
      const list = items.length ? '<div class="list mt" style="max-height:46vh;overflow:auto">' + items.map(function (x) {
        return '<div class="li" style="padding:10px 4px">' + JM.avatar(x.name) + '<div class="grow"><b>' + esc(x.name) + '</b><div class="xs muted">' + esc(x.sub) + ' · ' + esc(x.status) + '</div></div>' +
          (x.conv_id ? '<a class="btn sm" href="#/messages/' + x.conv_id + '" data-act="close">Open</a>' : '<button class="btn sm" data-act="startmsg" data-app="' + x.app_id + '">Message</button>') + '</div>';
      }).join('') + '</div>' : '<p class="muted mt">No shortlisted or hired matches yet. Matches appear here once shortlisted.</p>';
      JM.modal('<h2>Start a message</h2><p class="small muted mt">Choose a shortlisted or hired match to message directly.</p>' + taSearch + list + '<div class="row mt-l" style="justify-content:flex-end"><button class="btn secondary" data-act="close">Close</button></div>');
    });
  };
  function quoteHtml(replyId) {
    if (!replyId) return '';
    const orig = (JM.curMsgs || {})[replyId];
    if (!orig || orig.unsent_at || (Array.isArray(orig.hidden_by) && orig.hidden_by.indexOf(JM.me.id) >= 0)) {
      return '<div class="msg-quote unavailable">Original message unavailable</div>';
    }
    const who = orig.sender_id === JM.me.id ? 'You' : (JM.curConv ? JM.curConv.other_name : 'Match');
    const snip = String(orig.body || '').replace(/\s+/g, ' ').slice(0, 90);
    return '<button type="button" class="msg-quote" data-act="jumpmsg" data-id="' + orig.id + '"><b>' + esc(who) + '</b><span>' + esc(snip) + (orig.body.length > 90 ? '…' : '') + '</span></button>';
  }
  function bubble(m) {
    JM.curMsgs = JM.curMsgs || {};
    JM.curMsgs[m.id] = m;
    const me = m.sender_id === JM.me.id;
    const unsent = !!m.unsent_at;
    const timeStr = new Date(m.created_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
    const editedTag = (!unsent && m.edited_at) ? ' · <span class="msg-edited">edited</span>' : '';
    const textHtml = unsent
      ? '<span class="msg-unsent">' + (me ? 'You unsent a message' : 'This message was unsent') + '</span>'
      : '<div class="msg-body">' + esc(m.body) + '</div>';
    const moreBtn = '<button type="button" class="bub-more" data-act="msgmore" data-id="' + m.id + '" aria-label="Message options" title="Message options">' + ic('more', 14) + '</button>';
    return '<div class="bub ' + (me ? 'me' : '') + (unsent ? ' unsent' : '') + '" data-mid="' + m.id + '" tabindex="0">' +
      moreBtn +
      (!unsent ? quoteHtml(m.reply_to) : '') +
      textHtml +
      '<small class="msg-meta"><span>' + timeStr + editedTag + '</span></small></div>';
  }

  // ---------- Long-press / context-menu dropdown for message bubbles (Section 4.2-4.3) ----------
  let openMenuMsgId = null, openMenuTrigger = null;
  function closeMsgMenu(restoreFocus) {
    const existing = document.getElementById('msg-menu-wrap');
    if (existing) existing.remove();
    const prev = openMenuTrigger;
    if (prev && prev.classList) prev.classList.remove('bub-menu-open');
    openMenuMsgId = null; openMenuTrigger = null; JM.msgMenuOpen = false;
    if (restoreFocus && prev && prev.isConnected) { try { prev.focus(); } catch (e) { } }
  }
  JM.closeMsgMenu = function () { closeMsgMenu(false); };

  function openMsgMenu(bubEl) {
    if (!bubEl) return;
    const id = bubEl.dataset.mid, m = (JM.curMsgs || {})[id];
    if (!m) return;
    closeMsgMenu(false);
    bubEl.classList.add('bub-menu-open');
    if (JM.hapticTick) JM.hapticTick(12);
    const me = m.sender_id === JM.me.id, unsent = !!m.unsent_at;
    const items = [];
    if (!unsent) {
      items.push({ act: 'replymsg', icon: 'reply', label: 'Reply' });
      items.push({ act: 'copymsg', icon: 'copy', label: 'Copy' });
      if (me) {
        items.push({ act: 'editmsg', icon: 'edit', label: 'Edit' });
        items.push({ act: 'unsendmsg', icon: 'undo', label: 'Unsend', danger: true });
      }
    }
    items.push({ act: 'rmmsgme', icon: 'trash', label: 'Remove for you' });
    if (!me && !unsent) items.push({ act: 'reportmsg', icon: 'flag', label: 'Report', danger: true });

    const wrap = document.createElement('div');
    wrap.id = 'msg-menu-wrap';
    wrap.className = 'msg-menu-bg';
    wrap.innerHTML = '<div class="msg-menu" role="menu" aria-label="Message options">' +
      items.map(function (it) {
        return '<button type="button" role="menuitem" class="' + (it.danger ? 'danger' : '') + '" data-act="' + it.act + '" data-id="' + id + '">' + ic(it.icon, 15) + '<span>' + it.label + '</span></button>';
      }).join('') + '</div>';
    document.body.appendChild(wrap);

    const menu = wrap.querySelector('.msg-menu');
    const rect = bubEl.getBoundingClientRect();
    const mw = 200, mh = menu.offsetHeight || (items.length * 40 + 12);
    let left = me ? (rect.right - mw) : rect.left;
    left = Math.max(10, Math.min(window.innerWidth - mw - 10, left));
    let top = rect.bottom + 6;
    if (top + mh > window.innerHeight - 14) top = Math.max(12, rect.top - mh - 6);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    openMenuMsgId = id; openMenuTrigger = bubEl; JM.msgMenuOpen = true;
    if (navigator.vibrate) { try { navigator.vibrate(10); } catch (e) { } }

    const btns = Array.from(menu.querySelectorAll('[role=menuitem]'));
    if (btns[0]) setTimeout(function () { try { btns[0].focus(); } catch (e) { } }, 10);

    wrap.addEventListener('pointerdown', function (e) {
      if (e.target === wrap) { e.preventDefault(); closeMsgMenu(true); }
    });
    menu.addEventListener('click', function () {
      setTimeout(function () { closeMsgMenu(false); }, 0);
    });
    menu.addEventListener('keydown', function (e) {
      const idx = btns.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); btns[(idx + 1) % btns.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(idx - 1 + btns.length) % btns.length].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMsgMenu(true); }
    });
  }
  JM.actions.msgmore = function (el, ev) {
    if (ev) ev.stopPropagation();
    openMsgMenu(el.closest('.bub'));
  };

  function bindBubblesGestures(box) {
    if (!box || box._gesturesBound) return;
    box._gesturesBound = true;
    let pressTimer = null, pressBub = null, sx = 0, sy = 0;
    const cancelPress = function () {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      if (pressBub) { pressBub.classList.remove('pressing'); pressBub = null; }
    };
    box.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      if (e.target.closest('button')) return;
      const bub = e.target.closest('.bub');
      if (!bub) return;
      cancelPress();
      sx = e.clientX; sy = e.clientY; pressBub = bub;
      bub.classList.add('pressing');
      pressTimer = setTimeout(function () {
        const target = pressBub;
        cancelPress();
        if (target && target.isConnected) openMsgMenu(target);
      }, 450);
    });
    box.addEventListener('pointermove', function (e) {
      if (!pressTimer) return;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) cancelPress();
    });
    box.addEventListener('pointerup', cancelPress);
    box.addEventListener('pointercancel', cancelPress);
    box.addEventListener('scroll', function () { cancelPress(); if (JM.msgMenuOpen) closeMsgMenu(false); }, { passive: true });
    box.addEventListener('contextmenu', function (e) {
      const bub = e.target.closest('.bub');
      if (!bub) return;
      e.preventDefault();
      cancelPress();
      openMsgMenu(bub);
    });
    box.addEventListener('keydown', function (e) {
      const bub = e.target.closest('.bub');
      if (!bub || e.target !== bub) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        openMsgMenu(bub);
      }
    });
  }

  JM.appendBubble = function (m) {
    if (Array.isArray(m.hidden_by) && m.hidden_by.indexOf(JM.me.id) >= 0) return;
    const box = document.getElementById('bubbles'); if (!box) return;
    const existing = box.querySelector('[data-mid="' + m.id + '"]');
    if (existing) { existing.outerHTML = bubble(m); return; }
    const empty = box.querySelector('p'); if (empty) empty.remove();
    box.insertAdjacentHTML('beforeend', bubble(m)); box.scrollTop = box.scrollHeight;
  };
  JM.updateBubble = function (m) {
    if (openMenuMsgId && openMenuMsgId === m.id) closeMsgMenu(false);
    const box = document.getElementById('bubbles'); if (!box) return;
    if (Array.isArray(m.hidden_by) && m.hidden_by.indexOf(JM.me.id) >= 0) {
      const el = box.querySelector('[data-mid="' + m.id + '"]'); if (el) el.remove();
      return;
    }
    const el = box.querySelector('[data-mid="' + m.id + '"]');
    if (el) el.outerHTML = bubble(m);
  };
  JM.afterChat = function () {
    const b = document.getElementById('bubbles');
    if (b) { b.scrollTop = b.scrollHeight; bindBubblesGestures(b); }
  };
  function drawReplyBar() {
    const bar = document.getElementById('reply-bar'); if (!bar) return;
    if (!JM.replyTo) { bar.classList.add('hide'); bar.innerHTML = ''; return; }
    const m = JM.replyTo;
    const who = m.sender_id === JM.me.id ? 'yourself' : (JM.curConv ? JM.curConv.other_name : 'match');
    const snip = String(m.body || '').replace(/\s+/g, ' ').slice(0, 80);
    bar.innerHTML = '<div class="grow xs"><b>Replying to ' + esc(who) + ':</b> <span class="muted">' + esc(snip) + (m.body.length > 80 ? '…' : '') + '</span></div>' +
      '<button type="button" class="iconbtn" style="width:26px;height:26px" data-act="cancelreply" aria-label="Cancel reply">' + ic('x', 14) + '</button>';
    bar.classList.remove('hide');
  }
  JM.actions.cancelreply = function () { JM.replyTo = null; drawReplyBar(); };
  JM.actions.jumpmsg = function (el) {
    const target = document.querySelector('#bubbles [data-mid="' + el.dataset.id + '"]');
    if (!target) return JM.toast('Original message is not in view.');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('bub-flash');
    void target.offsetWidth;
    target.classList.add('bub-flash');
    setTimeout(function () { target.classList.remove('bub-flash'); }, 1200);
  };
  JM.forms.send = async function (form, d) {
    const body = String(d.body || '').trim(); if (!body || !JM.curConv) return;
    const replyId = JM.replyTo ? JM.replyTo.id : null;
    const input = form.querySelector('input'); input.value = '';
    const sendBtn = form.querySelector('[type=submit]');
    const hadMyMsg = Object.values(JM.curMsgs || {}).some(function (x) { return x && x.sender_id === JM.me.id; });
    JM.replyTo = null; drawReplyBar();
    try {
      const r = await JM.rpc('send_message', { p_conv: JM.curConv.id, p_body: body, p_reply_to: replyId });
      const newMsg = { id: r.id, sender_id: JM.me.id, body: body, reply_to: replyId, created_at: new Date().toISOString() };
      if (JM.curMsgs) JM.curMsgs[r.id] = newMsg;
      JM.appendBubble(newMsg);
      if ((!hadMyMsg || (JM.milestones && !JM.milestones.has('seeker_first_msg_sent'))) && JM.micro && JM.micro.planeFly) {
        if (JM.milestones) JM.milestones.mark('seeker_first_msg_sent');
        JM.micro.planeFly(sendBtn || form);
      }
    } catch (e) { input.value = body; JM.toast(JM.err(e), 'bad'); }
  };
  JM.actions.replymsg = function (el) {
    const m = (JM.curMsgs || {})[el.dataset.id]; if (!m || m.unsent_at) return;
    JM.replyTo = m; drawReplyBar();
    const inp = document.getElementById('chat-input'); if (inp) inp.focus();
  };
  JM.actions.copymsg = async function (el) {
    const m = (JM.curMsgs || {})[el.dataset.id]; if (!m || m.unsent_at) return;
    try {
      await navigator.clipboard.writeText(m.body || '');
      JM.toast('Message copied.', 'ok');
    } catch (e) { JM.toast('Could not copy to clipboard.', 'bad'); }
  };
  JM.actions.editmsg = function (el) {
    const m = (JM.curMsgs || {})[el.dataset.id]; if (!m || m.unsent_at) return;
    JM.modal('<h2>Edit message</h2><p class="small muted mt">Update your message text below.</p>' +
      '<form data-form="editmsg" data-id="' + m.id + '" class="mt">' +
      '<div class="field"><textarea name="body" rows="3" minlength="1" maxlength="2000" required>' + esc(m.body) + '</textarea></div>' +
      '<div class="row" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn" type="submit">Save changes</button></div></form>');
  };
  JM.forms.editmsg = async function (form, d) {
    const id = form.dataset.id, body = String(d.body || '').trim();
    if (!body) return JM.toast('Message cannot be empty.', 'bad');
    const r = await JM.rpc('edit_message', { p_msg: id, p_body: body });
    const cur = (JM.curMsgs || {})[id] || { id: id, sender_id: JM.me.id, created_at: new Date().toISOString() };
    cur.body = r.body || body;
    cur.edited_at = r.edited_at || new Date().toISOString();
    JM.updateBubble(cur);
    JM.close();
    JM.toast('Message edited.', 'ok');
  };
  JM.actions.unsendmsg = function (el) {
    const id = el.dataset.id;
    JM.confirm({
      title: 'Unsend for everyone?',
      text: 'This message will be unsent for everyone in the chat.',
      ok: 'Unsend',
      danger: true,
      onOk: function () {
        JM.busy(null, async function () {
          const bubNode = document.querySelector('[data-mid="' + id + '"]');
          if (JM.micro && JM.micro.smokePoof) JM.micro.smokePoof(bubNode);
          const r = await JM.rpc('unsend_message', { p_msg: id });
          const cur = (JM.curMsgs || {})[id] || { id: id, sender_id: JM.me.id, created_at: new Date().toISOString() };
          cur.body = 'This message was unsent';
          cur.unsent_at = r.unsent_at || new Date().toISOString();
          JM.updateBubble(cur);
          JM.toast('Message unsent.');
        });
      }
    });
  };
  JM.actions.rmmsgme = function (el) {
    const id = el.dataset.id;
    JM.confirm({
      title: 'Remove for you?',
      text: 'This message will be removed from your view. The other person still sees it.',
      ok: 'Remove for me',
      danger: true,
      onOk: function () {
        JM.busy(null, async function () {
          await JM.rpc('remove_message_for_me', { p_msg: id });
          const node = document.querySelector('[data-mid="' + id + '"]');
          if (node) node.remove();
          delete (JM.curMsgs || {})[id];
          JM.toast('Removed for you.');
        });
      }
    });
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
  JM.route('/notifications', {
    auth: 'any', title: 'Notifications', render: async function () {
      const items = await JM.q(JM.sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(60));
      const unread = items.filter(function (n) { return !n.read; }).length;
      const latestAnn = items.find(function (n) { return n.type === 'announcement'; });
      const annBanner = latestAnn
        ? '<div class="jobi-announcement-banner" role="region" aria-label="Platform announcement">' +
          '<div class="jobi-announcement-mascot"></div>' +
          '<div class="grow"><div class="xs bold" style="color:var(--brand);text-transform:uppercase;letter-spacing:.04em">📢 Official Announcement · ' + JM.ago(latestAnn.created_at) + '</div>' +
          '<div class="bold" style="font-size:15px;margin-top:2px">' + esc(latestAnn.title) + '</div>' +
          '<div class="small" style="color:var(--ink2);margin-top:2px">' + esc(latestAnn.body) + '</div></div></div>'
        : '';
      return '<div class="page narrow">' + JM.pageHead('Notifications', unread ? unread + ' unread' : 'You are all caught up.', unread ? '<button class="btn secondary sm" data-act="readall">Mark all as read</button>' : '') +
        annBanner +
        (items.length ? '<div class="card list">' + items.map(function (n) {
          return '<button class="li" data-act="opennotif" data-id="' + n.id + '" data-ref="' + esc(n.ref || '') + '" style="align-items:flex-start;' + (n.read ? '' : 'background:#F5F9FF') + '"><div class="avatar" style="background:' + (n.read ? '#EEF2F7' : 'var(--brand-t)') + '">' + ic(NICON[n.type] || 'bell', 17) + '</div><div class="grow"><div class="bold">' + esc(n.title) + '</div><div class="small muted">' + esc(n.body) + '</div><div class="xs muted" style="margin-top:3px">' + JM.ago(n.created_at) + '</div></div>' + (n.read ? '' : '<span class="badge brand">New</span>') + '</button>';
        }).join('') + '</div>' : '<div class="card">' + JM.empty('bell', 'No notifications yet', 'Matches, messages and updates will appear here.') + '</div>') + '</div>';
    }
  });
  JM.actions.readall = async function (el) { await JM.busy(el, async function () { await JM.rpc('mark_all_read'); await JM.loadMe(); JM.render(); }); };
  JM.actions.opennotif = async function (el) {
    try { await JM.q(JM.sb.from('notifications').update({ read: true }).eq('id', el.dataset.id)); await JM.loadMe(); JM.updateBadges(); } catch (e) { /* ignore */ }
    const ref = el.dataset.ref; if (ref) JM.go(ref); else JM.render();
  };

  // ---------- career ----------
  const rcol = function (v) { return v >= 70 ? 'ok' : v >= 40 ? '' : 'star'; };
  JM.careerCat = JM.careerCat || '';
  JM.route('/career', {
    auth: 'seeker', title: 'Career', render: async function () {
      const o = await JM.rpc('career_overview'), g = o.goal;
      const customGoal = !g && JM.me.seeker && JM.me.seeker.goal_text;
      const goal = g ? '<div class="card card-b mb"><div class="row" style="gap:18px;flex-wrap:wrap">' + JM.ring(g.readiness.ready, 72, g.readiness.ready >= 70 ? '#14804F' : '#0C70F8') + '<div class="grow"><div class="xs muted bold" style="text-transform:uppercase;letter-spacing:.05em">Your goal</div><h2>' + esc(g.role.title) + '</h2><p class="muted small" style="margin:4px 0 0">You are ' + g.readiness.ready + '% ready. Finish roadmap tasks to raise it.</p></div><a class="btn" href="#/career/role/' + g.role.id + '">Open roadmap</a></div></div>' :
        customGoal ? '<div class="card card-b mb tint"><div class="row wrap between"><div><div class="xs muted bold" style="text-transform:uppercase;letter-spacing:.05em">Your custom goal</div><h2>' + esc(JM.me.seeker.goal_text) + '</h2><p class="small muted" style="margin:4px 0 0">Pick a similar role below to follow a structured 4-week roadmap, or update your goal anytime.</p></div><a class="btn secondary sm" href="#/profile">Edit goal</a></div></div>' :
          '<div class="notice mb">' + ic('award') + '<span>Choose a career goal in your <a href="#/profile">profile</a> to get a personal roadmap.</span></div>';
      const tracked = o.tracked.length ? '<h3 class="mb">Jobs you are going for</h3><div class="card list mb">' + o.tracked.map(function (t) {
        return '<a class="li" href="#/career/job/' + t.job_id + '" style="color:inherit"><div class="avatar sq">' + esc(JM.initials(t.company)) + '</div><div class="grow"><div class="bold">' + esc(t.title) + '</div><div class="small muted">' + esc(t.company) + ' · ' + t.reason + '</div></div><div style="width:110px">' + JM.bar(t.ready, rcol(t.ready)) + '<div class="xs muted" style="margin-top:3px;text-align:right">' + t.ready + '% ready</div></div>' + ic('right', 16) + '</a>';
      }).join('') + '</div>' : '';
      const allCats = Array.from(new Set(o.roles.map(function (r) { return r.category; }))).sort();
      const roleSearch = '<div class="mb">' + JM.typeahead({
        id: 'career-role-ta',
        minChars: 1,
        max: 10,
        placeholder: 'Search ' + o.roles.length + ' career roles by title or category…',
        source: o.roles.map(function (r) { return { value: r.id, label: r.title, group: r.category }; }),
        onPick: function (item) { JM.go('/career/role/' + item.value); }
      }) + '</div>';
      const catChips = '<div class="chips mb">' + [''].concat(allCats).map(function (c) {
        return '<button type="button" class="chip' + (JM.careerCat === c ? ' on' : '') + '" data-act="careercat" data-c="' + esc(c) + '">' + (c || 'All categories (' + o.roles.length + ')') + '</button>';
      }).join('') + '</div>';
      const filtered = JM.careerCat ? o.roles.filter(function (r) { return r.category === JM.careerCat; }) : o.roles;
      const roles = '<h3 class="mb">Explore roles</h3>' + roleSearch + catChips + '<div class="grid g3">' + filtered.map(function (r) {
        return '<a class="card card-b" href="#/career/role/' + r.id + '" style="color:inherit"><div class="xs muted">' + esc(r.category) + '</div><h3 style="margin:4px 0 8px">' + esc(r.title) + '</h3><div class="small" style="color:var(--ink2)">' + JM.peso(r.salary.min) + ' – ' + Number(r.salary.max).toLocaleString('en-PH') + ' / mo</div></a>';
      }).join('') + '</div>';
      return '<div class="page">' + JM.pageHead('Career', 'See what each job needs and build a plan to get there.') + goal + tracked + roles + '</div>';
    }
  });
  JM.actions.careercat = function (el) { JM.careerCat = el.dataset.c || ''; JM.render(); };
  const wt = function (t) { return String(t || '').replace(/^Week\s*\d+\s*:\s*/i, ''); };
  JM.openWeeks = JM.openWeeks || {};
  document.addEventListener('toggle', function (e) { const d = e.target; if (d.classList && d.classList.contains('week')) JM.openWeeks[d.dataset.w] = d.open; }, true);

  // Authoritative client-side answer & concept explanation bank for interactive quiz feedback
  const QUIZ_ANSWER_BANK = {
    'A customer is upset about a late order. What is the best first step?': [1, 'In the LAST customer service model, always Listen and Apologize first before offering a concrete fix.'],
    'Which phrase shows active listening?': [1, 'Paraphrasing or repeating back confirms understanding and reassures the customer.'],
    'You do not know the answer to a customer question. You should...': [1, 'Honesty builds trust—commit to finding the right answer and following up promptly.'],
    'In Coursera\'s Customer Service Fundamentals (LAST method), after Listening and Apologizing, what are the next two steps?': [1, 'LAST stands for Listen, Apologize, Solve, and Thank.'],
    'A repeat customer reports the same billing issue for the third time. Which KPI and action should you prioritize?': [0, 'First Contact Resolution (FCR) prioritizes owning the root cause so the customer never has to call a fourth time.'],
    'A customer wants to cancel an item after it was scanned. You should...': [0, 'Use the POS Void Item function so inventory and audit logs stay accurate.'],
    'What should you do at the end of a shift?': [0, 'Closing the till and reconciling totals against the POS Z-reading prevents unexplained variances.'],
    'A product scans at the wrong price. First step?': [1, 'Inform your supervisor and verify the shelf/system price so all customers are charged accurately.'],
    'At shift reconciliation, the POS Z-reading shows ₱14,850 in cash sales while the physical drawer has ₱14,550. What is the correct audit procedure?': [1, 'Always recount with a supervisor, inspect split/e-wallet tender logs, and document any variance officially.'],
    'A customer pays ₱1,200 using ₱500 cash and ₱700 via GCash QR. How should this be recorded in the POS?': [1, 'Split Tender records the exact amount per payment method so both cash and digital ledgers balance.'],
    'Change for ₱350 paid with a ₱500 bill is...': [1, '₱500 minus ₱350 equals ₱150 change.'],
    'How often should you check bills for authenticity?': [1, 'Checking every cash transaction consistently protects the store from counterfeit losses.'],
    'If the till is short at closing, you should...': [1, 'Never cover shortages privately; report and recount with a supervisor for transparent auditing.'],
    'Under standard retail cash-handling controls, when should a cashier perform a cash drop to the safe?': [1, 'Performing a safe drop whenever drawer cash exceeds the preset limit minimizes register risk.'],
    'A customer hands you a ₱1,000 bill that feels overly smooth and lacks the security thread watermark. What should you do?': [1, 'Politely request an alternative bill or e-wallet payment and alert your supervisor per store protocol.'],
    'Which is clearest for a message to a teammate?': [1, 'Specific action + clear deadline ("update the stock list by 3 PM today") prevents ambiguity.'],
    'Good communication includes...': [1, 'Confirming that the listener understood closes the communication loop.'],
    'Tone matters most in...': [0, 'Written messages and calls lack facial cues, so clear and respectful tone is essential.'],
    'In business communication courses, what does the "BLUF" (Bottom Line Up Front) structure achieve in an email to a manager?': [0, 'BLUF places the core request or decision in the first 1–2 sentences so busy readers grasp it immediately.'],
    'You disagree with a teammate\'s schedule change during a busy shift. Which response applies non-violent, constructive communication?': [1, 'Focus on the specific impact and propose a constructive agreement rather than blaming.'],
    'A good upsell is...': [1, 'Relevant add-ons that genuinely improve the customer’s purchase create repeat loyalty.'],
    'When is the best time to suggest an add-on?': [0, 'Once the customer commits to their main item, a complementary suggestion feels natural and helpful.'],
    'If a customer declines an add-on you should...': [0, 'Respecting a customer’s "no" gracefully keeps the checkout experience positive.'],
    'What is the key difference between upselling and cross-selling in retail?': [0, 'Upselling upgrades the main item (e.g. size/tier), whereas cross-selling pairs a complementary item.'],
    'A customer is buying a budget laptop for schoolwork. Which recommendation builds trust and increases basket value?': [1, 'Matching accessories (sleeve + student warranty) to their actual need and budget builds trust.'],
    'Which formula adds cells A1 to A5?': [1, '=SUM(A1:A5) is the standard Excel range addition function.'],
    'What does a filter do?': [1, 'Filters temporarily display only rows matching your criteria without deleting data.'],
    'To lock a cell reference in a formula you use...': [0, 'Dollar signs ($A$1) create an absolute reference that stays fixed when copied.'],
    'In Excel (Coursera Data Skills), which formula safely looks up a price in column B by product ID in A2 without breaking when columns are inserted?': [1, 'XLOOKUP references the lookup and return columns directly, so inserting columns never breaks column indices.'],
    'You need total sales in C2:C50 only for rows where Branch (A2:A50) is "Biñan" and Status (B2:B50) is "Paid". Which formula is correct?': [0, 'SUMIFS sums a range based on multiple criteria ranges and values.'],
    'Espresso that tastes very bitter is often...': [1, 'Over-extraction (too slow/fine/hot) pulls excess bitter compounds from the coffee grounds.'],
    'Milk for a latte should be steamed until...': [1, 'Steaming to ~60–65°C creates sweet, silky microfoam without scalding the milk proteins.'],
    'Before service you should...': [0, 'Dialing in the grinder and flushing the machine ensures consistent shot quality from the first cup.'],
    'Your 18g espresso dose yields 36g of liquid in 16 seconds and tastes sour and watery. How should you calibrate the grinder?': [1, 'A fast, sour shot is under-extracted; grinding finer increases resistance to reach the 25–30s sweet spot.'],
    'When steaming milk for a flat white versus a cappuccino, what is the main textural difference?': [0, 'Flat whites use a thin layer of velvety microfoam, while cappuccinos incorporate more aeration for thicker foam.'],
    'The danger zone for food temperature is roughly...': [0, 'Bacteria multiply rapidly between 5°C and 60°C.'],
    'You should wash hands...': [1, 'Handwashing before food prep and after touching raw ingredients prevents cross-contamination.'],
    'Raw meat should be stored...': [1, 'Storing raw meat on the bottom shelf prevents juices from dripping onto ready-to-eat food.'],
    'In HACCP food safety standards, what is the maximum total time potentially hazardous food may stay in the temperature danger zone (5°C–60°C) before it must be discarded?': [0, 'HACCP limits cumulative time in the temperature danger zone to 4 hours maximum.'],
    'A kitchen staff member has a minor cut on their finger. What is the compliant food-safety action before returning to prep?': [1, 'A waterproof colored bandage covered by a single-use food-safe glove protects both worker and food.'],
    'Every transaction is recorded as...': [1, 'Double-entry bookkeeping records every transaction with equal debit and credit entries.'],
    'A receipt for supplies is recorded as...': [0, 'Consumable supplies used in operations are recorded as an expense.'],
    'Reconciling means...': [0, 'Reconciliation verifies that internal ledger balances match external bank or cash statements.'],
    'Under accrual accounting, a client pays ₱12,000 upfront in January for 3 months of service (Jan–Mar). How much revenue is recognized in January?': [1, 'Accrual accounting recognizes revenue as it is earned (₱4,000/month), holding the rest as Unearned Revenue.'],
    'Which entry correctly records buying ₱5,000 of office supplies on credit (Accounts Payable)?': [0, 'Increasing an asset/supply is a Debit to Office Supplies, and increasing a liability is a Credit to Accounts Payable.'],
    'Good contrast helps...': [0, 'High contrast between text and background ensures legibility across devices and lighting.'],
    'Too many fonts on one poster usually makes it...': [1, 'Limiting a layout to 2–3 complementary typefaces keeps visual hierarchy clean.'],
    'A logo should work in...': [0, 'A versatile logo remains recognizable in monochrome and on both light and dark surfaces.'],
    'When preparing a poster for commercial offset printing vs. Instagram, which color mode and resolution should you export?': [0, 'Offset print requires CMYK at 300 DPI, while digital screens use RGB at 72–150 DPI.'],
    'Visual hierarchy guides the viewer\'s eye first to the key message. Which combination creates the strongest hierarchy?': [1, 'Clear scale/weight contrast paired with generous whitespace directs attention immediately.'],
    'Which tag makes the biggest heading?': [1, '<h1> is the top-level semantic heading in HTML.'],
    'CSS is used to...': [0, 'CSS controls layout, colors, typography, and visual presentation.'],
    'Which attribute gives an image alternative text?': [0, 'The alt attribute provides accessible text for screen readers and fallback display.'],
    'In responsive CSS, which rule lets a 3-column grid automatically stack into 1 column on narrow screens without fixed pixel breakpoints?': [0, 'repeat(auto-fit, minmax(260px, 1fr)) fluidly wraps columns as viewport width changes.'],
    'Why should interactive controls use semantic <button> elements instead of clickable <div> elements?': [0, 'Native <button> elements provide keyboard focus, Enter/Space activation, and assistive role out of the box.'],
    'Your first step when a PC will not start is usually...': [1, 'Always verify physical power, outlets, and cable connections first.'],
    'A good troubleshooter...': [1, 'Testing one variable at a time isolates the true root cause.'],
    'If a user cannot connect to Wi-Fi, check...': [0, 'Checking if other devices connect immediately tells you whether the issue is the router or the single device.'],
    'A user can ping 8.8.8.8 by IP address, but websites fail to load by domain name. Where is the fault?': [0, 'Reachable IP + failing domain names points directly to a DNS resolution issue.'],
    'Following the CompTIA/Google IT Support troubleshooting methodology, what should you do right after establishing a theory of probable cause?': [1, 'Test the theory to confirm the root cause before executing invasive repairs.'],
    'FIFO means...': [0, 'First In, First Out rotates older stock first to prevent expiration or obsolescence.'],
    'A regular stock count helps you...': [0, 'Routine cycle counts catch shrinkage, misplacements, and stockouts early.'],
    'Fast-moving items should be kept...': [0, 'Placing high-turnover items in accessible zones speeds up fulfillment.'],
    'A café uses 40 bags of coffee beans per week, supplier lead time is 2 weeks, and safety stock is 25 bags. What is the Reorder Point (ROP)?': [1, 'ROP = (40 bags/wk × 2 weeks lead time) + 25 safety stock = 105 bags.'],
    'During cycle counting, physical stock is 48 units while the system shows 55 units. What is the best next step?': [1, 'Recount, verify recent receipts/sales logs, and log a supervisor-approved variance adjustment.'],
    'Instruments should be cleaned before sterilizing to...': [0, 'Organic debris shields microbes from steam/chemicals, so thorough pre-cleaning is mandatory.'],
    'Sterilized packs should be stored...': [0, 'Sterile packs must stay dry, sealed, and away from contamination sources.'],
    'If a pack is torn or wet, you should...': [1, 'Any compromised or wet sterile barrier must be fully reprocessed before use.'],
    'A content calendar helps you...': [0, 'Planning posts ahead maintains consistent cadence and campaign alignment.'],
    'Which metric shows how many people saw your post?': [0, 'Reach measures the number of unique people who viewed your content.'],
    'When a customer comments a complaint you should...': [0, 'Respond empathetically in public and invite them to DM to resolve personal details privately.'],
    'Your local shop\'s Reel got 10,000 views but only 12 link clicks (0.12% CTR). Which change directly addresses the bottleneck?': [1, 'High views with low clicks means the call-to-action and value proposition need to be clearer.'],
    'What is the purpose of UTM parameters on links shared in social campaigns?': [0, 'UTM tags let analytics attribute traffic and conversions to the exact platform and post.']
  };
  JM.QUIZ_ANSWER_BANK = QUIZ_ANSWER_BANK;

  // Bind keyboard navigation (ArrowUp/ArrowDown/ArrowLeft/ArrowRight/Home/End) & mount Jomo on active winding roadmap node
  JM.mountCareerRoadmap = function (root) {
    const scope = root || document;
    const winding = scope.querySelector ? scope.querySelector('.jobi-roadmap-winding') : null;
    if (!winding) return;

    const activeSlot = winding.querySelector('.jobi-node-mascot-slot[data-mount-jobi="1"]');
    if (activeSlot && !activeSlot._jobiMounted && JM.mascot) {
      activeSlot._jobiMounted = true;
      const isQuizSlot = activeSlot.dataset.nodeType === 'quiz';
      JM.mascot.mount(activeSlot, {
        emotion: isQuizSlot ? 'star_eyes' : 'curious',
        prop: isQuizSlot ? 'graduation-cap' : 'map',
        animation: isQuizSlot ? 'bounce' : 'idle',
        size: 62,
        ariaLabel: 'Jomo on your current active learning node'
      });
    }

    if (!winding._kbBound) {
      winding._kbBound = true;
      winding.addEventListener('keydown', function (e) {
        const node = e.target && e.target.closest ? e.target.closest('.jobi-path-node') : null;
        if (!node) return;
        const nodes = Array.from(winding.querySelectorAll('.jobi-path-node'));
        const idx = nodes.indexOf(node);
        if (idx < 0) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          const next = nodes[Math.min(nodes.length - 1, idx + 1)];
          if (next) next.focus();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const prev = nodes[Math.max(0, idx - 1)];
          if (prev) prev.focus();
        } else if (e.key === 'Home') {
          e.preventDefault();
          if (nodes[0]) nodes[0].focus();
        } else if (e.key === 'End') {
          e.preventDefault();
          if (nodes[nodes.length - 1]) nodes[nodes.length - 1].focus();
        }
      });
    }

    // Animate readiness ring & check 50 / 75 / 100% readiness milestones
    const readyRingWrap = scope.querySelector ? scope.querySelector('#bd-readiness-ring') : null;
    if (readyRingWrap && JM.bd && JM.bd.readiness && JM.bd.role) {
      const readyPct = Number(JM.bd.readiness.ready) || 0;
      const roleId = JM.bd.role.id;
      const roleTitle = JM.bd.role.title;
      const prevReady = JM._lastRoleReadiness && JM._lastRoleReadiness[roleId];
      JM._lastRoleReadiness = JM._lastRoleReadiness || {};
      JM._lastRoleReadiness[roleId] = readyPct;

      const ringEl = readyRingWrap.querySelector('.ring');
      if (ringEl && JM.micro && JM.micro.countUpRing && prevReady != null && readyPct !== prevReady) {
        JM.micro.countUpRing(ringEl, readyPct, prevReady);
      }

      if (JM.reward && JM.milestones) {
        if (readyPct >= 100 && !JM.milestones.has('seeker_ready_' + roleId + '_100')) {
          setTimeout(function () {
            JM.reward({
              id: 'seeker_ready_' + roleId + '_100',
              tier: 3,
              repeatTier: 2,
              emotion: 'proud',
              prop: 'graduation-cap',
              animation: 'cheer',
              badge: '100% Role Readiness',
              title: "You're ready for " + roleTitle + "!",
              copy: 'You reached 100% skill readiness for this career path. Explore matching jobs hiring right now!',
              confetti: true,
              cta: {
                label: 'Browse matching jobs',
                onClick: function () { JM.go('/deck'); }
              }
            });
          }, 180);
        } else if (readyPct >= 75 && readyPct < 100 && prevReady != null && prevReady < 75 && !JM.milestones.has('seeker_ready_' + roleId + '_75')) {
          JM.reward({
            id: 'seeker_ready_' + roleId + '_75',
            tier: 2,
            repeatTier: null,
            emotion: 'star_eyes',
            prop: 'graduation-cap',
            animation: 'bounce',
            title: '75% Ready for ' + roleTitle + '!',
            copy: 'You meet the hiring bar for most employers in this role.'
          });
        } else if (readyPct >= 50 && readyPct < 75 && prevReady != null && prevReady < 50 && !JM.milestones.has('seeker_ready_' + roleId + '_50')) {
          JM.reward({
            id: 'seeker_ready_' + roleId + '_50',
            tier: 2,
            repeatTier: null,
            emotion: 'happy',
            prop: 'graduation-cap',
            animation: 'bounce',
            title: 'Halfway there — 50% ready for ' + roleTitle + '!',
            copy: 'Keep checking off roadmap tasks to boost your match scores.'
          });
        }
      }
    }
  };

  // Saved job match crosses 75% after learning: ties learning progress to a real saved listing
  JM.checkSavedJobMatchBoost = async function (overrideList) {
    if (!JM.reward || !JM.milestones) return null;
    try {
      const saved = Array.isArray(overrideList) ? overrideList : await JM.rpc('get_preferred');
      if (!Array.isArray(saved) || !saved.length) return null;
      const crossed = saved.find(function (x) {
        const j = x && x.job;
        const sc = j && j.match && Number(j.match.score);
        return j && sc >= 75 && !JM.milestones.has('seeker_saved_75_' + j.id);
      });
      if (!crossed) return null;
      const j = crossed.job;
      const sc = Number(j.match.score);
      const compName = (j.company && j.company.name) || 'a verified employer';
      return JM.reward({
        id: 'seeker_saved_75_' + j.id,
        tier: 2,
        repeatTier: null,
        emotion: 'star_eyes',
        prop: 'briefcase',
        animation: 'cheer',
        confetti: true,
        title: "You're now a " + sc + "% match for " + j.title + " at " + compName + "!",
        copy: 'Your new skills boosted your match score on a job you saved.'
      });
    } catch (e) {
      return null;
    }
  };

  async function breakdownPage(kind, id) {
    const b = await JM.rpc('breakdown', { p_kind: kind, p_id: id });
    if (!b) return '<div class="page narrow">' + JM.empty('award', 'No breakdown for this job yet', 'This listing is not linked to a career role.', '<a class="btn" href="#/career">Back to Career</a>') + '</div>';
    JM.bd = b; const r = b.role, rd = b.readiness, s = b.salary, pro = b.pro;
    const needs = rd.skills.filter(function (x) { return x.pct < 70; });

    // Determine the active week node where Jomo should perch
    const activeWeekObj = b.weeks.find(function (x) { return !x.locked && (x.tasks || []).some(function (t) { return !t.done; }); }) ||
      b.weeks.filter(function (x) { return !x.locked; }).slice(-1)[0] ||
      b.weeks[0] || { week: 1 };
    const activeWeekNum = activeWeekObj.week;

    const aligns = ['left', 'right', 'left', 'right', 'left'];
    const weeks = '<div class="jobi-roadmap-winding" role="region" aria-label="Career learning winding roadmap">' +
      b.weeks.map(function (w, idx) {
        const tasks = w.tasks || [];
        const prelimTasks = tasks.filter(function (t) { return t.type !== 'quiz' && !t.adaptive; });
        const quizTask = tasks.find(function (t) { return t.type === 'quiz'; });
        const done = tasks.filter(function (t) { return t.done; }).length;
        const allDone = !w.locked && tasks.length > 0 && done === tasks.length;
        const isCurrentWeek = w.week === activeWeekNum && !w.locked;
        const key = kind + id + w.week;
        const open = JM.openWeeks[key] != null ? JM.openWeeks[key] : isCurrentWeek;
        const quizReady = !w.locked && w.quiz_ready !== false && prelimTasks.every(function (t) { return t.done; });
        const quizDone = !!(quizTask && quizTask.done);
        const quizIlluminated = !w.locked && quizReady && !quizDone;

        // Mount Jomo on the illuminated quiz node if preliminary tasks are done, otherwise on the active week node
        const mountOnQuiz = isCurrentWeek && quizIlluminated;
        const mountOnWeek = isCurrentWeek && !mountOnQuiz;

        const align = aligns[idx % aligns.length];
        const weekStatusText = w.locked ? 'Locked' : allDone ? 'Completed' : isCurrentWeek ? 'Current active week' : 'Unlocked';
        const weekNodeCls = w.locked ? 'is-locked' : allDone ? 'is-done' : isCurrentWeek ? 'is-active' : '';

        // Earned 1-3 stars on quiz checkpoint
        let starsHtml = '';
        if (quizTask && quizTask.quiz && quizTask.quiz.total > 0 && quizDone) {
          const ratio = quizTask.quiz.score / quizTask.quiz.total;
          const starCnt = ratio >= 0.95 ? 3 : ratio >= 0.8 ? 2 : 1;
          starsHtml = '<span class="jobi-node-stars" aria-label="' + starCnt + ' of 3 stars earned">' + '★'.repeat(starCnt) + '</span>';
        }

        const pipsHtml = prelimTasks.length ? '<div class="jobi-path-pips" aria-hidden="true">' +
          prelimTasks.map(function (pt) {
            return '<span class="jobi-path-pip' + (pt.done ? ' is-done' : '') + '"></span>';
          }).join('') + '</div>' : '';

        const quizNodeCls = w.locked || !quizReady ? 'is-locked' : quizDone ? 'is-done' : 'is-illuminated';
        const quizStatusText = w.locked ? 'Locked' : quizDone ? ('Passed ' + (quizTask && quizTask.quiz ? quizTask.quiz.score + '/' + quizTask.quiz.total : '')) : quizReady ? 'Ready to take quiz' : 'Complete preliminary tasks to unlock';

        const quizNodeHtml = quizTask
          ? '<button type="button" class="jobi-path-node jobi-node-quiz ' + quizNodeCls + '" data-week="' + w.week + '" ' +
            (quizReady && !w.locked ? 'data-act="quiz" data-id="' + quizTask.id + '"' : 'data-act="pathnode" data-w="' + key + '"') +
            ' aria-label="Week ' + w.week + ' Quiz Checkpoint: ' + esc(quizTask.skill) + ' — ' + esc(quizStatusText) + '">' +
            (mountOnQuiz ? '<div class="jobi-node-mascot-slot" data-mount-jobi="1" data-node-type="quiz"></div>' : '') +
            ic(quizDone ? 'award' : (quizReady ? 'zap' : 'lock'), 20) +
            '<span class="jobi-node-lbl">Quiz</span>' +
            starsHtml +
            '</button>'
          : '';

        const connectorSvg = idx < b.weeks.length - 1
          ? '<svg class="jobi-path-connector" viewBox="0 0 160 44" aria-hidden="true">' +
            '<path d="' + (align === 'left' ? 'M 48 2 C 48 24, 112 20, 112 42' : 'M 112 2 C 112 24, 48 20, 48 42') + '" fill="none" stroke="' + (allDone ? '#14804F' : '#CBD5E1') + '" stroke-width="3.5" stroke-dasharray="7 6" stroke-linecap="round"/>' +
            '</svg>'
          : '';

        const stationBody = w.locked
          ? '<div class="week jobi-station-card" id="week-panel-' + w.week + '"><div style="padding:14px 16px" class="row">' + ic('lock', 16) + '<b class="grow">Week ' + w.week + ': ' + esc(wt(w.title)) + '</b>' + (w.pro_locked ? '<a class="btn sm" href="#/pro">Unlock with Pro</a>' : '<span class="badge warn">Complete Week ' + (w.week - 1) + ' to unlock</span>') + '</div></div>'
          : '<details class="week jobi-station-card' + (isCurrentWeek ? ' is-active-station' : '') + '" id="week-panel-' + w.week + '" data-w="' + key + '"' + (open ? ' open' : '') + '><summary><span class="grow">Week ' + w.week + ': ' + esc(wt(w.title)) + '</span><span class="small muted">' + done + '/' + tasks.length + '</span>' + ic('down', 16) + '</summary>' + tasks.map(function (t) {
            const quiz = t.type === 'quiz', tag = t.adaptive ? 'Review' : quiz ? 'Quiz' : t.type === 'practice' ? 'Practice' : 'Learn';
            return '<div class="task' + (t.done ? ' done' : '') + '">' + (quiz ? '<span class="avatar" style="width:26px;height:26px;background:' + (t.done ? 'var(--ok-t)' : (quizReady ? '#FFF4DC' : '#EEF2F7')) + ';color:' + (t.done ? 'var(--ok)' : (quizReady ? '#B86E00' : 'var(--muted)')) + '">' + ic(t.done ? 'check' : (quizReady ? 'zap' : 'lock'), 14) + '</span>' :
              '<label class="switch" style="width:34px;height:20px;margin-top:2px"><input type="checkbox" data-act="task" data-id="' + t.id + '"' + (t.done ? ' checked' : '') + ' aria-label="Mark ' + esc(t.text) + ' done"><i></i></label>') +
              '<div class="grow"><div class="t">' + esc(t.text) + '</div><div class="row gap-s wrap xs" style="margin-top:5px">' + JM.badge(tag, t.adaptive ? 'warn' : quiz ? 'brand' : '') + '<span class="muted">' + esc(t.skill) + '</span>' + (t.quiz ? '<span class="badge ok">Score ' + t.quiz.score + '/' + t.quiz.total + '</span>' : '') +
              (quiz && !quizReady ? '<span class="badge warn">Complete preliminary tasks first</span>' : '') +
              (t.course ? '<a href="' + esc(t.course.url) + '" target="_blank" rel="noopener" data-act="course" data-role="' + r.id + '" data-title="' + esc(t.course.title) + '" data-provider="' + esc(t.course.provider) + '" data-url="' + esc(t.course.url) + '">' + esc(t.course.title) + ' ' + ic('ext', 12) + '</a>' : '') + '</div></div>' +
              (quiz ? '<button class="btn secondary sm" data-act="quiz" data-id="' + t.id + '"' + (quizReady ? '' : ' disabled title="Complete all preliminary tasks in this week first"') + '>' + (t.quiz ? 'Retake' : 'Take quiz') + '</button>' : '') + '</div>';
          }).join('') + '</details>';

        return '<div class="jobi-path-station" data-week="' + w.week + '" data-align="' + align + '">' +
          '<div class="jobi-chapter-pill ' + (w.locked ? 'is-locked' : allDone ? 'is-done' : '') + '">' +
            '<span>Week ' + w.week + ' · ' + esc(wt(w.title)) + '</span>' +
            '<span>' + (w.locked ? '🔒' : allDone ? '✓ Done' : (done + '/' + tasks.length)) + '</span>' +
          '</div>' +
          '<div class="jobi-path-pedestal">' +
            '<button type="button" class="jobi-path-node jobi-node-week ' + weekNodeCls + '" data-act="pathnode" data-w="' + key + '" data-panel="week-panel-' + w.week + '" ' +
              (isCurrentWeek ? 'aria-current="step" ' : '') +
              'aria-expanded="' + !!open + '" aria-controls="week-panel-' + w.week + '" ' +
              'aria-label="Week ' + w.week + ': ' + esc(wt(w.title)) + ' — ' + weekStatusText + ', ' + done + ' of ' + tasks.length + ' tasks completed">' +
              (mountOnWeek ? '<div class="jobi-node-mascot-slot" data-mount-jobi="1" data-node-type="week"></div>' : '') +
              ic(w.locked ? 'lock' : allDone ? 'check' : 'book', 20) +
              '<span class="jobi-node-lbl">W' + w.week + '</span>' +
            '</button>' +
            pipsHtml +
            quizNodeHtml +
          '</div>' +
          stationBody +
          connectorSvg +
          '</div>';
      }).join('') + '</div>';

    let totTasks = 0, doneTasks = 0, qPassed = 0, qTotal = 0, qScoreSum = 0, qMaxSum = 0;
    const weekBars = b.weeks.map(function (w) {
      const ts = w.tasks || [], dn = ts.filter(function (t) { return t.done; }).length;
      totTasks += ts.length; doneTasks += dn;
      ts.forEach(function (t) { if (t.type === 'quiz') { qTotal++; if (t.quiz) { qScoreSum += t.quiz.score; qMaxSum += t.quiz.total; if (t.done) qPassed++; } } });
      const pct = ts.length ? Math.round(dn / ts.length * 100) : 0;
      return '<div class="b" title="Week ' + w.week + ': ' + pct + '%"><span>' + (w.locked ? 'Locked' : pct + '%') + '</span><i style="height:' + Math.max(4, pct) + '%;opacity:' + (w.locked ? '.25' : '1') + '"></i><span>W' + w.week + '</span></div>';
    }).join('');
    const overallPct = totTasks ? Math.round(doneTasks / totTasks * 100) : 0;
    const avgQuizPct = qMaxSum ? Math.round(qScoreSum / qMaxSum * 100) + '%' : '–';
    const progressCard = '<div class="card card-b mb"><div class="row between mb"><h3>Learning progress</h3><span class="small muted">' + doneTasks + ' of ' + totTasks + ' unlocked tasks done (' + overallPct + '%)</span></div>' +
      JM.bar(overallPct, 'ok thick') +
      '<div class="grid g3 keep mt"><div class="card flat stat"><div class="n num">' + doneTasks + '/' + totTasks + '</div><div class="l">Tasks completed</div></div><div class="card flat stat"><div class="n num">' + qPassed + '/' + qTotal + '</div><div class="l">Quizzes passed</div></div><div class="card flat stat"><div class="n num">' + avgQuizPct + '</div><div class="l">Avg quiz score</div></div></div>' +
      '<div class="bars mt" role="img" aria-label="Weekly roadmap progress" style="height:110px">' + weekBars + '</div></div>';
    const growth = pro ? (b.growth || []).map(function (g, i) { return '<div class="row" style="padding:10px 0;border-top:' + (i ? '1px solid var(--line)' : '0') + '"><span class="badge ' + (i === 0 ? 'brand' : '') + '">' + esc(g.level) + '</span><b class="grow">' + esc(g.title) + '</b><span class="small muted">' + JM.peso(g.min) + ' – ' + Number(g.max).toLocaleString('en-PH') + '</span></div>'; }).join('') : '';
    const courses = pro ? (b.courses || []).map(function (c) { return '<a class="li" style="padding:12px 0" href="' + esc(c.url) + '" target="_blank" rel="noopener" data-act="course" data-role="' + r.id + '" data-title="' + esc(c.title) + '" data-provider="' + esc(c.provider) + '" data-url="' + esc(c.url) + '"><div class="grow"><div class="bold">' + esc(c.title) + '</div><div class="xs muted">' + esc(c.provider) + '</div></div>' + ic('ext', 15) + '</a>'; }).join('') : '';
    const lockCard = '<div class="card card-b"><div class="row">' + ic('lock', 20) + '<div class="grow"><b>Growth path and courses</b><div class="small muted">See where this career leads, salary at each level and recommended courses.</div></div><a class="btn sm" href="#/pro">Unlock with Pro</a></div></div>';
    JM.setTitle && JM.setTitle(r.title);
    return '<div class="page"><a class="small row gap-s" href="#/career" style="margin-bottom:14px">' + ic('left', 16) + 'Career</a>' +
      '<div class="card card-b mb"><div class="row" style="gap:18px;flex-wrap:wrap;align-items:flex-start"><div id="bd-readiness-ring">' + JM.ring(rd.ready, 76, rd.ready >= 70 ? '#14804F' : '#0C70F8') + '</div><div class="grow" style="min-width:240px"><div class="xs muted">' + esc(r.category) + (b.job ? ' · from ' + esc(b.job.company) : '') + '</div><h1 style="font-size:24px;margin:2px 0 6px">' + esc(r.title) + '</h1><p class="muted" style="margin:0">' + esc(r.overview) + '</p></div>' +
      '<div><div class="xs muted">Typical pay</div><b style="font-size:18px">' + JM.peso(s.min) + ' – ' + Number(s.max).toLocaleString('en-PH') + '</b><div class="xs muted" style="max-width:190px">' + esc(s.source) + '</div></div></div></div>' +
      progressCard +
      '<div class="grid g2" style="align-items:start"><div><div class="card mb"><div class="card-h"><h3>Skill readiness</h3></div><div class="card-b">' + rd.skills.map(function (x) { return '<div class="skill"><div class="row between"><span>' + esc(x.name) + ' <span class="xs muted">· ' + esc(JM.skillCatName(x.name)) + '</span></span><b class="num">' + x.pct + '%</b></div>' + JM.bar(x.pct, rcol(x.pct)) + '</div>'; }).join('') +
      (needs.length ? '<p class="small muted" style="margin:0">Focus on ' + needs.slice(0, 3).map(function (n) { return '<b>' + esc(n.name) + '</b>'; }).join(', ') + ' first.</p>' : '<p class="small" style="margin:0;color:var(--ok)">You meet the bar for every skill. Time to apply.</p>') + '</div></div>' +
      '<div class="card mb"><div class="card-h"><h3>What you will do</h3></div><div class="card-b"><ul class="small" style="margin:0;padding-left:18px;line-height:1.8;color:var(--ink2)">' + (r.duties || []).map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul></div></div></div>' +
      '<div><h3 class="mb">Your winding roadmap</h3>' + weeks + '<div class="mt">' + (pro ? '<div class="card mb"><div class="card-h"><h3>Growth path</h3></div><div class="card-b">' + growth + '</div></div><div class="card"><div class="card-h"><h3>Recommended courses</h3></div><div class="card-b list" style="padding-top:0;padding-bottom:0">' + courses + '</div></div>' : lockCard) + '</div></div></div></div>';
  }
  JM.route('/career/:kind/:id', {
    auth: 'seeker',
    title: 'Career breakdown',
    render: function (p) { return breakdownPage(p.kind === 'job' ? 'job' : 'role', p.id); },
    after: function () { if (JM.mountCareerRoadmap) JM.mountCareerRoadmap(document); }
  });
  JM.actions.pathnode = function (el) {
    const wKey = el.dataset.w;
    const det = wKey ? document.querySelector('details.week[data-w="' + wKey + '"]') : null;
    if (det) {
      det.open = !det.open;
      JM.openWeeks[wKey] = det.open;
      el.setAttribute('aria-expanded', String(det.open));
      if (det.open && det.scrollIntoView) det.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      JM.toast('Complete the previous week or unlock with Pro to open this station.');
    }
  };
  JM.actions.task = async function (el) {
    const on = el.checked;
    try {
      await JM.rpc('toggle_task', { p_task: el.dataset.id, p_done: on });
      if (on) {
        if (JM.micro && JM.micro.taskPlusOne) JM.micro.taskPlusOne(el);
        if (JM.bd && Array.isArray(JM.bd.weeks)) {
          let completedWeek = null;
          let nextWeekTitle = '';
          let quizJustUnlockedWeek = null;
          let quizSkillName = '';
          JM.bd.weeks.forEach(function (w, idx) {
            const ts = w.tasks || [];
            const found = ts.find(function (t) { return String(t.id) === String(el.dataset.id); });
            if (found) {
              found.done = true;
              const prelims = ts.filter(function (t) { return t.type !== 'quiz' && !t.adaptive; });
              const qTask = ts.find(function (t) { return t.type === 'quiz'; });
              if (prelims.length && prelims.every(function (t) { return t.done; }) && qTask && !qTask.done) {
                quizJustUnlockedWeek = w.week;
                quizSkillName = qTask.skill;
              }
              if (ts.every(function (t) { return t.done; })) {
                completedWeek = w.week;
                const nw = JM.bd.weeks[idx + 1];
                if (nw) nextWeekTitle = 'Week ' + nw.week + ': ' + wt(nw.title);
              }
            }
          });
          if (completedWeek && JM.reward) {
            if (JM.micro && JM.micro.chapterWalkBanner) JM.micro.chapterWalkBanner(completedWeek, nextWeekTitle);
            JM.reward({
              id: 'seeker_week_complete_' + (JM.bd.role ? JM.bd.role.id : 'role') + '_w' + completedWeek,
              tier: 3,
              repeatTier: 2,
              emotion: 'cheering',
              prop: 'graduation-cap',
              animation: 'cheer',
              badge: 'Week ' + completedWeek + ' Complete!',
              title: 'You finished Week ' + completedWeek + '!',
              copy: (nextWeekTitle ? 'Jomo walked to ' + nextWeekTitle + '. ' : '') + 'Your skill readiness score climbed!',
              confetti: true
            });
          } else if (quizJustUnlockedWeek && JM.micro && JM.micro.hopToQuizNode) {
            JM.micro.hopToQuizNode(quizJustUnlockedWeek, quizSkillName);
          }
        }
        if (JM.checkSavedJobMatchBoost) JM.checkSavedJobMatchBoost();
      }
      JM.render();
    } catch (e) { el.checked = !on; JM.toast(JM.err(e), 'bad'); }
  };
  JM.actions.course = function (el) { JM.rpc('save_course_click', { p_role: el.dataset.role, p_title: el.dataset.title, p_provider: el.dataset.provider, p_url: el.dataset.url }).catch(function () { }); };

  function bindQuizInstantFeedback(questions) {
    const qMap = {};
    (questions || []).forEach(function (q) { qMap[String(q.id)] = q; });
    const root = document.getElementById('overlay-root');
    if (!root) return;
    root.querySelectorAll('.opt input[type=radio]').forEach(function (inp) {
      if (inp._jobiQuizBound) return;
      inp._jobiQuizBound = true;
      inp.addEventListener('change', function () {
        const optLabel = inp.closest('.opt');
        const qId = inp.dataset.qid;
        const qObj = qMap[String(qId)] || (JM._quiz && JM._quiz.qs && JM._quiz.qs[JM._quiz.idx]);
        if (!qObj || !JM.micro || !JM.micro.quizAnswerFeedback) return;
        const bankEntry = QUIZ_ANSWER_BANK[qObj.question];
        const correctIdx = qObj.answer != null ? Number(qObj.answer) : (bankEntry ? bankEntry[0] : null);
        const explanation = (qObj.explanation) || (bankEntry ? bankEntry[1] : ('Key skill concept for ' + ((JM._quiz && JM._quiz.skill) || 'this module') + '.'));
        if (correctIdx != null) {
          const pickedIdx = Number(inp.value);
          JM.micro.quizAnswerFeedback(optLabel, pickedIdx === correctIdx, explanation);
        } else {
          JM.micro.quizAnswerFeedback(optLabel, true, explanation);
        }
      });
    });
  }

  JM.actions.quiz = async function (el) {
    await JM.busy(el, async function () {
      const q = await JM.rpc('quiz_for_task', { p_task: el.dataset.id });
      const courseUrl = (q.course && q.course.url) || ('https://www.coursera.org/search?query=' + encodeURIComponent(q.skill));
      const isFree = JM.me.seeker.plan !== 'pro';
      if (isFree && q.questions.length > 1) {
        // Free plan: forward-only 1-question-at-a-time mode (no backtracking)
        JM._quiz = { task: el.dataset.id, skill: q.skill, courseUrl: courseUrl, qs: q.questions, idx: 0, ans: {} };
        renderFreeQuizStep();
        return;
      }
      const body = q.questions.length ? q.questions.map(function (x, i) { return '<fieldset style="border:0;padding:0;margin:0 0 16px"><legend class="bold" style="margin-bottom:8px">' + (i + 1) + '. ' + esc(x.question) + '</legend>' + x.options.map(function (o, k) { return '<label class="opt"><input type="radio" name="q' + x.id + '" data-qid="' + x.id + '" value="' + k + '" required><span>' + esc(o) + '</span></label>'; }).join('') + '</fieldset>'; }).join('') :
        '<p class="muted">There is no quiz for this skill yet. Rate how confident you feel.</p><div class="chips mb">' + [1, 2, 3, 4, 5].map(function (n) { return '<label class="chip"><input type="radio" name="confidence" value="' + n + '" required><span>' + n + '</span></label>'; }).join('') + '</div>';
      JM.modal('<h2>' + esc(q.skill) + ' quiz</h2><p class="muted mt mb">Aligned with Coursera study materials. Score 70% or higher to pass. <a href="' + esc(courseUrl) + '" target="_blank" rel="noopener">Review on Coursera ' + ic('ext', 12) + '</a></p><form data-form="quiz" data-task="' + el.dataset.id + '">' + body + '<div class="row" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn" type="submit">Submit</button></div></form>', 'wide');
      bindQuizInstantFeedback(q.questions);
    });
  };
  function renderFreeQuizStep() {
    const st = JM._quiz, x = st.qs[st.idx], isLast = st.idx === st.qs.length - 1;
    JM.modal(
      '<h2>' + esc(st.skill) + ' quiz (' + (st.idx + 1) + ' of ' + st.qs.length + ')</h2>' +
      '<p class="xs muted mt mb">Free Plan: forward-only mode (backtracking requires Monthly or Annual Plan). <a href="' + esc(st.courseUrl) + '" target="_blank" rel="noopener">Review on Coursera ' + ic('ext', 12) + '</a></p>' +
      '<form data-form="quizstep"><fieldset style="border:0;padding:0;margin:0 0 16px"><legend class="bold" style="margin-bottom:10px">' + (st.idx + 1) + '. ' + esc(x.question) + '</legend>' +
      x.options.map(function (o, k) { return '<label class="opt"><input type="radio" name="choice" data-qid="' + x.id + '" value="' + k + '" required><span>' + esc(o) + '</span></label>'; }).join('') +
      '</fieldset><div class="row" style="justify-content:flex-end"><button type="button" class="btn secondary" data-act="close">Cancel</button><button class="btn" type="submit">' + (isLast ? 'Submit quiz' : 'Next question') + '</button></div></form>',
      'wide'
    );
    bindQuizInstantFeedback([x]);
  }
  function showQuizResultModal(taskId, r) {
    let weekFullyDone = false;
    let weekNum = null;
    let nextWeekTitle = '';
    if (r.passed && JM.bd && Array.isArray(JM.bd.weeks)) {
      JM.bd.weeks.forEach(function (w, idx) {
        const ts = w.tasks || [];
        const found = ts.find(function (t) { return String(t.id) === String(taskId); });
        if (found) {
          found.done = true;
          weekNum = w.week;
          if (ts.every(function (t) { return t.done; })) {
            weekFullyDone = true;
            const nw = JM.bd.weeks[idx + 1];
            if (nw) nextWeekTitle = 'Week ' + nw.week + ': ' + wt(nw.title);
          }
        }
      });
    }
    const total = Math.max(1, Number(r.total) || 1);
    const score = Number(r.score) || 0;
    const pct = Math.round((score / total) * 100);
    const isPerfect = r.passed && score >= total;
    const starCount = !r.passed ? 0 : (pct >= 95 ? 3 : pct >= 80 ? 2 : 1);
    const starsRowHtml = '<div class="jobi-quiz-stars-row" aria-label="' + starCount + ' of 3 stars earned">' +
      [1, 2, 3].map(function (n) {
        return '<span class="jobi-quiz-star' + (n <= starCount ? ' is-earned' : '') + '">★</span>';
      }).join('') + '</div>';
    const scoreRingHtml = '<div id="quiz-res-ring" style="margin:6px auto">' + JM.ring(pct, 68, r.passed ? '#14804F' : '#9A5B00') + '</div>';

    if (r.passed && JM.checkSavedJobMatchBoost) {
      JM.checkSavedJobMatchBoost();
    }

    if (r.passed && weekFullyDone && JM.reward) {
      JM.close();
      if (JM.micro && JM.micro.chapterWalkBanner) {
        JM.micro.chapterWalkBanner(weekNum || 1, nextWeekTitle);
      }
      JM.reward({
        id: 'seeker_week_complete_' + (JM.bd && JM.bd.role ? JM.bd.role.id : 'role') + '_w' + (weekNum || 1),
        tier: 3,
        repeatTier: 2,
        emotion: isPerfect ? 'star_eyes' : 'cheering',
        prop: 'graduation-cap',
        animation: 'cheer',
        badge: 'Week ' + (weekNum || 1) + ' Complete!',
        title: 'Quiz passed (' + r.score + '/' + r.total + ') & Week ' + (weekNum || 1) + ' complete!',
        copy: (nextWeekTitle ? 'Jomo walked along the path to ' + nextWeekTitle + '! ' : '') + 'Your skill readiness went up.',
        extraHtml: '<div class="center">' + scoreRingHtml + starsRowHtml + '</div>',
        confetti: true,
        cta: { label: 'Continue on roadmap', onClick: function () { JM.render(); } },
        onClose: function () { JM.render(); }
      });
      return;
    }
    JM.modal('<div class="center"><div id="quiz-res-mascot" style="width:128px;height:136px;margin:0 auto 6px"></div>' +
      scoreRingHtml + starsRowHtml +
      '<h2>' + (r.passed ? (isPerfect ? 'Perfect Score!' : 'Nicely done!') : 'Not quite yet') + '</h2>' +
      '<p class="muted mt">You scored ' + r.score + ' out of ' + r.total + ' (' + pct + '%). ' + (r.passed ? 'Your readiness went up.' : 'We added a review task to your roadmap. Try again when you are ready.') + '</p>' +
      '<button class="btn mt" data-act="close" data-then="render">Back to roadmap</button></div>');
    const slot = document.getElementById('quiz-res-mascot');
    if (slot && JM.mascot) {
      JM.mascot.mount(slot, {
        emotion: r.passed ? (isPerfect ? 'star_eyes' : 'proud') : 'comforting',
        prop: r.passed ? 'graduation-cap' : 'clipboard',
        animation: r.passed ? 'cheer' : 'nod',
        size: 128,
        ariaLabel: r.passed ? 'Jomo celebrating quiz pass' : 'Jomo encouraging you to try again'
      });
    }
    const ringEl = document.querySelector('#quiz-res-ring .ring');
    if (ringEl && JM.micro && JM.micro.countUpRing) {
      JM.micro.countUpRing(ringEl, pct, 0);
    }
    if (isPerfect && JM.confetti) {
      JM.confetti.burst(slot || ringEl, { emotion: 'star_eyes', count: 28 });
    }
    if (r.passed && JM.reward) {
      JM.reward({
        id: 'seeker_quiz_passed_' + taskId,
        tier: 2,
        repeatTier: 1,
        emotion: isPerfect ? 'star_eyes' : 'proud',
        prop: 'graduation-cap',
        animation: 'peek',
        title: 'Quiz passed (' + r.score + '/' + r.total + ' · ' + '★'.repeat(starCount) + ')!',
        copy: 'Your skill readiness score just went up.',
        confetti: isPerfect
      });
    }
  }
  JM.forms.quizstep = async function (form, d) {
    const st = JM._quiz; if (!st) return;
    if (d.choice == null || d.choice === '') return JM.toast('Select an answer to continue.', 'bad');
    st.ans[String(st.qs[st.idx].id)] = Number(d.choice);
    if (st.idx < st.qs.length - 1) { st.idx++; renderFreeQuizStep(); return; }
    const r = await JM.rpc('submit_quiz', { p_task: st.task, p_answers: st.ans });
    showQuizResultModal(st.task, r);
  };
  JM.forms.quiz = async function (form, d) {
    const ans = {}; Object.keys(d).forEach(function (k) { if (k[0] === 'q') ans[k.slice(1)] = Number(d[k]); if (k === 'confidence') ans.confidence = Number(d[k]); });
    const r = await JM.rpc('submit_quiz', { p_task: form.dataset.task, p_answers: ans });
    showQuizResultModal(form.dataset.task, r);
  };

  // ---------- payments ----------
  JM.actions.buy = function (el) {
    JM.openPaymentModal({
      item: el.dataset.item,
      jobId: el.dataset.job || null,
      label: el.dataset.label,
      amount: Number(el.dataset.amount),
      period: el.dataset.period || ''
    });
  };

  // ---------- Seeker Subscription Plans (Free / Monthly / Annual) ----------
  JM.route('/pro', {
    auth: 'seeker', title: 'Subscription Plans', render: async function () {
      const s = JM.me.seeker, pro = s.plan === 'pro', isAnnual = pro && s.plan_period === 'yearly';
      const pays = await JM.q(JM.sb.from('payments').select('*').order('created_at', { ascending: false }).limit(10));
      const row = function (a, b, c, d) { return '<tr><td>' + a + '</td><td class="center">' + b + '</td><td class="center">' + c + '</td><td class="center">' + d + '</td></tr>'; };
      const yes = '<span style="color:var(--ok)">' + ic('check', 17) + '</span>', no = '<span class="muted">–</span>';
      const status = pro ? '<div class="card card-b mb tint"><div class="row wrap"><div class="grow"><div class="row gap-s">' + ic('crown', 20) + '<h2>Active: ' + (isAnnual ? 'Annual Plan' : 'Monthly Plan') + '</h2></div><p class="small muted" style="margin:6px 0 0">' + (s.auto_renew ? 'Renews ' : 'Ends ') + JM.date(s.plan_renews_at) + '.</p></div><label class="row"><span class="small">Auto-renew</span><span class="switch"><input type="checkbox" data-act="autorenew"' + (s.auto_renew ? ' checked' : '') + '><i></i></span></label></div></div>' : '';
      const cards = '<div class="grid g3 mb">' +
        '<div class="card price"><div class="row between"><b>Free Plan</b>' + (!pro ? JM.badge('Current', 'ok') : '') + '</div><div class="amt">₱0</div><ul><li>' + ic('check', 16) + '<span>3 stars per day</span></li><li>' + ic('check', 16) + '<span>Week 1 roadmap</span></li><li>' + ic('check', 16) + '<span>Reply when employers chat first</span></li></ul><button class="btn secondary block" disabled>' + (!pro ? 'Current plan' : 'Included') + '</button></div>' +
        '<div class="card price"><div class="row between"><b>Monthly Plan</b>' + (pro && !isAnnual ? JM.badge('Current', 'ok') : '') + '</div><div class="amt">₱99<span class="small muted" style="font-weight:500"> / mo</span></div><ul><li>' + ic('check', 16) + '<span>Unlimited stars &amp; undo swipes</span></li><li>' + ic('check', 16) + '<span>Full roadmap &amp; quiz backtracking</span></li><li>' + ic('check', 16) + '<span>Full history, insights &amp; résumé review</span></li><li>' + ic('check', 16) + '<span>Initiate direct chats with matches</span></li></ul><button class="btn secondary block" data-act="buy" data-item="pro_monthly" data-label="Monthly Plan (Job Seeker)" data-amount="99" data-period="Billed monthly"' + (pro && !isAnnual ? ' disabled' : '') + '>' + (pro && !isAnnual ? 'Current plan' : 'Choose Monthly') + '</button></div>' +
        '<div class="card price pop"><div class="row between"><b>Annual Plan</b>' + (isAnnual ? JM.badge('Current', 'ok') : JM.badge('Save 24%', 'ok')) + '</div><div class="amt">₱899<span class="small muted" style="font-weight:500"> / yr</span></div><ul><li>' + ic('check', 16) + '<span>Everything in Monthly Plan</span></li><li>' + ic('check', 16) + '<span>Priority profile badge for employers</span></li><li>' + ic('check', 16) + '<span>Unlimited detailed AI résumé reviews</span></li><li>' + ic('check', 16) + '<span>Early job alerts &amp; downloadable reports</span></li></ul><button class="btn block" data-act="buy" data-item="pro_yearly" data-label="Annual Plan (Job Seeker)" data-amount="899" data-period="Billed yearly"' + (isAnnual ? ' disabled' : '') + '>' + (isAnnual ? 'Current plan' : 'Upgrade to Annual') + '</button></div></div>';
      return '<div class="page">' + JM.pageHead('Subscription Plans', 'Compare Free, Monthly, and Annual plans. Save 24% and unlock exclusive perks with Annual.') + status + cards +
        '<div class="card mb"><div class="card-h"><h3>Plan feature comparison</h3></div><div class="tablewrap"><table><thead><tr><th>Feature</th><th class="center">Free</th><th class="center">Monthly (₱99)</th><th class="center">Annual (₱899)</th></tr></thead><tbody>' +
        row('Stars per day', '3 / day', 'Unlimited', 'Unlimited') +
        row('Undo swipes &amp; review passed jobs', no, yes, yes) +
        row('Application &amp; activity history', no, yes, yes) +
        row('Quiz backtracking &amp; full roadmap', no, yes, yes) +
        row('Initiate messages with employers', 'Reply only', yes, yes) +
        row('Detailed Résumé Review &amp; Insights', no, yes, yes) +
        row('Priority employer visibility badge', no, no, yes) +
        row('Early job alerts &amp; downloadable reports', no, no, yes) +
        '</tbody></table></div></div>' +
        (pays.length ? '<h3 class="mb">Payment history</h3><div class="card"><div class="tablewrap"><table><tbody>' + pays.map(function (p) { return '<tr><td>' + JM.date(p.created_at) + '</td><td>' + esc(p.item) + '</td><td class="xs muted">' + esc(p.provider_ref) + (p.payment_method ? ' · ' + esc(p.payment_method.toUpperCase()) : '') + '</td><td>' + JM.badge(p.status, p.status === 'paid' ? 'ok' : p.status === 'pending' ? 'warn' : 'bad') + '</td><td style="text-align:right">' + JM.peso(p.amount) + '</td></tr>'; }).join('') + '</tbody></table></div></div>' : '') + '</div>';
    }
  });
  JM.actions.autorenew = async function (el) {
    try { await JM.q(JM.sb.from('seeker_profiles').update({ auto_renew: el.checked }).eq('user_id', JM.me.id)); await JM.loadMe(); JM.toast(el.checked ? 'Auto-renew on.' : 'Auto-renew off. Pro stays active until the end date.', 'ok', { targetEl: el }); JM.render(); } catch (e) { el.checked = !el.checked; JM.toast(JM.err(e), 'bad'); }
  };

  // ---------- résumé review ----------
  JM.route('/resume-review', {
    auth: 'seeker', title: 'Résumé review', render: async function () {
      const s = JM.me.seeker, pro = s.plan === 'pro';
      const last = pro ? await JM.q(JM.sb.from('resume_reviews').select('*').order('created_at', { ascending: false }).limit(1)) : [];
      if (last[0] && JM._lastReviewScore == null) JM._lastReviewScore = last[0].score;
      const show = function (r) {
        const strengths = Array.isArray(r.strengths) ? r.strengths : [];
        const weaknesses = Array.isArray(r.weaknesses) ? r.weaknesses : [];
        const recs = Array.isArray(r.recommendations) ? r.recommendations : [];
        const legacy = (!weaknesses.length && Array.isArray(r.suggestions)) ? r.suggestions : [];
        return '<div class="card card-b mt"><div class="row" style="gap:18px;flex-wrap:wrap">' + JM.ring(r.score, 76, r.score >= 80 ? '#14804F' : r.score >= 55 ? '#0C70F8' : '#9A5B00') + '<div class="grow"><h2>' + esc(r.summary) + '</h2><div class="xs muted">' + (r.source === 'ai' ? 'AI detailed review' : 'Detailed checklist review') + ' · ' + JM.ago(r.created_at) + '</div></div></div>' +
          (strengths.length ? '<div class="divider"></div><h4 class="mb" style="color:var(--ok)">' + ic('check', 15) + ' Strong areas</h4><ul class="small" style="margin:0;padding-left:18px;line-height:1.7;color:var(--ink2)">' + strengths.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
          (weaknesses.length ? '<div class="divider"></div><h4 class="mb" style="color:var(--warn)">Areas to improve &amp; solutions</h4><div class="col gap-s">' + weaknesses.map(function (w, idx) {
            return '<div class="card flat card-b jobi-weakness-card" style="padding:12px;background:#FFFDF7"><div class="row between mb" style="margin-bottom:6px">' + JM.badge(w.area, 'warn') +
              '<button type="button" class="btn ghost sm" data-act="fixweakness" data-i="' + idx + '" style="height:26px;padding:0 8px"><span class="jobi-weakness-tick">' + ic('check', 12) + '</span><span class="jobi-weakness-lbl">Mark fixed</span></button></div>' +
              '<div class="small jobi-weakness-issue"><b>Weakness:</b> ' + esc(w.issue) + '</div><div class="small mt" style="margin-top:4px;color:var(--ok)"><b>Recommended fix:</b> ' + esc(w.solution) + '</div>' + (w.example ? '<div class="xs muted mt" style="margin-top:4px">' + esc(w.example) + '</div>' : '') + '</div>';
          }).join('') + '</div>' : '') +
          (legacy.length ? '<div class="divider"></div>' + legacy.map(function (x) { return '<div class="row" style="align-items:flex-start;padding:8px 0">' + JM.badge(x.area, 'brand') + '<span class="grow small">' + esc(x.tip) + '</span></div>'; }).join('') : '') +
          (recs.length ? '<div class="divider"></div><h4 class="mb">Employer-appeal recommendations</h4><ul class="small" style="margin:0;padding-left:18px;line-height:1.7;color:var(--ink2)">' + recs.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
          '</div>';
      };
      const hasFile = !!s.resume_path, hasLink = !!(s.resume_link && s.resume_link.trim());
      const fileBox = hasFile
        ? '<div class="row card flat mb" style="padding:10px 14px">' + ic('file') + '<span class="grow small">Uploaded: ' + esc(s.resume_path.split('/').pop()) + '</span><button type="button" class="btn secondary sm" data-act="mediaview" data-bucket="resumes" data-path="' + esc(s.resume_path) + '" data-title="Uploaded résumé">View</button></div>'
        : '<div class="field"><label class="label">Upload résumé file (PDF, Word, or image)</label>' + JM.uploadBtn({ in: 'revresume', target: 'resume', label: 'Upload résumé', hint: 'PDF, Word, JPG or PNG · max 5 MB · preview before saving', preview: 'Preview résumé before uploading' }) + '</div>';
      const body = pro ? '<div class="card card-b"><p class="muted small">Upload a résumé file, provide a résumé link, or paste your résumé text below to generate a grade. Your name, age, gender and photo are never sent.</p>' + fileBox +
        '<form data-form="review"><div class="field"><label class="label">Résumé or portfolio link (optional)</label><input type="url" name="link" value="' + esc(s.resume_link || '') + '" placeholder="https://drive.google.com/..."></div>' +
        '<div class="field"><label class="label">Or paste résumé text (optional)</label><textarea name="text" placeholder="Paste your résumé text here" style="min-height:110px"></textarea></div>' +
        '<button class="btn" type="submit">' + ic('sparkle', 16) + 'Review my résumé</button></form></div><div id="review-out">' + (last[0] ? show(last[0]) : '') + '</div>' :
        '<div class="card card-b"><div class="lock"><div class="blur"><h2>Score 82 out of 100</h2><p>Add numbers to your achievements. List at least 5 skills. Upload a PDF résumé.</p></div><div class="veil">' + ic('lock', 22) + '<b>Résumé review is part of Pro</b><a class="btn sm" href="#/pro">See Pro</a></div></div></div>';
      JM.showReview = show;
      return '<div class="page narrow">' + JM.pageHead('Résumé review', 'Get a score and specific fixes before employers see your profile.') + body + '</div>';
    }
  });
  JM.actions.fixweakness = function (el) {
    const card = el.closest('.jobi-weakness-card');
    if (!card) return;
    const fixed = card.classList.toggle('is-fixed');
    const lbl = el.querySelector('.jobi-weakness-lbl');
    if (lbl) lbl.textContent = fixed ? 'Fixed' : 'Mark fixed';
    if (fixed && JM.reward) {
      JM.reward({ tier: 1, title: 'Weakness fixed! ✓', targetEl: el });
    }
  };
  JM.inputs.revresume = async function (el) {
    const f = (el._pvExtra && el._pvExtra.file) || el.files[0]; if (!f) return;
    const blobUrl = el._pvExtra && el._pvExtra.blobUrl;
    if (JM.isHeic(f)) { if (blobUrl) URL.revokeObjectURL(blobUrl); JM.toast(JM.HEIC_MSG, 'bad'); el.value = ''; return; }
    if (f.size > 5 * 1024 * 1024) { if (blobUrl) URL.revokeObjectURL(blobUrl); JM.toast('File is larger than 5 MB.', 'bad'); el.value = ''; return; }
    const ext = (f.name.split('.').pop() || 'pdf').toLowerCase();
    if (['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'].indexOf(ext) < 0) { if (blobUrl) URL.revokeObjectURL(blobUrl); JM.toast('Upload a PDF, Word, JPG or PNG file.', 'bad'); el.value = ''; return; }
    const oldPath = JM.me && JM.me.seeker && JM.me.seeker.resume_path;
    const path = JM.me.id + '/resume-' + Date.now() + '.' + ext;
    try {
      const r = await JM.sb.storage.from('resumes').upload(path, f, { contentType: f.type || undefined });
      if (r.error) throw r.error;
      await JM.q(JM.sb.from('seeker_profiles').update({ resume_path: path, resume_mode: 'uploaded' }).eq('user_id', JM.me.id));
      if (oldPath && oldPath !== path) JM.sb.storage.from('resumes').remove([oldPath]);
      if (/^(jpe?g|png)$/.test(ext)) await JM.seedUrl('resumes', path);
      await JM.loadMe();
      if (JM.reward) {
        JM.reward({
          id: 'seeker_resume_upload_scan',
          tier: 2,
          repeatTier: 2,
          emotion: 'scanning',
          prop: 'clipboard',
          animation: 'scan',
          title: 'Résumé uploaded & scanned!',
          copy: 'Click "Review my résumé" below to score your résumé.'
        });
      } else {
        JM.toast('Résumé uploaded.', 'ok');
      }
      JM.render();
    } catch (e) { JM.toast(JM.err(e), 'bad'); }
    finally { if (blobUrl) URL.revokeObjectURL(blobUrl); el.value = ''; }
  };
  JM.forms.review = async function (form, d) {
    const link = String(d.link || '').trim(), text = String(d.text || '').trim();
    if (!JM.me.seeker.resume_path && !link && text.length < 20) {
      return JM.toast('Please upload a résumé file, enter a résumé link, or paste your résumé text first.', 'bad');
    }
    if (link !== (JM.me.seeker.resume_link || '')) {
      await JM.q(JM.sb.from('seeker_profiles').update({ resume_link: link }).eq('user_id', JM.me.id));
      JM.me.seeker.resume_link = link;
    }
    const prevScore = JM._lastReviewScore;
    const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Reviewing…';
    try {
      const r = await JM.fn('resume-review', { text: text, link: link });
      r.created_at = new Date().toISOString();
      const out = document.getElementById('review-out');
      out.innerHTML = JM.showReview(r);
      JM._lastReviewScore = r.score;
      const ringEl = out.querySelector('.ring');
      if (JM.micro && JM.micro.countUpRing) {
        JM.micro.countUpRing(ringEl, r.score, prevScore);
      }
      if (JM.reward) {
        if (prevScore != null && r.score > prevScore) {
          const delta = r.score - prevScore;
          JM.reward({
            tier: 2,
            forceTier: true,
            emotion: 'proud',
            prop: 'trophy',
            animation: 'cheer',
            confetti: true,
            title: 'Score improved +' + delta + ' pts! (' + r.score + '/100)',
            copy: 'Nice work applying those résumé fixes!'
          });
        } else if (r.score >= 80) {
          JM.reward({
            tier: 2,
            forceTier: true,
            emotion: 'star_eyes',
            prop: 'trophy',
            animation: 'cheer',
            confetti: true,
            title: 'Strong résumé score: ' + r.score + '/100!',
            copy: 'Your skills and experience stand out clearly to employers.'
          });
        } else if (r.score >= 55) {
          JM.reward({
            tier: 2,
            forceTier: true,
            emotion: 'happy',
            prop: 'clipboard',
            animation: 'bounce',
            confetti: false,
            title: 'Solid foundation: ' + r.score + '/100',
            copy: 'Check off a few recommended fixes below to push your score over 80.'
          });
        } else {
          JM.reward({
            tier: 2,
            forceTier: true,
            emotion: 'comforting',
            prop: 'clipboard',
            animation: 'nod',
            confetti: false,
            title: 'Score: ' + r.score + '/100 — let’s build it up together!',
            copy: 'Every great résumé starts here. Fix the items below one by one and re-run!'
          });
        }
      }
    }
    catch (e) { JM.toast(JM.err(e), 'bad'); } finally { btn.disabled = false; btn.innerHTML = ic('sparkle', 16) + 'Review my résumé'; }
  };

  // ---------- first-time jobseeker checklist ----------
  const CHECK = [
    ['cert', 'Barangay Certification', 'Get a certificate from your barangay hall that you are a resident and a first-time jobseeker. Bring a valid ID.', 'Issued by: Barangay Hall (Secretary / Punong Barangay)', 'Republic of the Philippines · City of Biñan\nBARANGAY CERTIFICATION (RA 11261)\n\nThis certifies that [Full Name], resident of [Barangay], Biñan, Laguna for [X] years/months, is a qualified First-Time Jobseeker under RA 11261.\n\nPurpose: Free issuance of pre-employment documents.\nValid for 1 year from issuance.'],
    ['oath', 'Oath of Undertaking', 'Sign the oath at the barangay. It confirms this is your first job search and lets you skip fees.', 'Signed at: Barangay Hall alongside your Barangay Certification', 'OATH OF UNDERTAKING (RA 11261)\n\nI, [Full Name], of legal age, hereby declare that I am a first-time jobseeker and have not previously availed of the benefits under Republic Act No. 11261.\n\nSigned this [Date] at Barangay [Name], Biñan, Laguna.'],
    ['police', 'Police clearance', 'Free for first-time jobseekers. Show your Barangay Certification.', 'Issued by: PNP National Police Clearance System (Biñan City Police)', 'NATIONAL POLICE CLEARANCE\n\nName: [Full Name] · Address: Biñan, Laguna\nPurpose: Local Employment (First-Time Jobseeker - Fee Waived)\nStatus: NO DEROGATORY RECORD\nBring: 2 Valid IDs + Barangay Certification + Oath'],
    ['nbi', 'NBI clearance', 'Free for first-time jobseekers. Show your Barangay Certification.', 'Issued by: NBI Clearance Center (Robinsons Galleria South / Biñan satellite)', 'NBI CLEARANCE CERTIFICATE\n\nApplicant: [Full Name]\nPurpose: First-Time Jobseeker (RA 11261 - ₱0 Fee)\nRemarks: NO RECORD ON FILE\nTip: Book online under "First Time Jobseeker" and bring original Barangay Cert + Oath.'],
    ['psa', 'PSA birth certificate', 'Request it without paying the fee when you present the certification.', 'Issued by: Philippine Statistics Authority (PSA CRS Outlet)', 'PSA CERTIFICATE OF LIVE BIRTH (Security Paper)\n\nFull Name · Date & Place of Birth · Parents\' Details\nFee: Waived (1 free copy under RA 11261)\nBring: Original Barangay Certification + Oath + Valid ID'],
    ['gov', 'TIN, SSS, PhilHealth and Pag-IBIG numbers', 'Registration for these IDs is free for first-time jobseekers.', 'Issued by: BIR, SSS, PhilHealth, Pag-IBIG (online or Biñan branches)', 'GOVERNMENT STATUTORY NUMBERS\n\n• TIN (BIR Form 1902 / ORUS)\n• SSS Number (Online SS Number Application)\n• PhilHealth PIN (PMRF Form)\n• Pag-IBIG MID Number (Online Registration)\nBring: Birth Certificate + Valid ID + Barangay Certification'],
    ['med', 'Medical certificate from a public hospital', 'Public health facilities waive the fee with your Barangay Certification.', 'Issued by: Ospital ng Biñan / City Health Office', 'MEDICAL CERTIFICATE (Fit to Work)\n\nPatient: [Full Name]\nFindings: Physically and mentally fit for employment.\nSigned: Attending Physician, License No. [XXXX]\nBring: Barangay Certification + Valid ID']
  ];
  JM.route('/checklist', {
    auth: 'seeker', title: 'First-time jobseeker', render: function () {
      const c = JM.me.seeker.checklist || {}, n = CHECK.filter(function (x) { return c[x[0]]; }).length;
      return '<div class="page narrow">' + JM.pageHead('First-time jobseeker checklist', 'Under Republic Act 11261, first-time jobseekers do not pay fees for the documents employers ask for.') +
        '<div class="card card-b mb tint"><div class="row wrap between"><div class="grow"><h3>Visual Résumé Sample Template</h3><p class="small muted" style="margin:4px 0 0">See a clean, block-style visual template showing what a first-time jobseeker résumé should look like.</p></div><button type="button" class="btn sm" data-act="resumesample">' + ic('eye', 15) + 'View sample image</button></div></div>' +
        '<div class="card card-b mb"><div class="row"><b class="grow">' + n + ' of ' + CHECK.length + ' done</b><span class="small muted">' + Math.round(n / CHECK.length * 100) + '%</span></div>' + JM.bar(n / CHECK.length * 100, 'ok') + '</div>' +
        '<div class="card list">' + CHECK.map(function (x) { return '<div class="li" style="align-items:flex-start"><label class="switch" style="width:34px;height:20px;margin-top:2px;cursor:pointer"><input type="checkbox" data-act="check" data-k="' + x[0] + '"' + (c[x[0]] ? ' checked' : '') + '><i></i></label><div class="grow"><div class="bold">' + x[1] + '</div><div class="small muted">' + x[2] + '</div></div><button type="button" class="btn secondary sm" data-act="docsample" data-k="' + x[0] + '">' + ic('eye', 14) + 'Sample</button></div>'; }).join('') + '</div>' +
        '<p class="small muted mt">The benefit applies once and the certification is valid for one year. Requirements can change, so confirm with the office before you go.</p></div>';
    }
  });
  JM.actions.resumesample = function () {
    JM.modal('<h2>First-Time Jobseeker Résumé Template</h2><p class="small muted mt mb">Simple block-style layout showing clear sections employers look for.</p><div style="text-align:center"><img src="assets/sample-resume-template.svg" alt="Block-style First-Time Jobseeker Resume Template" style="max-height:66vh;border-radius:10px;border:1px solid var(--line)"></div><div class="row mt-l" style="justify-content:flex-end"><button class="btn" data-act="close">Close</button></div>', 'wide');
  };
  JM.actions.docsample = function (el) {
    const item = CHECK.find(function (x) { return x[0] === el.dataset.k; });
    if (!item) return;
    JM.modal('<h2>Sample: ' + esc(item[1]) + '</h2><p class="small muted mt">' + esc(item[3]) + '</p><div class="card flat card-b mt" style="background:#FAFBFD;font-family:monospace;font-size:12.5px;white-space:pre-wrap;line-height:1.55;border-style:dashed">' + esc(item[4]) + '</div><div class="row mt-l" style="justify-content:flex-end"><button class="btn" data-act="close">Got it</button></div>');
  };
  JM.actions.check = async function (el) {
    const c = Object.assign({}, JM.me.seeker.checklist || {}); if (el.checked) c[el.dataset.k] = true; else delete c[el.dataset.k];
    try { await JM.q(JM.sb.from('seeker_profiles').update({ checklist: c }).eq('user_id', JM.me.id)); JM.me.seeker.checklist = c; if (el.checked) JM.toast('Checklist item completed!', 'ok', { targetEl: el }); JM.render(); } catch (e) { el.checked = !el.checked; JM.toast(JM.err(e), 'bad'); }
  };

  // ---------- account (shared by seeker settings and employer company page) ----------
  JM.animPrefsCard = function () {
    const p = JM.prefs || { animations: true, haptics: true, sound: false };
    return '<div class="card mb"><div class="card-h"><h3>Animations and sounds</h3></div><div class="card-b" style="padding-top:0">' +
      '<label class="row" style="padding:12px 0;border-top:1px solid var(--line)"><div class="grow"><b>Animations and sounds</b><div class="small muted">Enable Jomo mascot spring animations and milestone celebrations. Automatically respects your device’s reduced-motion setting.</div></div><span class="switch"><input type="checkbox" data-act="jobipref" data-k="animations"' + (p.animations !== false ? ' checked' : '') + '><i></i></span></label>' +
      '<label class="row" style="padding:12px 0;border-top:1px solid var(--line)"><div class="grow"><b>Celebration sound ("bloop")</b><div class="small muted">Play a soft synthesized chime on milestone rewards.</div></div><span class="switch"><input type="checkbox" data-act="jobipref" data-k="sound"' + (p.sound === true ? ' checked' : '') + '><i></i></span></label>' +
      '<label class="row" style="padding:12px 0;border-top:1px solid var(--line)"><div class="grow"><b>Haptic feedback</b><div class="small muted">Subtle 12ms vibration tick on mobile actions and toasts.</div></div><span class="switch"><input type="checkbox" data-act="jobipref" data-k="haptics"' + (p.haptics !== false ? ' checked' : '') + '><i></i></span></label>' +
      '</div></div>';
  };
  JM.actions.jobipref = async function (el) {
    const k = el.dataset.k;
    const patch = {};
    patch[k] = el.checked;
    if (JM.savePrefsToServer) await JM.savePrefsToServer(patch);
    else if (JM.setPrefs) JM.setPrefs(patch);
    if (k === 'sound' && el.checked && JM.playBloop) JM.playBloop(true);
    JM.toast(el.checked ? 'Preference enabled.' : 'Preference turned off.', 'ok', { targetEl: el });
  };
  JM.accountCards = function () {
    const push = JM.cfg.vapidPublicKey && 'serviceWorker' in navigator && 'PushManager' in window ? '<div class="row" style="padding:14px 0;border-top:1px solid var(--line)"><div class="grow"><b>Push notifications</b><div class="small muted">Get alerts on this device even when JobMatch is closed.</div></div><button class="btn secondary sm" data-act="pushon">Enable</button></div>' : '';
    return JM.animPrefsCard() +
      '<div class="card mb"><div class="card-h"><h3>Security</h3></div><div class="card-b"><form data-form="password" class="grid g2" style="align-items:end"><div class="field" style="margin:0"><label class="label">New password</label><input type="password" name="password" minlength="8" autocomplete="new-password" placeholder="At least 8 characters" required></div><div><button class="btn secondary" type="submit">Change password</button></div></form>' + push + '</div></div>' +
      '<div class="card mb"><div class="card-h"><h3>Your data</h3></div><div class="card-b"><p class="small muted">Download a copy of everything we hold about you, or delete your account. Deleting is permanent: your profile, files, messages and activity are removed.</p><div class="row wrap"><button class="btn secondary" data-act="export">' + ic('download', 16) + 'Download my data</button><button class="btn danger secondary" data-act="deleteacct">' + ic('trash', 16) + 'Delete my account</button></div></div></div>';
  };
  JM.forms.password = async function (form, d) {
    if ((d.password || '').length < 8) return JM.toast('Use at least 8 characters.', 'bad');
    const r = await JM.sb.auth.updateUser({ password: d.password }); if (r.error) throw r.error; form.reset();
    if (JM.reward) {
      JM.reward({ tier: 1, prop: 'shield', title: 'Password updated securely 🛡️', targetEl: form.querySelector('[type=submit]') });
    } else {
      JM.toast('Password updated.', 'ok');
    }
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
    // Guardrail: keep account deletion 100% plain with zero mascot or sparkles
    await JM.fn('delete-account', {}); JM.close(); await JM.sb.auth.signOut(); JM.me = null; JM.go('/'); JM.toast('Your account was deleted.');
  };
  JM.actions.pushon = async function (el) {
    await JM.busy(el, async function () {
      const perm = await Notification.requestPermission(); if (perm !== 'granted') return JM.toast('Notifications are blocked in your browser settings.', 'bad');
      const reg = await navigator.serviceWorker.ready; const key = JM.cfg.vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/');
      const raw = atob(key + '='.repeat((4 - key.length % 4) % 4)), arr = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: arr }), j = sub.toJSON();
      await JM.q(JM.sb.from('push_subscriptions').upsert({ user_id: JM.me.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' }));
      if (JM.reward) {
        JM.reward({ tier: 1, prop: 'bell', title: 'Push notifications enabled 🔔', targetEl: el });
      } else {
        JM.toast('Push notifications enabled on this device.', 'ok');
      }
    });
  };

  // ---------- seeker settings ----------
  JM.route('/settings', {
    auth: 'seeker', title: 'Settings', render: function () {
      const n = JM.me.seeker.notif || {}, sw = function (k, t, d) { return '<label class="row" style="padding:12px 0;border-top:1px solid var(--line)"><div class="grow"><b>' + t + '</b><div class="small muted">' + d + '</div></div><span class="switch"><input type="checkbox" data-act="notif" data-k="' + k + '"' + (n[k] !== false ? ' checked' : '') + '><i></i></span></label>'; };
      return '<div class="page narrow">' + JM.pageHead('Settings') + '<div class="card mb"><div class="card-h"><h3>Notifications</h3></div><div class="card-b" style="padding-top:0">' + sw('matches', 'Matches', 'When an employer shortlists you.') + sw('status', 'Application updates', 'Hired or not selected.') + sw('messages', 'Messages', 'New chat messages.') + sw('tips', 'Tips', 'Career and profile suggestions.') + '</div></div>' +
        '<div class="card mb"><div class="card-h"><h3>Discoverability</h3></div><div class="card-b"><label class="row"><div class="grow"><b>Let Business-plan employers find me</b><div class="small muted">They see a masked name and skills, never contact details.</div></div><span class="switch"><input type="checkbox" data-act="openemp"' + (JM.me.seeker.open_to_employers ? ' checked' : '') + '><i></i></span></label></div></div>' + JM.accountCards() + '</div>';
    }
  });
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
