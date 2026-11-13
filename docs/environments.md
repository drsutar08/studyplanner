# Development and Production

Two builds of the app, each with its own Supabase project, installable side by side on one phone.

| | Development | Production |
|---|---|---|
| App on the phone | **StudyPlanner Dev** (icon with an orange DEV band) | **StudyPlanner** |
| App id | `com.studyly.studyplanner.app.dev` | `com.studyly.studyplanner.app` |
| Link scheme | `studyplanner-dev://` | `studyplanner://` |
| Supabase project | its own project, with test data only | `xlqnkglftspdowyucioc` (real students) |
| EAS profile and environment | `development` | `production` |
| Build file | APK, installed directly | AAB, for the Play Store |
| Ads | Google's test ads (test AdMob app id) | the real AdMob units |
| Over-the-air updates | `development` channel | `production` channel |

How it's done: `app.config.js` changes the name, ids, scheme, icon and AdMob app id when `APP_VARIANT=development`
(set by the `development` profile in `eas.json`). Each build reads its Supabase address and publishable key from the
EAS environment of the same name. `.env.local` is only for the web dev server on this computer.

## Setting up the Development project (once)

1. **Create the project:** supabase.com → New project (free), e.g. "study-planner-dev", in the same region as
   Production.
2. **Send the two public values:** Project Settings → API: the **Project URL** and the **publishable key**
   (`sb_publishable_…`). Never the secret key or the database password.
3. **The database:** `node scripts/dev-setup-sql.mjs <project-ref>` writes `supabase/dev-setup.sql` (all migrations,
   with this project's address). Paste it into the Development project's SQL Editor and run it.
4. **Auth settings** (Authentication → URL Configuration):
   - add `studyplanner-dev://reset` to the Redirect URLs (the password reset link opens the Development app);
   - email: Supabase's built-in sender is fine for testing (a few emails an hour). For the Gmail sender, as in
     Production, see `docs/auth-email.md`.
5. **The Edge Functions,** if you want the AI helper and the welcome email in Development:
   - deploy `study-helper` and `welcome-email` the same way as Production (`docs/ai-helper.md`, `docs/welcome-email.md`);
   - set their secrets in this project: `ANTHROPIC_API_KEY`, and the Gmail ones. A second Anthropic key, with its own
     spend limit, keeps testing costs separate.
6. **The EAS environment:** I set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the
   `development` environment from the values in step 2.
7. **First build:** `npm run build:dev:android`. EAS asks to create a signing key for the new app id: yes.

## The web app on this computer

| Address | Database | Start it with |
|---|---|---|
| http://localhost:8081 | **Development** (`.env.development.local`) | `npm run web:dev` (or `npx expo start --web`) |
| http://localhost:8083 | **Production** (`.env.local`): real accounts | `npm run web:prod` |

(Port 8082 is taken by another project on this computer.) Each address is a separate site in the browser, with its own
sign-in and offline copy. The browser tests and screenshot scripts always use 8081 and Development.

**The old on-device copy:** before cloud sync, the app kept accounts and data in the browser itself. Signing in to an
empty cloud account copies that old data in ("Bring data from the older version"). To start an account truly empty,
sign out and clear the site's data first (browser settings → Site settings → localhost:… → Clear data).

## Day to day

| Task | Command |
|---|---|
| Development build (APK) | `npm run build:dev:android` |
| Production build (Play Store) | `npm run build:prod:android` |
| A JavaScript fix to Development phones | `npx eas-cli@latest update --channel development --environment development --message "…"` |
| The same fix to Production phones | `npx eas-cli@latest update --channel production --environment production --message "…"` |

- **New SQL:** run each new migration on **Development first**, test it there, then run the same file on Production.
- **Accounts:** the two projects have separate accounts. Sign up again in the Development app (or with the demo
  accounts, once created there).
- **Never** point the Development app at the Production project, or paste `supabase/dev-setup.sql` into
  Production.
