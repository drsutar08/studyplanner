# Error reports, backups and limits

Set up by [`supabase/migrations/20261104000000_reliability.sql`](../supabase/migrations/20261104000000_reliability.sql).
Run it once in the SQL Editor; it's safe to run again.

## Sample data

`node scripts/seed-demo.mjs` creates three demo accounts (password `DemoPass123!`):
- `demo.priya@example.com` has a timetable and two live groups;
- `demo.arjun@example.com` and `demo.meera@example.com` are members.

It also adds eight error reports marked `[demo]`. Run `node scripts/seed-demo.mjs --remove` to delete the accounts
and their groups. Then `delete from client_errors where message like '[demo]%';` removes the sample reports.

## Error reports

Every unexpected error in the app goes through `reportError` in [`src/monitoring.js`](../src/monitoring.js). That
covers:
- a screen that crashes (the error screen);
- an error outside React (timers, promises; on the web, the window's error events);
- a sync round that fails for a reason other than being offline.

Each error is kept on the device (the last 20) and sent to the `client_errors` table. Each report holds the message,
the first lines of the stack, where it happened, the platform (`web` / `ios` / `android`), the app version and the
signed-in account.

Limits keep a broken build from flooding the table:
- The app sends each distinct error once per session, and at most 10 per session.
- The server keeps 30 an hour per account and 300 an hour from signed-out devices. It drops the rest.
- Reports older than 30 days are deleted every night.

Nobody can read reports through the app's API. Read them in **Table Editor → client_errors**, or in the SQL Editor:

```sql
-- the last day, most common first
select message, context, platform, app_version, count(*) as times, count(distinct user_id) as people, max(at) as last_seen
from client_errors where at > now() - interval '1 day'
group by 1, 2, 3, 4 order by times desc;
```

To use Sentry (or another service) as well, call it from `send` in `src/monitoring.js`. The Sentry SDK needs a
development build on phones.

## Nightly backups

At 02:00 UTC every night, a database job (pg_cron) copies all study data into the `backup` schema. That includes
every account's records, the live groups and their members. The app's API can't reach this schema. The last 14
nights are kept, and the migration takes a first copy straight away.

Check that it runs:

```sql
select * from backup.runs order by taken_on desc;        -- one row a night: when, how many records and groups
select * from cron.job_run_details order by start_time desc limit 5;   -- the job's own log
```

Put one account back as it was on a night (for example after a bad change or an accidental bulk delete):

```sql
select id, email from auth.users where email = 'someone@example.com';  -- their id
select backup.restore_user('<their id>', '2026-11-04');
```

Their records become that night's copy, and anything added since is marked deleted. Their devices pick up the change
on the next sync. Photos are files in Storage and aren't part of these copies.

These copies live in the same database. They help with mistakes, not with losing the project. For a copy outside
Supabase, download one now and then: **Database → Backups**, or the Pro plan's daily backups with point-in-time
recovery.

A deleted account's data stays in the backups for up to 14 days, then it's gone from them too.

## Limits on study groups

| Limit | What people see |
| --- | --- |
| 10 live groups per person | "You have 10 live groups, the most there can be. Stop sharing one to make another." |
| 200 members per group | "This group is full (200 members). Ask its owner to make another one." |

The server checks both, so no other client can get past them. Someone already in a full group can still open it
and get updates. A group's link holds a 96-bit random code, which is far too many possibilities to guess. Change the
numbers in `study_groups_limit()` and `join_study_group()` in the migration.

## The "not synced" dot

A change normally reaches the cloud within a couple of seconds. An orange dot appears on the account button (top
right) in two cases:
- changes on the device have waited more than 8 seconds;
- the device is offline, or the last sync failed.

Settings → Cloud sync then says how many changes are waiting, for example "Synced 10:42 · 3 changes not synced
yet", next to **Sync now**.
