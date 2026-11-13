// Study Planner: the AI study helper. The app sends { action, lang, ... } with the signed-in user's token; this asks
// Claude and returns JSON the app can use directly. The Anthropic API key stays here (the ANTHROPIC_API_KEY secret);
// only Premium accounts can use it, 30 requests a day (public.use_ai_quota, the 20261115 migration).
//   topics  { exam, subject, text? }   -> { topics: string[] }            topics to revise for an exam
//   cards   { subject, text }          -> { cards: [{ front, back }] }    flashcards from notes
//   quiz    { subject, text }          -> { questions: [...] }            a practice quiz from notes
//   advice  { today, summary }         -> { headline, steps: [...] }      what to study now
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = 'claude-opus-5-5';
const MAX_TEXT = 20000; // characters of notes; longer is refused, not cut
const LANGS: Record<string, string> = { en: 'English', hi: 'Hindi', or: 'Odia', es: 'Spanish' };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const str = { type: 'string' };
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const SCHEMAS: Record<string, unknown> = {
  topics: obj({ topics: { type: 'array', items: str } }),
  cards: obj({ cards: { type: 'array', items: obj({ front: str, back: str }) } }),
  quiz: obj({ questions: { type: 'array', items: obj({ question: str, options: { type: 'array', items: str }, answer: { type: 'integer' }, explanation: str }) } }),
  advice: obj({ headline: str, steps: { type: 'array', items: obj({ title: str, why: str, minutes: { type: 'integer' } }) } }),
};

function prompt(action: string, b: Record<string, string>, language: string): { system: string; user: string } {
  const lang = `Write everything for the student in ${language}. Write dates the way people say them (for example "Sunday 8 November" or "on Sunday"), never as 2026-11-08 or 11-08.`;
  if (action === 'topics')
    return {
      system: `You help a student plan revision for an exam. List the topics to revise, in a sensible order to study them: 3 to 8 short topic names (a few words each, no numbering). Use the syllabus or notes when given; otherwise the usual topics for that exam and subject. ${lang}`,
      user: `Exam: ${b.exam}\nSubject: ${b.subject || 'not given'}\n${b.text ? `Syllabus or notes:\n${b.text}` : 'No syllabus given.'}`,
    };
  if (action === 'cards')
    return {
      system: `You make flashcards from a student's notes. Make 5 to 15 cards that test the most important facts, definitions and ideas in the notes, and nothing that isn't in them. Each card: a short question on the front, a short, complete answer on the back. ${lang}`,
      user: `Subject: ${b.subject || 'not given'}\nNotes:\n${b.text}`,
    };
  if (action === 'quiz')
    return {
      system: `You write a practice quiz from a student's notes: 5 multiple-choice questions, each with 4 options, exactly one correct. "answer" is the index (0 to 3) of the correct option. "explanation" says in one or two sentences why it is right. Only ask about what the notes cover. ${lang}`,
      user: `Subject: ${b.subject || 'not given'}\nNotes:\n${b.text}`,
    };
  return {
    system: `You are a calm, practical study coach. From the student's current situation, say what to study now: a one-sentence headline, then 2 to 4 steps for the next study session, most urgent first, each with a short title, why it matters now, and how many minutes to spend (15 to 90). Be specific to their tasks, exams and subjects; don't invent ones that aren't listed. ${lang}`,
    user: `Today is ${b.today}.\n${b.summary}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return reply(503, { error: 'not_configured' });

  // the signed-in user, and today's allowance
  const auth = req.headers.get('Authorization') || '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: who } = await sb.auth.getUser();
  if (!who || !who.user) return reply(401, { error: 'signed_out' });
  const userId = who.user.id;

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'bad_request' });
  }
  const action = body.action;
  if (!SCHEMAS[action]) return reply(400, { error: 'bad_request' });
  const text = String(body.text || body.summary || '');
  if ((action === 'cards' || action === 'quiz') && !text.trim()) return reply(400, { error: 'no_text' });
  if (text.length > MAX_TEXT) return reply(413, { error: 'too_long', max: MAX_TEXT });
  if (action === 'topics' && !String(body.exam || '').trim()) return reply(400, { error: 'bad_request' });

  const { data: allowed, error: quotaError } = await sb.rpc('use_ai_quota');
  // the AI helper is Premium only: use_ai_quota() raises 'premium_required' for any other account (20261115 migration)
  if (quotaError) return String(quotaError.message).includes('premium_required') ? reply(402, { error: 'premium_required' }) : reply(500, { error: 'server' });
  if (!allowed) return reply(429, { error: 'limit' });

  // a request that fails on Claude's side doesn't count (refund_ai_quota, the 20261110 migration; service role only)
  const refund = async () => {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceKey) return;
    try {
      await createClient(Deno.env.get('SUPABASE_URL')!, serviceKey).rpc('refund_ai_quota', { who: userId });
    } catch {
      // not counted back: no harm beyond one request
    }
  };

  const { system, user } = prompt(action, body, LANGS[body.lang] || 'English');
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMAS[action] } },
      system,
      messages: [{ role: 'user', content: user }],
    } as never);
    if (response.stop_reason === 'refusal') return reply(422, { error: 'refused' });
    const block = response.content.find((b: { type: string }) => b.type === 'text') as { text: string } | undefined;
    if (!block) {
      await refund();
      return reply(502, { error: 'empty' });
    }
    return reply(200, JSON.parse(block.text));
  } catch (e) {
    await refund();
    if (e instanceof Anthropic.RateLimitError) return reply(503, { error: 'busy' });
    if (e instanceof Anthropic.APIError) {
      // Claude's status and error type (never the key) so a bad key or an empty balance shows up in the app's network log
      const type = (e.error as { error?: { type?: string } } | undefined)?.error?.type || 'unknown';
      console.error('study-helper', e.status, type, e.message);
      return reply(502, { error: 'server', upstream: e.status, type, message: String(e.message).slice(0, 300) });
    }
    console.error('study-helper', e);
    return reply(500, { error: 'server' });
  }
});
