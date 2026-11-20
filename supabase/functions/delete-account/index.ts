// delete-account: permanently deletes a user, their database rows (via cascades) and their stored files.
// A user can delete themselves. An admin can delete another user by passing { user_id }.
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
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'not_authenticated' }, 401);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const body = await req.json().catch(() => ({}));
    const target: string = body?.user_id ?? user.id;
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (target !== user.id) {
      if (me?.role !== 'admin') return json({ error: 'forbidden' }, 403);
      const { data: t } = await admin.from('profiles').select('role').eq('id', target).single();
      if (t?.role === 'admin') return json({ error: 'cannot_delete_admin' }, 400);
    } else if (me?.role === 'admin') {
      return json({ error: 'admins_cannot_self_delete' }, 400);
    }

    for (const bucket of ['resumes', 'verification-docs']) {
      const { data: files } = await admin.storage.from(bucket).list(target, { limit: 1000 });
      if (files && files.length) await admin.storage.from(bucket).remove(files.map((f) => `${target}/${f.name}`));
    }
    if (target !== user.id) await admin.from('audit_log').insert({ actor: user.id, action: 'user.delete', target });
    const { error } = await admin.auth.admin.deleteUser(target);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ error: 'server_error', message: (e as Error).message }, 500);
  }
});
