-- Study Planner: a request to the AI helper that fails on Claude's side (no credit, a bad key, an outage) no longer
-- uses up one of the account's 30 a day: the study-helper Edge Function gives it back. Only the function can (it
-- runs with the service role key, which the app never has). Apply after 20261107000000_ai_helper.sql:
-- SQL Editor -> paste -> Run. Safe to run again.

create or replace function public.refund_ai_quota(who uuid)
returns void language sql security definer set search_path = '' as $$
  update public.ai_usage set requests = greatest(requests - 1, 0)
  where user_id = who and day = (now() at time zone 'utc')::date;
$$;
revoke all on function public.refund_ai_quota(uuid) from public, anon, authenticated;
grant execute on function public.refund_ai_quota(uuid) to service_role;

-- once: today's counts were used up by requests that failed before the API key was set up
update public.ai_usage set requests = 0 where day = (now() at time zone 'utc')::date;
