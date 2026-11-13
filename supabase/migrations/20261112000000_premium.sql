-- Study Planner: Free and Premium.
-- An account is Premium while it has a subscription row that hasn't expired (from a store purchase, a gift or set by
-- hand); otherwise Free. The Free limits are enforced here, so a changed app can't get around them:
--   AI helper requests   Free 5 in 7 days      Premium 30 a day
--   flashcards           Free 200              Premium unlimited
--   photos on tasks      Free 50               Premium 2,000
--   study groups made    Free 1                Premium 10
-- A master switch (app_config.limits_enforced) keeps everyone on the Premium limits until payments work. To start
-- the limits at launch, run as the owner: select public.start_free_limits(90);  (every account that exists then
-- gets 90 days of Premium as a thank-you). Apply after 20261111000000_privacy.sql: SQL Editor -> paste -> Run.

-- ---------- the switch, and the plan ----------
create table if not exists public.app_config (key text primary key, value jsonb not null);
alter table public.app_config enable row level security;
drop policy if exists "config: read" on public.app_config;
create policy "config: read" on public.app_config for select to authenticated using (true);
revoke all on public.app_config from anon;
grant select on public.app_config to authenticated;
insert into public.app_config (key, value) values ('limits_enforced', 'false'::jsonb) on conflict (key) do nothing;

-- a row = Premium until expires_at (null: no end). Written by the server only: store webhooks, gifts, by hand.
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  source text not null check (source in ('gift', 'play', 'app_store', 'web', 'manual')),
  product text not null default '' check (char_length(product) <= 100),
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists "subscriptions: read own" on public.subscriptions;
create policy "subscriptions: read own" on public.subscriptions for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

create or replace function public.limits_on()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select value = 'true'::jsonb from public.app_config where key = 'limits_enforced'), false);
$$;

create or replace function public.is_premium(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.subscriptions s where s.user_id = uid and (s.expires_at is null or s.expires_at > now()));
$$;

-- the limit that applies to an account now: Premium's while the switch is off
create or replace function public.plan_limit(uid uuid, what text)
returns int language sql stable security definer set search_path = '' as $$
  select case
    when not public.limits_on() or public.is_premium(uid) then
      case what when 'ai' then 30 when 'cards' then 1000000 when 'photos' then 2000 when 'groups' then 10 end
    else
      case what when 'ai' then 5 when 'cards' then 200 when 'photos' then 50 when 'groups' then 1 end
  end;
$$;

-- what the app shows: { plan, enforced, expires_at, source, limits }
create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plan', case when public.is_premium(auth.uid()) then 'premium' else 'free' end,
    'enforced', public.limits_on(),
    'expires_at', (select s.expires_at from public.subscriptions s where s.user_id = auth.uid()),
    'source', (select s.source from public.subscriptions s where s.user_id = auth.uid()),
    'limits', jsonb_build_object(
      'ai', public.plan_limit(auth.uid(), 'ai'),
      'ai_period', case when public.limits_on() and not public.is_premium(auth.uid()) then 'week' else 'day' end,
      'cards', public.plan_limit(auth.uid(), 'cards'),
      'photos', public.plan_limit(auth.uid(), 'photos'),
      'groups', public.plan_limit(auth.uid(), 'groups')
    )
  );
$$;

revoke all on function public.limits_on(), public.is_premium(uuid), public.plan_limit(uuid, text), public.my_plan() from public, anon;
grant execute on function public.limits_on(), public.my_plan() to authenticated;

-- ---------- AI helper: per plan (Free: 5 in the last 7 days; Premium: 30 a day) ----------
-- (daily_limit is ignored now; it stays so the Edge Function's call is unchanged)
create or replace function public.use_ai_quota(daily_limit int default 30)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  free boolean;
  cap int;
  used int;
begin
  if auth.uid() is null then return false; end if;
  free := public.limits_on() and not public.is_premium(auth.uid());
  cap := public.plan_limit(auth.uid(), 'ai');
  insert into public.ai_usage (user_id, day, requests) values (auth.uid(), today, 0) on conflict do nothing;
  perform 1 from public.ai_usage where user_id = auth.uid() and day = today for update;
  if free then
    select coalesce(sum(requests), 0) into used from public.ai_usage where user_id = auth.uid() and day > today - 7;
  else
    select requests into used from public.ai_usage where user_id = auth.uid() and day = today;
  end if;
  if used >= cap then return false; end if;
  update public.ai_usage set requests = requests + 1 where user_id = auth.uid() and day = today;
  return true;
end;
$$;
revoke all on function public.use_ai_quota(int) from public, anon;
grant execute on function public.use_ai_quota(int) to authenticated;

-- ---------- flashcards: a new card past the limit is refused ----------
create or replace function public.records_card_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'card' and not new.deleted
     and (select count(*) from public.records r where r.user_id = new.user_id and r.kind = 'card' and not r.deleted) >= public.plan_limit(new.user_id, 'cards') then
    raise exception 'card_limit' using errcode = 'P0001', hint = 'The plan''s flashcard limit is reached';
  end if;
  return new;
end;
$$;
drop trigger if exists records_card_limit on public.records;
create trigger records_card_limit before insert on public.records for each row execute function public.records_card_limit();

-- ---------- photos: a new photo past the limit is refused ----------
create or replace function public.photo_count(uid uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from storage.objects o where o.bucket_id = 'attachments' and (storage.foldername(o.name))[1] = uid::text;
$$;
revoke all on function public.photo_count(uuid) from public, anon;
grant execute on function public.photo_count(uuid) to authenticated;

drop policy if exists "attachments: add own" on storage.objects;
create policy "attachments: add own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.photo_count((select auth.uid())) < public.plan_limit((select auth.uid()), 'photos')
  );

-- ---------- study groups: how many an account can make ----------
create or replace function public.study_groups_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.study_groups g where g.owner = new.owner) >= public.plan_limit(new.owner, 'groups') then
    raise exception 'group_limit' using errcode = 'P0001', hint = 'The plan''s study group limit is reached';
  end if;
  return new;
end;
$$;

-- ---------- starting the limits at launch (owner only) ----------
-- Every account that exists now gets gift_days of Premium (unless it has a longer subscription), then the switch is
-- turned on. Run once: select public.start_free_limits(90);
create or replace function public.start_free_limits(gift_days int default 90)
returns int language plpgsql security definer set search_path = '' as $$
declare
  gifted int;
begin
  insert into public.subscriptions (user_id, source, product, expires_at)
    select u.id, 'gift', 'launch', now() + make_interval(days => gift_days) from auth.users u
    on conflict (user_id) do update set expires_at = greatest(public.subscriptions.expires_at, excluded.expires_at), updated_at = now()
    where public.subscriptions.expires_at is not null;
  get diagnostics gifted = row_count;
  update public.app_config set value = 'true'::jsonb where key = 'limits_enforced';
  return gifted;
end;
$$;
revoke all on function public.start_free_limits(int) from public, anon, authenticated;
