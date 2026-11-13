-- Study Planner: ads (Google AdMob), for Free accounts of adults only.
-- An account sees ads when the Free limits are on (20261112), it isn't Premium, and it said "18 or older" at sign-up
-- (user_metadata.consent.age). Accounts under 18, Premium ones and older accounts without an age never see ads. For
-- trying ads in a phone build before launch, accounts on app_config.ads_test_accounts (a list of emails) see them
-- too. Ads are never personalised (the app asks for non-personalised ads only).
-- Watching a rewarded ad gives one more AI request, at most 3 a day. Apply after 20261112000000_premium.sql.

insert into public.app_config (key, value) values ('ads_test_accounts', '[]'::jsonb) on conflict (key) do nothing;

alter table public.ai_usage add column if not exists ad_rewards int not null default 0;

create or replace function public.shows_ads(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (public.limits_on() and not public.is_premium(uid) and (u.raw_user_meta_data -> 'consent' ->> 'age') = 'adult')
      or exists (select 1 from public.app_config c where c.key = 'ads_test_accounts' and c.value ? lower(u.email))
    from auth.users u where u.id = uid
  ), false);
$$;
revoke all on function public.shows_ads(uuid) from public, anon, authenticated;

-- my_plan() as before, plus whether to show ads and how many ad rewards are left today
create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plan', case when public.is_premium(auth.uid()) then 'premium' else 'free' end,
    'enforced', public.limits_on(),
    'expires_at', (select s.expires_at from public.subscriptions s where s.user_id = auth.uid()),
    'source', (select s.source from public.subscriptions s where s.user_id = auth.uid()),
    'ads', public.shows_ads(auth.uid()),
    'ad_rewards_left', greatest(0, 3 - coalesce((select a.ad_rewards from public.ai_usage a where a.user_id = auth.uid() and a.day = (now() at time zone 'utc')::date), 0)),
    'limits', jsonb_build_object(
      'ai', public.plan_limit(auth.uid(), 'ai'),
      'ai_period', case when public.limits_on() and not public.is_premium(auth.uid()) then 'week' else 'day' end,
      'cards', public.plan_limit(auth.uid(), 'cards'),
      'photos', public.plan_limit(auth.uid(), 'photos'),
      'groups', public.plan_limit(auth.uid(), 'groups')
    )
  );
$$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- A watched rewarded ad: one AI request back, at most 3 a day, only for an account that is shown ads.
-- Returns how many are left today, or -1 when not allowed. (The app calls it when AdMob says the reward was earned.
-- Until AdMob's server-side verification is set up, the daily cap is what limits misuse.)
create or replace function public.ad_reward()
returns int language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  taken int;
begin
  if auth.uid() is null or not public.shows_ads(auth.uid()) then return -1; end if;
  insert into public.ai_usage (user_id, day, requests) values (auth.uid(), today, 0) on conflict do nothing;
  select ad_rewards into taken from public.ai_usage where user_id = auth.uid() and day = today for update;
  if taken >= 3 then return -1; end if;
  update public.ai_usage set ad_rewards = ad_rewards + 1, requests = requests - 1 where user_id = auth.uid() and day = today;
  return 3 - taken - 1;
end;
$$;
revoke all on function public.ad_reward() from public, anon;
grant execute on function public.ad_reward() to authenticated;
