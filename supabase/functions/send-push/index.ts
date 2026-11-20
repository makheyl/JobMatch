// send-push (admin only): sends a browser push for an announcement to subscribed users.
// Needs these secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (for example mailto:you@example.com).
// Without them it reports { configured: false } and in-app notifications still reach everyone.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

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
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'not_authenticated' }, 401);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (me?.role !== 'admin') return json({ error: 'forbidden' }, 403);

    const pub = Deno.env.get('VAPID_PUBLIC_KEY');
    const priv = Deno.env.get('VAPID_PRIVATE_KEY');
    if (!pub || !priv) return json({ configured: false, sent: 0 });
    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com', pub, priv);

    const { announcement_id } = await req.json();
    const { data: a } = await admin.from('announcements').select('*').eq('id', announcement_id).single();
    if (!a) return json({ error: 'not_found' }, 404);
    const { data: subs } = await admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth');
    const { data: roles } = await admin.from('profiles').select('id,role,suspended');
    const allowed = new Set((roles ?? []).filter((r) => !r.suspended && (a.audience === 'all' || (a.audience === 'seekers' && r.role === 'seeker') || (a.audience === 'employers' && r.role === 'employer'))).map((r) => r.id));
    const payload = JSON.stringify({ title: a.title, body: a.body, url: '/' });
    let sent = 0;
    for (const s of (subs ?? []).filter((x) => allowed.has(x.user_id))) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id);
      }
    }
    return json({ configured: true, sent });
  } catch (e) {
    return json({ error: 'server_error', message: (e as Error).message }, 500);
  }
});
