-- Study Planner: a board for each live study group: notes (e.g. "test moved to Friday", pinned for everyone) and
-- shared tasks (each member gets a copy of their own to tick off). The group's owner posts; members read.
-- Apply after 20261104000000_reliability.sql: SQL Editor -> paste -> Run. Safe to run again.

create table if not exists public.study_group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups (id) on delete cascade,
  kind text not null check (kind in ('note', 'task')),
  title text not null default '' check (char_length(title) <= 120),
  body text not null default '' check (char_length(body) <= 1000),
  due date,
  estimate int check (estimate is null or estimate between 5 and 600),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_group_posts_task check (kind <> 'task' or (char_length(title) > 0 and due is not null)),
  constraint study_group_posts_note check (kind <> 'note' or char_length(body) > 0)
);
create index if not exists study_group_posts_group on public.study_group_posts (group_id, created_at desc);

create or replace function public.study_group_posts_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists study_group_posts_touch on public.study_group_posts;
create trigger study_group_posts_touch before update on public.study_group_posts for each row execute function public.study_group_posts_touch();

-- at most 100 posts on a group's board
create or replace function public.study_group_posts_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.study_group_posts p where p.group_id = new.group_id) >= 100 then
    raise exception 'board_full' using errcode = 'P0001', hint = 'At most 100 posts per group';
  end if;
  return new;
end;
$$;
drop trigger if exists study_group_posts_limit on public.study_group_posts;
create trigger study_group_posts_limit before insert on public.study_group_posts for each row execute function public.study_group_posts_limit();

create or replace function public.is_group_owner(gid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.study_groups g where g.id = gid and g.owner = auth.uid());
$$;
revoke all on function public.is_group_owner(uuid) from public, anon;
grant execute on function public.is_group_owner(uuid) to authenticated;

alter table public.study_group_posts enable row level security;
drop policy if exists "posts: owner writes" on public.study_group_posts;
create policy "posts: owner writes" on public.study_group_posts for all to authenticated
  using (public.is_group_owner(group_id)) with check (public.is_group_owner(group_id));
drop policy if exists "posts: members read" on public.study_group_posts;
create policy "posts: members read" on public.study_group_posts for select to authenticated
  using (public.is_group_member(group_id));
revoke all on public.study_group_posts from anon;
grant select, insert, update, delete on public.study_group_posts to authenticated;

-- members see new posts as they're made
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'study_group_posts') then
    alter publication supabase_realtime add table public.study_group_posts;
  end if;
end;
$$;
-- deletions reach members too (realtime sends the old row's id)
alter table public.study_group_posts replica identity full;

-- the nightly backup takes the boards as well
create table if not exists backup.study_group_posts (taken_on date not null, row jsonb not null);
create or replace function backup.take_posts()
returns void language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
begin
  delete from backup.study_group_posts where taken_on = today or taken_on < today - 13;
  insert into backup.study_group_posts (taken_on, row) select today, to_jsonb(p) from public.study_group_posts p;
end;
$$;
revoke all on function backup.take_posts() from public, anon, authenticated;
select cron.schedule('studyplanner-nightly-backup-posts', '5 2 * * *', 'select backup.take_posts()');
