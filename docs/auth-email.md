# Supabase sign-in emails through Gmail

"Forgot password" emails come from Supabase Auth. Out of the box, Supabase sends them from its own test mail
server, which is limited to a few emails an hour and only to your project's team. Pointing Auth at the same Gmail
used for the [welcome email](welcome-email.md) lets it email anyone. Confirm email is off, so the reset email is the
one that matters today.

You do this in the dashboard. Keep the App Password there: it doesn't go in the app or this repository.

## 1. SMTP

Supabase Dashboard → **Authentication** → **Emails** → **SMTP Settings** → turn on **Enable custom SMTP**:

| Field | Value |
| --- | --- |
| Sender email | your Gmail address (e.g. `drsutar08@gmail.com`). Gmail only sends as the signed-in account |
| Sender name | `Study Planner` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | the same Gmail address |
| Password | the 16-letter Gmail App Password (the one in the `GMAIL_APP_PASSWORD` secret) |
| Minimum interval per user | leave the default (60 seconds) |

Save.

## 2. Rate limit

**Authentication** → **Rate Limits** → **Rate limit for sending emails**. With custom SMTP this starts at 30 an
hour; raise it to what you expect (e.g. 100). Gmail itself allows about 500 emails a day from a normal account;
past that, use a mail service (Resend, Brevo, SES).

## 3. Where reset links may go

**Authentication** → **URL Configuration**:

- **Site URL**: where the app is: `http://localhost:8081` for now, the hosted address later.
- **Redirect URLs**: add each place a reset link may open:
  - `http://localhost:8081/**`
  - `studyplanner://reset` (the phone app)
  - later, the hosted address with `/**`

A link to an address not on the list opens the Site URL instead.

## 4. The reset email's wording (optional)

**Authentication** → **Emails** → **Templates** → **Reset Password**:

- Subject: `Reset your Study Planner password`
- Body (Source): the HTML below. `{{ .ConfirmationURL }}` is Supabase's link.

```html
<body style="margin:0;padding:0;background:#EEF0F8">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF0F8;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:20px;overflow:hidden">
      <tr><td style="background:#2A3A9E;background-image:linear-gradient(135deg,#151B33,#2A3A9E 55%,#7A5CFA);padding:28px">
        <div style="font:800 22px/1.2 Arial,sans-serif;color:#FFFFFF">Study Planner</div>
        <div style="font:400 14px/1.4 Arial,sans-serif;color:#DCE0FF;margin-top:4px">Plan · Focus · Grow</div>
      </td></tr>
      <tr><td style="padding:28px;font:400 15px/1.55 Arial,sans-serif;color:#151B33">
        <div style="font:800 20px/1.3 Arial,sans-serif;margin-bottom:10px">Reset your password</div>
        <p style="margin:0 0 18px 0">Someone (hopefully you) asked to reset the password for {{ .Email }}. Tap the button to choose a new one. The link works once and expires in an hour.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0"><tr><td style="border-radius:12px;background:#3B4CCA">
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 22px;font:800 15px Arial,sans-serif;color:#FFFFFF;text-decoration:none">Choose a new password</a>
        </td></tr></table>
        <p style="margin:0;color:#5C6482;font-size:13px">Didn't ask for this? Ignore this email: your password stays the same.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
```

## 5. Check it

In the app, on the sign-in screen, choose **Forgot password?** and enter your own address. The email should arrive
from "Study Planner" within a minute. If it doesn't, **Logs** → **Auth** shows the SMTP error. "Username and
Password not accepted" means the App Password was mistyped, or 2-Step Verification is off.
