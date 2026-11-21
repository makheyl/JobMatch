// parse-resume: downloads uploaded PDF/DOCX/image/text from `resumes` bucket, extracts text,
// and returns structured professional fields + a detailed 120–250 word summary while strictly
// excluding personal info (Full Name, Contact Number, Date of Birth, Email Address).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'npm:unpdf';
import { unzipSync } from 'npm:fflate';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
}

function extractDocxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const docXml = files['word/document.xml'];
  if (!docXml) return '';
  const xml = new TextDecoder('utf-8').decode(docXml);
  const withBreaks = xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/>/g, ' ')
    .replace(/<w:br[^>]*\/>/g, '\n');
  return decodeXmlEntities(withBreaks.replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractLegacyDocBestEffort(bytes: Uint8Array): string {
  const text = new TextDecoder('latin1').decode(bytes);
  const runs = text.match(/[A-Za-z0-9][A-Za-z0-9 ,.;:()\/&+\-'\n]{12,}/g) ?? [];
  return runs.join('\n').replace(/\s+/g, ' ').trim();
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

type SkillRow = { name: string; category: string | null; aliases: string[] | null };

function matchSkillsFromText(rawText: string, rows: SkillRow[]): string[] {
  const nText = norm(rawText);
  const out: string[] = [];
  for (const r of rows) {
    const terms = [r.name, ...(r.aliases ?? [])].filter(Boolean);
    const hit = terms.some((t) => {
      const nt = norm(t).trim();
      if (nt.length < 2) return false;
      if (nt.length <= 3) {
        const re = new RegExp(`(^|[^a-z0-9])${nt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);
        return re.test(nText);
      }
      return nText.includes(nt);
    });
    if (hit) out.push(r.name);
  }
  return out.slice(0, 20);
}

function detectEducation(rawText: string) {
  let edu_level = '';
  if (/\b(master|mba|ms\s|ma\s|post[- ]?grad|doctorate|phd)\b/i.test(rawText)) edu_level = 'Post-graduate';
  else if (/\b(undergraduate|student|3rd year|4th year|2nd year|1st year|ojt|intern)\b/i.test(rawText)) edu_level = 'College undergraduate';
  else if (/\b(bachelor|bs\s|ba\s|b\.s\.|bsit|bscs|bsba|bsa|bshm|bstm|bsn|bsed|college graduate)\b/i.test(rawText)) edu_level = 'College graduate';
  else if (/\b(tesda|nc\s?ii|nc2|vocational|diploma)\b/i.test(rawText)) edu_level = 'Vocational / TESDA';
  else if (/\b(senior high|shs|abm|stem|humss|tvl|grade 12)\b/i.test(rawText)) edu_level = 'Senior high school';

  const yearM = /\b(20[0-3]\d|19[89]\d)\b/.exec(rawText);
  const grad_year = yearM ? Number(yearM[1]) : null;
  return { edu_level, grad_year };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'not_authenticated' }, 401);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: knownSkills } = await admin.from('skills').select('name,category,aliases').eq('active', true);
    const skillRows = (knownSkills ?? []) as SkillRow[];
    const skillNameSet = new Set(skillRows.map((s) => s.name));
    const aliasToName = new Map<string, string>();
    for (const s of skillRows) {
      aliasToName.set(norm(s.name), s.name);
      for (const a of s.aliases ?? []) aliasToName.set(norm(a), s.name);
    }

    const body = await req.json().catch(() => ({}));
    let rawText = typeof body?.text === 'string' ? body.text.trim() : '';
    const resumePath = typeof body?.resume_path === 'string' ? body.resume_path.trim() : '';
    let imagePayload: { media_type: string; data: string } | null = null;
    let needsText = false;

    // Extract text directly from uploaded storage object if owned by caller
    if (resumePath) {
      if (!resumePath.startsWith(user.id + '/')) {
        return json({ error: 'forbidden' }, 403);
      }
      const { data: blob, error: dlErr } = await admin.storage.from('resumes').download(resumePath);
      if (!dlErr && blob) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const ext = (resumePath.split('.').pop() || '').toLowerCase();
        if (ext === 'pdf') {
          try {
            const pdf = await getDocumentProxy(bytes);
            const extracted = await extractText(pdf, { mergePages: true });
            const pdfText = Array.isArray(extracted.text) ? extracted.text.join('\n') : String(extracted.text || '');
            if (pdfText.trim().length > rawText.length) rawText = pdfText.trim();
          } catch (_e) { /* scanned PDF fallback */ }
          if (rawText.length < 30) needsText = true;
        } else if (ext === 'docx') {
          try {
            const docText = extractDocxText(bytes);
            if (docText.length > rawText.length) rawText = docText;
          } catch (_e) { /* ignore */ }
          if (rawText.length < 30) needsText = true;
        } else if (ext === 'doc') {
          const legacy = extractLegacyDocBestEffort(bytes);
          if (legacy.length >= 60 && legacy.length > rawText.length) rawText = legacy;
          else if (rawText.length < 30) needsText = true;
        } else if (ext === 'txt' || ext === 'md') {
          const txt = new TextDecoder('utf-8').decode(bytes).trim();
          if (txt.length > rawText.length) rawText = txt;
        } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
          const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          if (Deno.env.get('ANTHROPIC_API_KEY') && bytes.length <= 4_500_000) {
            imagePayload = { media_type: mime, data: toBase64(bytes) };
          } else if (rawText.length < 30) {
            needsText = true;
          }
        }
      }
    }

    const matchedSkills = rawText ? matchSkillsFromText(rawText, skillRows) : [];
    const { edu_level, grad_year } = detectEducation(rawText);

    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (key && (rawText.length >= 30 || imagePayload)) {
      try {
        const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5-20251001';
        const skillPromptList = skillRows.map((s) => s.name).slice(0, 260).join(', ');
        const userContent: unknown[] = [];
        if (imagePayload) {
          userContent.push({
            type: 'image',
            source: { type: 'base64', media_type: imagePayload.media_type, data: imagePayload.data },
          });
        }
        userContent.push({
          type: 'text',
          text: rawText
            ? `Extract professional profile details from this résumé:\n\n${rawText.slice(0, 12000)}`
            : 'Read this résumé image and extract the professional profile details.',
        });

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            max_tokens: 1500,
            system: `You extract ONLY professional details from a Filipino job seeker's résumé. NEVER include, return, or mention the person's full name, phone number, email address, home street address, birth date, age, or gender.
Match skills to this canonical list whenever possible: ${skillPromptList}.
Write resume_summary as a detailed, up-to-date 120-240 word professional summary (plain text with paragraph breaks, NO markdown symbols) covering: headline & target role, education, work/OJT experience with measurable highlights, grouped skills & tools, and credentials/certifications. Never invent facts not present in the résumé.
Reply with JSON only:
{"edu_level":"","school":"","course":"","grad_year":null,"skills":[],"experience":[{"role":"","org":"","years":"","start":"","end":"","highlights":[]}],"certificates":[],"languages":[],"tools":[],"resume_summary":"","goal_text":""}.`,
            messages: [{ role: 'user', content: userContent }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const raw = (data.content?.[0]?.text ?? '').replace(/^```json\s*|```$/g, '').trim();
          const parsed = JSON.parse(raw);
          const normSkills = Array.isArray(parsed.skills)
            ? Array.from(new Set(
                parsed.skills
                  .map((s: unknown) => aliasToName.get(norm(String(s || ''))) || (skillNameSet.has(String(s)) ? String(s) : null))
                  .filter(Boolean)
              ))
            : matchedSkills;
          const exp = Array.isArray(parsed.experience)
            ? parsed.experience.slice(0, 10).map((e: Record<string, unknown>) => ({
                role: String(e.role || '').trim(),
                org: String(e.org || '').trim(),
                years: String(e.years || '').trim(),
                start: String(e.start || '').trim(),
                end: String(e.end || '').trim(),
                highlights: Array.isArray(e.highlights) ? e.highlights.map((h) => String(h || '').trim()).filter(Boolean).slice(0, 4) : [],
              })).filter((e: { role: string; org: string }) => e.role || e.org)
            : [];
          return json({
            edu_level: String(parsed.edu_level || edu_level || ''),
            school: String(parsed.school || '').trim(),
            course: String(parsed.course || '').trim(),
            grad_year: parsed.grad_year ? Number(parsed.grad_year) : grad_year,
            skills: normSkills.length ? normSkills : matchedSkills,
            experience: exp,
            certificates: Array.isArray(parsed.certificates) ? parsed.certificates.map((c: unknown) => String(c || '').trim()).filter(Boolean).slice(0, 10) : [],
            languages: Array.isArray(parsed.languages) ? parsed.languages.map((l: unknown) => String(l || '').trim()).filter(Boolean).slice(0, 8) : [],
            tools: Array.isArray(parsed.tools) ? parsed.tools.map((t: unknown) => String(t || '').trim()).filter(Boolean).slice(0, 12) : [],
            resume_summary: String(parsed.resume_summary || '').trim().slice(0, 2000),
            goal_text: String(parsed.goal_text || '').trim().slice(0, 140),
            needs_text: false,
            source: 'ai',
          });
        }
      } catch (_e) { /* fall back to deterministic rules */ }
    }

    return json({
      edu_level,
      school: '',
      course: '',
      grad_year,
      skills: matchedSkills,
      experience: [],
      certificates: [],
      languages: [],
      tools: [],
      resume_summary: '',
      goal_text: '',
      extracted_chars: rawText.length,
      needs_text: needsText,
      source: 'rules',
    });
  } catch (e) {
    return json({ error: 'server_error', message: (e as Error).message }, 500);
  }
});
