// candidate-overview (Employer Business plan): generates an AI-powered suitability overview for a candidate.
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
    const { data: emp } = await admin.from('employers').select('plan').eq('user_id', user.id).single();
    if (!emp || emp.plan !== 'business') return json({ error: 'plan_required' }, 403);

    const { seeker_id, job_id } = await req.json();
    if (!seeker_id) return json({ error: 'seeker_required' }, 400);

    const { data: sp } = await admin.from('seeker_profiles').select('*').eq('user_id', seeker_id).single();
    if (!sp || !sp.open_to_employers) return json({ error: 'not_found' }, 404);
    const { data: sk } = await admin.from('seeker_skills').select('skill,level').eq('user_id', seeker_id);
    const { data: job } = job_id ? await admin.from('jobs').select('title,skills,category,type,description').eq('id', job_id).single() : { data: null };

    const skills = (sk ?? []).map((k) => `${k.skill} (${k.level}%)`);
    const exp = (sp.experience ?? []) as { role?: string; org?: string; years?: string }[];
    const jobSkills = (job?.skills ?? []) as string[];
    const matchedSkills = (sk ?? []).filter((k) => jobSkills.includes(k.skill)).map((k) => k.skill);
    const missingSkills = jobSkills.filter((s) => !(sk ?? []).some((k) => k.skill === s));

    const promptText = [
      job ? `Target Role: ${job.title} (${job.type}, ${job.category}). Required skills: ${jobSkills.join(', ')}` : 'General candidate evaluation',
      `Education: ${sp.edu_level || 'Not specified'}, ${sp.course || ''} at ${sp.school || ''}`,
      `Skills: ${skills.join(', ') || 'None listed'}`,
      `Experience: ${exp.map((e) => `${e.role} at ${e.org} (${e.years} yr)`).join('; ') || 'Entry-level / no prior formal experience listed'}`,
      `Summary: ${sp.resume_summary || 'No summary provided'}`,
      `Career Goal: ${sp.goal_text || 'Not specified'}`,
    ].join('\n');

    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (key) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-3-5-haiku-latest',
            max_tokens: 450,
            system: 'Summarize this job candidate for a Filipino MSME employer in a fair, objective way (never mention age, gender, or appearance). Reply with JSON: {"overview":"2-3 sentences","highlights":["..."],"gaps":["..."],"suitability":"High|Moderate|Developing"}.',
            messages: [{ role: 'user', content: promptText }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const raw = (data.content?.[0]?.text ?? '').replace(/^```json\s*|```$/g, '').trim();
          const parsed = JSON.parse(raw);
          return json({ ...parsed, source: 'ai' });
        }
      } catch (_e) { /* fall back to structured overview */ }
    }

    const fitRatio = jobSkills.length ? matchedSkills.length / jobSkills.length : 0.7;
    const suitability = fitRatio >= 0.7 ? 'High' : fitRatio >= 0.4 ? 'Moderate' : 'Developing';
    const eduLine = [sp.edu_level, sp.course, sp.school].filter(Boolean).join(' · ') || 'Education details pending';
    const expLine = exp.length ? `${exp.length} experience entry(ies), including ${exp[0].role || 'role'} at ${exp[0].org || 'organization'}` : 'Entry-level candidate ready for onboarding/training';
    const overview = `${eduLine}. ${expLine}. ${job ? `Matches ${matchedSkills.length} of ${jobSkills.length} key skills for ${job.title}.` : `Brings ${(sk ?? []).length} verified profile skills.`}`;

    return json({
      overview,
      highlights: [
        matchedSkills.length ? `Matching skills: ${matchedSkills.join(', ')}` : `Top skills: ${(sk ?? []).slice(0, 4).map((k) => k.skill).join(', ') || 'General readiness'}`,
        `Education: ${eduLine}`,
        sp.resume_summary ? `Profile note: ${sp.resume_summary.slice(0, 140)}` : 'Opted in and actively open to employer invitations.',
      ],
      gaps: missingSkills.length ? [`May need light onboarding on: ${missingSkills.join(', ')}`] : ['Meets core skill requirements for this role.'],
      suitability,
      source: 'rules',
    });
  } catch (e) {
    return json({ error: 'server_error', message: (e as Error).message }, 500);
  }
});
