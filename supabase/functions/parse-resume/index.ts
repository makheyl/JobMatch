// parse-resume: extracts professional fields from uploaded resume text while strictly excluding personal info
// (Full Name, Contact Number, Date of Birth, Email Address are NEVER returned or modified).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

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
    const { data: knownSkills } = await admin.from('skills').select('name').eq('active', true);
    const skillNames = (knownSkills ?? []).map((s) => s.name as string);

    const body = await req.json().catch(() => ({}));
    const rawText = typeof body?.text === 'string' ? body.text.trim() : '';

    // Deterministic extraction of known skills, education keywords, and summary
    const lower = rawText.toLowerCase();
    const matchedSkills = skillNames.filter((sk) => lower.includes(sk.toLowerCase()));
    const eduMatch = /college graduate|bachelor|bs\s|ba\s|senior high|tesda|vocational|undergraduate|master/i.exec(rawText);
    let edu_level = '';
    if (eduMatch) {
      const m = eduMatch[0].toLowerCase();
      if (m.includes('master')) edu_level = 'Post-graduate';
      else if (m.includes('undergraduate')) edu_level = 'College undergraduate';
      else if (m.includes('tesda') || m.includes('vocational')) edu_level = 'Vocational / TESDA';
      else if (m.includes('senior high')) edu_level = 'Senior high school';
      else edu_level = 'College graduate';
    }

    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (key && rawText.length >= 30) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-3-5-haiku-latest',
            max_tokens: 700,
            system: `Extract ONLY professional details from this resume. NEVER return name, phone, email, or birth date. Match skills strictly from this list: ${skillNames.join(', ')}. Reply JSON only: {"edu_level":"","school":"","course":"","grad_year":null,"skills":[],"experience":[{"role":"","org":"","years":""}],"resume_summary":"","goal_text":""}.`,
            messages: [{ role: 'user', content: rawText.slice(0, 6000) }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const raw = (data.content?.[0]?.text ?? '').replace(/^```json\s*|```$/g, '').trim();
          const parsed = JSON.parse(raw);
          return json({
            edu_level: parsed.edu_level || edu_level,
            school: String(parsed.school || ''),
            course: String(parsed.course || ''),
            grad_year: parsed.grad_year ? Number(parsed.grad_year) : null,
            skills: Array.isArray(parsed.skills) ? parsed.skills.filter((s: string) => skillNames.includes(s)) : matchedSkills,
            experience: Array.isArray(parsed.experience) ? parsed.experience.slice(0, 5) : [],
            resume_summary: String(parsed.resume_summary || '').slice(0, 600),
            goal_text: String(parsed.goal_text || '').slice(0, 140),
            source: 'ai',
          });
        }
      } catch (_e) { /* fallback */ }
    }

    return json({
      edu_level,
      school: '',
      course: '',
      grad_year: null,
      skills: matchedSkills,
      experience: [],
      resume_summary: rawText ? rawText.replace(/\s+/g, ' ').slice(0, 300) : '',
      goal_text: '',
      source: 'rules',
    });
  } catch (e) {
    return json({ error: 'server_error', message: (e as Error).message }, 500);
  }
});
