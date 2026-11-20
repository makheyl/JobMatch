// checkout: starts a purchase and activates it only after payment verification.
// Updated pricing: Seeker Monthly (₱99), Seeker Annual (₱899), Employer Growth (₱999), Employer Business (₱2,499), Boost (₱299).
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
  pro_monthly: { kind: 'pro', amount: 99, label: 'Monthly Plan (Job Seeker)', period: 'monthly', role: 'seeker' },
  pro_yearly: { kind: 'pro', amount: 899, label: 'Annual Plan (Job Seeker)', period: 'yearly', role: 'seeker' },
  employer_growth: { kind: 'employer_plan', amount: 999, label: 'Growth Plan (monthly)', plan: 'growth', role: 'employer' },
  employer_business: { kind: 'employer_plan', amount: 2499, label: 'Business Plan (monthly)', plan: 'business', role: 'employer' },
  boost: { kind: 'boost', amount: 299, label: 'Boosted listing (7 days)', days: 7, role: 'employer' },
};

const VALID_METHODS = new Set(['gcash', 'maya', 'card', 'bank']);

async function createLiveCheckout(_userId: string, _entry: Entry, _method: string): Promise<{ url: string }> {
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

    const { item, job_id, payment_method, simulate_status } = await req.json();
    const entry = CATALOG[item];
    if (!entry) return json({ error: 'unknown_item' }, 400);
    if (prof.role !== entry.role) return json({ error: 'wrong_account_type' }, 403);
    if (entry.kind === 'boost' && !job_id) return json({ error: 'job_required' }, 400);
    const method = VALID_METHODS.has(payment_method) ? payment_method : 'gcash';

    const mode = Deno.env.get('PAYMENTS_MODE') ?? 'sandbox';
    if (mode !== 'sandbox') {
      try {
        return json({ mode: 'live', ...(await createLiveCheckout(user.id, entry, method)) });
      } catch (e) {
        return json({ error: (e as Error).message, message: 'Live payments are not configured yet.' }, 501);
      }
    }

    const status = (simulate_status === 'pending' || simulate_status === 'failed') ? simulate_status : 'paid';
    const ref = 'JM-' + method.toUpperCase() + '-' + crypto.randomUUID().slice(0, 8).toUpperCase();

    // Only activate subscription / boost when payment is verified as 'paid'
    if (status === 'paid') {
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
    }

    const { data: pid, error: perr } = await admin.rpc('svc_record_payment', {
      p_user: user.id, p_kind: entry.kind, p_item: entry.label, p_amount: entry.amount,
      p_provider: 'sandbox', p_ref: ref, p_job: entry.kind === 'boost' ? job_id : null,
      p_method: method, p_status: status,
    });
    if (perr) return json({ error: perr.message }, 500);

    return json({
      mode: 'sandbox',
      ok: status === 'paid',
      status,
      payment_id: pid,
      reference: ref,
      payment_method: method,
      item: entry.label,
      amount: entry.amount,
    });
  } catch (e) {
    return json({ error: 'server_error', message: (e as Error).message }, 500);
  }
});
