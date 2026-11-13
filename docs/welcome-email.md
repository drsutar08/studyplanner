# Welcome email (Gmail)

Every new account gets one welcome email, sent from your Gmail through the `welcome-email` Edge Function, in the
language the person signed up in (English, Hindi, Odia or Spanish). The wording is at the top of
[`supabase/functions/welcome-email/index.ts`](../supabase/functions/welcome-email/index.ts) (`COPY`).

How it works: when an account is ready (at sign-up while *Confirm email* is off, or when the address is confirmed),
a database trigger calls the function with the user's id. The function looks the user up, sends the email once
(it marks the account `welcomed`), and skips test addresses (`@example.com`). A failed email never blocks a
sign-up.

## Setup (one time)

1. **A Gmail App Password.** Gmail needs one for apps (your normal password won't work):
   1. Turn on 2-Step Verification at <https://myaccount.google.com/security>.
   2. Open <https://myaccount.google.com/apppasswords>, name it "Study Planner", and copy the 16-letter password.

2. **Deploy the function.** Supabase Dashboard → *Edge Functions* → *Deploy a new function* → *Via Editor*:
   - Name it `welcome-email` (exactly).
   - Replace the code with the whole of `supabase/functions/welcome-email/index.ts`, then *Deploy*.
   - In the function's *Details* / *Settings*, turn **off** *Verify JWT* (*Enforce JWT verification*). The database calls it without
     a signed-in user. That's safe: the function only ever emails a real, confirmed, not-yet-welcomed account.

   Or with the CLI (needs a personal access token): `npx supabase functions deploy welcome-email --project-ref xlqnkglftspdowyucioc --no-verify-jwt`.

3. **Secrets.** *Edge Functions* → *Secrets* → add:

   | Name | Value |
   |---|---|
   | `GMAIL_USER` | the Gmail address that sends, e.g. `drsutar08@gmail.com` |
   | `GMAIL_APP_PASSWORD` | the 16-letter App Password from step 1 |
   | `APP_URL` | where the app is, for the email's button, e.g. `http://localhost:8081` for now |

4. **The trigger.** *SQL Editor* → paste [`supabase/migrations/20261102000000_welcome_email.sql`](../supabase/migrations/20261102000000_welcome_email.sql) → *Run*.

5. **(Recommended) Supabase's own emails through Gmail too**, so "Forgot password" reaches everyone: see [auth-email.md](auth-email.md).

## Trying it

Sign up in the app with a "plus" address of your own Gmail, e.g. `drsutar08+test1@gmail.com`: it arrives in your
inbox, and each `+something` is a new account. Edge Functions → `welcome-email` → *Logs* shows each call.

## Limits

A personal Gmail account sends at most about 500 emails a day. For more, use a Google Workspace account or an email
service (only the `nodemailer` transport in the function changes).
