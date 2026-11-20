// checkout: starts a purchase and activates it. Runs with the service role so browsers can never grant themselves a plan.
// PAYMENTS_MODE=sandbox (default): the payment is recorded as paid immediately, no real money moves.
// PAYMENTS_MODE=live: wire a provider (for example PayMongo for GCash, Maya and cards) in createLiveCheckout() below, then
// finish activation from the provider's webhook. Until that is done, live mode refuses to take payments.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Entry = { kind: 'pro' | 'employer_plan' | 'boost'; amount: number; label: string; period?: string; plan?: string; days?: number; role: 'seeker' | 'employer' };
const CATALOG: Record<string, Entry> = {
  pro_monthly: { kind: 'pro', amount: 99, label: 'JobMatch Pro (monthly)', period: 'monthly', role: 'seeker' },
  pro_yearly: { kind: 'pro', amount: 899, label: 'JobMatch Pro (yearly)', period: 'yearly', role: 'seeker' },
  employer_growth: { kind: 'employer_plan', amount: 1499, label: 'Growth plan (monthly)', plan: 'growth', role: 'employer' },
  employer_business: { kind: 'employer_plan', amount: 3999, label: 'Business plan (monthly)', plan: 'business', role: 'employer' },
  boost: { kind: 'boost', amount: 299, label: 'Boosted listing (7 days)', days: 7, role: 'employer' },
};

// Replace with a real provider call. Return a hosted checkout URL and store the pending payment.
async function createLiveCheckout(_userId: string, _entry: Entry): Promise<{ url: string }> {
  throw new Error('live_payments_not_configured');
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
    const { data: prof } = await admin.from('profiles').select('role,suspended').eq('id', user.id).single();
    if (!prof || prof.suspended) return json({ error: 'forbidden' }, 403);

    const { item, job_id } = await req.json();
    const entry = CATALOG[item];
    if (!entry) return json({ error: 'unknown_item' }, 400);
    if (prof.role !== entry.role) return json({ error: 'wrong_account_type' }, 403);
    if (entry.kind === 'boost' && !job_id) return json({ error: 'job_required' }, 400);

    const mode = Deno.env.get('PAYMENTS_MODE') ?? 'sandbox';
    if (mode !== 'sandbox') {
      try {
        return json({ mode: 'live', ...(await createLiveCheckout(user.id, entry)) });
      } catch (e) {
        return json({ error: (e as Error).message, message: 'Live payments are not configured yet.' }, 501);
      }
    }

    // sandbox: activate first so a failure (for example boosting an unpublished job) records nothing
    if (entry.kind === 'pro') {
      const { error } = await admin.rpc('svc_activate_pro', { p_user: user.id, p_period: entry.period });
      if (error) return json({ error: error.message }, 400);
    } else if (entry.kind === 'employer_plan') {
      const { error } = await admin.rpc('svc_activate_employer_plan', { p_user: user.id, p_plan: entry.plan });
      if (error) return json({ error: error.message }, 400);
    } else {
      const { error } = await admin.rpc('svc_boost_job', { p_user: user.id, p_job: job_id, p_days: entry.days });
      if (error) return json({ error: error.message }, 400);
    }
    const ref = 'SBX-' + crypto.randomUUID().slice(0, 8).toUpperCase();
    const { data: pid, error: perr } = await admin.rpc('svc_record_payment', {
      p_user: user.id, p_kind: entry.kind, p_item: entry.label, p_amount: entry.amount, p_provider: 'sandbox', p_ref: ref, p_job: entry.kind === 'boost' ? job_id : null,
    });
    if (perr) return json({ error: perr.message }, 500);
    return json({ mode: 'sandbox', ok: true, payment_id: pid, reference: ref, item: entry.label, amount: entry.amount });
  } catch (e) {
    return json({ error: 'server_error', message: (e as Error).message }, 500);
  }
});
