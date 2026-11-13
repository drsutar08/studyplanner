-- Study Planner, PRODUCTION only: delete every account except drsutar08@gmail.com (the owner asked, 3 November 2026).
-- Not a migration: run by hand, in two steps, in the Production project's SQL Editor (xlqnkglftspdowyucioc).
-- Each account goes the way "Delete my account" removes one (20261111): its records, groups it owns (with their
-- boards and replies), memberships, replies, Premium rows, AI counts and error reports, and its copies in the nightly
-- backups. Photos in Storage can't be removed by SQL: see the note at the end.

-- ===== STEP 1: look first (changes nothing). Check the owner is there and the list is what you expect. =====
select (select count(*) from auth.users where lower(email) = 'drsutar08@gmail.com') as owner_found,
       (select count(*) from auth.users where lower(email) <> 'drsutar08@gmail.com' or email is null) as to_delete;
select email, created_at, last_sign_in_at
from auth.users
where lower(email) <> 'drsutar08@gmail.com' or email is null
order by created_at;


-- ===== STEP 2: delete. Select from here to the end and Run. It stops, changing nothing, if the owner is missing. =====
do $$
declare
  keep uuid;
  gone uuid[];
  owned text[];
  n int;
begin
  select id into keep from auth.users where lower(email) = 'drsutar08@gmail.com';
  if keep is null then
    raise exception 'drsutar08@gmail.com not found: nothing deleted';
  end if;

  select coalesce(array_agg(id), '{}') into gone from auth.users where id <> keep;
  n := coalesce(array_length(gone, 1), 0);
  if n = 0 then
    raise notice 'Only the owner is left: nothing to delete';
    return;
  end if;

  -- groups those accounts own, live and in the backups
  select coalesce(array_agg(distinct g), '{}') into owned from (
    select id::text as g from public.study_groups where owner = any (gone)
    union select row ->> 'id' from backup.study_groups where (row ->> 'owner')::uuid = any (gone)
  ) x;

  -- their copies in the nightly backups (these have no link to the account, so they don't go by themselves)
  delete from backup.records where user_id = any (gone);
  delete from backup.study_groups where (row ->> 'owner')::uuid = any (gone);
  delete from backup.study_group_members where (row ->> 'user_id')::uuid = any (gone) or row ->> 'group_id' = any (owned);
  delete from backup.study_group_posts where row ->> 'group_id' = any (owned);
  delete from backup.study_group_replies where (row ->> 'user_id')::uuid = any (gone) or row ->> 'group_id' = any (owned);
  delete from public.client_errors where user_id = any (gone) or user_id is null;

  -- the accounts: everything else of theirs goes with them (on delete cascade)
  delete from auth.users where id = any (gone);

  raise notice 'Deleted % accounts; kept drsutar08@gmail.com', n;
end;
$$;

-- check: should list only drsutar08@gmail.com
select email, created_at from auth.users order by created_at;

-- Photos: files in Storage (bucket "attachments", one folder per account id) aren't removed by SQL. After step 2,
-- Storage → attachments shows any folders left whose names aren't the owner's id: select those folders and Delete.
-- The owner's folder is named after this id:
select id as owner_folder from auth.users where lower(email) = 'drsutar08@gmail.com';
