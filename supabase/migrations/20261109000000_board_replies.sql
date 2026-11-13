-- Study Planner: replies on a group's board. Anyone in the group (its owner and members) can reply under a note or
-- a shared task ("Is it chapters 4 and 5?"). A reply's group and author name are set here, from its post and the
-- signed-in account, so neither can be faked. People delete their own replies; the owner can delete any in the
-- group. At most 50 replies per post. Apply after 20261105000000_group_board.sql: SQL Editor -> paste -> Run.

create table if not exists public.study_group_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.study_group_posts (id) on delete cascade,
  group_id uuid not null references public.study_groups (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '' check (char_length(author_name) <= 60),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists study_group_replies_post on public.study_group_replies (post_id, created_at);
create index if not exists study_group_replies_group on public.study_group_replies (group_id);

-- the group from the post, the author from the account (and at most 50 replies on a post)
create or replace function public.study_group_replies_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select p.group_id into new.group_id from public.study_group_posts p where p.id = new.post_id;
  if new.group_id is null then raise exception 'no_post' using errcode = 'P0001'; end if;
  new.user_id := auth.uid();
  new.author_name := left(coalesce(auth.jwt() -> 'user_metadata' ->> 'name', ''), 60);
  new.created_at := now();
  if (select count(*) from public.study_group_replies r where r.post_id = new.post_id) >= 50 then
    raise exception 'replies_full' using errcode = 'P0001', hint = 'At most 50 replies per post';
  end if;
  return new;
end;
$$;
drop trigger if exists study_group_replies_fill on public.study_group_replies;
create trigger study_group_replies_fill before insert on public.study_group_replies for each row execute function public.study_group_replies_fill();

alter table public.study_group_replies enable row level security;

drop policy if exists "replies: group reads" on public.study_group_replies;
create policy "replies: group reads" on public.study_group_replies for select to authenticated
  using (public.is_group_member(group_id) or public.is_group_owner(group_id));

-- the trigger has set group_id from the post by the time this is checked
drop policy if exists "replies: group writes" on public.study_group_replies;
create policy "replies: group writes" on public.study_group_replies for insert to authenticated
  with check (user_id = (select auth.uid()) and (public.is_group_member(group_id) or public.is_group_owner(group_id)));

drop policy if exists "replies: delete own or as owner" on public.study_group_replies;
create policy "replies: delete own or as owner" on public.study_group_replies for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_group_owner(group_id));

revoke all on public.study_group_replies from anon;
grant select, insert, delete on public.study_group_replies to authenticated;

-- the group sees replies as they're written (and removed)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'study_group_replies') then
    alter publication supabase_realtime add table public.study_group_replies;
  end if;
end;
$$;
alter table public.study_group_replies replica identity full;

-- the nightly backup takes the replies as well
create table if not exists backup.study_group_replies (taken_on date not null, row jsonb not null);
create or replace function backup.take_replies()
returns void language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
begin
  delete from backup.study_group_replies where taken_on = today or taken_on < today - 13;
  insert into backup.study_group_replies (taken_on, row) select today, to_jsonb(r) from public.study_group_replies r;
end;
$$;
revoke all on function backup.take_replies() from public, anon, authenticated;
select cron.schedule('studyplanner-nightly-backup-replies', '10 2 * * *', 'select backup.take_replies()');
