-- Study Planner: live study groups.
-- A group is a timetable (classes, exams, breaks) its owner shares; members see it change as the owner's does.
-- The owner's app keeps `payload` up to date (the same shape as a share link, src/share.js). Joining needs the
-- group's secret code from the link. Apply after 20261031000000_cloud_sync.sql: SQL Editor -> paste -> Run.

create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  owner_name text not null default '' check (char_length(owner_name) <= 60),
  join_code text not null default encode(extensions.gen_random_bytes(12), 'hex'),
  include jsonb not null default '{"classes": true, "exams": true, "vacations": true}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_groups_payload_size check (pg_column_size(payload) < 1000000)
);
create index if not exists study_groups_owner on public.study_groups (owner);

create table if not exists public.study_group_members (
  group_id uuid not null references public.study_groups (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists study_group_members_user on public.study_group_members (user_id);

-- the server's clock says when a group last changed
create or replace function public.study_groups_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists study_groups_touch on public.study_groups;
create trigger study_groups_touch before update on public.study_groups for each row execute function public.study_groups_touch();

-- membership, checked without the policies calling each other
create or replace function public.is_group_member(gid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.study_group_members m where m.group_id = gid and m.user_id = auth.uid());
$$;

alter table public.study_groups enable row level security;
alter table public.study_group_members enable row level security;

drop policy if exists "groups: owner" on public.study_groups;
create policy "groups: owner" on public.study_groups for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

drop policy if exists "groups: members read" on public.study_groups;
create policy "groups: members read" on public.study_groups for select to authenticated
  using (public.is_group_member(id));

drop policy if exists "members: own rows" on public.study_group_members;
create policy "members: own rows" on public.study_group_members for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.study_groups g where g.id = group_id and g.owner = (select auth.uid())));

drop policy if exists "members: leave" on public.study_group_members;
create policy "members: leave" on public.study_group_members for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.study_groups, public.study_group_members from anon;
grant select, insert, update, delete on public.study_groups to authenticated;
grant select, delete on public.study_group_members to authenticated;

-- A group from its link (id + code), to look at before joining
create or replace function public.open_study_group(gid uuid, code text)
returns table (id uuid, name text, owner_name text, payload jsonb, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, g.owner_name, g.payload, g.updated_at from public.study_groups g where g.id = gid and g.join_code = code;
$$;

-- Joining with the link: adds the caller as a member and returns the group (nothing when the code is wrong)
create or replace function public.join_study_group(gid uuid, code text)
returns table (id uuid, name text, owner_name text, payload jsonb, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.study_groups g where g.id = gid and g.join_code = code) then return; end if;
  insert into public.study_group_members (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return query select g.id, g.name, g.owner_name, g.payload, g.updated_at from public.study_groups g where g.id = gid;
end;
$$;

revoke all on function public.open_study_group(uuid, text), public.join_study_group(uuid, text) from public, anon;
grant execute on function public.open_study_group(uuid, text), public.join_study_group(uuid, text) to authenticated;
revoke all on function public.is_group_member(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;

-- members hear about changes live
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'study_groups') then
    alter publication supabase_realtime add table public.study_groups;
  end if;
end;
$$;
