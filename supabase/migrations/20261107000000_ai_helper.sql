-- Study Planner: the AI study helper's daily allowance. The study-helper Edge Function calls use_ai_quota() before
-- each request to Claude; it counts the request and says whether the account is still within today's limit.
-- Apply after 20261106000000_flashcards.sql: SQL Editor -> paste -> Run. Safe to run again.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  requests int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
-- people may see their own counts (the app shows what's left); only the function below changes them
drop policy if exists "ai usage: own" on public.ai_usage;
create policy "ai usage: own" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

-- Count one request for the signed-in account; false (and nothing counted) once today's limit is reached
create or replace function public.use_ai_quota(daily_limit int default 30)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  used int;
begin
  if auth.uid() is null then return false; end if;
  insert into public.ai_usage (user_id, day, requests) values (auth.uid(), today, 0) on conflict do nothing;
  select requests into used from public.ai_usage where user_id = auth.uid() and day = today for update;
  if used >= daily_limit then return false; end if;
  update public.ai_usage set requests = requests + 1 where user_id = auth.uid() and day = today;
  return true;
end;
$$;
revoke all on function public.use_ai_quota(int) from public, anon;
grant execute on function public.use_ai_quota(int) to authenticated;

-- old counts go after 30 days (with the nightly tidy of error reports)
create or replace function backup.tidy_ai_usage()
returns void language sql security definer set search_path = '' as $$
  delete from public.ai_usage where day < (now() at time zone 'utc')::date - 30;
$$;
revoke all on function backup.tidy_ai_usage() from public, anon, authenticated;
select cron.schedule('studyplanner-tidy-ai-usage', '45 2 * * *', 'select backup.tidy_ai_usage()');
