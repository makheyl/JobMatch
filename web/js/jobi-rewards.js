/* ==========================================================================
   Jobi Mascot & Reward Engine — web/js/jobi-rewards.js
   Vanilla JS (No-build PWA). Exposes on window.JM without breaking existing JM methods:
     - JM.mascot.mount(container, options)
     - JM.reward(config)
     - JM.confetti.burst(originEl, options)
     - JM.toastSuccess(message, options)
     - JM.milestones.init({ fetchSeen, markSeen })
     - JM.prefs (animations, haptics, sound) + Web Audio rising "bloop"
   ========================================================================== */
(function () {
  const JM = window.JM = window.JM || {};

  // ---------- Constants & Catalogs ----------
  const EMOTIONS = [
    'wink_thumbs_up', 'happy', 'star_eyes', 'heart_eyes', 'proud',
    'cheering', 'thinking', 'scanning', 'curious', 'oops',
    'comforting', 'sleepy', 'waving'
  ];

  const PROPS = [
    'none', 'phone', 'trophy', 'medal', 'clipboard',
    'briefcase', 'magnifying-glass', 'calendar', 'paper-plane', 'megaphone',
    'graduation-cap', 'coffee-mug', 'stamp', 'hard-hat', 'balloons',
    'map', 'padlock', 'shield', 'bell'
  ];

  const ANIMATIONS = [
    'idle', 'bounce', 'cheer', 'wave', 'peek',
    'nod', 'oops', 'scan', 'rewind', 'boot',
    'sleepy', 'pop-burst'
  ];

  const ANIM_CLASS_MAP = {
    'idle': 'jobi-anim-idle',
    'bounce': 'jobi-anim-bounce',
    'cheer': 'jobi-anim-cheer',
    'wave': 'jobi-anim-wave',
    'peek': 'jobi-anim-peek',
    'nod': 'jobi-anim-nod',
    'oops': 'jobi-anim-oops',
    'scan': 'jobi-anim-scan',
    'rewind': 'jobi-anim-rewind',
    'boot': 'jobi-anim-boot',
    'sleepy': 'jobi-anim-sleepy',
    'pop-burst': 'jobi-pop-burst'
  };

  const ALL_ANIM_CLASSES = Object.keys(ANIM_CLASS_MAP).map(function (k) { return ANIM_CLASS_MAP[k]; });

  // ---------- 5. JM.prefs + Haptics + Web Audio ----------
  const PREFS_KEY = 'jm.jobi.prefs';
  const defaultPrefs = { animations: true, haptics: true, sound: false };

  function loadStoredPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          animations: parsed.animations !== false,
          haptics: parsed.haptics !== false,
          sound: parsed.sound === true
        };
      }
    } catch (e) { /* ignore storage errors */ }
    return Object.assign({}, defaultPrefs);
  }

  JM.prefs = Object.assign(loadStoredPrefs(), JM.prefs || {});

  function syncReducedMotionClass() {
    const sysReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const disabled = !JM.prefs.animations || sysReduced;
    if (document.documentElement) {
      document.documentElement.classList.toggle('jm-reduced-motion', disabled);
    }
    return !disabled;
  }

  JM.setPrefs = function (patch) {
    Object.assign(JM.prefs, patch || {});
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        animations: !!JM.prefs.animations,
        haptics: !!JM.prefs.haptics,
        sound: !!JM.prefs.sound
      }));
    } catch (e) { /* ignore */ }
    syncReducedMotionClass();
    return JM.prefs;
  };

  JM.isMotionEnabled = function () {
    return syncReducedMotionClass();
  };

  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', syncReducedMotionClass);
    } catch (e) { /* Safari fallback */ }
  }
  syncReducedMotionClass();

  // Haptic tick via navigator.vibrate?.(12)
  JM.hapticTick = function (ms) {
    if (!JM.prefs.haptics || !JM.isMotionEnabled()) return false;
    try {
      if (navigator && typeof navigator.vibrate === 'function') {
        navigator.vibrate(ms || 12);
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  };

  // Zero-external-file Web Audio API synthesizer: single soft rising "bloop"
  let audioCtx = null;
  JM.playBloop = function (force) {
    if (!force && !JM.prefs.sound) return false;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      // Soft rising pitch: 380 Hz -> 680 Hz over 115ms
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(680, now + 0.115);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.11, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.145);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.15);
      return true;
    } catch (e) {
      return false;
    }
  };

  // ---------- 6. Accessibility: Single Visually Hidden aria-live="polite" Region ----------
  let liveRegion = null;
  function ensureLiveRegion() {
    if (liveRegion && liveRegion.isConnected) return liveRegion;
    liveRegion = document.getElementById('jobi-aria-live');
    if (!liveRegion && document.body) {
      liveRegion = document.createElement('div');
      liveRegion.id = 'jobi-aria-live';
      liveRegion.className = 'jobi-sr-only';
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');
      document.body.appendChild(liveRegion);
    }
    return liveRegion;
  }

  JM.announce = function (text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    const region = ensureLiveRegion();
    if (!region) return;
    region.textContent = '';
    setTimeout(function () {
      if (region) region.textContent = clean;
    }, 30);
  };

  // ---------- Persistence: milestones_seen Adapter ----------
  const MILESTONES_KEY = 'jm.jobi.milestones_seen';
  const seenSet = new Set();

  function loadLocalMilestones() {
    try {
      const raw = localStorage.getItem(MILESTONES_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) arr.forEach(function (k) { if (k) seenSet.add(String(k)); });
      }
    } catch (e) { /* ignore */ }
  }
  loadLocalMilestones();

  function saveLocalMilestones() {
    try {
      localStorage.setItem(MILESTONES_KEY, JSON.stringify(Array.from(seenSet)));
    } catch (e) { /* ignore */ }
  }

  let customFetchSeen = null;
  let customMarkSeen = null;

  JM.milestones = {
    init: async function (adapter) {
      adapter = adapter || {};
      if (typeof adapter.fetchSeen === 'function') customFetchSeen = adapter.fetchSeen;
      if (typeof adapter.markSeen === 'function') customMarkSeen = adapter.markSeen;
      if (customFetchSeen) {
        try {
          const remote = await customFetchSeen();
          if (Array.isArray(remote)) {
            remote.forEach(function (k) { if (k) seenSet.add(String(k)); });
            saveLocalMilestones();
          } else if (remote && typeof remote === 'object') {
            Object.keys(remote).forEach(function (k) { if (remote[k]) seenSet.add(String(k)); });
            saveLocalMilestones();
          }
        } catch (e) { /* fallback to localStorage cache */ }
      }
      return Array.from(seenSet);
    },
    has: function (id) {
      if (!id) return false;
      return seenSet.has(String(id));
    },
    mark: async function (id) {
      if (!id) return;
      const key = String(id);
      const isNew = !seenSet.has(key);
      seenSet.add(key);
      saveLocalMilestones();
      if (isNew && customMarkSeen) {
        try { await customMarkSeen(key, Array.from(seenSet)); } catch (e) { /* ignore */ }
      }
    },
    list: function () {
      return Array.from(seenSet);
    },
    reset: function (id) {
      if (id) seenSet.delete(String(id));
      else seenSet.clear();
      saveLocalMilestones();
    }
  };

  // ---------- 1. JM.mascot.mount(container, options) ----------
  const FALLBACK_RIG_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 220\" class=\"jobi-svg\" data-emotion=\"wink_thumbs_up\" role=\"img\" aria-label=\"Jobi the JobMatch mascot\">\n  <defs>\n    <!-- Vibrant saturated palette matching Facebook / logo.png brand reference -->\n    <linearGradient id=\"jobi-g-shell\" x1=\"0.2\" y1=\"0.02\" x2=\"0.8\" y2=\"0.98\">\n      <stop offset=\"0%\" stop-color=\"#FFFFFF\"/>\n      <stop offset=\"58%\" stop-color=\"#F7FAFF\"/>\n      <stop offset=\"100%\" stop-color=\"#C8DDFB\"/>\n    </linearGradient>\n    <linearGradient id=\"jobi-g-shell-shade\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">\n      <stop offset=\"0%\" stop-color=\"#D7E7FD\"/>\n      <stop offset=\"100%\" stop-color=\"#ADCBF6\"/>\n    </linearGradient>\n    <radialGradient id=\"jobi-g-visor\" cx=\"50%\" cy=\"32%\" r=\"70%\">\n      <stop offset=\"0%\" stop-color=\"#114BB2\"/>\n      <stop offset=\"50%\" stop-color=\"#082668\"/>\n      <stop offset=\"100%\" stop-color=\"#031135\"/>\n    </radialGradient>\n    <linearGradient id=\"jobi-g-brand\" x1=\"0.15\" y1=\"0\" x2=\"0.85\" y2=\"1\">\n      <stop offset=\"0%\" stop-color=\"#338FFF\"/>\n      <stop offset=\"52%\" stop-color=\"#0C70F8\"/>\n      <stop offset=\"100%\" stop-color=\"#0052CC\"/>\n    </linearGradient>\n    <linearGradient id=\"jobi-g-brand-dark\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n      <stop offset=\"0%\" stop-color=\"#0C70F8\"/>\n      <stop offset=\"100%\" stop-color=\"#063999\"/>\n    </linearGradient>\n    <linearGradient id=\"jobi-g-gold\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n      <stop offset=\"0%\" stop-color=\"#FFD66B\"/>\n      <stop offset=\"100%\" stop-color=\"#F5A524\"/>\n    </linearGradient>\n    <!-- Pixel-traced rounded-squircle visor clip path from head.png -->\n    <clipPath id=\"jobi-clip-visor\">\n      <path d=\"M 100 34.4 C 132 34.4, 149.2 47, 149.2 76 C 149.2 103.5, 133.5 113.4, 100 113.4 C 66.5 113.4, 50.8 103.5, 50.8 76 C 50.8 47, 68 34.4, 100 34.4 Z\"/>\n    </clipPath>\n  </defs>\n\n  <!-- 1. Reusable spark / pop lines (top-right of logo.png, hidden by default, burst on trigger) -->\n  <g id=\"jobi-pop-lines\" style=\"transform-origin: 164px 28px;\">\n    <line class=\"jobi-pop-ray jobi-pop-ray-1\" x1=\"154\" y1=\"22\" x2=\"162\" y2=\"5\" stroke=\"var(--jobi-pop-color, #0C70F8)\" stroke-width=\"6.5\" stroke-linecap=\"round\"/>\n    <line class=\"jobi-pop-ray jobi-pop-ray-2\" x1=\"166\" y1=\"30\" x2=\"183\" y2=\"17\" stroke=\"var(--jobi-pop-color, #0C70F8)\" stroke-width=\"6.5\" stroke-linecap=\"round\"/>\n    <line class=\"jobi-pop-ray jobi-pop-ray-3\" x1=\"170\" y1=\"42\" x2=\"190\" y2=\"39\" stroke=\"var(--jobi-pop-color, #0C70F8)\" stroke-width=\"6.5\" stroke-linecap=\"round\"/>\n  </g>\n\n  <!-- 2. Ground shadow beneath Jobi (scales inversely during jumps) -->\n  <ellipse id=\"jobi-ground-shadow\" cx=\"100\" cy=\"206\" rx=\"50\" ry=\"7\" fill=\"#0A2B6D\" opacity=\"0.14\" style=\"transform-origin: 100px 206px;\"/>\n\n  <!-- 3. Root full-body squash-and-stretch wrapper -->\n  <g id=\"jobi-root\" style=\"transform-origin: 100px 198px;\">\n\n    <!-- 3A. Torso, structured backpack, articulated legs, shoulder/neck sockets & JobMatch chest emblem -->\n    <g id=\"jobi-body\" style=\"transform-origin: 100px 158px;\">\n\n      <!-- Structured blue backpack peeking behind left torso (from t-pose & side view) -->\n      <g id=\"jobi-backpack\" style=\"transform-origin: 64px 152px;\">\n        <rect x=\"46\" y=\"126\" width=\"24\" height=\"52\" rx=\"11\" fill=\"url(#jobi-g-brand-dark)\" stroke=\"#05358E\" stroke-width=\"1.5\"/>\n        <path d=\"M 52 134 V 170\" fill=\"none\" stroke=\"#4D9FFF\" stroke-width=\"2\" stroke-linecap=\"round\" opacity=\"0.7\"/>\n        <rect x=\"48\" y=\"151\" width=\"11\" height=\"18\" rx=\"4\" fill=\"#084BC0\" stroke=\"#042E7D\" stroke-width=\"1.2\"/>\n      </g>\n\n      <!-- Individually articulated legs with spherical hip connectors (zero gaps during jumps/runs) -->\n      <g id=\"jobi-legs\">\n        <!-- Left Leg (pivoted at hip 81, 174) -->\n        <g id=\"jobi-leg-left\" style=\"transform-origin: 81px 174px;\">\n          <circle cx=\"81\" cy=\"174\" r=\"11\" fill=\"#C4DBF9\"/>\n          <rect x=\"68\" y=\"170\" width=\"25\" height=\"26\" rx=\"11\" fill=\"url(#jobi-g-shell-shade)\" stroke=\"#ACC9F3\" stroke-width=\"1.4\"/>\n          <path d=\"M 68 176 Q 80 184 93 179\" fill=\"none\" stroke=\"#96BBEF\" stroke-width=\"1.6\" stroke-linecap=\"round\"/>\n          <path d=\"M 63 201 C 62 191, 73 188, 84 189 C 92 190, 96 193, 96 201 C 96 204, 63 204, 63 201 Z\" fill=\"url(#jobi-g-brand)\" stroke=\"#063B9E\" stroke-width=\"1.6\"/>\n          <path d=\"M 68 197 C 72 193, 81 193, 86 196\" fill=\"none\" stroke=\"#66AEFF\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\"0.8\"/>\n        </g>\n\n        <!-- Right Leg (pivoted at hip 119, 174) -->\n        <g id=\"jobi-leg-right\" style=\"transform-origin: 119px 174px;\">\n          <circle cx=\"119\" cy=\"174\" r=\"11\" fill=\"#C4DBF9\"/>\n          <rect x=\"107\" y=\"170\" width=\"25\" height=\"26\" rx=\"11\" fill=\"url(#jobi-g-shell-shade)\" stroke=\"#ACC9F3\" stroke-width=\"1.4\"/>\n          <path d=\"M 107 179 Q 120 184 132 176\" fill=\"none\" stroke=\"#96BBEF\" stroke-width=\"1.6\" stroke-linecap=\"round\"/>\n          <path d=\"M 104 201 C 104 193, 108 190, 116 189 C 127 188, 138 191, 137 201 C 137 204, 104 204, 104 201 Z\" fill=\"url(#jobi-g-brand)\" stroke=\"#063B9E\" stroke-width=\"1.6\"/>\n          <path d=\"M 114 196 C 119 193, 128 193, 132 197\" fill=\"none\" stroke=\"#66AEFF\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\"0.8\"/>\n        </g>\n      </g>\n\n      <!-- Spherical Neck Ball-Joint Connector at (100, 120) -->\n      <ellipse cx=\"100\" cy=\"120\" rx=\"19\" ry=\"10\" fill=\"#BDD6F8\" stroke=\"#9EC0F0\" stroke-width=\"1.2\"/>\n\n      <!-- Spherical Shoulder Socket Rings at Left (134, 136) and Right (66, 136) -->\n      <circle cx=\"66\" cy=\"136\" r=\"12\" fill=\"#BDD6F8\" stroke=\"#9EC0F0\" stroke-width=\"1.4\"/>\n      <circle cx=\"134\" cy=\"136\" r=\"12\" fill=\"#BDD6F8\" stroke=\"#9EC0F0\" stroke-width=\"1.4\"/>\n\n      <!-- Main Rounded Pear/Oval White Robot Torso -->\n      <path d=\"M 72 119 C 84 116, 116 116, 128 119 C 139 131, 141 160, 133 174 C 124 185, 76 185, 67 174 C 59 160, 61 131, 72 119 Z\" fill=\"url(#jobi-g-shell)\" stroke=\"#B2CEF6\" stroke-width=\"1.6\"/>\n\n      <!-- Soft lower belly shading & bright white chest oval -->\n      <path d=\"M 66 165 C 76 180, 124 180, 134 165 C 133 174, 123 183, 100 183 C 77 183, 67 174, 66 165 Z\" fill=\"#C2DAFA\" opacity=\"0.82\"/>\n      <ellipse cx=\"100\" cy=\"148\" rx=\"26\" ry=\"23\" fill=\"#FFFFFF\"/>\n\n      <!-- Vibrant blue backpack straps curving over shoulders -->\n      <path d=\"M 68 120 C 75 120, 80 133, 78 148 C 76 161, 69 170, 63 172 C 60 166, 63 157, 66 146 C 69 135, 65 124, 62 121 Z\" fill=\"url(#jobi-g-brand)\" stroke=\"#063B9E\" stroke-width=\"1.4\" stroke-linejoin=\"round\"/>\n      <path d=\"M 132 120 C 125 120, 120 133, 122 148 C 124 161, 131 170, 137 172 C 140 166, 137 157, 134 146 C 131 135, 135 124, 138 121 Z\" fill=\"url(#jobi-g-brand)\" stroke=\"#063B9E\" stroke-width=\"1.4\" stroke-linejoin=\"round\"/>\n\n      <!-- JobMatch chest wordmark + bold up-right arrow -->\n      <g id=\"jobi-chest-brand\" transform=\"translate(100, 150)\">\n        <text x=\"-7\" y=\"-3\" text-anchor=\"middle\" font-family=\"Inter, system-ui, -apple-system, sans-serif\" font-weight=\"800\" font-size=\"14\" fill=\"var(--jobi-navy, #06215C)\" letter-spacing=\"-0.5\">Job</text>\n        <g transform=\"translate(7, -14.5)\">\n          <path d=\"M 2 10.5 L 10.5 2 M 4 2 L 10.5 2 L 10.5 8.5\" fill=\"none\" stroke=\"var(--jobi-blue, #0C70F8)\" stroke-width=\"2.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n        </g>\n        <text x=\"0\" y=\"11\" text-anchor=\"middle\" font-family=\"Inter, system-ui, -apple-system, sans-serif\" font-weight=\"800\" font-size=\"13.4\" fill=\"var(--jobi-navy, #06215C)\" letter-spacing=\"-0.5\">Match</text>\n      </g>\n    </g>\n\n    <!-- 3C. Right Arm (pivoted at shoulder socket 66, 136 — viewer's left side; hand permanently welded at wrist ball-joint 32, 150) -->\n    <g id=\"jobi-arm-right\" style=\"transform-origin: 66px 136px;\">\n      <!-- Seamless spherical shoulder ball-joint cap centered at (66, 136) -->\n      <circle cx=\"66\" cy=\"136\" r=\"10.5\" fill=\"url(#jobi-g-shell)\"/>\n      <!-- Smooth tapered capsule arm extending outward-left from shoulder (66, 136) to wrist ball-joint (32, 150) -->\n      <path d=\"M 70 127 C 56 127, 42 134, 30 142 C 23 147, 25 159, 35 159 C 47 159, 60 151, 72 144 C 76 139, 75 128, 70 127 Z\" fill=\"url(#jobi-g-shell)\" stroke=\"#B0CEF6\" stroke-width=\"1.5\"/>\n      <!-- Soft underside arm shading -->\n      <path d=\"M 33 154 C 45 156, 58 150, 70 142\" fill=\"none\" stroke=\"#BDD6F8\" stroke-width=\"3\" stroke-linecap=\"round\"/>\n      <!-- Concentric wrist ball-joint socket centered at (32, 150) — guarantees hand never detaches at any rotation -->\n      <circle cx=\"32\" cy=\"150\" r=\"9.5\" fill=\"#063B9E\"/>\n\n      <!-- Prop slot container anchored directly at the wrist center (32, 150) -->\n      <g id=\"jobi-prop-slot\" data-prop=\"phone\" style=\"transform-origin: 32px 150px;\">\n\n        <!-- Prop 0: none -->\n        <g data-prop=\"none\"></g>\n\n        <!-- Prop 1: phone (default from logo.png & Facebook ref) -->\n        <g data-prop=\"phone\">\n          <g transform=\"translate(26, 143) rotate(-16)\">\n            <rect x=\"-19\" y=\"-27\" width=\"38\" height=\"52\" rx=\"7.5\" fill=\"#0B5ED7\" transform=\"translate(2, 2)\"/>\n            <rect x=\"-19\" y=\"-27\" width=\"38\" height=\"52\" rx=\"7.5\" fill=\"#061E52\" stroke=\"#1E75FF\" stroke-width=\"2\"/>\n            <path d=\"M -6 4 L 6 -8 M -2 -8 L 6 -8 L 6 0\" fill=\"none\" stroke=\"#399BFF\" stroke-width=\"3.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n          </g>\n        </g>\n\n        <!-- Prop 2: trophy -->\n        <g data-prop=\"trophy\">\n          <g transform=\"translate(24, 138) rotate(-10)\">\n            <path d=\"M-13 -17 H13 V-4 C13 6 5.5 12 0 12 C-5.5 12 -13 6 -13 -4 Z\" fill=\"url(#jobi-g-gold)\" stroke=\"#C87D0A\" stroke-width=\"1.5\"/>\n            <path d=\"M-13 -13 H-18 C-18 -5 -15 0 -11 0 M13 -13 H18 C18 -5 15 0 11 0\" fill=\"none\" stroke=\"#F5A524\" stroke-width=\"2.8\" stroke-linecap=\"round\"/>\n            <rect x=\"-3.5\" y=\"12\" width=\"7\" height=\"8\" fill=\"#D98A12\"/>\n            <rect x=\"-10\" y=\"19\" width=\"20\" height=\"5.5\" rx=\"2.5\" fill=\"#0A2B6D\"/>\n            <polygon points=\"0,-11 1.8,-6.5 6.5,-6.5 2.8,-3.8 4,1 0,-1.8 -4,1 -2.8,-3.8 -6.5,-6.5 -1.8,-6.5\" fill=\"#FFF7DC\"/>\n          </g>\n        </g>\n\n        <!-- Prop 3: medal -->\n        <g data-prop=\"medal\">\n          <g transform=\"translate(25, 142) rotate(-8)\">\n            <path d=\"M-8 -18 L-2 -4 L3 -4 L-3 -18 Z\" fill=\"#0C70F8\"/>\n            <path d=\"M8 -18 L2 -4 L-3 -4 L3 -18 Z\" fill=\"#FF7A6B\"/>\n            <circle cx=\"0\" cy=\"6\" r=\"14\" fill=\"url(#jobi-g-gold)\" stroke=\"#C87D0A\" stroke-width=\"1.8\"/>\n            <circle cx=\"0\" cy=\"6\" r=\"10\" fill=\"none\" stroke=\"#FFF3C4\" stroke-width=\"1.2\"/>\n            <polygon points=\"0,-1 2,3.2 6.5,3.8 3.2,7 4,11.5 0,9.4 -4,11.5 -3.2,7 -6.5,3.8 -2,3.2\" fill=\"#FFF9E6\"/>\n          </g>\n        </g>\n\n        <!-- Prop 4: clipboard -->\n        <g data-prop=\"clipboard\">\n          <g transform=\"translate(25, 144) rotate(-14)\">\n            <rect x=\"-16\" y=\"-22\" width=\"32\" height=\"44\" rx=\"5\" fill=\"#FFFFFF\" stroke=\"#0A2B6D\" stroke-width=\"2\"/>\n            <rect x=\"-8\" y=\"-25\" width=\"16\" height=\"6\" rx=\"2\" fill=\"#0C70F8\"/>\n            <line x1=\"-10\" y1=\"-10\" x2=\"10\" y2=\"-10\" stroke=\"#94A3B8\" stroke-width=\"2.4\" stroke-linecap=\"round\"/>\n            <line x1=\"-10\" y1=\"-2\" x2=\"6\" y2=\"-2\" stroke=\"#94A3B8\" stroke-width=\"2.4\" stroke-linecap=\"round\"/>\n            <polyline points=\"-10,8 -5,13 5,3\" fill=\"none\" stroke=\"#14804F\" stroke-width=\"2.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n          </g>\n        </g>\n\n        <!-- Prop 5: briefcase -->\n        <g data-prop=\"briefcase\">\n          <g transform=\"translate(24, 148) rotate(-12)\">\n            <path d=\"M-7 -17 V-22 C-7 -24 -5 -25 -3 -25 H3 C5 -25 7 -24 7 -22 V-17\" fill=\"none\" stroke=\"#0A2B6D\" stroke-width=\"2.8\"/>\n            <rect x=\"-20\" y=\"-17\" width=\"40\" height=\"29\" rx=\"5.5\" fill=\"#0A2B6D\" stroke=\"#2B86FF\" stroke-width=\"1.5\"/>\n            <path d=\"M-20 -4 Q0 2 20 -4\" fill=\"none\" stroke=\"#3994FF\" stroke-width=\"1.8\"/>\n            <rect x=\"-3.5\" y=\"-6\" width=\"7\" height=\"5.5\" rx=\"1.5\" fill=\"#F5A524\"/>\n          </g>\n        </g>\n\n        <!-- Prop 6: magnifying-glass -->\n        <g data-prop=\"magnifying-glass\">\n          <g transform=\"translate(24, 138) rotate(-24)\">\n            <line x1=\"0\" y1=\"6\" x2=\"0\" y2=\"23\" stroke=\"#0A2B6D\" stroke-width=\"5.5\" stroke-linecap=\"round\"/>\n            <circle cx=\"0\" cy=\"-7\" r=\"13.5\" fill=\"#EBF3FF\" fill-opacity=\"0.78\" stroke=\"#0C70F8\" stroke-width=\"4\"/>\n            <path d=\"M-6 -12 A7 7 0 0 1 3 -13\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"2.2\" stroke-linecap=\"round\"/>\n          </g>\n        </g>\n\n        <!-- Prop 7: calendar -->\n        <g data-prop=\"calendar\">\n          <g transform=\"translate(24, 144) rotate(-12)\">\n            <rect x=\"-17\" y=\"-18\" width=\"34\" height=\"34\" rx=\"5.5\" fill=\"#FFFFFF\" stroke=\"#0A2B6D\" stroke-width=\"2\"/>\n            <path d=\"M-17 -8 H17 V-13 C17 -16 15 -18 12 -18 H-12 C-15 -18 -17 -16 -17 -13 Z\" fill=\"#0C70F8\"/>\n            <line x1=\"-8\" y1=\"-21\" x2=\"-8\" y2=\"-15\" stroke=\"#0A2B6D\" stroke-width=\"2.8\" stroke-linecap=\"round\"/>\n            <line x1=\"8\" y1=\"-21\" x2=\"8\" y2=\"-15\" stroke=\"#0A2B6D\" stroke-width=\"2.8\" stroke-linecap=\"round\"/>\n            <circle cx=\"-7\" cy=\"0\" r=\"2\" fill=\"#CBD5E1\"/>\n            <circle cx=\"0\" cy=\"0\" r=\"2\" fill=\"#CBD5E1\"/>\n            <circle cx=\"7\" cy=\"0\" r=\"2\" fill=\"#14804F\"/>\n            <circle cx=\"-7\" cy=\"8\" r=\"2\" fill=\"#CBD5E1\"/>\n            <circle cx=\"0\" cy=\"8\" r=\"2\" fill=\"#0C70F8\"/>\n          </g>\n        </g>\n\n        <!-- Prop 8: paper-plane -->\n        <g data-prop=\"paper-plane\">\n          <g transform=\"translate(22, 138) rotate(-22)\">\n            <polygon points=\"-18,4 16,-13 2,16 -4,5\" fill=\"#EBF3FF\" stroke=\"#0C70F8\" stroke-width=\"2\" stroke-linejoin=\"round\"/>\n            <polyline points=\"-4,5 16,-13 -8,9\" fill=\"none\" stroke=\"#0C70F8\" stroke-width=\"1.8\" stroke-linejoin=\"round\"/>\n          </g>\n        </g>\n\n        <!-- Prop 9: megaphone -->\n        <g data-prop=\"megaphone\">\n          <g transform=\"translate(22, 140) rotate(-20)\">\n            <path d=\"M-15 -14 L6 -6 V2 L-15 10 Z\" fill=\"url(#jobi-g-brand)\" stroke=\"#0A2B6D\" stroke-width=\"1.8\" stroke-linejoin=\"round\"/>\n            <rect x=\"6\" y=\"-7\" width=\"7\" height=\"10\" rx=\"2\" fill=\"#F5A524\" stroke=\"#0A2B6D\" stroke-width=\"1.5\"/>\n            <path d=\"M5 3 L3 12 H8 L10 3\" fill=\"#0A2B6D\"/>\n            <path d=\"M-19 -8 Q-24 -2 -19 4 M-23 -12 Q-30 -2 -23 8\" fill=\"none\" stroke=\"#F5A524\" stroke-width=\"2.4\" stroke-linecap=\"round\"/>\n          </g>\n        </g>\n\n        <!-- Prop 10: graduation-cap -->\n        <g data-prop=\"graduation-cap\">\n          <g transform=\"translate(23, 138) rotate(-14)\">\n            <polygon points=\"0,-14 21,-4 0,5 -21,-4\" fill=\"#0A2B6D\" stroke=\"#2B86FF\" stroke-width=\"1.5\"/>\n            <path d=\"M-11 1 V10 C-11 13.5 11 13.5 11 10 V1\" fill=\"#0C70F8\"/>\n            <path d=\"M16 -2 V11\" fill=\"none\" stroke=\"#F5A524\" stroke-width=\"2.2\" stroke-linecap=\"round\"/>\n            <circle cx=\"16\" cy=\"12\" r=\"2.5\" fill=\"#F5A524\"/>\n          </g>\n        </g>\n\n        <!-- Prop 11: coffee-mug -->\n        <g data-prop=\"coffee-mug\">\n          <g transform=\"translate(25, 144) rotate(-8)\">\n            <path d=\"M-11 -8 H-16 C-19 -8 -19 4 -16 4 H-11\" fill=\"none\" stroke=\"#0A2B6D\" stroke-width=\"3\"/>\n            <rect x=\"-11\" y=\"-13\" width=\"23\" height=\"27\" rx=\"5.5\" fill=\"#FFFFFF\" stroke=\"#0A2B6D\" stroke-width=\"2\"/>\n            <rect x=\"-8\" y=\"-4\" width=\"17\" height=\"9\" rx=\"2.5\" fill=\"#0C70F8\"/>\n            <path d=\"M-4 -17 Q-2 -22 -4 -25 M3 -17 Q5 -22 3 -25\" fill=\"none\" stroke=\"#94A3B8\" stroke-width=\"1.8\" stroke-linecap=\"round\"/>\n          </g>\n        </g>\n\n        <!-- Prop 12: stamp -->\n        <g data-prop=\"stamp\">\n          <g transform=\"translate(24, 144) rotate(-14)\">\n            <rect x=\"-16\" y=\"-11\" width=\"32\" height=\"22\" rx=\"4.5\" fill=\"#E7F5EE\" stroke=\"#14804F\" stroke-width=\"2.2\"/>\n            <polyline points=\"-7,0 -2,5 8,-5\" fill=\"none\" stroke=\"#14804F\" stroke-width=\"3.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n          </g>\n        </g>\n\n        <!-- Prop 13: hard-hat -->\n        <g data-prop=\"hard-hat\">\n          <g transform=\"translate(23, 142) rotate(-12)\">\n            <path d=\"M-17 4 C-17 -10 17 -10 17 4 Z\" fill=\"url(#jobi-g-gold)\" stroke=\"#C87D0A\" stroke-width=\"1.8\"/>\n            <rect x=\"-3.5\" y=\"-9\" width=\"7\" height=\"13\" rx=\"2\" fill=\"#FFE082\"/>\n            <rect x=\"-20\" y=\"3\" width=\"40\" height=\"4.5\" rx=\"2.2\" fill=\"#F5A524\" stroke=\"#C87D0A\" stroke-width=\"1.4\"/>\n          </g>\n        </g>\n\n        <!-- Prop 14: balloons -->\n        <g data-prop=\"balloons\">\n          <g transform=\"translate(20, 122) rotate(-8)\">\n            <path d=\"M-7 5 Q-3 20 5 30 M7 1 Q6 18 5 30\" fill=\"none\" stroke=\"#94A3B8\" stroke-width=\"1.5\"/>\n            <ellipse cx=\"-8\" cy=\"-7\" rx=\"10.5\" ry=\"12.5\" fill=\"#0C70F8\"/>\n            <ellipse cx=\"-11\" cy=\"-10\" rx=\"2.5\" ry=\"4.5\" fill=\"#77B6FF\" opacity=\"0.75\"/>\n            <ellipse cx=\"7\" cy=\"-12\" rx=\"10.5\" ry=\"12.5\" fill=\"#F5A524\"/>\n            <ellipse cx=\"4\" cy=\"-15\" rx=\"2.5\" ry=\"4.5\" fill=\"#FFE699\" opacity=\"0.75\"/>\n          </g>\n        </g>\n\n        <!-- Prop 15: map -->\n        <g data-prop=\"map\">\n          <g transform=\"translate(24, 144) rotate(-12)\">\n            <polygon points=\"-16,-12 -5,-16 5,-12 16,-16 16,12 5,16 -5,12 -16,16\" fill=\"#EBF3FF\" stroke=\"#0C70F8\" stroke-width=\"1.8\" stroke-linejoin=\"round\"/>\n            <line x1=\"-5\" y1=\"-16\" x2=\"-5\" y2=\"12\" stroke=\"#93C5FD\" stroke-width=\"1.4\"/>\n            <line x1=\"5\" y1=\"-12\" x2=\"5\" y2=\"16\" stroke=\"#93C5FD\" stroke-width=\"1.4\"/>\n            <path d=\"M0 -11 C-4.5 -11 -7 -7.5 -7 -4 C-7 1 0 7 0 7 C0 7 7 1 7 -4 C7 -7.5 4.5 -11 0 -11 Z\" fill=\"#FF7A6B\" stroke=\"#FFFFFF\" stroke-width=\"1.1\"/>\n            <circle cx=\"0\" cy=\"-4\" r=\"2\" fill=\"#FFFFFF\"/>\n          </g>\n        </g>\n\n        <!-- Prop 16: padlock -->\n        <g data-prop=\"padlock\">\n          <g transform=\"translate(24, 143) rotate(-10)\">\n            <path d=\"M-7 -7 V-14 C-7 -19 5 -19 7 -14\" fill=\"none\" stroke=\"#14804F\" stroke-width=\"3.2\" stroke-linecap=\"round\"/>\n            <rect x=\"-13.5\" y=\"-7\" width=\"27\" height=\"21\" rx=\"5.5\" fill=\"url(#jobi-g-gold)\" stroke=\"#C87D0A\" stroke-width=\"1.8\"/>\n            <circle cx=\"0\" cy=\"1.5\" r=\"2.5\" fill=\"#0A2B6D\"/>\n            <line x1=\"0\" y1=\"3.5\" x2=\"0\" y2=\"8\" stroke=\"#0A2B6D\" stroke-width=\"2.2\" stroke-linecap=\"round\"/>\n          </g>\n        </g>\n\n        <!-- Prop 17: shield -->\n        <g data-prop=\"shield\">\n          <g transform=\"translate(24, 143) rotate(-10)\">\n            <path d=\"M0 -16 L14 -11 V0 C14 9.5 7 16 0 18.5 C-7 16 -14 9.5 -14 0 V-11 Z\" fill=\"url(#jobi-g-brand)\" stroke=\"#0A2B6D\" stroke-width=\"1.8\"/>\n            <polyline points=\"-5,1 -1,5 7,-3.5\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"2.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n          </g>\n        </g>\n\n        <!-- Prop 18: bell -->\n        <g data-prop=\"bell\">\n          <g transform=\"translate(24, 142) rotate(-12)\">\n            <path d=\"M-12 7 H12 L9 -3 C9 -10 4.5 -14.5 0 -14.5 C-4.5 -14.5 -9 -10 -9 -3 Z\" fill=\"url(#jobi-g-gold)\" stroke=\"#C87D0A\" stroke-width=\"1.8\" stroke-linejoin=\"round\"/>\n            <circle cx=\"0\" cy=\"10\" r=\"3.2\" fill=\"#0A2B6D\"/>\n            <circle cx=\"0\" cy=\"-16\" r=\"2\" fill=\"#C87D0A\"/>\n          </g>\n        </g>\n\n      </g>\n\n      <!-- Vibrant blue right hand permanently centered at wrist ball-joint (32, 150) — zero gap possible -->\n      <g id=\"jobi-hand-right\" style=\"transform-origin: 32px 150px;\">\n        <circle cx=\"32\" cy=\"150\" r=\"12\" fill=\"url(#jobi-g-brand)\" stroke=\"#063B9E\" stroke-width=\"1.4\"/>\n        <circle cx=\"36\" cy=\"146\" r=\"4.8\" fill=\"#338FFF\"/>\n        <path d=\"M 27 148 Q 32 153 38 149\" fill=\"none\" stroke=\"#05328A\" stroke-width=\"1.6\" stroke-linecap=\"round\"/>\n      </g>\n    </g>\n\n    <!-- 3B. Left Arm (pivoted at shoulder socket 134, 136 — viewer's right side; hand permanently welded at wrist ball-joint 164, 121) -->\n    <g id=\"jobi-arm-left\" style=\"transform-origin: 134px 136px;\">\n      <!-- Seamless spherical shoulder ball-joint cap centered at (134, 136) -->\n      <circle cx=\"134\" cy=\"136\" r=\"10.5\" fill=\"url(#jobi-g-shell)\"/>\n      <!-- Smooth tapered capsule arm extending outward-right from shoulder (134, 136) to wrist ball-joint (164, 121) -->\n      <path d=\"M 130 127 C 143 126, 155 120, 162 113 C 169 115, 171 126, 163 132 C 154 139, 142 142, 131 143 Z\" fill=\"url(#jobi-g-shell)\" stroke=\"#B0CEF6\" stroke-width=\"1.5\"/>\n      <!-- Soft underside arm shading -->\n      <path d=\"M 134 139 C 145 138, 155 134, 163 127\" fill=\"none\" stroke=\"#BDD6F8\" stroke-width=\"3\" stroke-linecap=\"round\"/>\n      <!-- Concentric wrist ball-joint socket centered at (164, 121) — guarantees hand never detaches at any rotation -->\n      <circle cx=\"164\" cy=\"121\" r=\"9.5\" fill=\"#063B9E\"/>\n      <!-- Vibrant blue gloved hand centered directly on wrist ball-joint (164, 121) with transform-origin: 164px 121px -->\n      <g id=\"jobi-hand-left\" style=\"transform-origin: 164px 121px;\">\n        <!-- Thumb pointing up -->\n        <rect x=\"158\" y=\"99\" width=\"11\" height=\"17\" rx=\"5.5\" fill=\"url(#jobi-g-brand)\" stroke=\"#063B9E\" stroke-width=\"1.4\"/>\n        <!-- Gloved palm/fist centered over the wrist ball-joint (165, 120) -->\n        <circle cx=\"165\" cy=\"120\" r=\"12.5\" fill=\"url(#jobi-g-brand)\" stroke=\"#063B9E\" stroke-width=\"1.4\"/>\n        <!-- Curled finger details -->\n        <path d=\"M 161 115.5 C 167 114.5, 171.5 115.5, 173.5 117.5 M 160.5 121 C 166 120, 171.5 121, 173.5 123 M 162 126.5 C 167 125.5, 170.5 126.5, 172.5 127.5\" fill=\"none\" stroke=\"#05328A\" stroke-width=\"1.7\" stroke-linecap=\"round\"/>\n        <ellipse cx=\"162.5\" cy=\"106.5\" rx=\"1.8\" ry=\"3.2\" fill=\"#70B5FF\" opacity=\"0.8\"/>\n      </g>\n    </g>\n\n    <!-- 3D. Head (pivoted at neck ball-joint 100, 120 — pixel-traced continuous curvature superellipse from head.png) -->\n    <g id=\"jobi-head\" style=\"transform-origin: 100px 120px;\">\n\n      <!-- 1. Top Headphone Arch & Twin Side Ridges (exact pixel-traced contour from head.png y=15..62) -->\n      <g id=\"jobi-headband-top\">\n        <!-- Center top arch (y=15 at peak, hugging the top dome) -->\n        <path d=\"M 56 26.5 C 74 13.5, 126 13.5, 144 26.5 L 140 35 C 122 23, 78 23, 60 35 Z\" fill=\"url(#jobi-g-brand-dark)\" stroke=\"#05358E\" stroke-width=\"1.4\"/>\n        <!-- Inner arch bevel band (from head.png) -->\n        <path d=\"M 64 23 C 82 16, 118 16, 136 23\" fill=\"none\" stroke=\"#5AA7FF\" stroke-width=\"3.2\" stroke-linecap=\"round\" opacity=\"0.85\"/>\n        <!-- Left top rounded ear-ridge (bulges smoothly from x=35..62, y=24..59) -->\n        <path d=\"M 35.5 58 C 31.5 39, 41 24.5, 60 24.5 C 50 32, 43 44, 41 59 Z\" fill=\"url(#jobi-g-brand)\" stroke=\"#05358E\" stroke-width=\"1.4\" stroke-linejoin=\"round\"/>\n        <path d=\"M 39 48 C 41 37, 47 30, 55 27.5\" fill=\"none\" stroke=\"#66AEFF\" stroke-width=\"2\" stroke-linecap=\"round\" opacity=\"0.7\"/>\n        <!-- Right top rounded ear-ridge (bulges smoothly from x=140..164.5, y=24..59) -->\n        <path d=\"M 164.5 58 C 168.5 39, 159 24.5, 140 24.5 C 150 32, 157 44, 159 59 Z\" fill=\"url(#jobi-g-brand)\" stroke=\"#05358E\" stroke-width=\"1.4\" stroke-linejoin=\"round\"/>\n        <path d=\"M 161 48 C 159 37, 153 30, 145 27.5\" fill=\"none\" stroke=\"#66AEFF\" stroke-width=\"2\" stroke-linecap=\"round\" opacity=\"0.7\"/>\n      </g>\n\n      <!-- 2. Left & Right Multi-Layered Headphone Earcups (pixel-traced from head.png x=26..43 and x=157..174) -->\n      <g id=\"jobi-earcups\">\n        <!-- Left outer glossy white/ice-blue dome cap (x=26..35, y=64..102) -->\n        <path d=\"M 34 64 C 23.5 66, 23.5 100, 34 102 Z\" fill=\"url(#jobi-g-shell)\" stroke=\"#A5C4F0\" stroke-width=\"1.4\"/>\n        <path d=\"M 29.5 72 C 27.5 78, 27.5 88, 29.5 94\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"2.2\" stroke-linecap=\"round\"/>\n        <!-- Left middle vibrant blue cushion (tapered organic capsule hugging helmet side x=33..44, y=58..105) -->\n        <path d=\"M 41 58 C 34 58, 32 64, 32 81.5 C 32 99, 34 105, 41 105 C 44 105, 44.5 96, 44.5 81.5 C 44.5 67, 44 58, 41 58 Z\" fill=\"url(#jobi-g-brand)\" stroke=\"#05358E\" stroke-width=\"1.4\"/>\n        <path d=\"M 36.5 65 C 35.5 74, 35.5 88, 36.5 97\" fill=\"none\" stroke=\"#6BB3FF\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\"0.8\"/>\n\n        <!-- Right outer glossy white/ice-blue dome cap (x=166..174, y=64..102) -->\n        <path d=\"M 166 64 C 176.5 66, 176.5 100, 166 102 Z\" fill=\"url(#jobi-g-shell)\" stroke=\"#A5C4F0\" stroke-width=\"1.4\"/>\n        <path d=\"M 170.5 72 C 172.5 78, 172.5 88, 170.5 94\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"2.2\" stroke-linecap=\"round\"/>\n        <!-- Right middle vibrant blue cushion (x=155.5..168, y=58..105) -->\n        <path d=\"M 159 58 C 166 58, 168 64, 168 81.5 C 168 99, 166 105, 159 105 C 156 105, 155.5 96, 155.5 81.5 C 155.5 67, 156 58, 159 58 Z\" fill=\"url(#jobi-g-brand)\" stroke=\"#05358E\" stroke-width=\"1.4\"/>\n        <path d=\"M 163.5 65 C 164.5 74, 164.5 88, 163.5 97\" fill=\"none\" stroke=\"#6BB3FF\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\"0.8\"/>\n      </g>\n\n      <!-- 3. Main White Superellipse Helmet Shell (pixel-traced from head.png: x=40..160, y=23.7..124.5)\n           Zero straight edges — continuous G2 curvature across crown, cheeks, and chin -->\n      <path d=\"M 100 23.7 C 138.5 23.7, 159.5 39.5, 159.5 75.5 C 159.5 109.5, 140.5 124.2, 100 124.2 C 59.5 124.2, 40.5 109.5, 40.5 75.5 C 40.5 39.5, 61.5 23.7, 100 23.7 Z\" fill=\"url(#jobi-g-shell)\" stroke=\"#ACC9F4\" stroke-width=\"1.6\"/>\n      <!-- Soft cool-blue lower chin & cheek 3D rim shading (matching head.png y=104..124) -->\n      <path d=\"M 44 92 C 48 113, 68 120, 100 120 C 132 120, 152 113, 156 92 C 153 114, 134 123.5, 100 123.5 C 66 123.5, 47 114, 44 92 Z\" fill=\"#BCD5F7\" opacity=\"0.88\"/>\n      <!-- Crisp top white specular crown highlight -->\n      <path d=\"M 62 30 C 80 25.5, 120 25.5, 138 30\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"3.2\" stroke-linecap=\"round\"/>\n\n      <!-- 4. Visor Dark Screen (pixel-traced from head.png: x=50.8..149.2, y=34.4..113.4) -->\n      <g id=\"jobi-visor-bg\">\n        <!-- Outer soft blue bezel rim around visor -->\n        <path d=\"M 100 33.4 C 133 33.4, 150.4 46.2, 150.4 76 C 150.4 104.4, 134.4 114.5, 100 114.5 C 65.6 114.5, 49.6 104.4, 49.6 76 C 49.6 46.2, 67 33.4, 100 33.4 Z\" fill=\"#8FB5E8\"/>\n        <!-- Main deep radial-gradient navy visor screen -->\n        <path d=\"M 100 34.4 C 132 34.4, 149.2 47, 149.2 76 C 149.2 103.5, 133.5 113.4, 100 113.4 C 66.5 113.4, 50.8 103.5, 50.8 76 C 50.8 47, 68 34.4, 100 34.4 Z\" fill=\"url(#jobi-g-visor)\" stroke=\"#051B4C\" stroke-width=\"1.5\"/>\n        <!-- Top inner screen glow arc -->\n        <path d=\"M 68 41 C 86 37, 114 37, 132 41\" fill=\"none\" stroke=\"#3B96FF\" stroke-width=\"2.2\" stroke-linecap=\"round\" opacity=\"0.32\"/>\n        <!-- Scan sweep beam (animated by .jobi-anim-scan) -->\n        <g clip-path=\"url(#jobi-clip-visor)\">\n          <rect id=\"jobi-scan-beam\" x=\"30\" y=\"32\" width=\"22\" height=\"86\" fill=\"#47A1FF\" opacity=\"0\" transform=\"skewX(-18)\"/>\n        </g>\n      </g>\n\n      <!-- 5. 13 Mutually Exclusive Emotion Faces inside Visor (centered around 100, 76) -->\n      <g id=\"jobi-visor-face\" style=\"transform-origin: 100px 76px;\">\n\n        <!-- 1. wink_thumbs_up (Signature look from Facebook color reference & logo.png) -->\n        <g data-emotion=\"wink_thumbs_up\">\n          <path d=\"M 66 75 C 71 64, 84 64, 89 75\" fill=\"none\" stroke=\"#399BFF\" stroke-width=\"9\" stroke-linecap=\"round\" opacity=\"0.28\"/>\n          <path d=\"M 66 75 C 71 64, 84 64, 89 75\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"6.5\" stroke-linecap=\"round\"/>\n          <rect x=\"114\" y=\"55\" width=\"16\" height=\"25\" rx=\"8\" fill=\"#399BFF\" opacity=\"0.28\"/>\n          <rect x=\"115\" y=\"56\" width=\"14\" height=\"23\" rx=\"7\" fill=\"#FFFFFF\"/>\n          <line x1=\"63\" y1=\"87\" x2=\"60\" y2=\"93\" stroke=\"#42A4FF\" stroke-width=\"4\" stroke-linecap=\"round\"/>\n          <line x1=\"70\" y1=\"87\" x2=\"67\" y2=\"93\" stroke=\"#42A4FF\" stroke-width=\"4\" stroke-linecap=\"round\"/>\n          <line x1=\"130\" y1=\"85\" x2=\"127\" y2=\"91\" stroke=\"#42A4FF\" stroke-width=\"4\" stroke-linecap=\"round\"/>\n          <line x1=\"137\" y1=\"85\" x2=\"134\" y2=\"91\" stroke=\"#42A4FF\" stroke-width=\"4\" stroke-linecap=\"round\"/>\n          <path d=\"M 84 82 H 116 C 116 100, 84 100, 84 82 Z\" fill=\"#031233\"/>\n          <path d=\"M 87 89 Q 100 83 113 89 C 110 98, 90 98, 87 89 Z\" fill=\"#47A1FF\"/>\n        </g>\n\n        <!-- 2. happy (Matches head.png with soft eyebrows, glowing oval eyes & smile) -->\n        <g data-emotion=\"happy\">\n          <path d=\"M 68 53 Q 76 48.5 84 53\" fill=\"none\" stroke=\"#538FD6\" stroke-width=\"3.4\" stroke-linecap=\"round\"/>\n          <path d=\"M 116 53 Q 124 48.5 132 53\" fill=\"none\" stroke=\"#538FD6\" stroke-width=\"3.4\" stroke-linecap=\"round\"/>\n          <ellipse cx=\"76\" cy=\"69\" rx=\"10.5\" ry=\"13\" fill=\"#399BFF\" opacity=\"0.25\"/>\n          <ellipse cx=\"76\" cy=\"69\" rx=\"9\" ry=\"11.5\" fill=\"#FFFFFF\"/>\n          <ellipse cx=\"124\" cy=\"69\" rx=\"10.5\" ry=\"13\" fill=\"#399BFF\" opacity=\"0.25\"/>\n          <ellipse cx=\"124\" cy=\"69\" rx=\"9\" ry=\"11.5\" fill=\"#FFFFFF\"/>\n          <line x1=\"63\" y1=\"87\" x2=\"60\" y2=\"93\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <line x1=\"70\" y1=\"87\" x2=\"67\" y2=\"93\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <line x1=\"130\" y1=\"87\" x2=\"127\" y2=\"93\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <line x1=\"137\" y1=\"87\" x2=\"134\" y2=\"93\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <path d=\"M 85 83 H 115 C 115 99, 85 99, 85 83 Z\" fill=\"#031233\"/>\n          <path d=\"M 88 89 Q 100 84 112 89 C 109 97, 91 97, 88 89 Z\" fill=\"#47A1FF\"/>\n        </g>\n\n        <!-- 3. star_eyes -->\n        <g data-emotion=\"star_eyes\">\n          <polygon points=\"76,54 79.8,62.5 89,63.5 82,69.5 83.8,78.5 76,74 68.2,78.5 70,69.5 63,63.5 72.2,62.5\" fill=\"#FFD464\"/>\n          <polygon points=\"124,54 127.8,62.5 137,63.5 130,69.5 131.8,78.5 124,74 116.2,78.5 118,69.5 111,63.5 120.2,62.5\" fill=\"#FFD464\"/>\n          <line x1=\"63\" y1=\"87\" x2=\"60\" y2=\"93\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <line x1=\"70\" y1=\"87\" x2=\"67\" y2=\"93\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <line x1=\"130\" y1=\"87\" x2=\"127\" y2=\"93\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <line x1=\"137\" y1=\"87\" x2=\"134\" y2=\"93\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <path d=\"M 84 82 H 116 C 116 100, 84 100, 84 82 Z\" fill=\"#031233\"/>\n          <path d=\"M 87 89 Q 100 83 113 89 C 110 98, 90 98, 87 89 Z\" fill=\"#47A1FF\"/>\n        </g>\n\n        <!-- 4. heart_eyes -->\n        <g data-emotion=\"heart_eyes\">\n          <path d=\"M76 77 C76 77 63 69 63 61.5 C63 57 67 54 71.5 54 C74 54 76 56 76 57.8 C76 56 78 54 80.5 54 C85 54 89 57 89 61.5 C89 69 76 77 76 77 Z\" fill=\"#FF7A6B\"/>\n          <path d=\"M124 77 C124 77 111 69 111 61.5 C111 57 115 54 119.5 54 C122 54 124 56 124 57.8 C124 56 126 54 128.5 54 C133 54 137 57 137 61.5 C137 69 124 77 124 77 Z\" fill=\"#FF7A6B\"/>\n          <path d=\"M 85 83 H 115 C 115 99, 85 99, 85 83 Z\" fill=\"#031233\"/>\n          <path d=\"M 88 89 Q 100 84 112 89 C 109 97, 91 97, 88 89 Z\" fill=\"#47A1FF\"/>\n        </g>\n\n        <!-- 5. proud -->\n        <g data-emotion=\"proud\">\n          <path d=\"M 66 72 C 71 61, 83 61, 88 72\" fill=\"none\" stroke=\"#399BFF\" stroke-width=\"8.5\" stroke-linecap=\"round\" opacity=\"0.26\"/>\n          <path d=\"M 66 72 C 71 61, 83 61, 88 72\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"6\" stroke-linecap=\"round\"/>\n          <path d=\"M 112 72 C 117 61, 129 61, 134 72\" fill=\"none\" stroke=\"#399BFF\" stroke-width=\"8.5\" stroke-linecap=\"round\" opacity=\"0.26\"/>\n          <path d=\"M 112 72 C 117 61, 129 61, 134 72\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"6\" stroke-linecap=\"round\"/>\n          <line x1=\"63\" y1=\"85\" x2=\"60\" y2=\"91\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <line x1=\"70\" y1=\"85\" x2=\"67\" y2=\"91\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <line x1=\"130\" y1=\"85\" x2=\"127\" y2=\"91\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <line x1=\"137\" y1=\"85\" x2=\"134\" y2=\"91\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <path d=\"M 87 86 Q 100 96 113 86\" fill=\"none\" stroke=\"#47A1FF\" stroke-width=\"5\" stroke-linecap=\"round\"/>\n        </g>\n\n        <!-- 6. cheering -->\n        <g data-emotion=\"cheering\">\n          <path d=\"M 66 73 C 71 61, 84 61, 89 73\" fill=\"none\" stroke=\"#399BFF\" stroke-width=\"9\" stroke-linecap=\"round\" opacity=\"0.3\"/>\n          <path d=\"M 66 73 C 71 61, 84 61, 89 73\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"6.5\" stroke-linecap=\"round\"/>\n          <path d=\"M 111 73 C 116 61, 129 61, 134 73\" fill=\"none\" stroke=\"#399BFF\" stroke-width=\"9\" stroke-linecap=\"round\" opacity=\"0.3\"/>\n          <path d=\"M 111 73 C 116 61, 129 61, 134 73\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"6.5\" stroke-linecap=\"round\"/>\n          <line x1=\"62\" y1=\"86\" x2=\"59\" y2=\"92\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <line x1=\"69\" y1=\"86\" x2=\"66\" y2=\"92\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <line x1=\"131\" y1=\"86\" x2=\"128\" y2=\"92\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <line x1=\"138\" y1=\"86\" x2=\"135\" y2=\"92\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <path d=\"M 83 81 H 117 C 117 101, 83 101, 83 81 Z\" fill=\"#031233\"/>\n          <path d=\"M 86 89 Q 100 82 114 89 C 111 99, 89 99, 86 89 Z\" fill=\"#47A1FF\"/>\n        </g>\n\n        <!-- 7. thinking -->\n        <g data-emotion=\"thinking\">\n          <path d=\"M 67 54 Q 76 52 84 55\" fill=\"none\" stroke=\"#538FD6\" stroke-width=\"3.2\" stroke-linecap=\"round\"/>\n          <path d=\"M 114 50 Q 124 45 134 51\" fill=\"none\" stroke=\"#47A1FF\" stroke-width=\"3.5\" stroke-linecap=\"round\"/>\n          <ellipse cx=\"76\" cy=\"68\" rx=\"8.5\" ry=\"11\" fill=\"#FFFFFF\"/>\n          <rect x=\"115\" y=\"61\" width=\"17\" height=\"12\" rx=\"6\" fill=\"#FFFFFF\"/>\n          <path d=\"M 89 88 Q 100 85 111 90\" fill=\"none\" stroke=\"#47A1FF\" stroke-width=\"4.5\" stroke-linecap=\"round\"/>\n        </g>\n\n        <!-- 8. scanning -->\n        <g data-emotion=\"scanning\">\n          <rect x=\"64\" y=\"59\" width=\"23\" height=\"15\" rx=\"4.5\" fill=\"none\" stroke=\"#47A1FF\" stroke-width=\"3\"/>\n          <circle cx=\"75.5\" cy=\"66.5\" r=\"3.8\" fill=\"#FFFFFF\"/>\n          <rect x=\"113\" y=\"59\" width=\"23\" height=\"15\" rx=\"4.5\" fill=\"none\" stroke=\"#47A1FF\" stroke-width=\"3\"/>\n          <circle cx=\"124.5\" cy=\"66.5\" r=\"3.8\" fill=\"#FFFFFF\"/>\n          <polyline points=\"81,88 90,88 94,82 100,93 106,84 110,88 119,88\" fill=\"none\" stroke=\"#47A1FF\" stroke-width=\"3.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n        </g>\n\n        <!-- 9. curious -->\n        <g data-emotion=\"curious\">\n          <path d=\"M 67 52 Q 75 48 83 52\" fill=\"none\" stroke=\"#538FD6\" stroke-width=\"3.2\" stroke-linecap=\"round\"/>\n          <path d=\"M 115 49 Q 125 44 134 50\" fill=\"none\" stroke=\"#47A1FF\" stroke-width=\"3.4\" stroke-linecap=\"round\"/>\n          <circle cx=\"75\" cy=\"68\" r=\"9.5\" fill=\"#FFFFFF\"/>\n          <circle cx=\"125\" cy=\"66\" r=\"11.5\" fill=\"#FFFFFF\"/>\n          <circle cx=\"100\" cy=\"88\" r=\"5.5\" fill=\"#47A1FF\"/>\n        </g>\n\n        <!-- 10. oops -->\n        <g data-emotion=\"oops\">\n          <path d=\"M 67 59 L 83 67 L 67 75\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"4.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n          <path d=\"M 133 59 L 117 67 L 133 75\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"4.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n          <path d=\"M 86 89 Q 93 84 100 89 Q 107 94 114 89\" fill=\"none\" stroke=\"#FF7A6B\" stroke-width=\"4.5\" stroke-linecap=\"round\"/>\n          <path d=\"M 141 52 C 141 52 146 59 146 62.5 C 146 65.5 143.8 67.5 141 67.5 C 138.2 67.5 136 65.5 136 62.5 C 136 59 141 52 141 52 Z\" fill=\"#47A1FF\"/>\n        </g>\n\n        <!-- 11. comforting (Exact head.png calm supportive expression: soft eyebrows, glowing white oval eyes, gentle arc smile) -->\n        <g data-emotion=\"comforting\">\n          <path d=\"M 67 54 Q 76 49.5 85 54\" fill=\"none\" stroke=\"#538FD6\" stroke-width=\"3.6\" stroke-linecap=\"round\"/>\n          <path d=\"M 133 54 Q 124 49.5 115 54\" fill=\"none\" stroke=\"#538FD6\" stroke-width=\"3.6\" stroke-linecap=\"round\"/>\n          <ellipse cx=\"76\" cy=\"69\" rx=\"10.5\" ry=\"13\" fill=\"#399BFF\" opacity=\"0.24\"/>\n          <ellipse cx=\"76\" cy=\"69\" rx=\"9\" ry=\"11.5\" fill=\"#FFFFFF\"/>\n          <ellipse cx=\"124\" cy=\"69\" rx=\"10.5\" ry=\"13\" fill=\"#399BFF\" opacity=\"0.24\"/>\n          <ellipse cx=\"124\" cy=\"69\" rx=\"9\" ry=\"11.5\" fill=\"#FFFFFF\"/>\n          <path d=\"M 88 86 Q 100 94 112 86\" fill=\"none\" stroke=\"#538FD6\" stroke-width=\"4.8\" stroke-linecap=\"round\"/>\n        </g>\n\n        <!-- 12. sleepy -->\n        <g data-emotion=\"sleepy\">\n          <path d=\"M 66 70 Q 76 77 86 70\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"5\" stroke-linecap=\"round\"/>\n          <path d=\"M 114 70 Q 124 77 134 70\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"5\" stroke-linecap=\"round\"/>\n          <circle cx=\"100\" cy=\"88\" r=\"4.5\" fill=\"#47A1FF\"/>\n          <text class=\"jobi-zzz\" x=\"136\" y=\"53\" font-family=\"Inter, sans-serif\" font-weight=\"800\" font-size=\"13\" fill=\"#47A1FF\">z</text>\n        </g>\n\n        <!-- 13. waving -->\n        <g data-emotion=\"waving\">\n          <path d=\"M 68 53 Q 76 48.5 84 53\" fill=\"none\" stroke=\"#538FD6\" stroke-width=\"3.4\" stroke-linecap=\"round\"/>\n          <path d=\"M 116 53 Q 124 48.5 132 53\" fill=\"none\" stroke=\"#538FD6\" stroke-width=\"3.4\" stroke-linecap=\"round\"/>\n          <ellipse cx=\"76\" cy=\"68\" rx=\"9\" ry=\"11.5\" fill=\"#FFFFFF\"/>\n          <ellipse cx=\"124\" cy=\"68\" rx=\"9\" ry=\"11.5\" fill=\"#FFFFFF\"/>\n          <line x1=\"63\" y1=\"87\" x2=\"60\" y2=\"93\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <line x1=\"70\" y1=\"87\" x2=\"67\" y2=\"93\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <line x1=\"130\" y1=\"87\" x2=\"127\" y2=\"93\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <line x1=\"137\" y1=\"87\" x2=\"134\" y2=\"93\" stroke=\"#42A4FF\" stroke-width=\"3.8\" stroke-linecap=\"round\"/>\n          <path d=\"M 84 82 H 116 C 116 100, 84 100, 84 82 Z\" fill=\"#031233\"/>\n          <path d=\"M 87 89 Q 100 83 113 89 C 110 98, 90 98, 87 89 Z\" fill=\"#47A1FF\"/>\n        </g>\n\n      </g>\n    </g>\n\n  </g>\n</svg>\n";
  let cachedSvgText = null;
  let cachedSvgBytes = new Blob([FALLBACK_RIG_SVG]).size;
  let fetchPromise = null;

  async function loadRigSvg(customUrl) {
    if (cachedSvgText) return cachedSvgText;
    if (location.protocol === 'file:') {
      cachedSvgText = FALLBACK_RIG_SVG;
      cachedSvgBytes = new Blob([FALLBACK_RIG_SVG]).size;
      return cachedSvgText;
    }
    if (fetchPromise) return fetchPromise;
    const url = customUrl || 'assets/mascot/jobi-rig.svg';
    fetchPromise = fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load jobi-rig.svg (' + res.status + ')');
        return res.text();
      })
      .then(function (txt) {
        cachedSvgText = txt;
        cachedSvgBytes = new Blob([txt]).size;
        return txt;
      })
      .catch(function () {
        cachedSvgText = FALLBACK_RIG_SVG;
        cachedSvgBytes = new Blob([FALLBACK_RIG_SVG]).size;
        return cachedSvgText;
      })
      .finally(function () {
        fetchPromise = null;
      });
    return fetchPromise;
  }

  function applyMascotState(svgEl, state) {
    if (!svgEl) return;
    if (state.emotion) {
      svgEl.setAttribute('data-emotion', state.emotion);
    }
    if (state.prop != null) {
      const slot = svgEl.querySelector('#jobi-prop-slot');
      if (slot) slot.setAttribute('data-prop', state.prop || 'none');
    }
    if (state.ariaLabel != null) {
      if (state.ariaLabel === '') {
        svgEl.setAttribute('aria-hidden', 'true');
        svgEl.removeAttribute('aria-label');
      } else {
        svgEl.removeAttribute('aria-hidden');
        svgEl.setAttribute('aria-label', state.ariaLabel);
      }
    }
    if (state.animation !== undefined) {
      ALL_ANIM_CLASSES.forEach(function (cls) { svgEl.classList.remove(cls); });
      const cls = ANIM_CLASS_MAP[state.animation];
      if (cls && JM.isMotionEnabled()) {
        void svgEl.getBoundingClientRect();
        svgEl.classList.add(cls);
      }
    }
  }

  JM.mascot = {
    EMOTIONS: EMOTIONS,
    PROPS: PROPS,
    ANIMATIONS: ANIMATIONS,
    preload: loadRigSvg,
    getRigSizeKB: async function () {
      await loadRigSvg();
      return Math.round((cachedSvgBytes / 1024) * 100) / 100;
    },
    mount: function (container, options) {
      const hostEl = typeof container === 'string' ? document.querySelector(container) : container;
      const opts = Object.assign({
        emotion: 'wink_thumbs_up',
        prop: 'phone',
        animation: 'idle',
        size: 140,
        ariaLabel: 'Jobi the JobMatch mascot'
      }, options || {});

      let svgEl = null;
      let destroyed = false;
      const wrapper = document.createElement('div');
      wrapper.className = 'jobi-host';
      if (opts.size) {
        const px = typeof opts.size === 'number' ? opts.size + 'px' : String(opts.size);
        wrapper.style.width = px;
        wrapper.style.height = px;
      }

      if (hostEl) {
        hostEl.innerHTML = '';
        hostEl.appendChild(wrapper);
      }

      const mountNow = function (svgMarkup) {
        if (destroyed) return;
        wrapper.innerHTML = svgMarkup;
        svgEl = wrapper.querySelector('svg');
        if (!svgEl) return;
        // Scoped unique IDs so multiple inline Jobi instances never collide on gradient/clip IDs
        const uid = 'j' + Math.random().toString(36).slice(2, 7);
        ['jobi-g-shell', 'jobi-g-visor', 'jobi-g-brand', 'jobi-g-brand-dark', 'jobi-g-gold', 'jobi-clip-visor'].forEach(function (id) {
          const defEl = svgEl.querySelector('#' + id);
          if (defEl) defEl.id = id + '-' + uid;
          svgEl.innerHTML = svgEl.innerHTML.replace(new RegExp('url\\(#' + id + '\\)', 'g'), 'url(#' + id + '-' + uid + ')');
        });
        svgEl = wrapper.querySelector('svg');
        applyMascotState(svgEl, opts);
        if (typeof opts.onReady === 'function') opts.onReady(controller);
      };

      const controller = {
        el: wrapper,
        getSvg: function () { return svgEl; },
        setEmotion: function (emotion) {
          opts.emotion = emotion;
          applyMascotState(svgEl, { emotion: emotion });
          return controller;
        },
        setProp: function (prop) {
          opts.prop = prop;
          applyMascotState(svgEl, { prop: prop });
          return controller;
        },
        play: function (animation) {
          opts.animation = animation;
          applyMascotState(svgEl, { animation: animation });
          return controller;
        },
        triggerPopLines: function () {
          if (!svgEl || !JM.isMotionEnabled()) return controller;
          const pop = svgEl.querySelector('#jobi-pop-lines');
          if (pop) {
            pop.classList.remove('jobi-pop-burst');
            void pop.getBoundingClientRect();
            pop.classList.add('jobi-pop-burst');
          }
          return controller;
        },
        destroy: function () {
          destroyed = true;
          if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
          svgEl = null;
        }
      };

      if (cachedSvgText) {
        mountNow(cachedSvgText);
      } else {
        loadRigSvg(opts.svgUrl).then(mountNow).catch(function (err) {
          console.warn('[Jobi]', err.message);
        });
      }

      return controller;
    }
  };

  // ---------- 3. JM.confetti.burst(originEl, options) ----------
  const CONFETTI_SHAPES = {
    star: function (c) {
      return '<svg viewBox="0 0 20 20" width="18" height="18"><polygon points="10,1 12.6,6.8 19,7.5 14.2,11.8 15.5,18.2 10,14.9 4.5,18.2 5.8,11.8 1,7.5 7.4,6.8" fill="' + c + '"/></svg>';
    },
    arrow: function (c) {
      return '<svg viewBox="0 0 20 20" width="17" height="17"><path d="M4 16 L16 4 M8 4 H16 V12" fill="none" stroke="' + c + '" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    },
    resume: function (c) {
      return '<svg viewBox="0 0 20 20" width="17" height="17"><rect x="3" y="2" width="14" height="16" rx="2.5" fill="#FFFFFF" stroke="' + c + '" stroke-width="2"/><line x1="6" y1="7" x2="14" y2="7" stroke="' + c + '" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="11" x2="12" y2="11" stroke="' + c + '" stroke-width="2" stroke-linecap="round"/></svg>';
    },
    pin: function (c) {
      return '<svg viewBox="0 0 20 20" width="17" height="17"><path d="M10 2 C6.1 2 3 5 3 8.8 C3 13.8 10 18.5 10 18.5 C10 18.5 17 13.8 17 8.8 C17 5 13.9 2 10 2 Z" fill="' + c + '"/><circle cx="10" cy="8.5" r="2.5" fill="#FFFFFF"/></svg>';
    },
    square: function (c) {
      return '<svg viewBox="0 0 20 20" width="14" height="14"><rect x="3" y="3" width="14" height="14" rx="3.5" fill="' + c + '"/></svg>';
    }
  };

  const CONFETTI_COLORS = ['#0C70F8', '#F5A524', '#14804F', '#FF7A6B', '#3994FF', '#FFD05B'];
  const SHAPE_KEYS = Object.keys(CONFETTI_SHAPES);

  JM.confetti = {
    burst: function (originEl, options) {
      opts = Object.assign({ count: 26, emotion: '' }, options || {});
      // Guardrail: auto-blocked if emotion is 'comforting' or 'oops' or motion disabled
      if (opts.emotion === 'comforting' || opts.emotion === 'oops' || !JM.isMotionEnabled()) {
        return null;
      }

      let cx = window.innerWidth / 2;
      let cy = window.innerHeight * 0.42;
      if (originEl && originEl.getBoundingClientRect) {
        const r = originEl.getBoundingClientRect();
        if (r.width || r.height) {
          cx = r.left + r.width / 2;
          cy = r.top + r.height / 2;
        }
      }

      const layer = document.createElement('div');
      layer.className = 'jobi-confetti-layer';
      layer.setAttribute('aria-hidden', 'true');

      const count = Math.min(48, Math.max(8, Number(opts.count) || 26));
      for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'jobi-confetti-p';
        const shapeKey = SHAPE_KEYS[i % SHAPE_KEYS.length];
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        p.innerHTML = CONFETTI_SHAPES[shapeKey](color);

        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
        const speed = 75 + Math.random() * 145;
        const dx1 = Math.cos(angle) * speed * 0.65;
        const dy1 = Math.sin(angle) * speed * 0.65 - 55;
        const dx2 = Math.cos(angle) * speed * 1.15;
        const dy2 = Math.sin(angle) * speed * 0.9 + 115;

        const r1 = Math.round((Math.random() - 0.5) * 220) + 'deg';
        const r2 = Math.round((Math.random() - 0.5) * 520) + 'deg';
        const dur = (1.1 + Math.random() * 0.45).toFixed(2) + 's';

        p.style.setProperty('--jc-x0', Math.round(cx) + 'px');
        p.style.setProperty('--jc-y0', Math.round(cy) + 'px');
        p.style.setProperty('--jc-x1', Math.round(cx + dx1) + 'px');
        p.style.setProperty('--jc-y1', Math.round(cy + dy1) + 'px');
        p.style.setProperty('--jc-x2', Math.round(cx + dx2) + 'px');
        p.style.setProperty('--jc-y2', Math.round(cy + dy2) + 'px');
        p.style.setProperty('--jc-r1', r1);
        p.style.setProperty('--jc-r2', r2);
        p.style.setProperty('--jc-dur', dur);

        layer.appendChild(p);
      }

      document.body.appendChild(layer);
      setTimeout(function () {
        if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
      }, 1650);
      return layer;
    }
  };

  // ---------- 4. JM.toastSuccess(message, options) ----------
  const SPARK_SVG = '<svg class="jobi-toast-sparks" viewBox="0 0 24 24" aria-hidden="true">' +
    '<line x1="6" y1="10" x2="10" y2="2" stroke="#F5A524" stroke-width="3" stroke-linecap="round"/>' +
    '<line x1="12" y1="13" x2="20" y2="6" stroke="#3994FF" stroke-width="3" stroke-linecap="round"/>' +
    '<line x1="14" y1="18" x2="22" y2="16" stroke="#F5A524" stroke-width="3" stroke-linecap="round"/>' +
    '</svg>';

  const CHECK_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

  JM.toastSuccess = function (message, options) {
    const opts = Object.assign({ haptics: true, sound: false, targetEl: null }, options || {});
    let box = document.getElementById('toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }

    const t = document.createElement('div');
    t.className = 'toast ok jobi-toast-ok';
    t.setAttribute('role', 'status');

    const badge = document.createElement('span');
    badge.className = 'jobi-toast-badge';
    badge.innerHTML = CHECK_SVG + SPARK_SVG;

    const label = document.createElement('span');
    label.textContent = message;

    t.appendChild(badge);
    t.appendChild(label);
    box.appendChild(t);

    if (opts.haptics !== false) JM.hapticTick(12);
    if (opts.sound || JM.prefs.sound) JM.playBloop();
    if (opts.targetEl) renderTier1InlinePop(opts.targetEl);

    setTimeout(function () {
      if (t && t.parentNode) t.parentNode.removeChild(t);
    }, 4200);
    return t;
  };

  // ---------- 2. JM.reward(config) — 3-Tier Celebration Engine ----------
  let tier3ShownThisSession = false;
  let activeTier2El = null;
  let activeTier3El = null;

  function renderTier1InlinePop(targetEl, labelText) {
    let x = window.innerWidth / 2;
    let y = window.innerHeight - 90;
    if (targetEl && targetEl.getBoundingClientRect) {
      const r = targetEl.getBoundingClientRect();
      if (r.width || r.height) {
        x = r.left + r.width / 2;
        y = Math.max(36, r.top - 6);
      }
    }

    const pop = document.createElement('div');
    pop.className = 'jobi-tier1-pop';
    pop.style.left = Math.round(x) + 'px';
    pop.style.top = Math.round(y) + 'px';
    pop.innerHTML = '<span class="jobi-tier1-check">' + CHECK_SVG + '</span>' +
      (labelText ? '<span>' + (JM.esc ? JM.esc(labelText) : labelText) + '</span>' : '') +
      '<svg class="jobi-tier1-rays" viewBox="0 0 24 24" aria-hidden="true">' +
      '<line x1="4" y1="10" x2="9" y2="2" stroke="#0C70F8" stroke-width="3" stroke-linecap="round"/>' +
      '<line x1="10" y1="13" x2="19" y2="6" stroke="#F5A524" stroke-width="3" stroke-linecap="round"/>' +
      '<line x1="12" y1="18" x2="21" y2="16" stroke="#0C70F8" stroke-width="3" stroke-linecap="round"/>' +
      '</svg>';

    document.body.appendChild(pop);

    // Optional count-up animation if targetEl has data-count-to
    if (targetEl && targetEl.dataset && targetEl.dataset.countTo) {
      const toVal = Number(targetEl.dataset.countTo);
      const fromVal = Number(targetEl.dataset.countFrom || 0);
      if (!isNaN(toVal) && JM.isMotionEnabled()) {
        const start = performance.now();
        const dur = 520;
        const step = function (now) {
          const p = Math.min(1, (now - start) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          targetEl.textContent = Math.round(fromVal + (toVal - fromVal) * eased) + (targetEl.dataset.countSuffix || '');
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }

    setTimeout(function () {
      if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    }, 700);
    return pop;
  }

  function renderTier2Banner(cfg) {
    if (activeTier2El && activeTier2El.parentNode) {
      activeTier2El.parentNode.removeChild(activeTier2El);
      activeTier2El = null;
    }

    const banner = document.createElement('div');
    banner.className = 'jobi-tier2-banner';
    banner.setAttribute('role', 'status');

    const avSlot = document.createElement('div');
    avSlot.className = 'jobi-tier2-avatar';

    const textWrap = document.createElement('div');
    textWrap.className = 'jobi-tier2-text';

    const titleEl = document.createElement('div');
    titleEl.className = 'jobi-tier2-title';
    titleEl.textContent = cfg.title || 'Nice work!';
    textWrap.appendChild(titleEl);

    if (cfg.copy) {
      const copyEl = document.createElement('div');
      copyEl.className = 'jobi-tier2-copy';
      copyEl.textContent = cfg.copy;
      textWrap.appendChild(copyEl);
    }

    banner.appendChild(avSlot);
    banner.appendChild(textWrap);
    document.body.appendChild(banner);
    activeTier2El = banner;

    const ctrl = JM.mascot.mount(avSlot, {
      emotion: cfg.emotion || 'happy',
      prop: cfg.prop || 'phone',
      animation: cfg.animation || 'peek',
      size: 52,
      ariaLabel: ''
    });

    const dismiss = function () {
      if (!banner || !banner.parentNode) return;
      banner.classList.add('is-leaving');
      setTimeout(function () {
        ctrl.destroy();
        if (banner.parentNode) banner.parentNode.removeChild(banner);
        if (activeTier2El === banner) activeTier2El = null;
      }, 280);
    };

    banner.addEventListener('click', dismiss);
    setTimeout(dismiss, cfg.duration || 1850);
    return banner;
  }

  function renderTier3Overlay(cfg) {
    if (activeTier3El && activeTier3El.parentNode) {
      activeTier3El.parentNode.removeChild(activeTier3El);
      activeTier3El = null;
    }

    tier3ShownThisSession = true;

    const ov = document.createElement('div');
    ov.className = 'jobi-tier3-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', cfg.title || 'Milestone reached');

    const card = document.createElement('div');
    card.className = 'jobi-tier3-card';

    const badgeHtml = cfg.badge
      ? '<div class="jobi-tier3-badge">' + (JM.esc ? JM.esc(cfg.badge) : cfg.badge) + '</div>'
      : '<div class="jobi-tier3-badge">Milestone Unlocked</div>';

    card.innerHTML = badgeHtml +
      '<div class="jobi-tier3-stage" id="jobi-tier3-stage"></div>' +
      '<h2 class="jobi-tier3-title">' + (JM.esc ? JM.esc(cfg.title || 'Awesome job!') : (cfg.title || 'Awesome job!')) + '</h2>' +
      (cfg.copy ? '<p class="jobi-tier3-copy">' + (JM.esc ? JM.esc(cfg.copy) : cfg.copy) + '</p>' : '') +
      (cfg.extraHtml ? '<div class="jobi-tier3-extra">' + cfg.extraHtml + '</div>' : '') +
      '<div class="jobi-tier3-actions" id="jobi-tier3-actions"></div>' +
      '<div class="jobi-tier3-skip">Tap anywhere or press Esc to continue</div>';

    ov.appendChild(card);
    document.body.appendChild(ov);
    activeTier3El = ov;

    const stage = card.querySelector('#jobi-tier3-stage');
    const ctrl = JM.mascot.mount(stage, {
      emotion: cfg.emotion || 'cheering',
      prop: cfg.prop || 'trophy',
      animation: cfg.animation || 'cheer',
      size: 156,
      ariaLabel: 'Jobi celebrating: ' + (cfg.title || '')
    });

    const actionsBox = card.querySelector('#jobi-tier3-actions');
    if (cfg.cta && cfg.cta.label) {
      const primaryBtn = document.createElement('button');
      primaryBtn.type = 'button';
      primaryBtn.className = 'btn lg block';
      primaryBtn.textContent = cfg.cta.label;
      primaryBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeOverlay();
        if (typeof cfg.cta.onClick === 'function') cfg.cta.onClick();
      });
      actionsBox.appendChild(primaryBtn);
    }

    if (cfg.secondaryCta && cfg.secondaryCta.label) {
      const secBtn = document.createElement('button');
      secBtn.type = 'button';
      secBtn.className = 'btn secondary block';
      secBtn.textContent = cfg.secondaryCta.label;
      secBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeOverlay();
        if (typeof cfg.secondaryCta.onClick === 'function') cfg.secondaryCta.onClick();
      });
      actionsBox.appendChild(secBtn);
    }

    // Contextual confetti (auto-blocked if comforting or oops)
    const blockConfetti = cfg.emotion === 'comforting' || cfg.emotion === 'oops';
    if (cfg.confetti !== false && !blockConfetti) {
      JM.confetti.burst(stage, { emotion: cfg.emotion, count: 30 });
    }

    let closed = false;
    function closeOverlay() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      ov.classList.add('is-leaving');
      setTimeout(function () {
        ctrl.destroy();
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        if (activeTier3El === ov) activeTier3El = null;
        if (typeof cfg.onClose === 'function') cfg.onClose();
      }, 200);
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeOverlay();
      }
    }
    document.addEventListener('keydown', onKey);

    ov.addEventListener('click', function (e) {
      if (e.target.closest('button, a')) return;
      closeOverlay();
    });

    if (cfg.autoDismiss !== false && !cfg.extraHtml) {
      setTimeout(closeOverlay, cfg.duration || 3800);
    }

    return ov;
  }

  JM.reward = function (config) {
    const cfg = Object.assign({
      id: null,
      tier: 2,
      repeatTier: 1,
      emotion: 'wink_thumbs_up',
      prop: 'phone',
      animation: 'bounce',
      title: '',
      copy: '',
      cta: null,
      targetEl: null,
      confetti: false,
      forceTier: false
    }, config || {});

    // Always announce title & copy to screen readers (even when animations are off)
    const announcement = [cfg.title, cfg.copy].filter(Boolean).join('. ');
    if (announcement) JM.announce(announcement);

    // Frequency decay via milestones_seen
    let effectiveTier = Number(cfg.tier) || 1;
    const alreadySeen = cfg.id && JM.milestones.has(cfg.id);
    if (alreadySeen && !cfg.forceTier) {
      if (cfg.repeatTier === null) return null;
      effectiveTier = Number(cfg.repeatTier) || 1;
    }

    // Enforce max 1 Tier 3 per session (gracefully downgrade additional Tier 3 events to Tier 2 unless forced)
    if (effectiveTier === 3 && tier3ShownThisSession && !cfg.forceTier) {
      effectiveTier = 2;
    }

    // Mark milestone as seen
    if (cfg.id) {
      JM.milestones.mark(cfg.id);
    }

    // Guardrail: never fire confetti on comforting or oops
    if (cfg.emotion === 'comforting' || cfg.emotion === 'oops') {
      cfg.confetti = false;
    }

    // Haptics + optional bloop
    JM.hapticTick(effectiveTier === 3 ? 20 : 12);
    if (JM.prefs.sound) JM.playBloop();

    if (effectiveTier === 1) {
      if (cfg.targetEl) {
        return renderTier1InlinePop(cfg.targetEl, cfg.title || cfg.copy);
      }
      return JM.toastSuccess(cfg.title || cfg.copy || 'Done!');
    }

    if (effectiveTier === 2) {
      if (cfg.confetti) JM.confetti.burst(cfg.targetEl, { emotion: cfg.emotion, count: 16 });
      return renderTier2Banner(cfg);
    }

    return renderTier3Overlay(cfg);
  };

  JM.resetTier3Session = function () {
    tier3ShownThisSession = false;
  };

  // ---------- 7. Server Persistence Sync for milestones_seen & prefs ----------
  JM.syncUserRewards = function () {
    const me = JM.me;
    if (!me) return;
    const isSeeker = me.role === 'seeker' && me.seeker;
    const isEmployer = me.role === 'employer' && me.employer;
    if (!isSeeker && !isEmployer) return;

    const notifObj = (isSeeker ? me.seeker.notif : me.employer.notif) || {};
    if (notifObj.prefs && typeof notifObj.prefs === 'object') {
      JM.setPrefs({
        animations: notifObj.prefs.animations !== false,
        haptics: notifObj.prefs.haptics !== false,
        sound: notifObj.prefs.sound === true
      });
    }

    JM.milestones.init({
      fetchSeen: async function () {
        const cur = (isSeeker ? (JM.me.seeker && JM.me.seeker.notif) : (JM.me.employer && JM.me.employer.notif)) || {};
        return Array.isArray(cur.milestones_seen) ? cur.milestones_seen : [];
      },
      markSeen: async function (key, allSeen) {
        if (!JM.me || !JM.q || !JM.sb) return;
        try {
          if (JM.me.role === 'seeker' && JM.me.seeker) {
            const n = Object.assign({}, JM.me.seeker.notif || {}, { milestones_seen: allSeen });
            JM.me.seeker.notif = n;
            await JM.q(JM.sb.from('seeker_profiles').update({ notif: n }).eq('user_id', JM.me.id));
          } else if (JM.me.role === 'employer' && JM.me.employer) {
            const n = Object.assign({}, JM.me.employer.notif || {}, { milestones_seen: allSeen });
            JM.me.employer.notif = n;
            await JM.q(JM.sb.from('employers').update({ notif: n }).eq('user_id', JM.me.id));
          }
        } catch (e) { /* localStorage fallback remains authoritative if offline */ }
      }
    });
  };

  JM.savePrefsToServer = async function (patch) {
    JM.setPrefs(patch);
    if (!JM.me || !JM.q || !JM.sb) return JM.prefs;
    try {
      const prefsSnap = {
        animations: !!JM.prefs.animations,
        haptics: !!JM.prefs.haptics,
        sound: !!JM.prefs.sound
      };
      if (JM.me.role === 'seeker' && JM.me.seeker) {
        const n = Object.assign({}, JM.me.seeker.notif || {}, { prefs: prefsSnap });
        JM.me.seeker.notif = n;
        await JM.q(JM.sb.from('seeker_profiles').update({ notif: n }).eq('user_id', JM.me.id));
      } else if (JM.me.role === 'employer' && JM.me.employer) {
        const n = Object.assign({}, JM.me.employer.notif || {}, { prefs: prefsSnap });
        JM.me.employer.notif = n;
        await JM.q(JM.sb.from('employers').update({ notif: n }).eq('user_id', JM.me.id));
      }
    } catch (e) { /* localStorage fallback already updated */ }
    return JM.prefs;
  };

  // ---------- 8. Empty-State Curious Jobi Auto-Hydrator ----------
  const EMPTY_TIPS = {
    layers: { emotion: 'happy', prop: 'coffee-mug', tip: 'Tip: Enjoy a coffee break, loosen a filter, or review passed cards to see more jobs.' },
    heart: { prop: 'phone', tip: 'Tip: Swipe right or tap Save on any job card to bookmark it here.' },
    briefcase: { prop: 'briefcase', tip: 'Tip: Roles with a 75%+ match score give you the fastest shortlist response.' },
    users: { prop: 'megaphone', tip: 'Tip: Star your top-choice job so employers see your application first.' },
    chat: { prop: 'paper-plane', tip: 'Tip: As soon as an employer shortlists you, direct messaging unlocks automatically.' },
    bell: { prop: 'bell', tip: 'Tip: Keep notifications enabled so you never miss an interview invite.' },
    award: { prop: 'graduation-cap', tip: 'Tip: Pick a career goal in your Profile to generate a 4-week skill roadmap.' },
    search: { prop: 'map', tip: 'Tip: Try broadening your skill keyword or switching work setup to Any.' },
    chart: { prop: 'clipboard', tip: 'Tip: Published jobs start recording views, saves, and conversion rates immediately.' },
    book: { prop: 'clipboard', tip: 'Tip: Add quiz questions or partner courses to help seekers close their skill gaps.' },
    megaphone: { prop: 'megaphone', tip: 'Tip: Announcements appear in every target user\'s notification feed.' },
    inbox: { prop: 'clipboard', tip: 'Tip: New items will appear here as activity comes in.' }
  };

  JM.hydrateEmptyMascots = function (root) {
    const scope = root || document;
    if (!scope.querySelectorAll) return;
    scope.querySelectorAll('.empty[data-jobi-empty]').forEach(function (box) {
      if (box._jobiMounted) return;
      box._jobiMounted = true;
      const iconKey = box.dataset.jobiEmpty || 'inbox';
      const meta = EMPTY_TIPS[iconKey] || EMPTY_TIPS.inbox;
      const slot = box.querySelector('.jobi-empty-mascot');
      if (slot) {
        JM.mascot.mount(slot, {
          emotion: meta.emotion || 'curious',
          prop: meta.prop || 'magnifying-glass',
          animation: 'idle',
          size: 112,
          ariaLabel: (meta.emotion === 'happy' ? 'Relaxed' : 'Curious') + ' Jobi helper'
        });
      }
    });
  };
  JM.EMPTY_TIPS = EMPTY_TIPS;

  // ---------- 8B. Phase 2A High-Frequency Seeker Micro-Moment Helpers (JM.micro) ----------
  function anchorCoords(targetEl, fallbackY) {
    let x = window.innerWidth / 2;
    let y = fallbackY || (window.innerHeight / 2);
    if (targetEl && targetEl.getBoundingClientRect) {
      const r = targetEl.getBoundingClientRect();
      if (r.width || r.height) {
        x = r.left + r.width / 2;
        y = Math.max(48, r.top + r.height * 0.32);
      }
    }
    return { x: Math.round(x), y: Math.round(y) };
  }

  let activeCornerPeek = null;

  JM.micro = {
    // 1. Discover Save (swipe right): heart_eyes heart pop off the card (Tier 1)
    heartPop: function (targetEl) {
      JM.hapticTick(12);
      const pt = anchorCoords(targetEl);
      const el = document.createElement('div');
      el.className = 'jobi-heart-pop';
      el.style.left = pt.x + 'px';
      el.style.top = pt.y + 'px';
      el.innerHTML = '<div class="jobi-heart-pop-mascot"></div>' +
        '<span class="jobi-heart-pop-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></span>' +
        '<span>Saved!</span>';
      document.body.appendChild(el);
      const slot = el.querySelector('.jobi-heart-pop-mascot');
      const ctrl = JM.mascot.mount(slot, { emotion: 'heart_eyes', prop: 'none', animation: 'bounce', size: 38 });
      setTimeout(function () {
        ctrl.destroy();
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 780);
      return el;
    },

    // 2. Discover Star (swipe up): star_eyes flash + gold star burst (Tier 2 on first-ever star, Tier 1 after)
    starBurst: function (targetEl) {
      const isFirstStar = !JM.milestones.has('seeker_first_star');
      const pt = anchorCoords(targetEl);
      const el = document.createElement('div');
      el.className = 'jobi-star-flash';
      el.style.left = pt.x + 'px';
      el.style.top = pt.y + 'px';
      el.innerHTML = '<div class="jobi-star-flash-mascot"></div>' +
        '<span>★ Top Pick!</span>';
      document.body.appendChild(el);
      const slot = el.querySelector('.jobi-star-flash-mascot');
      const ctrl = JM.mascot.mount(slot, { emotion: 'star_eyes', prop: 'trophy', animation: 'cheer', size: 40 });
      JM.confetti.burst(targetEl || el, { emotion: 'star_eyes', count: isFirstStar ? 22 : 12 });
      setTimeout(function () {
        ctrl.destroy();
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 840);

      if (isFirstStar) {
        JM.reward({
          id: 'seeker_first_star',
          tier: 2,
          repeatTier: 1,
          emotion: 'star_eyes',
          prop: 'trophy',
          animation: 'cheer',
          title: 'First Top Pick Starred! ★',
          copy: 'Employers see starred applicants at the top of their ranked list.'
        });
      } else {
        JM.hapticTick(12);
      }
      return el;
    },

    // 3. Discover Undo Swipe: Jobi .jobi-anim-rewind spin (Tier 1)
    rewindPop: function (targetEl) {
      JM.hapticTick(12);
      const pt = anchorCoords(targetEl);
      const el = document.createElement('div');
      el.className = 'jobi-rewind-pop';
      el.style.left = pt.x + 'px';
      el.style.top = pt.y + 'px';
      el.innerHTML = '<div class="jobi-rewind-pop-mascot"></div><span>Card rewound ↺</span>';
      document.body.appendChild(el);
      const slot = el.querySelector('.jobi-rewind-pop-mascot');
      const ctrl = JM.mascot.mount(slot, { emotion: 'curious', prop: 'none', animation: 'rewind', size: 38 });
      setTimeout(function () {
        ctrl.destroy();
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 860);
      return el;
    },

    // 4. Discover 10th, 50th, 100th job reviewed: milestone chip with number count-up (Tier 1)
    milestoneChip: function (count, targetEl) {
      const key = 'seeker_jobs_reviewed_' + count;
      if (JM.milestones.has(key)) return null;
      JM.milestones.mark(key);
      JM.hapticTick(14);
      JM.announce(count + ' jobs reviewed milestone!');

      const chip = document.createElement('div');
      chip.className = 'jobi-milestone-chip';
      chip.innerHTML = '<span class="jobi-milestone-num">0</span><span>jobs reviewed! Keep exploring</span>';
      document.body.appendChild(chip);

      const numEl = chip.querySelector('.jobi-milestone-num');
      if (JM.isMotionEnabled()) {
        const start = performance.now();
        const dur = 560;
        const step = function (now) {
          const p = Math.min(1, (now - start) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          numEl.textContent = String(Math.round(count * eased));
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      } else {
        numEl.textContent = String(count);
      }

      setTimeout(function () {
        if (chip.parentNode) chip.parentNode.removeChild(chip);
      }, 1500);
      return chip;
    },

    // 5. Tier 1 Non-Blocking Jobi Corner Peek (90%+ match, employer reply, profile strength 25/50/75% nod)
    cornerPeek: function (opts) {
      opts = opts || {};
      if (opts.id && opts.once && JM.milestones.has(opts.id)) return null;
      if (opts.id && opts.once) JM.milestones.mark(opts.id);

      if (activeCornerPeek && activeCornerPeek.parentNode) {
        activeCornerPeek.parentNode.removeChild(activeCornerPeek);
        activeCornerPeek = null;
      }

      JM.hapticTick(10);
      const el = document.createElement('div');
      el.className = 'jobi-corner-peek';
      el.setAttribute('role', 'status');
      el.innerHTML = '<div class="jobi-corner-peek-mascot"></div><span>' + (JM.esc ? JM.esc(opts.text || 'Nice!') : (opts.text || 'Nice!')) + '</span>';
      document.body.appendChild(el);
      activeCornerPeek = el;

      const slot = el.querySelector('.jobi-corner-peek-mascot');
      const ctrl = JM.mascot.mount(slot, {
        emotion: opts.emotion || 'star_eyes',
        prop: opts.prop || 'none',
        animation: opts.animation || 'peek',
        size: 42
      });

      setTimeout(function () {
        ctrl.destroy();
        if (el.parentNode) el.parentNode.removeChild(el);
        if (activeCornerPeek === el) activeCornerPeek = null;
      }, 1580);
      return el;
    },

    // 6. Messages: First message sent — mini paper-plane fly-out (Tier 1)
    planeFly: function (targetEl) {
      JM.hapticTick(12);
      const pt = anchorCoords(targetEl, window.innerHeight - 60);
      if ( JM.isMotionEnabled() ) {
        const plane = document.createElement('div');
        plane.className = 'jobi-plane-fly';
        plane.style.left = pt.x + 'px';
        plane.style.top = pt.y + 'px';
        plane.innerHTML = '<svg viewBox="0 0 36 36" width="34" height="34" aria-hidden="true">' +
          '<polygon points="3,17 33,4 22,32 15,21" fill="#FFFFFF" stroke="#0C70F8" stroke-width="2.2" stroke-linejoin="round"/>' +
          '<polygon points="15,21 33,4 19,24" fill="#CFE2FF"/>' +
          '</svg>';
        document.body.appendChild(plane);
        setTimeout(function () {
          if (plane.parentNode) plane.parentNode.removeChild(plane);
        }, 820);
      }
      return renderTier1InlinePop(targetEl, 'First message sent! ✈️');
    },

    // 7. Messages: Unsend message — gentle smoke "poof" (Tier 1)
    smokePoof: function (targetEl) {
      JM.hapticTick(10);
      if (!JM.isMotionEnabled()) return null;
      const pt = anchorCoords(targetEl);
      const wrap = document.createElement('div');
      wrap.className = 'jobi-smoke-poof';
      wrap.style.left = pt.x + 'px';
      wrap.style.top = pt.y + 'px';
      const vectors = [
        ['-22px', '-14px', '-34px', '-24px'],
        ['20px', '-16px', '32px', '-26px'],
        ['-16px', '12px', '-26px', '20px'],
        ['18px', '10px', '28px', '18px']
      ];
      vectors.forEach(function (v) {
        const puff = document.createElement('span');
        puff.className = 'jobi-smoke-puff';
        puff.style.setProperty('--sp-dx', v[0]);
        puff.style.setProperty('--sp-dy', v[1]);
        puff.style.setProperty('--sp-dx2', v[2]);
        puff.style.setProperty('--sp-dy2', v[3]);
        wrap.appendChild(puff);
      });
      document.body.appendChild(wrap);
      setTimeout(function () {
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }, 700);
      return wrap;
    },

    // 8. Professional photo shutter flash (Tier 1)
    shutterFlash: function (targetEl) {
      JM.hapticTick(12);
      if (JM.isMotionEnabled()) {
        const flash = document.createElement('div');
        flash.className = 'jobi-shutter-flash';
        document.body.appendChild(flash);
        setTimeout(function () {
          if (flash.parentNode) flash.parentNode.removeChild(flash);
        }, 540);
      }
      return renderTier1InlinePop(targetEl, 'Photo captured 📸');
    },

    // 9. Certificate gold stamp & Interview confirmed green stamp (Tier 1)
    stampPop: function (targetEl, label, variant) {
      JM.hapticTick(14);
      const pt = anchorCoords(targetEl);
      const stamp = document.createElement('div');
      stamp.className = 'jobi-gold-stamp' + (variant === 'green' ? ' is-green' : '');
      stamp.style.left = pt.x + 'px';
      stamp.style.top = pt.y + 'px';
      stamp.textContent = label || (variant === 'green' ? 'Confirmed ✓' : 'Credential Stamped ★');
      document.body.appendChild(stamp);
      setTimeout(function () {
        if (stamp.parentNode) stamp.parentNode.removeChild(stamp);
      }, 800);
      return stamp;
    },

    // 10. Skill set to Advanced medal glint (Tier 1)
    medalGlint: function (targetEl, skillName) {
      JM.hapticTick(12);
      const pt = anchorCoords(targetEl);
      const glint = document.createElement('div');
      glint.className = 'jobi-medal-glint';
      glint.style.left = pt.x + 'px';
      glint.style.top = pt.y + 'px';
      glint.textContent = '🥇 Advanced' + (skillName ? ': ' + skillName : '') + ' ★';
      document.body.appendChild(glint);
      setTimeout(function () {
        if (glint.parentNode) glint.parentNode.removeChild(glint);
      }, 760);
      return glint;
    },

    // 11. Résumé Review score ring count-up + floating "+X" delta
    countUpRing: function (ringEl, targetScore, prevScore) {
      if (!ringEl) return;
      const b = ringEl.querySelector('b');
      const fgCircle = ringEl.querySelectorAll('circle')[1];
      const toVal = Math.max(0, Math.min(100, Number(targetScore) || 0));
      const fromVal = (prevScore != null && !isNaN(prevScore)) ? Math.max(0, Math.min(100, Number(prevScore))) : 0;

      if (JM.isMotionEnabled() && b) {
        const dash = fgCircle ? parseFloat(fgCircle.getAttribute('stroke-dasharray') || '0') : 0;
        const start = performance.now();
        const dur = 720;
        const step = function (now) {
          const p = Math.min(1, (now - start) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          const cur = Math.round(fromVal + (toVal - fromVal) * eased);
          b.textContent = cur + '%';
          if (fgCircle && dash > 0) {
            fgCircle.setAttribute('stroke-dashoffset', String(dash * (1 - cur / 100)));
          }
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      } else if (b) {
        b.textContent = toVal + '%';
      }

      if (prevScore != null && !isNaN(prevScore) && toVal > prevScore) {
        const delta = toVal - prevScore;
        const badge = document.createElement('span');
        badge.className = 'jobi-score-delta';
        badge.textContent = '+' + delta + ' pts';
        if (ringEl.parentNode) {
          ringEl.insertAdjacentElement('afterend', badge);
        }
      }
    },

    // 12. Phase 2B: Task checked — inline green check pop + floating "+1" (Tier 1)
    taskPlusOne: function (targetEl) {
      JM.hapticTick(12);
      const pt = anchorCoords(targetEl);
      const el = document.createElement('div');
      el.className = 'jobi-task-plus1';
      el.style.left = pt.x + 'px';
      el.style.top = pt.y + 'px';
      el.innerHTML = '<span class="jobi-tier1-check">' + CHECK_SVG + '</span><span>+1 Task</span>';
      document.body.appendChild(el);
      JM.announce('Task checked, plus 1');
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 760);
      return el;
    },

    // 13. Phase 2B: Week's tasks all done — illuminate quiz node and hop Jobi onto it (Tier 2)
    hopToQuizNode: function (weekNum, skillName) {
      const quizNode = document.querySelector('.jobi-node-quiz[data-week="' + weekNum + '"]');
      if (quizNode) {
        quizNode.classList.remove('is-locked');
        quizNode.classList.add('is-illuminated');
        let slot = quizNode.querySelector('.jobi-node-mascot-slot');
        if (!slot) {
          document.querySelectorAll('.jobi-node-mascot-slot').forEach(function (s) {
            if (s.parentNode) s.parentNode.removeChild(s);
          });
          slot = document.createElement('div');
          slot.className = 'jobi-node-mascot-slot is-hopping';
          quizNode.appendChild(slot);
        }
        JM.mascot.mount(slot, {
          emotion: 'star_eyes',
          prop: 'graduation-cap',
          animation: 'bounce',
          size: 62,
          ariaLabel: 'Jobi hopped onto Week ' + weekNum + ' quiz checkpoint'
        });
      }
      return JM.reward({
        id: 'seeker_quiz_illuminated_w' + weekNum + '_' + (skillName || ''),
        tier: 2,
        repeatTier: 2,
        emotion: 'star_eyes',
        prop: 'graduation-cap',
        animation: 'bounce',
        title: 'Week ' + weekNum + ' tasks complete! ⚡',
        copy: 'Quiz checkpoint unlocked — Jobi hopped to the quiz node!'
      });
    },

    // 14. Phase 2B: Chapter walk banner when completing a week and advancing along the path
    chapterWalkBanner: function (completedWeek, nextWeekTitle) {
      JM.hapticTick(16);
      const banner = document.createElement('div');
      banner.className = 'jobi-chapter-banner';
      banner.setAttribute('role', 'status');
      banner.innerHTML = '<span>🎓 Week ' + completedWeek + ' Complete!</span>' +
        (nextWeekTitle ? '<span style="opacity:.88;font-weight:600">→ Next: ' + (JM.esc ? JM.esc(nextWeekTitle) : nextWeekTitle) + '</span>' : '');
      document.body.appendChild(banner);
      setTimeout(function () {
        if (banner.parentNode) banner.parentNode.removeChild(banner);
      }, 2250);
      return banner;
    },

    // 15. Phase 2B: Quiz Answer Micro-Feedback (Correct green pop-line sparkle / Wrong gentle shake + oops Jobi + soft coral #FF7A6B explanation)
    quizAnswerFeedback: function (optLabelEl, isCorrect, explanationText) {
      if (!optLabelEl) return null;
      const container = optLabelEl.closest('fieldset') || optLabelEl.parentNode;
      if (container && container.querySelectorAll) {
        container.querySelectorAll('.opt').forEach(function (o) {
          o.classList.remove('jobi-opt-correct', 'jobi-opt-wrong');
          const oldSp = o.querySelector('.jobi-opt-sparkle');
          if (oldSp && oldSp.parentNode) oldSp.parentNode.removeChild(oldSp);
        });
        const oldExp = container.querySelector('.jobi-quiz-explain');
        if (oldExp && oldExp.parentNode) oldExp.parentNode.removeChild(oldExp);
      }

      if (isCorrect) {
        JM.hapticTick(12);
        optLabelEl.classList.add('jobi-opt-correct');
        const sp = document.createElement('span');
        sp.className = 'jobi-opt-sparkle';
        sp.innerHTML = '✓ Correct ✨';
        optLabelEl.appendChild(sp);
        JM.announce('Correct answer! ' + (explanationText || ''));
        if (explanationText && container) {
          const exp = document.createElement('div');
          exp.className = 'jobi-quiz-explain is-correct';
          exp.setAttribute('role', 'status');
          exp.innerHTML = '<div class="jobi-quiz-explain-mascot"></div><div><b>Spot on!</b> ' + (JM.esc ? JM.esc(explanationText) : explanationText) + '</div>';
          container.appendChild(exp);
          const slot = exp.querySelector('.jobi-quiz-explain-mascot');
          JM.mascot.mount(slot, { emotion: 'wink_thumbs_up', prop: 'graduation-cap', animation: 'nod', size: 42 });
        }
        return renderTier1InlinePop(optLabelEl, 'Correct! ✨');
      } else {
        JM.hapticTick(14);
        optLabelEl.classList.add('jobi-opt-wrong');
        const msg = explanationText || 'Review the key concept in the module and try another option.';
        JM.announce('Not quite. ' + msg);
        if (container) {
          const exp = document.createElement('div');
          exp.className = 'jobi-quiz-explain';
          exp.setAttribute('role', 'status');
          exp.innerHTML = '<div class="jobi-quiz-explain-mascot"></div><div><b>Almost!</b> ' + (JM.esc ? JM.esc(msg) : msg) + '</div>';
          container.appendChild(exp);
          const slot = exp.querySelector('.jobi-quiz-explain-mascot');
          JM.mascot.mount(slot, { emotion: 'oops', prop: 'clipboard', animation: 'oops', size: 42 });
          return exp;
        }
        return null;
      }
    },

    // 16. Phase 2C: Employer Logo Uploaded — Sample Discover Card Landing Preview (Tier 2)
    logoCardPreview: function (opts) {
      opts = opts || {};
      const esc = JM.esc || function (s) { return String(s || ''); };
      const companyName = opts.companyName || 'Your Business';
      const areaName = opts.areaName || 'Biñan, Laguna';
      const bizType = opts.type || 'Verified Employer';
      const logoUrl = opts.logoUrl || '';

      const pop = document.createElement('div');
      pop.className = 'jobi-logo-preview-pop';
      pop.setAttribute('role', 'status');
      pop.innerHTML = '<div class="jobi-logo-preview-cover"><span>Discover Card Preview</span>' +
        '<div class="jobi-logo-preview-badge">' +
        (logoUrl ? '<img src="' + esc(logoUrl) + '" alt="Company logo preview">' : '<b>' + esc(companyName.slice(0, 2).toUpperCase()) + '</b>') +
        '</div></div>' +
        '<div class="jobi-logo-preview-body">' +
        '<div class="xs muted bold" style="color:#0C70F8;text-transform:uppercase;letter-spacing:.04em">How Job Seekers See Your Brand</div>' +
        '<div style="font-weight:800;font-size:15px;margin-top:2px;color:#0F172A">' + esc(companyName) + '</div>' +
        '<div class="xs muted" style="margin-top:2px">' + esc(bizType) + ' · ' + esc(areaName) + '</div>' +
        '</div>';
      document.body.appendChild(pop);

      JM.reward({
        id: 'employer_logo_uploaded',
        tier: 2,
        repeatTier: 2,
        emotion: 'proud',
        prop: 'phone',
        animation: 'bounce',
        title: 'Logo landed on your Discover card!',
        copy: 'Job seekers will now see your brand emblem on every listing.'
      });

      setTimeout(function () {
        if (pop.parentNode) pop.parentNode.removeChild(pop);
      }, 2650);
      return pop;
    },

    // 17. Phase 2C: Shortlist Candidate — Fair-Hiring Mask-Peel Reveal (Tier 2)
    fairHiringReveal: function (opts) {
      opts = opts || {};
      const esc = JM.esc || function (s) { return String(s || ''); };
      const maskedName = opts.maskedName || 'Candidate L.';
      const fullName = opts.fullName || maskedName;
      const jobTitle = opts.jobTitle || 'your listing';

      const wrap = document.createElement('div');
      wrap.className = 'jobi-fair-reveal-pop';
      wrap.setAttribute('role', 'status');
      wrap.innerHTML = '<div class="jobi-fair-reveal-card">' +
        '<div class="row between"><span class="badge star">★ Shortlisted · Fair-Hiring Reveal</span>' +
        (opts.score != null ? '<b class="small" style="color:#14804F">' + esc(opts.score) + '% Match</b>' : '') + '</div>' +
        '<div class="jobi-fair-name-stage">' +
        '<span class="jobi-mask-peel">🎭 ' + esc(maskedName) + '</span>' +
        '<span class="jobi-full-name-reveal">✨ ' + esc(fullName) + '</span>' +
        '</div>' +
        '<div class="xs muted" style="margin-top:4px">Matched for <b>' + esc(jobTitle) + '</b> — full profile, contact details &amp; chat unlocked!</div>' +
        '</div>';
      document.body.appendChild(wrap);

      JM.reward({
        id: opts.id ? ('employer_shortlist_' + opts.id) : null,
        tier: 2,
        repeatTier: 2,
        forceTier: true,
        emotion: 'star_eyes',
        prop: 'padlock',
        animation: 'cheer',
        confetti: true,
        title: 'Shortlisted ' + fullName + '! ★',
        copy: 'Fair-hiring mask lifted: full profile, résumé & direct chat are now unlocked.'
      });

      setTimeout(function () {
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }, 2550);
      return wrap;
    },

    // 18. Phase 2C: Interview Invited — Calendar Page Flip (Tier 2)
    calendarFlip: function (opts) {
      opts = opts || {};
      const esc = JM.esc || function (s) { return String(s || ''); };
      const candidateName = opts.candidateName || 'Candidate';
      const dateStr = opts.date || 'Upcoming';
      const timeStr = opts.time || '';
      const ivType = opts.type || 'Online';

      const wrap = document.createElement('div');
      wrap.className = 'jobi-calendar-flip-pop';
      wrap.setAttribute('role', 'status');
      wrap.innerHTML = '<div class="jobi-calendar-sheet">' +
        '<div class="jobi-calendar-icon-box"><span>📅</span><span>' + esc(ivType) + '</span></div>' +
        '<div><div style="font-weight:800;font-size:13.5px;color:#0F172A">Interview Invite Sent</div>' +
        '<div class="xs muted">' + esc(candidateName) + ' · ' + esc(dateStr) + (timeStr ? ' at ' + esc(timeStr) : '') + '</div></div>' +
        '</div>';
      document.body.appendChild(wrap);

      JM.reward({
        id: 'employer_interview_invited',
        tier: 2,
        repeatTier: 2,
        forceTier: true,
        emotion: 'happy',
        prop: 'calendar',
        animation: 'bounce',
        title: 'Interview scheduled with ' + candidateName + '!',
        copy: dateStr + (timeStr ? ' at ' + timeStr : '') + ' (' + ivType + ').'
      });

      setTimeout(function () {
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }, 2000);
      return wrap;
    },

    // 19. Phase 2C: Candidate Search Loading — Scanning Jobi + Radar Ring
    mountRadarLoader: function (container, labelText) {
      if (!container) return null;
      const esc = JM.esc || function (s) { return String(s || ''); };
      container.innerHTML = '<div class="jobi-radar-loader" role="status" aria-live="polite">' +
        '<div class="jobi-radar-stage">' +
        '<div class="jobi-radar-ring"></div>' +
        '<div class="jobi-radar-ring r2"></div>' +
        '<div class="jobi-radar-mascot"></div>' +
        '</div>' +
        '<b style="font-size:14.5px;color:#0A2B6D">' + esc(labelText || 'Scanning opted-in candidates…') + '</b>' +
        '<div class="xs muted" style="margin-top:3px">Matching skills (55%), location (20%), interests (15%) &amp; pay (10%)</div>' +
        '</div>';
      const slot = container.querySelector('.jobi-radar-mascot');
      if (slot && JM.mascot) {
        return JM.mascot.mount(slot, {
          emotion: 'scanning',
          prop: 'magnifying-glass',
          animation: 'scan',
          size: 104,
          ariaLabel: 'Jobi scanning matching candidates'
        });
      }
      return null;
    }
  };

  // ---------- 8C. Phase 2D: System & Lifecycle States (JM.system) ----------
  let activeOfflinePill = null;
  let activeOfflineCtrl = null;

  JM.hydrateSystemMascots = function (root) {
    const scope = root || document;
    if (!scope.querySelectorAll || !JM.mascot) return;

    // Thinking spinners (skeleton / loading states)
    scope.querySelectorAll('.jobi-thinking-mascot').forEach(function (slot) {
      if (slot._jobiMounted) return;
      slot._jobiMounted = true;
      JM.mascot.mount(slot, {
        emotion: 'thinking',
        prop: 'none',
        animation: 'idle',
        size: 40,
        ariaLabel: 'Jobi thinking while loading'
      });
    });

    // 404 Lost Jobi with map
    scope.querySelectorAll('.jobi-404-mascot').forEach(function (slot) {
      if (slot._jobiMounted) return;
      slot._jobiMounted = true;
      JM.mascot.mount(slot, {
        emotion: 'curious',
        prop: 'map',
        animation: 'idle',
        size: 124,
        ariaLabel: 'Lost Jobi holding a map'
      });
    });

    // General / Network Error oops Jobi
    scope.querySelectorAll('.jobi-error-mascot').forEach(function (slot) {
      if (slot._jobiMounted) return;
      slot._jobiMounted = true;
      JM.mascot.mount(slot, {
        emotion: 'oops',
        prop: 'clipboard',
        animation: 'oops',
        size: 124,
        ariaLabel: 'Oops Jobi error state'
      });
    });

    // Admin announcement megaphone banner
    scope.querySelectorAll('.jobi-announcement-mascot').forEach(function (slot) {
      if (slot._jobiMounted) return;
      slot._jobiMounted = true;
      JM.mascot.mount(slot, {
        emotion: 'cheering',
        prop: 'megaphone',
        animation: 'wave',
        size: 58,
        ariaLabel: 'Jobi holding a megaphone for announcement'
      });
    });
  };

  JM.system = {
    // 1. Splash & App Boot (.jobi-anim-boot, non-blocking, instant under prefers-reduced-motion)
    bootSplash: function () {
      if (!JM.isMotionEnabled()) return null;
      const el = document.createElement('div');
      el.className = 'jobi-boot-splash';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<div class="jobi-boot-splash-mascot"></div><span>Jobi booting up…</span>';
      document.body.appendChild(el);
      const slot = el.querySelector('.jobi-boot-splash-mascot');
      const ctrl = JM.mascot.mount(slot, {
        emotion: 'happy',
        prop: 'phone',
        animation: 'boot',
        size: 44
      });
      setTimeout(function () {
        ctrl.destroy();
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 1150);
      return el;
    },

    // 2. Thinking Spinner HTML for skeleton & loading states
    thinkingSpinnerHtml: function (label) {
      const esc = JM.esc || function (s) { return String(s || ''); };
      return '<div class="jobi-thinking-spinner" role="status" aria-live="polite">' +
        '<div class="jobi-thinking-mascot"></div>' +
        '<span>' + esc(label || 'Jobi is loading…') + '</span>' +
        '</div>';
    },

    // 3A. 404 / Not Found HTML (Lost Jobi holding map + clear home CTA)
    notFoundHtml: function (homeHref) {
      const href = homeHref || (JM.home ? '#' + JM.home() : '#/');
      return '<div class="auth-main" style="min-height:100vh;background:var(--bg)">' +
        '<div class="jobi-404-card" role="region" aria-label="Page not found">' +
        '<div class="jobi-state-mascot jobi-404-mascot"></div>' +
        '<span class="badge brand">404 · Off the Map</span>' +
        '<h2 style="margin:10px 0 6px">Looks like Jobi took a wrong turn</h2>' +
        '<p class="muted small">We couldn’t find that page on the map. Let’s get you back to your dashboard.</p>' +
        '<a class="btn lg mt" href="' + href + '">Back to Home</a>' +
        '</div></div>';
    },

    // 3B. General / Network Error HTML (oops Jobi + soft coral #FF7A6B accent + retry CTA)
    errorStateHtml: function (errorMessage) {
      const esc = JM.esc || function (s) { return String(s || ''); };
      return '<div class="jobi-error-card" role="alert">' +
        '<div class="jobi-state-mascot jobi-error-mascot"></div>' +
        '<span class="badge" style="background:#FFE4E0;color:#9A2B1D">Connection / Load Issue</span>' +
        '<h2 style="margin:10px 0 6px">Oops — something hit a snag</h2>' +
        '<p class="small" style="color:#5C2418;margin:0 auto 14px">' + esc(errorMessage || 'Cannot reach the server right now. Check your connection and try again.') + '</p>' +
        '<button type="button" class="btn" data-act="reload">Try again</button>' +
        '</div>';
    },

    // 4. Offline & Back Online Non-Blocking Indicator (sleepy Jobi with floating "z" -> wake-up)
    showOffline: function () {
      if (activeOfflinePill && activeOfflinePill.parentNode) {
        activeOfflinePill.parentNode.removeChild(activeOfflinePill);
      }
      if (activeOfflineCtrl) {
        activeOfflineCtrl.destroy();
        activeOfflineCtrl = null;
      }
      const pill = document.createElement('div');
      pill.className = 'jobi-offline-pill';
      pill.setAttribute('role', 'status');
      pill.innerHTML = '<div class="jobi-offline-mascot"></div><span class="jobi-offline-text">Offline · Jobi is resting (cached view)</span>';
      document.body.appendChild(pill);
      activeOfflinePill = pill;
      const slot = pill.querySelector('.jobi-offline-mascot');
      activeOfflineCtrl = JM.mascot.mount(slot, {
        emotion: 'sleepy',
        prop: 'coffee-mug',
        animation: 'sleepy',
        size: 42,
        ariaLabel: 'Sleepy Jobi offline indicator'
      });
      JM.announce('You are currently offline.');
      return pill;
    },

    showOnline: function () {
      if (!activeOfflinePill || !activeOfflinePill.parentNode) {
        activeOfflinePill = document.createElement('div');
        activeOfflinePill.className = 'jobi-offline-pill is-online';
        activeOfflinePill.setAttribute('role', 'status');
        activeOfflinePill.innerHTML = '<div class="jobi-offline-mascot"></div><span class="jobi-offline-text">Back online! Jobi is awake ⚡</span>';
        document.body.appendChild(activeOfflinePill);
      } else {
        activeOfflinePill.classList.add('is-online');
        const txt = activeOfflinePill.querySelector('.jobi-offline-text');
        if (txt) txt.textContent = 'Back online! Jobi is awake ⚡';
      }
      const slot = activeOfflinePill.querySelector('.jobi-offline-mascot');
      if (activeOfflineCtrl) activeOfflineCtrl.destroy();
      activeOfflineCtrl = JM.mascot.mount(slot, {
        emotion: 'happy',
        prop: 'phone',
        animation: 'boot',
        size: 42,
        ariaLabel: 'Jobi awake and back online'
      });
      JM.announce('Connection restored. Back online.');
      const targetPill = activeOfflinePill;
      const targetCtrl = activeOfflineCtrl;
      setTimeout(function () {
        if (targetCtrl) targetCtrl.destroy();
        if (targetPill && targetPill.parentNode) targetPill.parentNode.removeChild(targetPill);
        if (activeOfflinePill === targetPill) {
          activeOfflinePill = null;
          activeOfflineCtrl = null;
        }
      }, 1750);
      return targetPill;
    },

    // 5. PWA Home-Screen Install (appinstalled event -> Tier 2 Jobi hops out of phone prop)
    celebratePwaInstalled: function () {
      return JM.reward({
        id: 'system_pwa_installed',
        tier: 2,
        repeatTier: null,
        emotion: 'cheering',
        prop: 'phone',
        animation: 'cheer',
        confetti: true,
        title: 'JobMatch installed on your home screen! 📱',
        copy: 'Jobi is now one tap away whenever you want to check matches.'
      });
    },

    // 6A. Notification Bell Wiggle (Tier 1)
    wiggleBell: function () {
      const bellBtn = document.querySelector && document.querySelector('a[href="#/notifications"]');
      if (!bellBtn) return null;
      bellBtn.classList.remove('jobi-bell-wiggle');
      void bellBtn.offsetWidth;
      bellBtn.classList.add('jobi-bell-wiggle');
      setTimeout(function () {
        if (bellBtn.classList) bellBtn.classList.remove('jobi-bell-wiggle');
      }, 750);
      return bellBtn;
    },

    // 6B. Welcome Back Greeting (waving Jobi with time-of-day greeting, throttled once per session / inactivity)
    checkWelcomeBack: function (force) {
      if (!JM.me || !JM.me.id) return null;
      try {
        const sessKey = 'jm.jobi.welcome_sess.' + JM.me.id;
        const lastTsKey = 'jm.jobi.last_active.' + JM.me.id;
        const now = Date.now();
        const prevTs = parseInt(localStorage.getItem(lastTsKey) || '0', 10) || 0;
        localStorage.setItem(lastTsKey, String(now));

        if (!force) {
          if (sessionStorage.getItem(sessKey)) return null;
          // Only greet returning users who had a prior session or > 30 mins inactivity
          if (!prevTs) {
            sessionStorage.setItem(sessKey, '1');
            return null;
          }
        }
        sessionStorage.setItem(sessKey, '1');
      } catch (e) {}

      const hr = new Date().getHours();
      const tod = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
      const rawName = (JM.me.role === 'employer' && JM.me.employer && JM.me.employer.name) || JM.me.full_name || '';
      const firstName = String(rawName).trim().split(/\s+/)[0] || 'there';

      return JM.micro.cornerPeek({
        emotion: 'waving',
        prop: 'coffee-mug',
        animation: 'wave',
        text: tod + ', ' + firstName + '! Welcome back 👋'
      });
    },

    // Bind global window lifecycle listeners (offline/online, appinstalled, pull-to-refresh, visibility welcome-back)
    initLifecycle: function () {
      if (JM._lifecycleBound) return;
      JM._lifecycleBound = true;

      window.addEventListener('offline', function () {
        JM.system.showOffline();
      });
      window.addEventListener('online', function () {
        JM.system.showOnline();
      });
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        JM.system.showOffline();
      }

      window.addEventListener('appinstalled', function () {
        JM.system.celebratePwaInstalled();
      });

      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible' && JM.me && JM.me.id) {
          try {
            const lastTsKey = 'jm.jobi.last_active.' + JM.me.id;
            const prevTs = parseInt(localStorage.getItem(lastTsKey) || '0', 10) || 0;
            // After 4+ hours of inactivity, greet on return
            if (prevTs && (Date.now() - prevTs) > 4 * 3600 * 1000) {
              JM.system.checkWelcomeBack(true);
            }
            localStorage.setItem(lastTsKey, String(Date.now()));
          } catch (e) {}
        }
      });

      // Mobile touch Pull-to-Refresh with mini thinking Jobi
      let ptrStartY = 0;
      let ptrPulling = false;
      let ptrEl = null;

      window.addEventListener('touchstart', function (e) {
        if (window.scrollY > 2 || !e.touches || e.touches.length !== 1) return;
        if (document.getElementById('overlay-root') && document.getElementById('overlay-root').classList.contains('open')) return;
        ptrStartY = e.touches[0].clientY;
        ptrPulling = true;
      }, { passive: true });

      window.addEventListener('touchmove', function (e) {
        if (!ptrPulling || !e.touches || !e.touches[0]) return;
        const dy = e.touches[0].clientY - ptrStartY;
        if (dy > 48 && window.scrollY <= 2) {
          if (!ptrEl) {
            ptrEl = document.createElement('div');
            ptrEl.className = 'jobi-ptr-pill';
            ptrEl.innerHTML = '<div class="jobi-thinking-mascot"></div><span>Release to refresh…</span>';
            document.body.appendChild(ptrEl);
            JM.hydrateSystemMascots(ptrEl);
          }
          ptrEl.classList.add('is-visible');
        } else if (ptrEl) {
          ptrEl.classList.remove('is-visible');
        }
      }, { passive: true });

      window.addEventListener('touchend', function (e) {
        if (!ptrPulling) return;
        ptrPulling = false;
        if (ptrEl && ptrEl.classList.contains('is-visible')) {
          const pill = ptrEl;
          ptrEl = null;
          if (JM.render) JM.render();
          setTimeout(function () {
            if (pill.parentNode) pill.parentNode.removeChild(pill);
          }, 550);
        } else if (ptrEl) {
          if (ptrEl.parentNode) ptrEl.parentNode.removeChild(ptrEl);
          ptrEl = null;
        }
      }, { passive: true });
    }
  };

  // ---------- 9. Downloadable "I Got Hired!" Share Card Generator & Celebration ----------
  JM.downloadHiredCard = function (opts) {
    opts = opts || {};
    const seekerName = opts.seekerName || (JM.me && JM.me.full_name) || 'JobMatch Candidate';
    const jobTitle = opts.jobTitle || 'New Role';
    const companyName = opts.companyName || 'Verified Employer';
    const dateStr = new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');

    // Deep Navy -> Brand Blue gradient background
    const bgGrad = ctx.createLinearGradient(0, 0, 1080, 640);
    bgGrad.addColorStop(0, '#061E52');
    bgGrad.addColorStop(0.55, '#0A2B6D');
    bgGrad.addColorStop(1, '#0C70F8');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 640);

    // Decorative soft glowing circles
    ctx.fillStyle = 'rgba(57, 155, 255, 0.14)';
    ctx.beginPath();
    ctx.arc(920, 130, 210, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(140, 540, 180, 0, Math.PI * 2);
    ctx.fill();

    // Inner white card frame
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(64, 56, 952, 528, 28);
    else ctx.rect(64, 56, 952, 528);
    ctx.fill();

    // Top Gold Pill Badge
    ctx.fillStyle = '#FFF4DC';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(110, 102, 230, 44, 22);
    else ctx.rect(110, 102, 230, 44);
    ctx.fill();

    ctx.fillStyle = '#9A5B00';
    ctx.font = '800 18px Inter, system-ui, -apple-system, sans-serif';
    ctx.fillText('★  I GOT HIRED!', 136, 130);

    // Headline & details
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 46px Inter, system-ui, -apple-system, sans-serif';
    ctx.fillText(String(seekerName).slice(0, 32), 110, 215);

    ctx.fillStyle = '#0C70F8';
    ctx.font = '700 34px Inter, system-ui, -apple-system, sans-serif';
    ctx.fillText(String(jobTitle).slice(0, 38), 110, 272);

    ctx.fillStyle = '#334155';
    ctx.font = '600 26px Inter, system-ui, -apple-system, sans-serif';
    ctx.fillText('at ' + String(companyName).slice(0, 40), 110, 318);

    // Divider line
    ctx.strokeStyle = '#E3E8EF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(110, 375);
    ctx.lineTo(680, 375);
    ctx.stroke();

    // Footer branding
    ctx.fillStyle = '#0A2B6D';
    ctx.font = '800 26px Inter, system-ui, -apple-system, sans-serif';
    ctx.fillText('JobMatch ↗', 110, 435);

    ctx.fillStyle = '#64748B';
    ctx.font = '500 20px Inter, system-ui, -apple-system, sans-serif';
    ctx.fillText('Matched & hired in Biñan, Laguna · ' + dateStr, 110, 472);

    // Draw Jobi mini emblem on the right side of the card
    ctx.fillStyle = '#EBF3FF';
    ctx.beginPath();
    ctx.arc(845, 290, 115, 0, Math.PI * 2);
    ctx.fill();

    // Robot head silhouette on share card
    ctx.fillStyle = '#0C70F8';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(752, 222, 186, 134, 54);
    else ctx.rect(752, 222, 186, 134);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(764, 232, 162, 118, 48);
    else ctx.rect(764, 232, 162, 118);
    ctx.fill();

    ctx.fillStyle = '#07235E';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(778, 246, 134, 90, 36);
    else ctx.rect(778, 246, 134, 90);
    ctx.fill();

    // Cheering arch eyes + smile on share card
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(816, 286, 13, Math.PI, 0, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(874, 286, 13, Math.PI, 0, false);
    ctx.stroke();

    ctx.fillStyle = '#47A1FF';
    ctx.beginPath();
    ctx.arc(845, 304, 18, 0, Math.PI, false);
    ctx.fill();

    canvas.toBlob(function (blob) {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'jobmatch-hired-' + String(jobTitle).toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      JM.toastSuccess('Share card downloaded!');
    }, 'image/png');
  };

  JM.celebrateHired = function (info) {
    info = info || {};
    const jobTitle = info.jobTitle || 'your new role';
    const companyName = info.companyName || 'your new employer';
    const seekerName = (JM.me && JM.me.full_name) || 'Candidate';
    const propChoice = /engineer|construct|carpenter|electric|weld|plumber|mason|warehouse|forklift|technician|mechanic/i.test(jobTitle)
      ? 'hard-hat'
      : 'briefcase';

    const esc = JM.esc || function (s) { return String(s || ''); };
    const extraHtml = '<div class="jobi-hired-card">' +
      '<div class="xs" style="color:#FFD66B;font-weight:800;letter-spacing:.05em;text-transform:uppercase">★ Official Offer Accepted</div>' +
      '<div style="font-size:17px;font-weight:800;margin-top:4px">' + esc(seekerName) + '</div>' +
      '<div class="small" style="opacity:.92">' + esc(jobTitle) + ' at <b>' + esc(companyName) + '</b></div>' +
      '</div>';

    JM.reward({
      id: info.id ? ('seeker_hired_' + info.id) : 'seeker_hired_celebration',
      tier: 3,
      forceTier: !!info.force,
      repeatTier: 2,
      emotion: 'cheering',
      prop: propChoice,
      animation: 'cheer',
      badge: '🎉 You Got Hired!',
      title: 'Congratulations on your new job!',
      copy: companyName + ' marked you as hired for ' + jobTitle + '. Celebrate your milestone with a shareable card!',
      extraHtml: extraHtml,
      confetti: true,
      cta: {
        label: 'Download "I got hired" card',
        onClick: function () {
          JM.downloadHiredCard({ seekerName: seekerName, jobTitle: jobTitle, companyName: companyName });
        }
      },
      secondaryCta: {
        label: 'Continue',
        onClick: function () {}
      }
    });
  };
})();
