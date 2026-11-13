-- Study Planner: the AI study helper is Premium only.
-- An account can use it only while it has an unexpired subscription (store purchase, gift or set by hand), and this
-- holds whether or not the Free limits switch (app_config.limits_enforced) is on: the helper costs money per request.
-- Premium keeps 30 requests a day. A Free account is refused ('premium_required'). The "watch an ad for one more
-- request" reward is gone with the Free allowance. Apply after 20261114000000_ads_all.sql: SQL Editor -> paste -> Run.
-- Deploy the study-helper Edge Function again too (it turns 'premium_required' into a 402 for the app).

-- ---------- the limits: AI is 0 for anyone who isn't Premium, switch or no switch ----------
create or replace function public.plan_limit(uid uuid, what text)
returns int language sql stable security definer set search_path = '' as $$
  select case
    when what = 'ai' then case when public.is_premium(uid) then 30 else 0 end
    when not public.limits_on() or public.is_premium(uid) then
      case what when 'cards' then 1000000 when 'photos' then 2000 when 'groups' then 10 end
    else
      case what when 'cards' then 200 when 'photos' then 50 when 'groups' then 1 end
  end;
$$;
revoke all on function public.plan_limit(uuid, text) from public, anon;

-- ---------- the helper's gate: Premium, then 30 a day ----------
create or replace function public.use_ai_quota(daily_limit int default 30)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  used int;
begin
  if auth.uid() is null then return false; end if;
  if not public.is_premium(auth.uid()) then
    raise exception 'premium_required' using errcode = 'P0001', hint = 'The AI study helper is part of Premium';
  end if;
  insert into public.ai_usage (user_id, day, requests) values (auth.uid(), today, 0) on conflict do nothing;
  select requests into used from public.ai_usage where user_id = auth.uid() and day = today for update;
  if used >= public.plan_limit(auth.uid(), 'ai') then return false; end if;
  update public.ai_usage set requests = requests + 1 where user_id = auth.uid() and day = today;
  return true;
end;
$$;
revoke all on function public.use_ai_quota(int) from public, anon;
grant execute on function public.use_ai_quota(int) to authenticated;

-- ---------- no more ad rewards for AI requests ----------
create or replace function public.ad_reward()
returns int language sql security definer set search_path = '' as $$
  select -1;
$$;
revoke all on function public.ad_reward() from public, anon;
grant execute on function public.ad_reward() to authenticated;

-- my_plan() as before, but the AI allowance is per day for everyone and there are no ad rewards left
create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plan', case when public.is_premium(auth.uid()) then 'premium' else 'free' end,
    'enforced', public.limits_on(),
    'expires_at', (select s.expires_at from public.subscriptions s where s.user_id = auth.uid()),
    'source', (select s.source from public.subscriptions s where s.user_id = auth.uid()),
    'ads', public.shows_ads(auth.uid()),
    'age', public.age_group(auth.uid()),
    'ad_rewards_left', 0,
    'limits', jsonb_build_object(
      'ai', public.plan_limit(auth.uid(), 'ai'),
      'ai_period', 'day',
      'cards', public.plan_limit(auth.uid(), 'cards'),
      'photos', public.plan_limit(auth.uid(), 'photos'),
      'groups', public.plan_limit(auth.uid(), 'groups')
    )
  );
$$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;
