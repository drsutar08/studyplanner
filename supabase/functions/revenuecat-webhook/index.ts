// Study Planner: RevenueCat tells this function about every Premium purchase, renewal, cancellation and expiry
// (Google Play and the App Store), and it keeps public.subscriptions in step. The server's plan (my_plan, the
// limits, the ads) follows from that table, so the app can't make itself Premium.
// RevenueCat sends the secret set in its dashboard (Integrations → Webhooks → Authorization header); it must equal
// the REVENUECAT_WEBHOOK_SECRET secret here. Verify JWT is OFF for this function (RevenueCat has no Supabase sign-in):
// the secret is the check instead. Setup: docs/subscriptions.md.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ENTITLEMENT = 'premium';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// events after which Premium runs until the event's expiration (a cancellation still runs to the end of the period;
// a billing issue's expiration includes the store's grace period)
const ACTIVE = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED', 'TEMPORARY_ENTITLEMENT_GRANT', 'CANCELLATION', 'BILLING_ISSUE', 'SUBSCRIPTION_PAUSED']);
// TEST_STORE is RevenueCat's Test Store (the Development app's key): it stands in for Google Play
const STORE: Record<string, string> = { PLAY_STORE: 'play', TEST_STORE: 'play', APP_STORE: 'app_store', MAC_APP_STORE: 'app_store' };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// a timing-safe comparison of the secret
const same = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') || '';
  const sent = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!secret || !same(sent, secret)) return json(401, { error: 'unauthorized' });

  let event: Record<string, unknown>;
  try {
    event = ((await req.json()) as { event: Record<string, unknown> }).event;
  } catch {
    return json(400, { error: 'bad_request' });
  }
  if (!event || event.type === 'TEST') return json(200, { ok: true, ignored: 'test' });

  // the Study Planner account: the app logs in to RevenueCat with the account id (a uuid); anonymous ids are skipped
  const ids = [event.app_user_id, event.original_app_user_id, ...((event.aliases as string[]) || [])].filter((x): x is string => typeof x === 'string');
  const userId = ids.find((x) => UUID.test(x));
  if (!userId) return json(200, { ok: true, ignored: 'no account id' });
  const entitlements = (event.entitlement_ids as string[] | null) || null;
  if (entitlements && !entitlements.includes(ENTITLEMENT)) return json(200, { ok: true, ignored: 'other entitlement' });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: current } = await sb.from('subscriptions').select('source, expires_at').eq('user_id', userId).maybeSingle();
  const source = STORE[String(event.store)] || 'web';
  const product = String(event.product_id || '').slice(0, 100);
  const expiresMs = typeof event.expiration_at_ms === 'number' ? event.expiration_at_ms : null;
  const expires = expiresMs === null ? null : new Date(expiresMs).toISOString();
  const type = String(event.type);

  if (ACTIVE.has(type)) {
    // a gift that runs longer than the purchase keeps its end date
    const later = current && current.expires_at && expires && current.expires_at > expires ? current.expires_at : expires;
    const { error } = await sb.from('subscriptions').upsert({ user_id: userId, source, product, expires_at: later, updated_at: new Date().toISOString() });
    if (error) return json(500, { error: 'write failed' });
    return json(200, { ok: true, premium_until: later });
  }

  if (type === 'EXPIRATION') {
    // a store subscription ended; a gift still running is left alone
    if (current && current.source !== 'gift' && current.source !== 'manual') {
      const { error } = await sb.from('subscriptions').update({ expires_at: expires || new Date().toISOString(), updated_at: new Date().toISOString() }).eq('user_id', userId);
      if (error) return json(500, { error: 'write failed' });
    }
    return json(200, { ok: true, ended: true });
  }

  return json(200, { ok: true, ignored: type });
});
