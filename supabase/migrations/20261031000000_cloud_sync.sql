-- Study Planner: cloud sync.
-- Every piece of a user's data is one row: a task, an exam, a class... (kind + id), with its fields as JSON.
-- Devices push the rows they changed and pull the rows changed since they last looked; a deleted item stays
-- as a row with deleted = true, so the deletion reaches the other devices too.
-- Apply in the Supabase dashboard (SQL Editor -> paste -> Run), or with `supabase db push`.

create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('subject', 'task', 'session', 'exam', 'recurring', 'class', 'vacation', 'group', 'archive', 'singleton')),
  id text not null check (char_length(id) between 1 and 200),
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id),
  -- a guard against one bad row filling the database (a task with photos is well under this)
  constraint records_data_size check (data is null or pg_column_size(data) < 2000000)
);

-- "what changed since …" for one user
create index if not exists records_user_updated on public.records (user_id, updated_at);

-- The server's clock orders changes (a phone's clock can be wrong)
create or replace function public.records_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch
before insert or update on public.records
for each row execute function public.records_touch();

-- Only your own rows, ever
alter table public.records enable row level security;

drop policy if exists "records: read own" on public.records;
create policy "records: read own" on public.records
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "records: add own" on public.records;
create policy "records: add own" on public.records
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "records: change own" on public.records;
create policy "records: change own" on public.records
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "records: remove own" on public.records;
create policy "records: remove own" on public.records
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.records from anon;
grant select, insert, update, delete on public.records to authenticated;

-- Live updates between your devices
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records') then
    alter publication supabase_realtime add table public.records;
  end if;
end;
$$;

-- "Delete account": the app can't remove a user itself, so this removes the caller (their rows go with them)
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
