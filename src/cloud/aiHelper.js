import { supabase } from './supabase';
import { getLanguage } from '../i18n';

// The AI study helper (supabase/functions/study-helper): ask(action, fields) resolves to its JSON, or throws an Error
// whose `kind` names the message to show: 'premium' (the helper is Premium only), 'limit' (today's allowance is used), 'too_long', 'not_configured',
// 'refused', 'offline' or 'server'.
export const AI_MAX_TEXT = 20000;

export async function askHelper(action, fields) {
  const fail = (kind) => Object.assign(new Error(kind), { kind });
  let res;
  try {
    res = await supabase.functions.invoke('study-helper', { body: { action, lang: getLanguage(), ...fields } });
  } catch {
    throw fail('offline');
  }
  const { data, error } = res;
  if (!error) return data;
  // an answer from the function itself says what went wrong; no answer means the network
  const response = error.context;
  if (!response || typeof response.status !== 'number') throw fail('offline');
  let code = null;
  try {
    code = (await response.json()).error;
  } catch {
    /* not JSON */
  }
  if (response.status === 404 || code === 'not_configured') throw fail('not_configured');
  if (response.status === 402 || code === 'premium_required') throw fail('premium');
  if (code === 'limit' || code === 'too_long' || code === 'refused') throw fail(code);
  throw fail('server');
}
