-- Study Planner: study together.
-- While a student's focus timer runs, the app tells their study groups (the subject and when it ends, never the
-- task) through Realtime Presence on a private channel per group, "study:<group id>". Nothing is stored: a status
-- goes when the timer stops or the app closes. These policies let only the group's owner and members join that
-- channel. Apply after 20261103000000_live_groups.sql: SQL Editor -> paste -> Run.

create or replace function public.can_join_study_topic(topic text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(topic like 'study:%', false) and exists (
    select 1 from public.study_groups g
    where g.id::text = substr(topic, 7)
      and (g.owner = auth.uid()
        or exists (select 1 from public.study_group_members m where m.group_id = g.id and m.user_id = auth.uid()))
  );
$$;
revoke all on function public.can_join_study_topic(text) from public, anon;
grant execute on function public.can_join_study_topic(text) to authenticated;

-- see who's studying in the group
drop policy if exists "study together: listen" on realtime.messages;
create policy "study together: listen" on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'presence' and public.can_join_study_topic((select realtime.topic())));

-- say you're studying
drop policy if exists "study together: track" on realtime.messages;
create policy "study together: track" on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'presence' and public.can_join_study_topic((select realtime.topic())));
