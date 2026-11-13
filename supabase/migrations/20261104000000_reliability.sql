-- Study Planner: error reports, nightly backups, and limits on study groups.
-- Apply after 20261103000000_live_groups.sql: SQL Editor -> paste -> Run. Safe to run again.

-- ============================== 1. Error reports from the app ==============================
-- The app sends unexpected errors here (src/monitoring.js). Anyone can add a report; nobody can read them through the
-- API: read them in the dashboard (Table Editor -> client_errors) or with the queries in docs/reliability.md.
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  context text not null default '' check (char_length(context) <= 300),
  message text not null check (char_length(message) <= 1000),
  stack text not null default '' check (char_length(stack) <= 4000),
  platform text not null default '' check (char_length(platform) <= 20),
  app_version text not null default '' check (char_length(app_version) <= 40)
);
create index if not exists client_errors_at on public.client_errors (at desc);
create index if not exists client_errors_user on public.client_errors (user_id, at desc);

alter table public.client_errors enable row level security;
drop policy if exists "errors: add your own" on public.client_errors;
create policy "errors: add your own" on public.client_errors for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
revoke all on public.client_errors from anon, authenticated;
grant insert (context, message, stack, platform, app_version) on public.client_errors to anon, authenticated;

-- a broken build can't flood the table: 30 reports an hour per account, 300 an hour from signed-out devices
create or replace function public.client_errors_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null then
    if (select count(*) from public.client_errors e where e.user_id = new.user_id and e.at > now() - interval '1 hour') >= 30 then
      return null; -- dropped quietly
    end if;
  elsif (select count(*) from public.client_errors e where e.user_id is null and e.at > now() - interval '1 hour') >= 300 then
    return null;
  end if;
  return new;
end;
$$;
drop trigger if exists client_errors_limit on public.client_errors;
create trigger client_errors_limit before insert on public.client_errors for each row execute function public.client_errors_limit();

-- ============================== 2. Nightly backups ==============================
-- Every night at 02:00 UTC a copy of all study data (records) and live groups goes into the `backup` schema, which
-- the API can't reach. The last 14 nights are kept. docs/reliability.md says how to restore.
create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;

create table if not exists backup.records (
  taken_on date not null,
  user_id uuid not null,
  kind text not null,
  id text not null,
  data jsonb,
  deleted boolean not null,
  updated_at timestamptz not null,
  primary key (taken_on, user_id, kind, id)
);
create table if not exists backup.study_groups (
  taken_on date not null,
  row jsonb not null
);
create table if not exists backup.study_group_members (
  taken_on date not null,
  row jsonb not null
);
create table if not exists backup.runs (
  taken_on date primary key,
  finished_at timestamptz not null default now(),
  records bigint not null,
  groups bigint not null
);

create or replace function backup.take()
returns void language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  n_records bigint;
  n_groups bigint;
begin
  delete from backup.records where taken_on = today;
  delete from backup.study_groups where taken_on = today;
  delete from backup.study_group_members where taken_on = today;
  insert into backup.records (taken_on, user_id, kind, id, data, deleted, updated_at)
    select today, r.user_id, r.kind, r.id, r.data, r.deleted, r.updated_at from public.records r;
  get diagnostics n_records = row_count;
  insert into backup.study_groups (taken_on, row) select today, to_jsonb(g) from public.study_groups g;
  get diagnostics n_groups = row_count;
  insert into backup.study_group_members (taken_on, row) select today, to_jsonb(m) from public.study_group_members m;
  insert into backup.runs (taken_on, records, groups) values (today, n_records, n_groups)
    on conflict (taken_on) do update set finished_at = now(), records = excluded.records, groups = excluded.groups;
  -- keep 14 nights
  delete from backup.records where taken_on < today - 13;
  delete from backup.study_groups where taken_on < today - 13;
  delete from backup.study_group_members where taken_on < today - 13;
  delete from backup.runs where taken_on < today - 13;
end;
$$;

-- Put one account's study data back as it was on a night (run by you in the SQL Editor, never by the app):
--   select backup.restore_user('<user id>', '2026-11-03');
-- Its records become that night's copy; anything added since is marked deleted. Devices pick it up on their next sync.
create or replace function backup.restore_user(uid uuid, night date)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  n bigint;
begin
  if not exists (select 1 from backup.records b where b.taken_on = night and b.user_id = uid) then
    raise exception 'no backup of % on %', uid, night;
  end if;
  insert into public.records (user_id, kind, id, data, deleted)
    select b.user_id, b.kind, b.id, b.data, b.deleted from backup.records b where b.taken_on = night and b.user_id = uid
    on conflict (user_id, kind, id) do update set data = excluded.data, deleted = excluded.deleted;
  get diagnostics n = row_count;
  update public.records r set deleted = true, data = null
    where r.user_id = uid and not r.deleted
      and not exists (select 1 from backup.records b where b.taken_on = night and b.user_id = uid and b.kind = r.kind and b.id = r.id);
  return n;
end;
$$;
revoke all on function backup.take(), backup.restore_user(uuid, date) from public, anon, authenticated;

-- old error reports go too (after 30 days)
create or replace function backup.tidy_errors()
returns void language sql security definer set search_path = '' as $$
  delete from public.client_errors where at < now() - interval '30 days';
$$;
revoke all on function backup.tidy_errors() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('studyplanner-nightly-backup', '0 2 * * *', 'select backup.take()');
select cron.schedule('studyplanner-tidy-errors', '30 2 * * *', 'select backup.tidy_errors()');
-- a first copy now
select backup.take();

-- ============================== 3. Limits on study groups ==============================
-- 10 live groups per person, 200 members per group. The app shows a message for each (groups.errors.*).
create or replace function public.study_groups_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.study_groups g where g.owner = new.owner) >= 10 then
    raise exception 'group_limit' using errcode = 'P0001', hint = 'At most 10 live groups per person';
  end if;
  return new;
end;
$$;
drop trigger if exists study_groups_limit on public.study_groups;
create trigger study_groups_limit before insert on public.study_groups for each row execute function public.study_groups_limit();

create or replace function public.join_study_group(gid uuid, code text)
returns table (id uuid, name text, owner_name text, payload jsonb, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.study_groups g where g.id = gid and g.join_code = code) then return; end if;
  if not exists (select 1 from public.study_group_members m where m.group_id = gid and m.user_id = auth.uid())
     and (select count(*) from public.study_group_members m where m.group_id = gid) >= 200 then
    raise exception 'group_full' using errcode = 'P0001', hint = 'At most 200 members per group';
  end if;
  insert into public.study_group_members (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return query select g.id, g.name, g.owner_name, g.payload, g.updated_at from public.study_groups g where g.id = gid;
end;
$$;
revoke all on function public.join_study_group(uuid, text) from public, anon;
grant execute on function public.join_study_group(uuid, text) to authenticated;
