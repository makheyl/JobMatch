import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MD_PATH = path.join(REPO_ROOT, 'docs/guide/jobmatch-seeker-journey.md');
const HTML_PATH = path.join(REPO_ROOT, 'docs/guide/jobmatch-seeker-journey.html');
const LOGO_PATH = path.join(REPO_ROOT, 'web/assets/logo.png');

const md = fs.readFileSync(MD_PATH, 'utf8');
const logoB64 = fs.existsSync(LOGO_PATH)
  ? 'data:image/png;base64,' + fs.readFileSync(LOGO_PATH).toString('base64')
  : '';

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inlineMd(s) {
  let out = escHtml(s);
  // Inline code
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  return out;
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Parse markdown into structured blocks and sections for rich visual layout
const lines = md.split(/\r?\n/);
const toc = [];
let htmlParts = [];
let i = 0;

function parseTable(startIdx) {
  const headerCells = lines[startIdx].split('|').slice(1, -1).map(c => c.trim());
  let idx = startIdx + 2; // skip separator
  const rows = [];
  while (idx < lines.length && lines[idx].trim().startsWith('|')) {
    rows.push(lines[idx].split('|').slice(1, -1).map(c => c.trim()));
    idx++;
  }
  const tableHtml = '<div class="table-wrap"><table><thead><tr>' +
    headerCells.map(c => `<th>${inlineMd(c)}</th>`).join('') +
    '</tr></thead><tbody>' +
    rows.map(r => '<tr>' + r.map(c => `<td>${inlineMd(c)}</td>`).join('') + '</tr>').join('') +
    '</tbody></table></div>';
  return { html: tableHtml, nextIdx: idx };
}

function renderBlock(blockLines) {
  const out = [];
  let k = 0;
  while (k < blockLines.length) {
    const line = blockLines[k];
    const trim = line.trim();
    if (!trim || trim === '---') { k++; continue; }

    // Image
    const imgM = trim.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgM) {
      out.push(`<figure class="shot-figure"><img src="${escHtml(imgM[2])}" alt="${escHtml(imgM[1])}" loading="lazy"><figcaption>${escHtml(imgM[1])}</figcaption></figure>`);
      k++; continue;
    }

    // Blockquote / Tip / First 15 minutes callout
    if (trim.startsWith('>')) {
      const qLines = [];
      while (k < blockLines.length && blockLines[k].trim().startsWith('>')) {
        qLines.push(blockLines[k].trim().replace(/^>\s?/, ''));
        k++;
      }
      const isTip = qLines[0] && /^\*\*Tip:\*\*/i.test(qLines[0]);
      const isFirst15 = qLines[0] && /^###\s+Your First 15 Minutes/i.test(qLines[0]);
      if (isTip) {
        out.push(`<aside class="callout tip">${inlineMd(qLines.join(' '))}</aside>`);
      } else if (isFirst15) {
        const heading = qLines[0].replace(/^###\s+/, '');
        const items = qLines.slice(1).filter(Boolean).map(x => `<li>${inlineMd(x.replace(/^\d+\.\s*/, ''))}</li>`).join('');
        out.push(`<section class="callout first15"><h3>${inlineMd(heading)}</h3><ol>${items}</ol></section>`);
      } else {
        out.push(`<aside class="callout">${qLines.map(x => `<p>${inlineMd(x)}</p>`).join('')}</aside>`);
      }
      continue;
    }

    // Table
    if (trim.startsWith('|') && k + 1 < blockLines.length && /^\|[\s:-]+\|/.test(blockLines[k + 1].trim())) {
      const headerCells = trim.split('|').slice(1, -1).map(c => c.trim());
      k += 2;
      const rows = [];
      while (k < blockLines.length && blockLines[k].trim().startsWith('|')) {
        rows.push(blockLines[k].split('|').slice(1, -1).map(c => c.trim()));
        k++;
      }
      out.push('<div class="table-wrap"><table><thead><tr>' +
        headerCells.map(c => `<th>${inlineMd(c)}</th>`).join('') +
        '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + r.map(c => `<td>${inlineMd(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>');
      continue;
    }

    // Unordered list (including nested numbered lists under "- **Do this:**")
    if (/^-\s+/.test(trim)) {
      const items = [];
      while (k < blockLines.length) {
        const cur = blockLines[k];
        const curTrim = cur.trim();
        if (/^-\s+/.test(curTrim)) {
          items.push({ text: curTrim.replace(/^-\s+/, ''), subs: [] });
          k++;
        } else if (/^\s{2,}(\d+\.|-)\s+/.test(cur) && items.length) {
          const isNum = /^\s+\d+\./.test(cur);
          items[items.length - 1].subs.push({ isNum, text: curTrim.replace(/^(\d+\.|-)\s+/, '') });
          k++;
        } else {
          break;
        }
      }
      const listHtml = '<ul class="step-meta">' + items.map(it => {
        if (/^\*\*Screenshot:\*\*$/i.test(it.text.trim())) return '';
        let subHtml = '';
        if (it.subs.length) {
          const tag = it.subs[0].isNum ? 'ol' : 'ul';
          subHtml = `<${tag} class="sub-list">` + it.subs.map(s => `<li>${inlineMd(s.text)}</li>`).join('') + `</${tag}>`;
        }
        return `<li>${inlineMd(it.text)}${subHtml}</li>`;
      }).filter(Boolean).join('') + '</ul>';
      out.push(listHtml);
      continue;
    }

    // Paragraph
    const pLines = [];
    while (k < blockLines.length && blockLines[k].trim() && !blockLines[k].trim().startsWith('>') && !blockLines[k].trim().startsWith('|') && !/^!\[/.test(blockLines[k].trim()) && !/^-\s+/.test(blockLines[k].trim()) && blockLines[k].trim() !== '---') {
      pLines.push(blockLines[k].trim());
      k++;
    }
    if (pLines.length) {
      const pText = pLines.join(' ');
      if (/^\*[^*]+\*$/.test(pText) && !pText.includes('**')) {
        out.push(`<p class="tagline">${inlineMd(pText.slice(1, -1))}</p>`);
      } else {
        out.push(`<p>${inlineMd(pText)}</p>`);
      }
    }
  }
  return out.join('\n');
}

// Split document into top-level sections by "## "
let title = 'From Sign-Up to Hired: Your Complete JobMatch Guide';
const heroLines = [];
const sections = [];
let curSec = null;

for (const line of lines) {
  if (line.startsWith('# ') && !curSec && heroLines.length === 0) {
    title = line.slice(2).trim();
    continue;
  }
  if (line.startsWith('## ')) {
    curSec = { heading: line.slice(3).trim(), id: slugify(line.slice(3).trim()), lines: [] };
    sections.push(curSec);
    continue;
  }
  if (curSec) curSec.lines.push(line);
  else heroLines.push(line);
}

// Extract hero image vs hero prose
const heroImgIdx = heroLines.findIndex(l => /^!\[/.test(l.trim()));
let heroShotHtml = '';
if (heroImgIdx >= 0) {
  const m = heroLines[heroImgIdx].trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  if (m) heroShotHtml = `<div class="hero-phone"><img src="${escHtml(m[2])}" alt="${escHtml(m[1])}"></div>`;
  heroLines.splice(heroImgIdx, 1);
}

function renderSection(sec) {
  toc.push({ id: sec.id, heading: sec.heading });
  const isPhase = /^Phase\s+\d+/i.test(sec.heading);
  const isAppendix = /^Appendix:/i.test(sec.heading);
  const isFaq = /^Frequently Asked Questions/i.test(sec.heading);
  const isCta = /^Ready to take the first step/i.test(sec.heading);

  if (isCta) {
    return `<section id="${sec.id}" class="cta-banner"><h2>${inlineMd(sec.heading)}</h2>${renderBlock(sec.lines)}</section>`;
  }

  // Split by "### " subsections
  const intro = [];
  const subs = [];
  let curSub = null;
  for (const l of sec.lines) {
    if (l.startsWith('### ')) {
      curSub = { heading: l.slice(4).trim(), id: slugify(l.slice(4).trim()), lines: [] };
      subs.push(curSub);
    } else if (curSub) {
      curSub.lines.push(l);
    } else {
      intro.push(l);
    }
  }

  let bodyHtml = renderBlock(intro);

  if (isFaq) {
    bodyHtml += '<div class="faq-grid">' + subs.map(s =>
      `<article class="faq-item"><h3>${inlineMd(s.heading)}</h3>${renderBlock(s.lines)}</article>`
    ).join('') + '</div>';
  } else if (isAppendix) {
    bodyHtml += subs.map(s => {
      const imgs = [];
      const textLines = [];
      s.lines.forEach(l => {
        const m = l.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (m) imgs.push({ alt: m[1], src: m[2] });
        else textLines.push(l);
      });
      const gallery = imgs.length
        ? `<div class="emp-shots count-${imgs.length}">` + imgs.map(im =>
            `<figure class="shot-figure"><img src="${escHtml(im.src)}" alt="${escHtml(im.alt)}" loading="lazy"><figcaption>${escHtml(im.alt)}</figcaption></figure>`
          ).join('') + '</div>'
        : '';
      return `<article class="appendix-card"><h3>${inlineMd(s.heading)}</h3><div class="appendix-body">${renderBlock(textLines)}</div>${gallery}</article>`;
    }).join('');
  } else if (subs.length) {
    bodyHtml += subs.map(s => {
      // Pull out screenshot(s) to place side-by-side in a responsive 2-col step card
      const imgs = [];
      const textLines = [];
      s.lines.forEach(l => {
        const m = l.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (m) imgs.push({ alt: m[1], src: m[2] });
        else textLines.push(l);
      });
      const mediaHtml = imgs.length
        ? `<div class="step-media">` + imgs.map(im =>
            `<figure class="shot-figure"><img src="${escHtml(im.src)}" alt="${escHtml(im.alt)}" loading="lazy"><figcaption>${escHtml(im.alt)}</figcaption></figure>`
          ).join('') + '</div>'
        : '';
      return `<article id="${s.id}" class="step-card ${imgs.length ? 'has-media' : ''}">` +
        `<div class="step-content"><h3>${inlineMd(s.heading)}</h3>${renderBlock(textLines)}</div>` +
        mediaHtml + `</article>`;
    }).join('');
  }

  const badge = isPhase ? `<span class="phase-pill">${escHtml(sec.heading.split('–')[0].trim())}</span>` : '';
  const cleanH2 = isPhase && sec.heading.includes('–') ? sec.heading.split('–').slice(1).join('–').trim() : sec.heading;
  return `<section id="${sec.id}" class="guide-section ${isPhase ? 'phase-section' : ''}">` +
    `<div class="sec-head">${badge}<h2>${inlineMd(cleanH2)}</h2></div>` +
    bodyHtml + `</section>`;
}

const sectionsHtml = sections.map(renderSection).join('\n');

const finalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --brand: #0C70F8;
    --brand-d: #0952B8;
    --brand-t: #EBF3FF;
    --ok: #14804F;
    --ok-t: #E8F7EF;
    --warn: #9A5B00;
    --warn-t: #FFF6E0;
    --ink: #0F172A;
    --ink2: #334155;
    --muted: #5B6577;
    --line: #E3E8EF;
    --bg: #F5F7FA;
    --card: #FFFFFF;
    --radius: 18px;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    font: 15.5px/1.65 "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: var(--ink);
    background: var(--bg);
    -webkit-font-smoothing: antialiased;
  }
  .topbar {
    position: sticky;
    top: 0;
    z-index: 50;
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line);
  }
  .topbar-in {
    max-width: 1220px;
    margin: 0 auto;
    padding: 12px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-weight: 800;
    font-size: 18px;
    color: var(--ink);
    text-decoration: none;
    letter-spacing: -0.02em;
  }
  .brand img { width: 32px; height: 32px; border-radius: 8px; }
  .top-actions { display: flex; align-items: center; gap: 10px; }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 15px;
    border-radius: 10px;
    font: 600 13.5px/1.2 "Inter", sans-serif;
    text-decoration: none;
    cursor: pointer;
    border: 1px solid var(--line);
    background: #fff;
    color: var(--ink);
  }
  .btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
  .btn.primary:hover { background: var(--brand-d); }
  .layout {
    max-width: 1220px;
    margin: 0 auto;
    padding: 28px 24px 72px;
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 32px;
    align-items: start;
  }
  .toc {
    position: sticky;
    top: 76px;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 18px 16px;
    max-height: calc(100vh - 96px);
    overflow-y: auto;
  }
  .toc-title {
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin: 0 0 10px;
  }
  .toc a {
    display: block;
    padding: 6px 8px;
    border-radius: 8px;
    font-size: 13px;
    color: var(--ink2);
    text-decoration: none;
    line-height: 1.35;
  }
  .toc a:hover { background: var(--brand-t); color: var(--brand-d); }
  main { min-width: 0; }
  .hero {
    background: linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 100%);
    border: 1px solid #D6E6FF;
    border-radius: 22px;
    padding: 32px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 260px;
    gap: 28px;
    align-items: center;
    margin-bottom: 32px;
    box-shadow: 0 10px 30px rgba(12, 112, 248, 0.06);
  }
  .eyebrow {
    display: inline-block;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--brand);
    background: var(--brand-t);
    padding: 4px 10px;
    border-radius: 999px;
    margin-bottom: 12px;
  }
  .hero h1 {
    margin: 0 0 10px;
    font-size: clamp(26px, 3.2vw, 34px);
    line-height: 1.18;
    letter-spacing: -0.025em;
  }
  .hero-phone { text-align: center; }
  .hero-phone img { width: 100%; max-width: 245px; height: auto; display: block; margin: 0 auto; }
  .tagline {
    margin: 4px 0 14px;
    font-size: 15px;
    font-style: italic;
    color: var(--brand-d);
    font-weight: 500;
  }
  .callout {
    border-radius: 14px;
    padding: 16px 18px;
    margin: 16px 0;
    border: 1px solid var(--line);
    background: #F8FAFC;
  }
  .callout.first15 {
    background: #FFFFFF;
    border: 1px solid #CFE2FF;
    border-left: 4px solid var(--brand);
  }
  .callout.first15 h3 { margin: 0 0 8px; font-size: 15.5px; color: var(--brand-d); }
  .callout.first15 ol { margin: 0; padding-left: 20px; font-size: 14px; }
  .callout.first15 li { margin: 5px 0; }
  .callout.tip {
    background: var(--ok-t);
    border-color: #BFE7D3;
    color: #0E4F31;
    font-size: 14px;
    padding: 12px 15px;
  }
  .guide-section { margin: 38px 0; }
  .sec-head { margin-bottom: 14px; }
  .phase-pill {
    display: inline-block;
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #fff;
    background: var(--brand);
    padding: 3px 10px;
    border-radius: 999px;
    margin-bottom: 6px;
  }
  .guide-section h2 {
    margin: 0;
    font-size: 24px;
    letter-spacing: -0.02em;
    line-height: 1.25;
  }
  .step-card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 24px;
    margin: 18px 0;
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
  }
  .step-card.has-media {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 250px;
    gap: 26px;
    align-items: start;
  }
  .step-card h3 {
    margin: 0 0 12px;
    font-size: 18px;
    line-height: 1.3;
    color: var(--ink);
  }
  .step-meta { list-style: none; padding: 0; margin: 0; }
  .step-meta > li { margin: 10px 0; font-size: 14.8px; color: var(--ink2); }
  .step-meta > li strong:first-child { color: var(--ink); }
  .sub-list { margin: 8px 0 4px; padding-left: 20px; }
  .sub-list li { margin: 5px 0; }
  .step-media { display: flex; flex-direction: column; gap: 14px; align-items: center; }
  .shot-figure { margin: 0; text-align: center; }
  .shot-figure img { width: 100%; max-width: 240px; height: auto; display: block; margin: 0 auto; }
  .shot-figure figcaption {
    margin-top: 8px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--muted);
    max-width: 240px;
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.88em;
    background: #EEF2F7;
    color: #0F172A;
    padding: 2px 6px;
    border-radius: 6px;
  }
  .table-wrap {
    overflow-x: auto;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 14px;
    margin: 16px 0;
  }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 11px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { background: #F8FAFC; font-weight: 700; color: var(--ink); font-size: 13px; }
  tr:last-child td { border-bottom: 0; }
  .faq-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 14px; }
  .faq-item {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 18px 20px;
  }
  .faq-item h3 { margin: 0 0 8px; font-size: 15.5px; color: var(--ink); }
  .faq-item p { margin: 0; font-size: 14px; color: var(--ink2); }
  .appendix-card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 22px 24px;
    margin: 18px 0;
  }
  .appendix-card h3 { margin: 0 0 8px; font-size: 17px; }
  .appendix-body p { margin: 0 0 16px; font-size: 14.5px; color: var(--ink2); }
  .emp-shots {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 18px;
    justify-items: center;
    padding-top: 6px;
  }
  .cta-banner {
    background: linear-gradient(135deg, #0C70F8 0%, #0952B8 100%);
    color: #fff;
    border-radius: 20px;
    padding: 36px 32px;
    text-align: center;
    margin-top: 42px;
    box-shadow: 0 14px 32px rgba(12, 112, 248, 0.22);
  }
  .cta-banner h2 { margin: 0 0 10px; font-size: 26px; color: #fff; }
  .cta-banner p { margin: 8px auto; max-width: 560px; color: rgba(255, 255, 255, 0.92); font-size: 16px; }
  .cta-banner strong { color: #fff; font-size: 18px; display: inline-block; margin-top: 6px; padding: 10px 22px; background: rgba(255, 255, 255, 0.16); border: 1px solid rgba(255, 255, 255, 0.35); border-radius: 12px; }
  .foot {
    max-width: 1220px;
    margin: 0 auto;
    padding: 0 24px 40px;
    font-size: 13px;
    color: var(--muted);
    text-align: center;
  }
  @media (max-width: 960px) {
    .layout { grid-template-columns: 1fr; }
    .toc { position: static; max-height: none; }
    .hero, .step-card.has-media { grid-template-columns: 1fr; }
    .faq-grid { grid-template-columns: 1fr; }
  }
  @media print {
    body { background: #fff; font-size: 12px; }
    .topbar, .toc { display: none !important; }
    .layout { display: block; max-width: 100%; padding: 0; }
    .hero, .step-card, .appendix-card, .faq-item, .cta-banner {
      break-inside: avoid;
      box-shadow: none;
    }
    .step-card.has-media { grid-template-columns: minmax(0, 1fr) 185px; gap: 16px; }
    .shot-figure img { max-width: 175px; }
    .cta-banner { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-in">
      <a class="brand" href="#top">${logoB64 ? `<img src="${logoB64}" alt="JobMatch logo">` : ''}JobMatch Seeker Guide</a>
      <div class="top-actions">
        <a class="btn" href="screenshots/gallery.html">Mockup Gallery</a>
        <button class="btn primary" type="button" onclick="window.print()">Print / Save PDF</button>
      </div>
    </div>
  </header>

  <div class="layout" id="top">
    <aside class="toc" aria-label="Guide contents">
      <div class="toc-title">On this page</div>
      ${toc.map(t => `<a href="#${t.id}">${escHtml(t.heading)}</a>`).join('\n      ')}
    </aside>

    <main>
      <section class="hero">
        <div>
          <span class="eyebrow">Biñan · Laguna · Cavite</span>
          <h1>${inlineMd(title)}</h1>
          ${renderBlock(heroLines)}
        </div>
        ${heroShotHtml}
      </section>

      ${sectionsHtml}
    </main>
  </div>

  <footer class="foot">
    JobMatch Seeker Journey Guide · Built for job seekers in Biñan, Laguna, and nearby Cavite.
  </footer>
</body>
</html>`;

fs.writeFileSync(HTML_PATH, finalHtml);
console.log('Generated', HTML_PATH, '(' + Math.round(finalHtml.length / 1024) + ' KB)');
