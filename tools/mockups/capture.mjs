import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(REPO_ROOT, 'docs/guide/screenshots');
const RAW_DIR = path.join(__dirname, '.raw');

// Resolve playwright-core locally or from env override
let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  ({ chromium } = require(process.env.PW_CORE_PATH || 'playwright'));
}

const BASE = process.env.JM_BASE_URL || 'http://localhost:5173';
const DEMO_PW = process.env.JM_DEMO_PW || '';
if (!DEMO_PW) {
  console.error('Missing JM_DEMO_PW environment variable. Set it to the demo password before running.');
  process.exit(1);
}

const EXEC_PATH = process.env.CHROME_PATH || (
  fs.existsSync('/Applications/Brave Browser.app/Contents/MacOS/Brave Browser')
    ? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    : undefined
);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(RAW_DIR, { recursive: true });

// CSS injected ONLY during ?mockup=1 capture:
// - Respects iPhone 16 Pro Max safe areas (top 62px, bottom 34px)
// - Disables animations/transitions for crisp deterministic screenshots
// - Hides plan badges, pricing, lock icons, billing links, and boost labels (Section 1.1)
const MOCKUP_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
  }
  :root {
    --safe-top: 62px;
    --safe-bot: 34px;
  }
  /* Push sticky topbars and plain/auth/landing screens clear of Dynamic Island (62pt) */
  .topbar {
    padding-top: var(--safe-top) !important;
    height: calc(56px + var(--safe-top)) !important;
    align-items: center !important;
  }
  .lnav {
    padding-top: var(--safe-top) !important;
  }
  .lnav .lwrap {
    height: 54px !important;
  }
  .auth-main {
    padding-top: calc(var(--safe-top) + 18px) !important;
    padding-bottom: calc(var(--safe-bot) + 24px) !important;
  }
  /* Push fixed bottom tabbar clear of Home Indicator (34pt) */
  .tabbar {
    padding-bottom: var(--safe-bot) !important;
  }
  .page {
    padding-bottom: calc(96px + var(--safe-bot)) !important;
  }
  .page.deck-page {
    height: calc(100dvh - 56px - var(--safe-top) - 60px - var(--safe-bot)) !important;
    min-height: 460px !important;
    padding-bottom: 10px !important;
  }
  .chat {
    height: calc(100dvh - 56px - var(--safe-top) - 60px - var(--safe-bot) - 24px) !important;
    min-height: 420px !important;
  }
  .ov {
    padding-top: var(--safe-top) !important;
    padding-bottom: var(--safe-bot) !important;
  }
  .modal {
    max-height: calc(100vh - var(--safe-top) - var(--safe-bot) - 24px) !important;
  }
  .drawer {
    padding-top: calc(var(--safe-top) + 14px) !important;
    padding-bottom: calc(var(--safe-bot) + 20px) !important;
  }
  /* Always keep the iOS status bar + Dynamic Island band clean on scrolled pages */
  body::before {
    content: "";
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 58px;
    background: var(--bg, #F5F7FA);
    z-index: 9000;
    pointer-events: none;
  }
  .topbar, .lnav {
    z-index: 9001 !important;
  }
  /* Keep Discover card "Why this match" box fully unclipped */
  .jdesc {
    -webkit-line-clamp: 2 !important;
  }
  /* Hide Section 1.1 pricing/plan/billing/pro UI */
  #pricing,
  a[data-scroll="pricing"],
  a[href="#/pro"],
  a[href="#/employer/billing"] {
    display: none !important;
  }
  /* Hide scrollbar artifacts */
  ::-webkit-scrollbar {
    display: none !important;
  }
`;

// Sanitizer run in-page right before each capture to remove any plan/tier/price mentions
// and ensure neutral, consistent demo presentation without modifying live DB
async function sanitizeMockupDom(page) {
  await page.evaluate(() => {
    // 1. Hide sidebar/landing plan/billing links & pricing sections
    document.querySelectorAll('#pricing, a[data-scroll="pricing"], a[href="#/pro"], a[href="#/employer/billing"]').forEach(el => el.remove());

    // 2. Clean text nodes containing plan/tier/price mentions per Section 1.1
    const cleanText = (el) => {
      if (!el) return;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let n;
      while ((n = walker.nextNode())) nodes.push(n);
      nodes.forEach(node => {
        let t = node.nodeValue || '';
        const orig = t;
        t = t.replace(/\b(Free|Monthly|Annual|Starter|Growth|Business)\s+Plan\b/gi, '');
        t = t.replace(/\bBusiness-plan\s+/gi, '');
        t = t.replace(/\s*\(Growth and up\)/gi, '');
        t = t.replace(/\s*\(Business\)/gi, '');
        t = t.replace(/Free for job seekers\.\s*/gi, '');
        t = t.replace(/Create a free account/gi, 'Create an account');
        t = t.replace(/Pay only when you need more reach\./gi, 'Review matched candidates in one place.');
        t = t.replace(/3 stars left today/gi, 'Unlimited stars');
        t = t.replace(/\bGrowth path\b/gi, 'Career path');
        t = t.replace(/\bboost your\b/gi, 'raise your');
        t = t.replace(/\bhi pogi\b/gi, 'Hello! Thank you for reaching out about the role.');
        t = t.replace(/₱\s*([\d,]+(?:\s*[–-]\s*[\d,]+)?)/g, 'PHP $1');
        t = t.replace(/\(₱\/mo\)/g, '(PHP/mo)');
        t = t.replace(/\(₱\)/g, '(PHP)');
        t = t.replace(/\(₱ per month\)/g, '(PHP per month)');
        if (t !== orig) node.nodeValue = t;
      });
    };
    cleanText(document.body);

    // 3. Remove plan & featured/boosted badges
    document.querySelectorAll('.badge').forEach(b => {
      const txt = (b.textContent || '').trim().toLowerCase();
      if (!txt || /plan|boosted|featured|starter|growth|business|free/.test(txt)) b.remove();
    });

    // 4. Remove "Your plan" card on Employer Overview
    document.querySelectorAll('.card').forEach(c => {
      const h = c.querySelector('h3');
      if (h && /your plan/i.test(h.textContent || '')) c.remove();
    });

    // 5. Remove any demo-only notices or real-user uploaded Unity screenshots in company-logos
    document.querySelectorAll('.jm-img[data-jm-bucket="company-logos"]').forEach(w => {
      const p = w.dataset.jmPath || '';
      if (p.includes('logo-17952')) {
        w.classList.remove('loaded');
        const im = w.querySelector('img');
        if (im) im.remove();
      }
    });
  });
}

async function waitImagesAndQuiet(page, ms = 700) {
  await page.waitForTimeout(ms);
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll('img.jm-img-el'));
    await Promise.race([
      Promise.all(imgs.map(im => im.complete ? Promise.resolve() : new Promise(r => { im.addEventListener('load', r, { once: true }); im.addEventListener('error', r, { once: true }); }))),
      new Promise(r => setTimeout(r, 2500))
    ]);
  });
  await page.waitForTimeout(250);
}

// Pure CSS iPhone 16 Pro Max Titanium Frame compositor (no Apple artwork/trademarks)
function frameHtml(rawDataUri) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: transparent;
    width: 524px;
    height: 1040px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", "Segoe UI", sans-serif;
    overflow: hidden;
  }
  .stage {
    position: relative;
    width: 476px;
    height: 992px;
    border-radius: 73px;
    padding: 18px;
    background: linear-gradient(145deg, #32353B 0%, #17181C 38%, #101114 68%, #2B2E34 100%);
    box-shadow:
      0 26px 56px rgba(15, 23, 42, 0.28),
      0 8px 20px rgba(15, 23, 42, 0.16),
      inset 0 0 0 2px rgba(255, 255, 255, 0.14),
      inset 0 0 0 4px rgba(0, 0, 0, 0.7);
  }
  /* Subtle titanium side hardware buttons */
  .btn-side {
    position: absolute;
    background: linear-gradient(180deg, #3A3D44, #1C1E22);
    border-radius: 3px;
  }
  .btn-action { left: -3px; top: 170px; width: 3px; height: 30px; }
  .btn-vol-up { left: -3px; top: 222px; width: 3px; height: 58px; }
  .btn-vol-dn { left: -3px; top: 294px; width: 3px; height: 58px; }
  .btn-power  { right: -3px; top: 248px; width: 3px; height: 86px; }
  .screen {
    position: relative;
    width: 440px;
    height: 956px;
    border-radius: 55px;
    overflow: hidden;
    background: #FFFFFF;
    box-shadow: inset 0 0 0 1px rgba(0,0,0,0.45);
  }
  .shot {
    display: block;
    width: 440px;
    height: 956px;
    object-fit: cover;
  }
  .status-bar {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 54px;
    padding: 15px 32px 0 34px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    pointer-events: none;
    z-index: 10;
  }
  .time {
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: #0F172A;
  }
  .status-icons {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #0F172A;
  }
  .island {
    position: absolute;
    top: 11px;
    left: 50%;
    transform: translateX(-50%);
    width: 126px;
    height: 37px;
    border-radius: 999px;
    background: #000000;
    z-index: 20;
    box-shadow: 0 1px 2px rgba(0,0,0,0.35);
  }
  .island::after {
    content: "";
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #1E3A5F 0%, #091322 55%, #000 100%);
    box-shadow: inset 0 0 2px rgba(96, 165, 250, 0.35);
  }
  .home-ind {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    width: 138px;
    height: 5px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.36);
    z-index: 20;
  }
</style>
</head>
<body>
  <div class="stage">
    <div class="btn-side btn-action"></div>
    <div class="btn-side btn-vol-up"></div>
    <div class="btn-side btn-vol-dn"></div>
    <div class="btn-side btn-power"></div>
    <div class="screen">
      <img class="shot" src="${rawDataUri}" alt="">
      <div class="status-bar">
        <span class="time">9:41</span>
        <span class="status-icons">
          <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="7" width="3" height="5" rx="1"/><rect x="4.5" y="5" width="3" height="7" rx="1"/><rect x="9" y="2.5" width="3" height="9.5" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>
          <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M1.5 4.2C5.2 1 10.8 1 14.5 4.2"/><path d="M4.2 7C6.4 5.1 9.6 5.1 11.8 7"/><circle cx="8" cy="10.2" r="1.2" fill="currentColor" stroke="none"/></svg>
          <svg width="26" height="12" viewBox="0 0 26 12" fill="none"><rect x="0.75" y="0.75" width="21.5" height="10.5" rx="3" stroke="currentColor" stroke-width="1.3" opacity="0.45"/><rect x="2.5" y="2.5" width="18" height="7" rx="1.6" fill="currentColor"/><path d="M23.8 4v4a1.5 1.5 0 0 0 0-4z" fill="currentColor" opacity="0.5"/></svg>
        </span>
      </div>
      <div class="island"></div>
      <div class="home-ind"></div>
    </div>
  </div>
</body>
</html>`;
}

const manifest = [];
const mockedNotes = [];

async function captureAndFrame(appPage, framePage, item) {
  await waitImagesAndQuiet(appPage, item.waitMs || 700);
  await sanitizeMockupDom(appPage);
  if (item.afterSanitize) await item.afterSanitize(appPage);
  await appPage.waitForTimeout(150);

  const rawPath = path.join(RAW_DIR, item.file);
  const outPath = path.join(OUT_DIR, item.file);
  await appPage.screenshot({ path: rawPath, type: 'png' });

  const b64 = fs.readFileSync(rawPath).toString('base64');
  await framePage.setContent(frameHtml('data:image/png;base64,' + b64), { waitUntil: 'load' });
  await framePage.waitForTimeout(60);
  await framePage.screenshot({ path: outPath, type: 'png', omitBackground: true });

  manifest.push({
    file: item.file,
    perspective: item.perspective,
    title: item.title,
    route: item.route,
    caption: item.caption,
    guideStep: item.guideStep,
    rawPx: '1320x2868',
    mocked: !!item.mocked
  });
  if (item.mocked) mockedNotes.push(`${item.file}: ${item.mocked}`);
  console.log('CAPTURED |', item.file, '—', item.title);
}

const browser = await chromium.launch({
  executablePath: EXEC_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu']
});

const appCtx = await browser.newContext({
  viewport: { width: 440, height: 956 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
});
const appPage = await appCtx.newPage();

// Inject mockup safe-area & clean CSS on every navigation
await appPage.addInitScript((cssText) => {
  const inject = () => {
    if (document.getElementById('jm-mockup-css')) return;
    const s = document.createElement('style');
    s.id = 'jm-mockup-css';
    s.textContent = cssText;
    (document.head || document.documentElement).appendChild(s);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
}, MOCKUP_CSS);

const frameCtx = await browser.newContext({
  viewport: { width: 524, height: 1040 },
  deviceScaleFactor: 3
});
const framePage = await frameCtx.newPage();

async function signIn(email) {
  await appPage.goto(BASE + '/?mockup=1#/login', { waitUntil: 'networkidle' });
  await appPage.waitForTimeout(600);
  await appPage.evaluate(async ({ email, pw }) => {
    await window.JM.signIn(email, pw);
  }, { email, pw: DEMO_PW });
  await appPage.waitForFunction(() => location.hash !== '#/login' && location.hash !== '#/', { timeout: 15000 });
  await appPage.waitForTimeout(1200);
}

async function signOut() {
  await appPage.evaluate(async () => {
    await window.JM.sb.auth.signOut();
    window.JM.me = null;
    if (window.JM.unsubscribe) window.JM.unsubscribe();
    window.JM.go('/');
  });
  await appPage.waitForTimeout(600);
}

try {
  // =========================================================================
  // PART 1: PUBLIC / ONBOARDING SEEKER SCREENS (01 - 06)
  // =========================================================================
  await appPage.goto(BASE + '/?mockup=1#/', { waitUntil: 'networkidle' });
  await captureAndFrame(appPage, framePage, {
    file: 'seeker-01-welcome.png',
    perspective: 'seeker',
    title: 'Welcome to JobMatch',
    route: '#/',
    caption: 'Start your job search with transparent match scores built for Biñan and Laguna.',
    guideStep: 'Hero / Phase 1'
  });

  // 03 Sign up (clean empty form)
  await appPage.goto(BASE + '/?mockup=1#/signup?role=seeker', { waitUntil: 'networkidle' });
  await captureAndFrame(appPage, framePage, {
    file: 'seeker-03-signup.png',
    perspective: 'seeker',
    title: 'Create your account',
    route: '#/signup',
    caption: 'Enter your full name, email, and an 8+ character password to create your account.',
    guideStep: 'Phase 1 – Step 1'
  });

  // Sign in as Maria Reyes (demo seeker with full seeker features) for seeker screens
  await signIn('maria@jobmatch.demo');

  // 02 Choose account type (#/role) — mocked in-memory only (no DB writes)
  await appPage.evaluate(async () => {
    window._origRole = window.JM.me.role;
    window.JM.me.role = null;
    location.hash = '#/role';
    await window.JM.render();
  });
  await captureAndFrame(appPage, framePage, {
    file: 'seeker-02-choose-role.png',
    perspective: 'seeker',
    title: 'Choose account type',
    route: '#/role',
    caption: 'Pick "I am looking for a job" to start your personal job matching and career plan.',
    guideStep: 'Phase 1 – Step 2',
    mocked: 'Temporarily cleared JM.me.role in memory to render #/role without modifying DB'
  });
  await appPage.evaluate(() => { window.JM.me.role = window._origRole || 'seeker'; });

  // 04 Onboarding Step 3 – Skills (categorized picker)
  await appPage.evaluate(async () => {
    window._origOnboarded = window.JM.me.seeker.onboarded;
    window.JM.me.seeker.onboarded = false;
    window.JM.draft = null;
    window.JM.obStep = 2;
    location.hash = '#/onboarding';
    await window.JM.render();
  });
  await captureAndFrame(appPage, framePage, {
    file: 'seeker-04-onboarding-skills.png',
    perspective: 'seeker',
    title: 'Onboarding – Skills (categorized picker)',
    route: '#/onboarding (Step 3 of 5)',
    caption: 'Browse 300+ categorized skills, pick Suggested for you, and set your level for each skill.',
    guideStep: 'Phase 2 – Step 3',
    mocked: 'Temporarily set JM.me.seeker.onboarded=false and JM.obStep=2 in memory'
  });

  // 05 Onboarding Step 4 – Résumé + "Profile updated from résumé" modal
  await appPage.evaluate(async () => {
    window.JM.obStep = 3;
    window.JM.drawDraft();
    const sum = 'College graduate (BS Business Administration) pursuing Sales Associate opportunities, open to on-site, hybrid, or remote roles based in or near Biñan – Poblacion. Practical retail and customer service experience supporting daily store operations, POS checkout, and customer inquiries. Core strengths span Customer Service & Hospitality and Retail & Sales: advanced in Customer service, Communication, Filipino; intermediate in POS system, Upselling, English.';
    window.JM.modal(
      '<h2>Profile updated from résumé</h2>' +
      '<p class="small muted mt">Updated sections: <b>Education level, School, Skills (6), Work / OJT experience (2), Professional summary (68 words)</b>.</p>' +
      '<div class="card flat card-b mt" style="padding:12px"><div class="xs muted bold mb">Updated Professional Summary</div><p class="xs" style="white-space:pre-wrap;margin:0">' + sum + '</p></div>' +
      '<div class="notice ok mt">' + window.JM.icon('shield') + '<div><b>Protected personal details were NOT modified:</b> Full Name, Contact Number, Date of Birth, and Email Address remain unchanged.</div></div>' +
      '<p class="xs muted mt">Review your sections and click <b>Continue</b> when ready.</p>' +
      '<div class="row mt-l" style="justify-content:flex-end"><button class="btn" data-act="close">Got it</button></div>',
      'wide'
    );
  });
  await captureAndFrame(appPage, framePage, {
    file: 'seeker-05-onboarding-resume.png',
    perspective: 'seeker',
    title: 'Onboarding – Résumé auto-fill result',
    route: '#/onboarding (Step 4 of 5)',
    caption: 'Tap Update All Info to auto-fill skills, education, and summary while keeping personal details protected.',
    guideStep: 'Phase 2 – Step 4',
    mocked: 'Rendered "Profile updated from résumé" confirmation modal in memory on Step 4'
  });
  await appPage.evaluate(() => window.JM.close());

  // 06 Onboarding Step 5 – Goals (role picker + work setups)
  await appPage.evaluate(async () => {
    window.JM.obStep = 4;
    window.JM.drawDraft();
    window.scrollTo(0, 0);
  });
  await captureAndFrame(appPage, framePage, {
    file: 'seeker-06-onboarding-goals.png',
    perspective: 'seeker',
    title: 'Onboarding – Goals & work setups',
    route: '#/onboarding (Step 5 of 5)',
    caption: 'Pick your target career role, accepted work setups (On-site, Hybrid, Remote), and pay goal.',
    guideStep: 'Phase 2 – Step 5',
    mocked: 'Temporarily rendered Step 5 of #/onboarding in memory'
  });
  await appPage.evaluate(() => {
    window.JM.me.seeker.onboarded = window._origOnboarded !== false;
    window.JM.obStep = null;
    window.JM.draft = null;
  });

  // =========================================================================
  // PART 2: MAIN SEEKER APP SCREENS (07 - 17)
  // =========================================================================
  // 07 Profile Hero (100% strength)
  await appPage.goto(BASE + '/?mockup=1#/profile', { waitUntil: 'networkidle' });
  await appPage.evaluate(() => window.scrollTo(0, 0));
  await captureAndFrame(appPage, framePage, {
    file: 'seeker-07-profile-hero.png',
    perspective: 'seeker',
    title: 'Your profile',
    route: '#/profile',
    caption: 'Complete your circular profile photo, 3:4 portrait, and details to reach 100% profile strength.',
    guideStep: 'Phase 3 – Step 1'
  });

  // 08 Discover – job card
  await appPage.goto(BASE + '/?mockup=1#/deck', { waitUntil: 'networkidle' });
  await appPage.waitForTimeout(1000);
  const hasTopCard = await appPage.evaluate(() => !!document.querySelector('#deck .jcard.top'));
  if (!hasTopCard) {
    // Switch to Paolo or Ana or mock a deck card if Maria has seen all jobs
    await signOut();
    await signIn('paolo@jobmatch.demo');
    await appPage.goto(BASE + '/?mockup=1#/deck', { waitUntil: 'networkidle' });
    await appPage.waitForTimeout(1000);
  }
  const stillEmpty = await appPage.evaluate(() => !document.querySelector('#deck .jcard.top'));
  let deckJobId = '00000000-0000-4000-8000-000000000101';
  if (stillEmpty) {
    await appPage.evaluate(async () => {
      const j = await window.JM.rpc('get_job', { p_job: '00000000-0000-4000-8000-000000000101' });
      const j2 = await window.JM.rpc('get_job', { p_job: '00000000-0000-4000-8000-000000000112' });
      window.JM.deckItems = [j2, j].filter(Boolean);
      const root = document.getElementById('deck');
      if (root && window.JM.deckItems.length) {
        // Trigger requeue-free redraw via JM.actions.deckrefresh override
        const origRpc = window.JM.rpc;
        window.JM.rpc = async (fn, args) => fn === 'get_deck' ? window.JM.deckItems : origRpc(fn, args);
        await window.JM.render();
        window.JM.rpc = origRpc;
      }
    });
    await appPage.waitForTimeout(800);
  }
  deckJobId = await appPage.evaluate(() => document.querySelector('#deck .jcard.top')?.dataset?.id || '00000000-0000-4000-8000-000000000101');
  await captureAndFrame(appPage, framePage, {
    file: 'seeker-08-discover-card.png',
    perspective: 'seeker',
    title: 'Discover – matched job card',
    route: '#/deck',
    caption: 'Swipe right to save, left to pass, up to star, or tap any card to see your full match breakdown.',
    guideStep: 'Phase 4 – Step 1',
    mocked: stillEmpty ? 'Populated Discover deck in memory from live get_job RPCs without changing swipes' : ''
  });

  // 09 Discover – Filters modal
  await appPage.click('button[data-act="filters"]');
  await appPage.waitForTimeout(300);
  await captureAndFrame(appPage, framePage, {
    file: 'seeker-09-discover-filters.png',
    perspective: 'seeker',
    title: 'Discover – Filter jobs',
    route: '#/deck (Filters modal)',
    caption: 'Filter jobs by commute limit, work setup (On-site, Hybrid, Remote), employment type, area, and minimum pay.',
    guideStep: 'Phase 4 – Step 2'
  });
  await appPage.click('button[data-act="close"]');
  await appPage.waitForTimeout(250);

  // 17 Upcoming interview card on Discover (fixture injected in-memory only)
  await appPage.evaluate(async () => {
    const origRpc = window.JM.rpc;
    const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    window.JM.rpc = async (fn, args) => {
      if (fn === 'my_interviews') {
        return [{
          id: 'mock-iv-1',
          job_title: 'Sales Associate',
          employer_name: 'Kape Biñan',
          scheduled_date: tomorrow,
          scheduled_time: '10:00 AM',
          interview_type: 'On-site',
          location_or_link: 'Kape Biñan, Poblacion, Biñan',
          status: 'scheduled'
        }];
      }
      if (fn === 'get_deck' && window.JM.deckItems && window.JM.deckItems.length) return window.JM.deckItems;
      return origRpc(fn, args);
    };
    await window.JM.render();
    window.JM.rpc = origRpc;
    window.scrollTo(0, 0);
  });
  await captureAndFrame(appPage, framePage, {
    file: 'seeker-17-upcoming-interview.png',
    perspective: 'seeker',
    title: 'Upcoming interview on Discover',
    route: '#/deck (Upcoming Interviews)',
    caption: 'Scheduled interviews appear at the top of Discover so you can review details and tap Confirm in one tap.',
    guideStep: 'Phase 8 – Step 1',
    mocked: 'Mocked my_interviews RPC response in memory to show a scheduled interview card without DB writes'
  });

  // Ensure we're signed in as Maria (or Paolo) for Job details, Career, Resume review, Applications, Matches, Messages
  const curEmail = await appPage.evaluate(() => window.JM.me?.email || '');
  if (curEmail !== 'paolo@jobmatch.demo') {
    await signOut();
    await signIn('paolo@jobmatch.demo');
  }

  // 10 Job details – match breakdown
  await appPage.goto(BASE + '/?mockup=1#/jobs/00000000-0000-4000-8000-000000000112', { waitUntil: 'networkidle' });
  await appPage.waitForTimeout(500);
  await appPage.evaluate(() => {
    const h = Array.from(document.querySelectorAll('h3')).find(el => /why you match/i.test(el.textContent || ''));
    if (h) {
      h.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -135);
    }
  });
  await captureAndFrame(appPage, framePage, {
    file: 'seeker-10-job-details.png',
    perspective: 'seeker',
    title: 'Job details & match breakdown',
    route: '#/jobs/:id',
    caption: 'See exactly how your skills (55%), location (20%), interests (15%), and pay (10%) build your match score.',
    guideStep: 'Phase 5 – Step 1'
  });

  // 11 Career breakdown for a job
  await appPage.goto(BASE + '/?mockup=1#/career/job/00000000-0000-4000-8000-000000000112', { waitUntil: 'networkidle' });
  await appPage.evaluate(() => window.scrollTo(0, 0));
  await captureAndFrame(appPage, framePage, {
    file: 'seeker-11-career-job.png',
    perspective: 'seeker',
    title: 'Career breakdown for a job',
    route: '#/career/job/:id',
    caption: 'Check your readiness ring, learning progress, and exact skills needed for any job listing.',
    guideStep: 'Phase 5 – Step 2'
  });

  // 12 Career – roadmap, readiness & career ladder
  await appPage.goto(BASE + '/?mockup=1#/career/role/web-developer', { waitUntil: 'networkidle' });
  await appPage.waitForTimeout(800);
  await appPage.evaluate(() => {
    // Show Week 1 tasks completed with Take quiz active and remove padlock icons for clean guide visual (in-memory DOM only)
    const wk1 = document.querySelector('details.week');
    if (wk1) {
      const cnt = wk1.querySelector('summary .small.muted');
      if (cnt) cnt.textContent = '2/3';
      wk1.querySelectorAll('.task').forEach(t => {
        const cb = t.querySelector('input[type="checkbox"]');
        if (cb) { cb.checked = true; t.classList.add('done'); }
        const qbtn = t.querySelector('button[data-act="quiz"]');
        if (qbtn) {
          qbtn.disabled = false;
          qbtn.className = 'btn sm';
        }
        t.querySelectorAll('.badge.warn').forEach(b => b.remove());
        const av = t.querySelector('.avatar');
        if (av && window.JM && window.JM.icon) {
          av.style.background = '#EBF3FF';
          av.style.color = '#0C70F8';
          av.innerHTML = window.JM.icon('zap', 14);
        }
      });
    }
    // Replace padlock icons on upcoming weeks with clock icons & clean "Up next" badges
    document.querySelectorAll('div.week').forEach(w => {
      const svg = w.querySelector('svg');
      if (svg && window.JM && window.JM.icon) svg.outerHTML = window.JM.icon('clock', 16);
      w.querySelectorAll('.badge.warn').forEach(b => {
        b.className = 'badge';
        b.textContent = b.textContent.replace(/Complete (Week \d+) to unlock/i, 'After $1');
      });
    });
    const rm = Array.from(document.querySelectorAll('h3')).find(h => /your roadmap/i.test(h.textContent || ''));
    if (rm) rm.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -130);
  });
  await captureAndFrame(appPage, framePage, {
    file: 'seeker-12-career-roadmap.png',
    perspective: 'seeker',
    title: 'Career roadmap & career path',
    route: '#/career/role/:id',
    caption: 'Follow weekly Learn and Practice tasks, pass skill quizzes, and track your Entry-to-Senior career path.',
    guideStep: 'Phase 9 – Step 1',
    mocked: 'Toggled Week 1 tasks in memory so Take quiz is active and replaced lock badges with upcoming-week indicators'
  });

  // 13 Résumé review results (use existing or fixture review card without invoking edge function/DB write)
  await appPage.goto(BASE + '/?mockup=1#/resume-review', { waitUntil: 'networkidle' });
  await appPage.waitForTimeout(700);
  const hasRev = await appPage.evaluate(() => !!document.querySelector('#review-out .ring'));
  if (!hasRev) {
    await appPage.evaluate(() => {
      const out = document.getElementById('review-out');
      if (out && window.JM.showReview) {
        out.innerHTML = window.JM.showReview({
          score: 84,
          summary: 'Strong early-career profile with clear technical skills and local readiness.',
          source: 'ai',
          created_at: new Date(Date.now() - 3600000).toISOString(),
          strengths: [
            'Clear HTML, CSS, JavaScript, and Troubleshooting skills aligned with IT and Web roles.',
            'Specific academic background and hands-on part-time/OJT experience listed.',
            'Open to On-site, Hybrid, and Remote setups around Santa Rosa and Biñan.'
          ],
          weaknesses: [
            {
              area: 'Impact metrics',
              issue: 'Work experience lists duties without measurable results.',
              solution: 'Add 1–2 concrete numbers such as tickets resolved or pages built.',
              example: 'Example: "Resolved 15+ workstation and Wi-Fi issues per week during OJT."'
            },
            {
              area: 'Networking fundamentals',
              issue: 'Core IT support skills like basic networking are not listed yet.',
              solution: 'Add Networking basics after completing Week 1 of your roadmap.'
            }
          ],
          recommendations: [
            'Keep your professional summary focused on your target role and top 3 skills.',
            'Attach a clean PDF résumé so employers can download it once shortlisted.'
          ]
        });
        out.scrollIntoView({ block: 'start' });
        window.scrollBy(0, -130);
      }
    });
  } else {
    await appPage.evaluate(() => {
      const out = document.getElementById('review-out');
      if (out) { out.scrollIntoView({ block: 'start' }); window.scrollBy(0, -130); }
    });
  }
  await captureAndFrame(appPage, framePage, {
    file: 'seeker-13-resume-review.png',
    perspective: 'seeker',
    title: 'Résumé review results',
    route: '#/resume-review',
    caption: 'Get an instant score, strong areas, specific fixes with examples, and employer-appeal tips.',
    guideStep: 'Phase 3 – Step 2',
    mocked: !hasRev ? 'Populated #review-out with a sample review object in memory (no DB write)' : ''
  });

  // 14 Applications – status timeline
  await appPage.goto(BASE + '/?mockup=1#/applications', { waitUntil: 'networkidle' });
  await appPage.evaluate(() => window.scrollTo(0, 0));
  await captureAndFrame(appPage, framePage, {
    file: 'seeker-14-applications.png',
    perspective: 'seeker',
    title: 'Applications & status timeline',
    route: '#/applications',
    caption: 'Track every application from Applied to Shortlisted or Hired, plus employer view status and Insights.',
    guideStep: 'Phase 6 – Step 2'
  });

  // 15 Matches (shortlisted / hired)
  await appPage.goto(BASE + '/?mockup=1#/matches', { waitUntil: 'networkidle' });
  await appPage.evaluate(() => window.scrollTo(0, 0));
  await captureAndFrame(appPage, framePage, {
    file: 'seeker-15-matches.png',
    perspective: 'seeker',
    title: 'Matches – contact details shared',
    route: '#/matches',
    caption: 'Once shortlisted, employer contact details appear and a direct chat opens.',
    guideStep: 'Phase 6 – Step 3'
  });

  // 16 Messages – long-press menu open
  await appPage.goto(BASE + '/?mockup=1#/messages', { waitUntil: 'networkidle' });
  await appPage.waitForTimeout(800);
  const firstConv = await appPage.$('.list-pane a.li');
  if (firstConv) {
    await firstConv.click();
    await appPage.waitForTimeout(900);
    const bub = await appPage.$('#bubbles .bub');
    if (bub) {
      await bub.click({ button: 'right' });
      await appPage.waitForTimeout(250);
    }
  }
  await captureAndFrame(appPage, framePage, {
    file: 'seeker-16-messages-menu.png',
    perspective: 'seeker',
    title: 'Messages – long-press options',
    route: '#/messages/:id',
    caption: 'Press and hold any message to Reply, Copy, Edit, Unsend, or Remove for you.',
    guideStep: 'Phase 7 – Step 2'
  });

  // =========================================================================
  // PART 3: EMPLOYER SCREENS (01 - 10)
  // =========================================================================
  await signOut();
  await signIn('pixel@jobmatch.demo');

  // E01 Overview dashboard
  await appPage.goto(BASE + '/?mockup=1#/employer', { waitUntil: 'networkidle' });
  await appPage.evaluate(() => window.scrollTo(0, 0));
  await captureAndFrame(appPage, framePage, {
    file: 'employer-01-overview.png',
    perspective: 'employer',
    title: 'Employer overview dashboard',
    route: '#/employer',
    caption: 'Employers see live jobs, applicants, matches, views, and upcoming interviews in one dashboard.',
    guideStep: 'Appendix – Employer Overview'
  });

  // E02 Post a job (filled with fixture values in memory, no DB write)
  await appPage.goto(BASE + '/?mockup=1#/employer/jobs/new', { waitUntil: 'networkidle' });
  await appPage.waitForTimeout(600);
  await appPage.evaluate(() => {
    window.JM.jd = Object.assign(window.JM.jd, {
      title: 'Junior Web Developer',
      role_id: 'web-developer',
      work_setup: 'Hybrid',
      onsite_days: 3,
      category: 'IT & Tech',
      type: 'Full-time',
      area_id: 'sta-rosa',
      salary_min: 22000,
      salary_max: 32000,
      description: 'Build responsive websites and web applications with our small Biñan & Santa Rosa engineering team.',
      skills: ['HTML & CSS', 'JavaScript', 'Problem solving', 'Teamwork']
    });
    window.JM.drawDraft();
    window.scrollTo(0, 140);
  });
  await captureAndFrame(appPage, framePage, {
    file: 'employer-02-post-job.png',
    perspective: 'employer',
    title: 'Post a job',
    route: '#/employer/jobs/new',
    caption: 'Employers pick a career role, work setup (On-site, Hybrid, or Remote), 4:3 photo, and required skills.',
    guideStep: 'Appendix – Step 1',
    mocked: 'Pre-filled JM.jd form state in memory without saving to DB'
  });

  // E03 Jobs list
  await appPage.goto(BASE + '/?mockup=1#/employer/jobs', { waitUntil: 'networkidle' });
  await appPage.evaluate(() => window.scrollTo(0, 0));
  await captureAndFrame(appPage, framePage, {
    file: 'employer-03-jobs-list.png',
    perspective: 'employer',
    title: 'Employer jobs list',
    route: '#/employer/jobs',
    caption: 'Every live listing shows work setup, pay range, status, and total applicant count.',
    guideStep: 'Appendix – Step 2'
  });

  // E04 Ranked applicants with match scores
  await appPage.goto(BASE + '/?mockup=1#/employer/jobs/00000000-0000-4000-8000-000000000112/applicants', { waitUntil: 'networkidle' });
  await appPage.waitForTimeout(800);
  await captureAndFrame(appPage, framePage, {
    file: 'employer-04-applicants.png',
    perspective: 'employer',
    title: 'Ranked applicants with match scores',
    route: '#/employer/jobs/:id/applicants',
    caption: 'Applicants are ranked by fit with masked names until the employer chooses to shortlist.',
    guideStep: 'Appendix – Step 3'
  });

  // E05 Applicant drawer (shortlist, message, schedule interview)
  const appBtn = await appPage.$('button[data-act="openapp"]');
  if (appBtn) {
    await appBtn.click();
    await appPage.waitForTimeout(800);
  }
  await captureAndFrame(appPage, framePage, {
    file: 'employer-05-applicant-drawer.png',
    perspective: 'employer',
    title: 'Applicant review drawer',
    route: '#/employer/jobs/:id/applicants (Drawer)',
    caption: 'Employers review skills, work setups, education, and summary fairly—contact details appear only after shortlisting.',
    guideStep: 'Appendix – Step 3'
  });

  // E06 Schedule interview modal
  await appPage.evaluate(() => {
    window.JM.close();
    const fakeBtn = { dataset: { app: 'mock-app', name: 'Paolo Garcia' } };
    window.JM.actions.schediv(fakeBtn);
  });
  await appPage.waitForTimeout(300);
  await captureAndFrame(appPage, framePage, {
    file: 'employer-06-schedule-interview.png',
    perspective: 'employer',
    title: 'Schedule interview modal',
    route: '#/employer/jobs/:id/applicants (Modal)',
    caption: 'Once shortlisted, employers schedule an Online or On-site interview and send an instant invite.',
    guideStep: 'Appendix – Step 4',
    mocked: 'Opened Schedule Interview modal via JM.actions.schediv in memory (no invite sent)'
  });
  await appPage.evaluate(() => window.JM.close());

  // E07 Candidate search + invite
  await appPage.goto(BASE + '/?mockup=1#/employer/candidates', { waitUntil: 'networkidle' });
  await appPage.waitForTimeout(1100);
  await appPage.evaluate(() => window.scrollTo(0, 320));
  await captureAndFrame(appPage, framePage, {
    file: 'employer-07-candidate-search.png',
    perspective: 'employer',
    title: 'Candidate search & invites',
    route: '#/employer/candidates',
    caption: 'Employers can discover opted-in seekers matched to their open roles and invite them to apply.',
    guideStep: 'Appendix – Step 2'
  });

  // E08 Analytics (trends + insights)
  await appPage.goto(BASE + '/?mockup=1#/employer/analytics', { waitUntil: 'networkidle' });
  await appPage.waitForTimeout(1000);
  await appPage.evaluate(() => window.scrollTo(0, 0));
  await captureAndFrame(appPage, framePage, {
    file: 'employer-08-analytics.png',
    perspective: 'employer',
    title: 'Employer analytics',
    route: '#/employer/analytics',
    caption: 'Hiring trends, views, saves, and application rates help employers improve their job listings.',
    guideStep: 'Appendix – Step 5'
  });

  // E09 Company page (logo, verified)
  await appPage.goto(BASE + '/?mockup=1#/employer/company', { waitUntil: 'networkidle' });
  await appPage.waitForTimeout(900);
  await appPage.evaluate(() => window.scrollTo(0, 0));
  await captureAndFrame(appPage, framePage, {
    file: 'employer-09-company.png',
    perspective: 'employer',
    title: 'Verified company profile',
    route: '#/employer/company',
    caption: 'Every employer completes document verification to earn the Verified badge shown to seekers.',
    guideStep: 'Appendix – Step 1'
  });

  // E10 Messages with a candidate (sign in as ServeWell who has an active chat with Paolo, or Pixel if it has one)
  await appPage.goto(BASE + '/?mockup=1#/messages', { waitUntil: 'networkidle' });
  await appPage.waitForTimeout(900);
  let empConv = await appPage.$('.list-pane a.li');
  let empMsgMocked = '';
  if (!empConv) {
    await signOut();
    await signIn('serve@jobmatch.demo');
    await appPage.goto(BASE + '/?mockup=1#/messages', { waitUntil: 'networkidle' });
    await appPage.waitForTimeout(900);
    empConv = await appPage.$('.list-pane a.li');
    empMsgMocked = 'Captured using ServeWell Support Hub demo employer (has active candidate conversation)';
  }
  if (empConv) {
    await empConv.click();
    await appPage.waitForTimeout(900);
    await appPage.evaluate(() => {
      const box = document.getElementById('bubbles');
      if (box && !box.querySelector('.bub.me')) {
        box.insertAdjacentHTML('beforeend', '<div class="bub me"><div class="msg-body">Hi Paolo! We would love to meet you this Thursday at 10:00 AM via Google Meet. I just sent the interview invite to your Discover dashboard.</div><small class="msg-meta"><span>9:15 AM</span></small></div>');
        box.scrollTop = box.scrollHeight;
      }
    });
  }
  await captureAndFrame(appPage, framePage, {
    file: 'employer-10-messages.png',
    perspective: 'employer',
    title: 'Messages with a candidate',
    route: '#/messages/:id',
    caption: 'Employers chat directly with shortlisted candidates using quick replies and message tools.',
    guideStep: 'Appendix – Step 4',
    mocked: empMsgMocked
  });

  // Write manifest.json
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    device: 'iPhone 16 Pro Max (440x956 pt @ 3x = 1320x2868 px raw)',
    count: manifest.length,
    screenshots: manifest
  }, null, 2));

  // Build gallery.html
  const cardHtml = (m) => `
    <figure class="shot-card" data-p="${m.perspective}">
      <div class="shot-img"><img src="${m.file}" alt="${m.title}" loading="lazy"></div>
      <figcaption>
        <div class="meta"><span class="pill ${m.perspective}">${m.perspective}</span><span class="route">${m.route}</span></div>
        <h3>${m.title}</h3>
        <p>${m.caption}</p>
        <div class="step">${m.guideStep}</div>
      </figcaption>
    </figure>`;

  const galleryHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>JobMatch Mockup Gallery – iPhone 16 Pro Max</title>
<style>
  :root { --brand:#0C70F8; --ink:#0F172A; --muted:#5B6577; --line:#E3E8EF; --bg:#F5F7FA; }
  * { box-sizing:border-box; }
  body { margin:0; font:15px/1.55 "Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:var(--bg); padding:32px 24px 64px; }
  .wrap { max-width:1360px; margin:0 auto; }
  header { display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:28px; }
  h1 { margin:0; font-size:28px; letter-spacing:-.02em; }
  .sub { margin:4px 0 0; color:var(--muted); }
  h2 { margin:36px 0 16px; font-size:20px; border-bottom:1px solid var(--line); padding-bottom:8px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(250px, 1fr)); gap:22px; }
  .shot-card { margin:0; background:#fff; border:1px solid var(--line); border-radius:16px; padding:16px; display:flex; flex-direction:column; gap:12px; box-shadow:0 4px 16px rgba(15,23,42,.05); }
  .shot-img { display:flex; justify-content:center; padding:6px 0; background:#F8FAFC; border-radius:12px; }
  .shot-img img { width:100%; max-width:220px; height:auto; display:block; }
  .meta { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px; }
  .pill { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; padding:2px 8px; border-radius:999px; }
  .pill.seeker { background:#EBF3FF; color:#0952B8; }
  .pill.employer { background:#E8F7EF; color:#14804F; }
  .route { font-size:11.5px; color:var(--muted); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  figcaption h3 { margin:0 0 4px; font-size:15px; }
  figcaption p { margin:0 0 8px; font-size:13px; color:var(--muted); }
  .step { font-size:11.5px; font-weight:600; color:var(--brand); }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <div>
        <h1>JobMatch iPhone 16 Pro Max Mockup Gallery</h1>
        <p class="sub">27 framed screens (17 Job Seeker + 10 Employer) · Captured at 440 × 956 pt @ 3× (1320 × 2868 px raw)</p>
      </div>
    </header>
    <h2>Job Seeker Journey (17 screens)</h2>
    <div class="grid">${manifest.filter(m => m.perspective === 'seeker').map(cardHtml).join('')}</div>
    <h2>How Employers Find You (10 screens)</h2>
    <div class="grid">${manifest.filter(m => m.perspective === 'employer').map(cardHtml).join('')}</div>
  </div>
</body>
</html>`;
  fs.writeFileSync(path.join(OUT_DIR, 'gallery.html'), galleryHtml);

  // Render gallery.png
  const galCtx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  const galPage = await galCtx.newPage();
  await galPage.goto('file://' + path.join(OUT_DIR, 'gallery.html'), { waitUntil: 'networkidle' });
  await galPage.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll('img'));
    imgs.forEach(im => { im.loading = 'eager'; });
    await Promise.all(imgs.map(im => im.complete ? Promise.resolve() : new Promise(r => { im.onload = im.onerror = r; })));
  });
  await galPage.waitForTimeout(300);
  await galPage.screenshot({ path: path.join(OUT_DIR, 'gallery.png'), fullPage: true });
  await galCtx.close();

  console.log('\nALL DONE! Captured', manifest.length, 'framed screenshots + manifest.json + gallery.html + gallery.png');
  if (mockedNotes.length) {
    console.log('MOCKED STATES:\n' + mockedNotes.map(x => ' - ' + x).join('\n'));
  }
} finally {
  fs.rmSync(RAW_DIR, { recursive: true, force: true });
  await browser.close();
}
