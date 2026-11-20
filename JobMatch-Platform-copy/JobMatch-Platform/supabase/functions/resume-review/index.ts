// resume-review (Pro): scores the signed-in seeker's résumé and suggests improvements.
// Works with no outside account using built-in rules. If the ANTHROPIC_API_KEY secret is set, an AI review is used
// (falling back to the rules on any error). Optional secrets: ANTHROPIC_MODEL.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Review = { score: number; summary: string; suggestions: { area: string; tip: string }[]; source: 'rules' | 'ai' };

function ruleReview(c: { summary: string; skills: string[]; experience: { role?: string; org?: string; years?: string }[]; edu: boolean; phone: boolean; goal: string; uploaded: boolean }): Review {
  const tips: { area: string; tip: string }[] = [];
  let score = 0;
  const s = c.summary.trim();
  if (s.length >= 60) score += 15; else tips.push({ area: 'Summary', tip: 'Write a 2 to 3 sentence summary (at least 60 characters) that says who you are and what role you want.' });
  if (s.length <= 600) score += 5; else tips.push({ area: 'Summary', tip: 'Shorten your summary to under 600 characters so employers read all of it.' });
  if (/\b(managed|led|handled|improved|created|built|sold|served|organized|trained|reduced|increased)\b/i.test(s + ' ' + c.experience.map((e) => e.role ?? '').join(' '))) score += 10;
  else tips.push({ area: 'Wording', tip: 'Start achievements with action verbs such as handled, organized, improved or served.' });
  if (/\d/.test(s + c.experience.map((e) => (e.years ?? '') + (e.role ?? '')).join(' '))) score += 10;
  else tips.push({ area: 'Results', tip: 'Add numbers where you can, for example "served 50 customers a day" or "2 years of experience".' });
  if (c.skills.length >= 5) score += 20; else if (c.skills.length >= 3) { score += 12; tips.push({ area: 'Skills', tip: 'Add at least 5 skills that match the jobs you want. More skills improve your match scores.' }); } else tips.push({ area: 'Skills', tip: 'List at least 3 to 5 relevant skills with your honest level.' });
  if (c.experience.length >= 1) score += 15; else tips.push({ area: 'Experience', tip: 'Add any work, OJT, volunteer or school project experience, even short ones.' });
  if (c.edu) score += 10; else tips.push({ area: 'Education', tip: 'Complete your education details: level, school and course.' });
  if (c.phone) score += 5; else tips.push({ area: 'Contact', tip: 'Add a mobile number so a shortlisting employer can reach you.' });
  if (c.goal.trim().length >= 10) score += 5; else tips.push({ area: 'Goal', tip: 'State your career goal so we can build the right roadmap.' });
  if (c.uploaded) score += 5; else tips.push({ area: 'File', tip: 'Upload a PDF résumé as well, so shortlisted employers can download it.' });
  score = Math.min(100, score);
  const summary = score >= 80 ? 'Strong résumé. A few small tweaks will make it stand out.' : score >= 55 ? 'Good start. Fix the points below to get noticed.' : 'Your résumé needs more detail before employers can judge it fairly.';
  return { score, summary, suggestions: tips.slice(0, 8), source: 'rules' };
}

async function aiReview(text: string): Promise<Review | null> {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-5-5',
        max_tokens: 700,
        system: 'You review résumés for entry-level Filipino job seekers. Be specific, kind and practical. Never mention or infer age, gender, religion or appearance. Reply with JSON only: {"score":0-100,"summary":"one sentence","suggestions":[{"area":"short label","tip":"one concrete action"}]} with at most 6 suggestions.',
        messages: [{ role: 'user', content: text.slice(0, 6000) }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = (data.content?.[0]?.text ?? '').replace(/^```json\s*|```$/g, '').trim();
    const parsed = JSON.parse(raw);
    if (typeof parsed.score !== 'number' || !Array.isArray(parsed.suggestions)) return null;
    return { score: Math.max(0, Math.min(100, Math.round(parsed.score))), summary: String(parsed.summary ?? ''), suggestions: parsed.suggestions.slice(0, 6).map((s: { area?: string; tip?: string }) => ({ area: String(s.area ?? 'Tip'), tip: String(s.tip ?? '') })), source: 'ai' };
  } catch (_e) {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'not_authenticated' }, 401);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: sp } = await admin.from('seeker_profiles').select('*').eq('user_id', user.id).single();
    if (!sp) return json({ error: 'not_a_seeker' }, 403);
    if (sp.plan !== 'pro') return json({ error: 'pro_required' }, 402);
    const { data: prof } = await admin.from('profiles').select('full_name,phone').eq('id', user.id).single();
    const { data: sk } = await admin.from('seeker_skills').select('skill,level').eq('user_id', user.id);

    // never send name, age, gender or photos to the reviewer
    const skills = (sk ?? []).map((k) => k.skill as string);
    const body = await req.json().catch(() => ({}));
    const pasted = typeof body?.text === 'string' ? body.text.trim() : '';
    const experience = (sp.experience ?? []) as { role?: string; org?: string; years?: string }[];
    const compiled = [
      `Goal: ${sp.goal_text}`, `Summary: ${sp.resume_summary}`, `Education: ${sp.edu_level}, ${sp.course}, ${sp.school}`,
      `Skills: ${(sk ?? []).map((k) => `${k.skill} (${k.level})`).join(', ')}`,
      `Experience: ${experience.map((e) => `${e.role} at ${e.org} (${e.years} yr)`).join('; ')}`,
    ].join('\n');

    const review = (await aiReview(pasted || compiled)) ??
      ruleReview({ summary: pasted || sp.resume_summary, skills, experience, edu: !!(sp.edu_level && sp.school), phone: !!prof?.phone, goal: sp.goal_text, uploaded: !!sp.resume_path });

    await admin.from('resume_reviews').insert({ user_id: user.id, score: review.score, summary: review.summary, suggestions: review.suggestions, source: review.source });
    return json(review);
  } catch (e) {
    return json({ error: 'server_error', message: (e as Error).message }, 500);
  }
});
