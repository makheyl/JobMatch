// resume-review (Monthly/Annual): detailed review identifying strengths, weaknesses, solutions & recommendations.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Weakness = { area: string; issue: string; solution: string; example: string };
type Review = {
  score: number;
  summary: string;
  strengths: string[];
  weaknesses: Weakness[];
  recommendations: string[];
  suggestions: { area: string; tip: string }[];
  source: 'rules' | 'ai';
};

function ruleReview(c: { summary: string; skills: string[]; experience: { role?: string; org?: string; years?: string }[]; edu: boolean; phone: boolean; goal: string; uploaded: boolean; linked: boolean }): Review {
  const strengths: string[] = [];
  const weaknesses: Weakness[] = [];
  const recommendations: string[] = [];
  let score = 0;
  const s = c.summary.trim();
  const expText = c.experience.map((e) => `${e.role ?? ''} ${e.org ?? ''} ${e.years ?? ''}`).join(' ');

  if (s.length >= 60 && s.length <= 600) {
    score += 20;
    strengths.push('Clear, well-sized professional summary that introduces your background concisely.');
  } else if (s.length < 60) {
    weaknesses.push({
      area: 'Professional Summary',
      issue: 'Your summary is too brief or missing, making it harder for recruiters to grasp your strengths in the first 10 seconds.',
      solution: 'Write a focused 2–3 sentence summary covering your background, top 2–3 skills, and target role.',
      example: 'Example: "Detail-oriented BS Business Administration graduate skilled in customer service, POS operations, and Excel, seeking a Sales Associate role in Biñan."'
    });
  } else {
    score += 12;
    weaknesses.push({
      area: 'Summary Length',
      issue: 'Your summary exceeds 600 characters and may be skipped by busy MSME employers.',
      solution: 'Trim filler words and keep your summary to 3–4 crisp lines.',
      example: 'Example: Focus on 1 sentence for background, 1 for key skills/results, and 1 for your target role.'
    });
  }

  if (/\b(managed|led|handled|improved|created|built|sold|served|organized|trained|reduced|increased|assisted|coordinated|prepared)\b/i.test(s + ' ' + expText)) {
    score += 12;
    strengths.push('Uses strong action verbs that clearly show hands-on contribution.');
  } else {
    weaknesses.push({
      area: 'Action-Oriented Wording',
      issue: 'Descriptions read passively without action verbs.',
      solution: 'Start each experience bullet or achievement with a strong verb (Served, Managed, Organized, Improved, Prepared).',
      example: 'Example: Change "Responsible for cashier duties" to "Processed 80+ daily cash and GCash transactions with 99.8% accuracy."'
    });
  }

  if (/\d/.test(s + ' ' + expText)) {
    score += 12;
    strengths.push('Includes measurable numbers or timeframes that add credibility.');
  } else {
    weaknesses.push({
      area: 'Quantifiable Impact',
      issue: 'No measurable figures (customers served, hours completed, sales volume, or years of experience) are highlighted.',
      solution: 'Add concrete numbers wherever possible — even from OJT, school orgs, or part-time work.',
      example: 'Example: "Completed 300-hour OJT supporting 40+ daily customer inquiries."'
    });
  }

  if (c.skills.length >= 5) {
    score += 18;
    strengths.push(`Strong skills section with ${c.skills.length} relevant skills listed (${c.skills.slice(0, 4).join(', ')}).`);
  } else {
    score += c.skills.length >= 3 ? 10 : 4;
    weaknesses.push({
      area: 'Skills Coverage',
      issue: `Only ${c.skills.length} skill(s) listed, which limits keyword and match-score visibility.`,
      solution: 'Add at least 5–7 honest, job-relevant hard and soft skills matching your target role.',
      example: 'Example: Pair technical tools (POS system, Microsoft Excel, Canva) with soft skills (Customer service, Communication).'
    });
  }

  if (c.experience.length >= 1) {
    score += 14;
    strengths.push(`Includes ${c.experience.length} work/OJT experience entry(ies) demonstrating practical readiness.`);
  } else {
    weaknesses.push({
      area: 'Work & OJT Experience',
      issue: 'No work, internship, volunteer, or project experience is listed yet.',
      solution: 'Include OJT, student organization roles, capstone projects, or family business help with clear duties.',
      example: 'Example: "Student Assistant / OJT – Local Café (300 hrs): Managed counter orders and daily stock count."'
    });
  }

  if (c.edu) {
    score += 10;
    strengths.push('Education background (level, school, and course/strand) is properly documented.');
  } else {
    weaknesses.push({
      area: 'Education Details',
      issue: 'Education level or school name is incomplete.',
      solution: 'Add your highest attainment, school name, course/strand, and expected or actual graduation year.',
      example: 'Example: "BS Information Technology – UPHSD Laguna (2026)"'
    });
  }

  if (c.phone) score += 4;
  else recommendations.push('Add an active mobile number in your profile so shortlisted employers can reach you promptly.');

  if (c.goal.trim().length >= 10) score += 5;
  else recommendations.push('Define a clear career goal statement to align your résumé headline with employer expectations.');

  if (c.uploaded || c.linked) {
    score += 5;
    strengths.push('Attached a downloadable résumé file or portfolio link for shortlisted employers.');
  }

  recommendations.push(
    'Keep layout clean and single-column with consistent fonts so employers can scan it on mobile in under 15 seconds.',
    'Tailor your top 3 skills to match the exact keywords in the job listing you apply for.',
    'Proofread spelling, capitalization, and dates carefully — error-free résumés get shortlisted significantly faster.'
  );

  score = Math.min(100, score);
  const summary = score >= 80
    ? 'Strong, employer-ready résumé! Polish the minor areas below to stand out even further.'
    : score >= 55
      ? 'Solid foundation. Addressing the specific weaknesses below will noticeably boost your shortlist rate.'
      : 'Needs stronger detail and structure before employers can evaluate your fit confidently.';

  return {
    score,
    summary,
    strengths,
    weaknesses: weaknesses.slice(0, 6),
    recommendations: recommendations.slice(0, 5),
    suggestions: weaknesses.slice(0, 6).map((w) => ({ area: w.area, tip: `${w.issue} Fix: ${w.solution}` })),
    source: 'rules',
  };
}

async function aiReview(text: string): Promise<Review | null> {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-3-5-haiku-latest',
        max_tokens: 1100,
        system: 'You review résumés for Filipino job seekers. Be detailed, specific, kind and practical. Never mention or infer age, gender, religion or appearance. Reply with JSON only: {"score":0-100,"summary":"one clear sentence","strengths":["..."],"weaknesses":[{"area":"...","issue":"...","solution":"...","example":"..."}],"recommendations":["..."]}.',
        messages: [{ role: 'user', content: text.slice(0, 6000) }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = (data.content?.[0]?.text ?? '').replace(/^```json\s*|```$/g, '').trim();
    const parsed = JSON.parse(raw);
    if (typeof parsed.score !== 'number') return null;
    const weaknesses: Weakness[] = Array.isArray(parsed.weaknesses)
      ? parsed.weaknesses.slice(0, 6).map((w: Record<string, unknown>) => ({
          area: String(w.area ?? 'Area'),
          issue: String(w.issue ?? ''),
          solution: String(w.solution ?? ''),
          example: String(w.example ?? ''),
        }))
      : [];
    return {
      score: Math.max(0, Math.min(100, Math.round(parsed.score))),
      summary: String(parsed.summary ?? ''),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String).slice(0, 6) : [],
      weaknesses,
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String).slice(0, 6) : [],
      suggestions: weaknesses.map((w) => ({ area: w.area, tip: `${w.issue} ${w.solution}`.trim() })),
      source: 'ai',
    };
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

    const body = await req.json().catch(() => ({}));
    const pasted = typeof body?.text === 'string' ? body.text.trim() : '';
    const link = typeof body?.link === 'string' ? body.link.trim() : (sp.resume_link ?? '').trim();
    const hasUpload = !!sp.resume_path;

    if (!hasUpload && !link && pasted.length < 20) {
      return json({ error: 'resume_required', message: 'Please upload a résumé file, provide a résumé link, or paste your résumé text first.' }, 400);
    }

    const skills = (sk ?? []).map((k) => k.skill as string);
    const experience = (sp.experience ?? []) as { role?: string; org?: string; years?: string }[];
    const compiled = [
      `Goal: ${sp.goal_text}`, `Summary: ${sp.resume_summary}`, `Education: ${sp.edu_level}, ${sp.course}, ${sp.school}`,
      `Skills: ${(sk ?? []).map((k) => `${k.skill} (${k.level})`).join(', ')}`,
      `Experience: ${experience.map((e) => `${e.role} at ${e.org} (${e.years} yr)`).join('; ')}`,
      link ? `Resume link provided: yes` : '',
    ].filter(Boolean).join('\n');

    const review = (await aiReview(pasted || compiled)) ??
      ruleReview({ summary: pasted || sp.resume_summary, skills, experience, edu: !!(sp.edu_level && sp.school), phone: !!prof?.phone, goal: sp.goal_text, uploaded: hasUpload, linked: !!link });

    await admin.from('resume_reviews').insert({
      user_id: user.id,
      score: review.score,
      summary: review.summary,
      suggestions: review.suggestions,
      strengths: review.strengths,
      weaknesses: review.weaknesses,
      recommendations: review.recommendations,
      source: review.source,
    });
    return json(review);
  } catch (e) {
    return json({ error: 'server_error', message: (e as Error).message }, 500);
  }
});
