/* App boot: event delegation, realtime, service worker. Loaded last. */
(function () {
  const JM = window.JM;

  // ---------- delegated events ----------
  function formData(form) {
    const d = {}, fd = new FormData(form);
    fd.forEach(function (v, k) { d[k] = typeof v === 'string' ? v : ''; });
    form.querySelectorAll('input[type=checkbox][name]').forEach(function (c) { d[c.name] = c.checked; });
    return d;
  }
  document.addEventListener('click', async function (e) {
    const ov = e.target.closest('[data-ov]');
    if (ov && e.target === ov) { JM.close(); return; }
    const sc = e.target.closest('[data-scroll]');
    if (sc) {
      e.preventDefault(); const go = function () { const t = document.getElementById(sc.dataset.scroll); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      if ((location.hash || '#/') !== '#/') { JM.go('/'); setTimeout(go, 150); } else go(); return;
    }
    const el = e.target.closest('[data-act]'); if (!el) return;
    if (el.tagName === 'INPUT' && el.type === 'checkbox') return; // handled on change
    const fn = JM.actions[el.dataset.act]; if (!fn) return;
    const then = el.dataset.then;
    try { await fn(el, e); } catch (err) { JM.toast(JM.err(err), 'bad'); }
    if (then === 'render') JM.render();
  });
  document.addEventListener('submit', async function (e) {
    const form = e.target.closest('form[data-form]'); if (!form) return;
    e.preventDefault(); const fn = JM.forms[form.dataset.form]; if (!fn) return;
    try { await fn(form, formData(form)); } catch (err) { JM.toast(JM.err(err), 'bad'); const b = form.querySelector('[type=submit]'); if (b) b.disabled = false; }
  });
  const fire = async function (el, ev) {
    // Preview-before-upload for file inputs marked with data-preview
    if (el.type === 'file' && el.dataset.preview != null && el.files && el.files[0] && !el._pvOk && JM.previewFile) {
      JM.previewFile(el.files[0], {
        title: el.dataset.preview, titleField: !!el.dataset.pvtitle, shape: el.dataset.shape || 'contain',
        onConfirm: function (extra) { el._pvOk = true; el._pvExtra = extra || {}; return fire(el, ev); },
        onCancel: function () { el.value = ''; }
      });
      return;
    }
    if (el.dataset.in && JM.inputs[el.dataset.in]) { try { await JM.inputs[el.dataset.in](el, ev); } catch (err) { JM.toast(JM.err(err), 'bad'); } finally { el._pvOk = false; el._pvExtra = null; } }
    else if (ev.type === 'change' && el.tagName === 'INPUT' && el.type === 'checkbox' && el.dataset.act && JM.actions[el.dataset.act]) { try { await JM.actions[el.dataset.act](el, ev); } catch (err) { JM.toast(JM.err(err), 'bad'); } }
  };
  document.addEventListener('input', function (e) {
    const el = e.target, t = el.type;
    if (el.tagName === 'SELECT' || t === 'file' || t === 'checkbox' || t === 'radio') return; fire(el, e);
  });
  document.addEventListener('change', function (e) { fire(e.target, e); });
  // drag and drop onto upload buttons
  const zoneOf = function (t) { return t && t.closest ? t.closest('.upl,.upl-btn') : null; };
  document.addEventListener('dragover', function (e) { const z = zoneOf(e.target); if (!z) return; e.preventDefault(); z.classList.add('drag'); });
  document.addEventListener('dragleave', function (e) { const z = zoneOf(e.target); if (z && !z.contains(e.relatedTarget)) z.classList.remove('drag'); });
  document.addEventListener('drop', function (e) {
    const z = zoneOf(e.target); if (!z) return;
    e.preventDefault(); z.classList.remove('drag');
    const inp = z.querySelector('input[type=file]');
    if (!inp || !e.dataTransfer || !e.dataTransfer.files.length) return;
    try { inp.files = e.dataTransfer.files; } catch (x) { return; }
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (JM.closeMsgMenu && JM.msgMenuOpen) { JM.closeMsgMenu(); return; }
      if (document.getElementById('overlay-root').classList.contains('open')) JM.close();
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.getAttribute && e.target.getAttribute('role') === 'button' && e.target.dataset && e.target.dataset.act) {
      e.preventDefault();
      e.target.click();
    }
  });

  // ---------- realtime ----------
  JM.unsubscribe = function () { if (JM.rt) { JM.sb.removeChannel(JM.rt); JM.rt = null; } };
  JM.subscribe = function () {
    JM.unsubscribe(); if (!JM.me) return;
    JM.rt = JM.sb.channel('jm-' + JM.me.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, function (p) {
        const m = p.new; if (m.sender_id === JM.me.id) return;
        if (JM.curConv && JM.curConv.id === m.conversation_id && location.hash.indexOf('/messages/' + m.conversation_id) > 0) {
          JM.appendBubble(m); JM.rpc('mark_conversation_read', { p_conv: m.conversation_id }).catch(function () {});
        } else { JM.loadMe().then(JM.updateBadges); JM.toast('New message'); }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, function (p) {
        const m = p.new;
        if (JM.curConv && JM.curConv.id === m.conversation_id && JM.updateBubble) {
          JM.updateBubble(m);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + JM.me.id }, function (p) {
        JM.loadMe().then(JM.updateBadges);
        if (p.new.type !== 'message') JM.toast(p.new.title);
        if (p.new.type === 'match' && JM.checkMatch) JM.checkMatch(true);
      }).subscribe();
  };
  JM.afterRender = function (path) {
    if (JM.me && JM.me.role === 'seeker' && JM.checkMatch) JM.checkMatch();
    if (path.indexOf('/messages') === 0) JM.afterChat();
    if (JM.me && !JM.rt) JM.subscribe();
  };

  // ---------- boot ----------
  async function boot() {
    try { await JM.loadRef(); } catch (e) { console.error('reference data', e); }
    try { const s = await JM.sb.auth.getSession(); if (s.data.session) await JM.loadMe(); } catch (e) { console.error('session', e); }
    JM.sb.auth.onAuthStateChange(function (ev) {
      if (ev === 'PASSWORD_RECOVERY') { setTimeout(function () { location.hash = '#/reset'; }, 0); }
      if (ev === 'SIGNED_OUT') { JM.me = null; JM.unsubscribe(); }
    });
    window.addEventListener('hashchange', function () { JM.render(); });
    if (JM.me) JM.subscribe();
    await JM.render();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  boot();
})();
