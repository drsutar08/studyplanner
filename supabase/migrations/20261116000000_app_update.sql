-- Study Planner: ask people to update the app. app_config.app_update holds, for each platform, the build number
-- (Android versionCode / iOS buildNumber) a phone must have:
--   min_build     older builds are blocked by an "Update required" screen until the person updates
--   latest_build  older builds get a dismissible "Update available" prompt (once per new build)
-- 0 turns a check off. Anyone can read it (also signed out: the check runs before sign-in). Apply after
-- 20261112000000_premium.sql (which creates app_config).
--
-- After a new release is live on Google Play, run for example:
--   update public.app_config set value = jsonb_set(value, '{android,latest_build}', '7') where key = 'app_update';
--   update public.app_config set value = jsonb_set(value, '{android,min_build}', '7') where key = 'app_update';

insert into public.app_config (key, value)
values ('app_update', '{"android": {"min_build": 0, "latest_build": 0}, "ios": {"min_build": 0, "latest_build": 0}}'::jsonb)
on conflict (key) do nothing;

create or replace function public.app_update_info()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select c.value from public.app_config c where c.key = 'app_update'), '{}'::jsonb);
$$;
revoke all on function public.app_update_info() from public;
grant execute on function public.app_update_info() to anon, authenticated;
