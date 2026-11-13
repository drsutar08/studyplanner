-- Study Planner: deleting an account removes everything of it, including the copies the nightly backup keeps for
-- 14 days and its error reports (which were kept 30 days with the link to the account removed). What it owned goes
-- too: its study groups, their boards and replies, in the backups as well as live. Settings → Privacy & data says
-- so. Apply after 20261110000000_ai_quota_refund.sql: SQL Editor -> paste -> Run. Safe to run again.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  owned text[];
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  -- the groups this account owns, live and in the backups (their boards and members go with them)
  select coalesce(array_agg(distinct g), '{}') into owned from (
    select id::text as g from public.study_groups where owner = uid
    union select row ->> 'id' from backup.study_groups where row ->> 'owner' = uid::text
  ) x;

  delete from backup.records where user_id = uid;
  delete from backup.study_groups where row ->> 'owner' = uid::text;
  delete from backup.study_group_members where row ->> 'user_id' = uid::text or row ->> 'group_id' = any (owned);
  delete from backup.study_group_posts where row ->> 'group_id' = any (owned);
  delete from backup.study_group_replies where row ->> 'user_id' = uid::text or row ->> 'group_id' = any (owned);
  delete from public.client_errors where user_id = uid;

  -- the account itself: its records, groups, memberships, replies, AI counts and so on go with it (on delete cascade)
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
