# Cloud sync and accounts (Supabase)

Accounts are Supabase accounts (email and password), and every account's data syncs between the web app and the
phone apps. The app still works offline: it saves to the device first and syncs when it can.

## Setting up a project

1. **Create a project** at [supabase.com](https://supabase.com) (the free plan is fine).
2. **Create the table.** Open *SQL Editor* → *New query*, paste the whole of
   [`supabase/migrations/20261031000000_cloud_sync.sql`](../supabase/migrations/20261031000000_cloud_sync.sql) and
   press *Run*. It is safe to run again. It creates:
   - `records`: one row per task, exam, class, subject, session, break, group, archived task, plus the term,
     the rotation and the settings. Row-level security means each user can only see and change their own rows.
   - `delete_my_account()`: lets the app's "Delete account" remove the signed-in user (and, with them, their rows).
   - Realtime on `records`, so changes show up on the user's other devices within seconds.
3. **Authentication settings** (*Authentication* → *Sign In / Providers*, and *URL Configuration*):
   - *Confirm email*: on for real users (sign-up then asks them to open the link before signing in). Turn it
     **off for development and the e2e tests**, which create accounts and sign straight in.
   - *Site URL*: where the web app is served, e.g. `http://localhost:8081` while developing.
   - *Redirect URLs*: add the web address(es) and `studyplanner://reset` (the phone apps' "reset password" link).
4. **Connect the app.** Copy *Project Settings* → *API*: the project URL and the **publishable** key (`sb_publishable_…`,
   or the legacy `anon` key). Put them in `.env.local` at the project root (it is git-ignored):

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   Restart `npx expo start` after changing it (the values are built into the bundle). For EAS builds, add the same
   two as EAS environment variables. Never put the database password or the secret / `service_role` key in the app.

## How sync works

- Every change is saved on the device straight away, then sent about a second later.
- Each task, exam, class... is its own row, so edits to different things on two devices both survive. If the same
  thing is changed on two devices, the change sent last wins. A change made here and not sent yet is never
  replaced by an older copy from the server.
- Deleting something leaves a row marked `deleted`, so the deletion reaches the other devices.
- A device new to the account downloads everything when you sign in. If it can't (no connection), it says so and
  offers *Try again* instead of starting empty.
- Changes from other devices arrive live (Realtime), when the app comes back to the front, and every two minutes.
- Settings sync too, except whether that phone allows notifications.
- Settings → Account → *Cloud sync* shows the status and has *Sync now*.

The rules are in `src/cloud/sync.js` (unit-tested in `e2e/sync.test.mjs`); the network side is
`src/cloud/useCloudSync.js`; accounts are in `src/auth.js`.

## Data from before cloud accounts

The first time someone signs in to a new (empty) cloud account on a device that still has data from the old
on-device accounts, the data of the old account with the same email is copied into the cloud account. Nothing on
the device is deleted.
