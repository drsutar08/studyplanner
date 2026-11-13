# AI study helper

The helper uses Claude (Anthropic's AI) for three things:
- **What should I study now?** A short plan for the next session, from what's due, the exams, weak subjects and
  recent focus time.
- **Flashcards from notes.** Paste notes, then keep the cards you want.
- **A practice quiz.** Five multiple-choice questions on pasted notes, with explanations.

It can also suggest the topics in an exam prep plan.

The app never holds the Anthropic API key. It calls the `study-helper` Edge Function with the signed-in user's
token, and the function calls Claude.

## Setup (one time)

1. **The database part.** In the SQL Editor, paste and run
   [`supabase/migrations/20261107000000_ai_helper.sql`](../supabase/migrations/20261107000000_ai_helper.sql). It
   holds the daily allowance: 30 requests per account per day.
2. **An Anthropic API key.** Create one at <https://console.anthropic.com/settings/keys>, and set a spending limit
   on that page if you like.
3. **The secret.** Supabase Dashboard → *Edge Functions* → *Secrets* → add `ANTHROPIC_API_KEY` with the key. Keep
   it there only: never in the app, `.env.local` or this repository.
4. **Deploy the function.** *Edge Functions* → *Deploy a new function* → *Via Editor*:
   - Name it `study-helper` (exactly).
   - Paste the whole of [`supabase/functions/study-helper/index.ts`](../supabase/functions/study-helper/index.ts),
     then *Deploy*.
   - Leave **Verify JWT on**, so only signed-in users can call it.

   Or with the CLI: `npx supabase functions deploy study-helper --project-ref xlqnkglftspdowyucioc`.

## How it behaves

- **Model:** `claude-opus-5-5` at low effort. The answers come back as JSON in a fixed shape, so the app can use
  them directly. If Claude declines a request, a fallback model tries it (the server-side fallback is on); if that
  also declines, the student sees "The helper couldn't help with that".
- **Limits:**
  - 30 requests per account per day, after which the student sees a message saying so.
  - Notes up to 20,000 characters. Longer notes are refused with a message, not cut short.

  Change these with `daily_limit` in `use_ai_quota()` and `MAX_TEXT` in the function.
- **What's sent:** only what the student pastes, or, for "What to study", titles, dates and numbers. Notes and task
  details are never sent. The sheet says this in every language.
- **Usage:** each account's daily count is in **Table Editor → `ai_usage`**. Errors appear in the function's
  *Logs*. A request that fails on Claude's side doesn't count (the `20261110` migration gives it back).
- **When it fails,** the function's reply (and its *Logs*) says why, from Claude:
  - `401 authentication_error`: the `ANTHROPIC_API_KEY` secret isn't a valid key.
  - `400 … credit balance is too low`: the Anthropic account needs credit (*Plans & Billing*).
