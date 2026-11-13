-- Study Planner: ads for every account that isn't Premium (the owner's decision, 3 November 2026), in the phone apps.
-- my_plan() also says the account's age group, so the app can ask Google for the right ads: adults get
-- non-personalised ads rated up to PG; under-18s and accounts with no age recorded are tagged "under the age of
-- consent" (Google then serves only non-personalised ads, rated G). Apply after 20261113000000_ads.sql.

create or replace function public.shows_ads(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select uid is not null and not public.is_premium(uid);
$$;
revoke all on function public.shows_ads(uuid) from public, anon, authenticated;

-- 'adult' | 'minor' | 'unknown': what the account said at sign-up (older accounts said nothing)
create or replace function public.age_group(uid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select case u.raw_user_meta_data -> 'consent' ->> 'age' when 'adult' then 'adult' when 'minor' then 'minor' end from auth.users u where u.id = uid), 'unknown');
$$;
revoke all on function public.age_group(uuid) from public, anon, authenticated;

create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plan', case when public.is_premium(auth.uid()) then 'premium' else 'free' end,
    'enforced', public.limits_on(),
    'expires_at', (select s.expires_at from public.subscriptions s where s.user_id = auth.uid()),
    'source', (select s.source from public.subscriptions s where s.user_id = auth.uid()),
    'ads', public.shows_ads(auth.uid()),
    'age', public.age_group(auth.uid()),
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
