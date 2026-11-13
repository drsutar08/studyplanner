# Free and Premium

What each plan includes, how the limits are enforced, and how to switch them on at launch.

## The plans

| | Free | Premium |
|---|---|---|
| Planning, focus, grades, attendance, quick add, voice | All | All |
| AI study helper | **Premium only** (none on Free) | 30 a day |
| Flashcards | 200 | Unlimited |
| Photos on tasks | 50 (each at most 1 MB) | 2,000 |
| Study groups you make | 1 (join any number) | 10 |
| Progress report | This week | Month, term and the PDF |
| Ads | A few, phone apps only (G-rated for under-18s) | None |

Prices: $2.99 a month or $19.99 a year, the same in every country. Google Play and the App Store charge each buyer
the local-currency equivalent of those dollar prices (they can't charge in dollars where the local currency is different).

## How it works

- **The database decides** (`supabase/migrations/20261112000000_premium.sql`). An account is Premium while it has a
  row in `subscriptions` that hasn't expired. The limits are checked there: the AI helper in `use_ai_quota()` (Premium only, 30 a day; the 20261115 migration; it refuses a Free account with `premium_required`, which the Edge Function turns into a 402), new
  flashcards by a trigger on `records`, photos by the storage upload rule, and new groups by the group-limit trigger.
  A changed app can't get past them.
- **The app shows it** (`src/plans.js`, `src/cloud/plan.js`): the Premium page (Settings → Account → Study Planner
  Premium), and a message with "See Premium" when a limit is reached. The longer progress report periods and the PDF
  are checked in the app only, since they use no server resources.
- **The master switch:** `app_config.limits_enforced`. While it's `false` (as now), everyone gets the Premium limits,
  so nobody hits a limit before Premium can be bought. **The AI helper ignores the switch:** it is Premium only from the moment the 20261115 migration is applied, so give testers Premium by hand (below).

## At launch, once Premium can be bought

Run this once in the SQL Editor:

```sql
select public.start_free_limits(90);
```

It gives every account that exists then **90 days of Premium** as a thank-you (it says how many), and turns the limits
on. New accounts after that start on Free.

## By hand

```sql
-- give an account Premium for a year (e.g. a tester or a school)
insert into public.subscriptions (user_id, source, product, expires_at)
select id, 'manual', 'tester', now() + interval '1 year' from auth.users where email = 'someone@example.com'
on conflict (user_id) do update set expires_at = excluded.expires_at, source = 'manual', updated_at = now();

-- who has Premium
select u.email, s.source, s.expires_at from public.subscriptions s join auth.users u on u.id = s.user_id order by s.expires_at;

-- turn the limits off again
update public.app_config set value = 'false'::jsonb where key = 'limits_enforced';
```

## Ads (Google AdMob)

Built in `src/ads.native.js` (the web has none) and `supabase/migrations/20261113000000_ads.sql`.

- **Who sees them** is decided by the server (`my_plan()` → `ads`, the 20261114 migration): every account that isn't
  Premium. `my_plan()` also says the age group: adults get non-personalised ads rated up to PG; under-18s and accounts
  with no age are tagged "under the age of consent", so Google serves only non-personalised, G-rated ads.
- **Where:** a native ad card under the quote on the Dashboard (`AdCard`, unit `androidNative`; nothing shows if no ad fills), a banner at the bottom of Progress, a full-screen (interstitial)
  ad at a natural break (a break starting after a focus session, a finished review closing; at most once every 10
  minutes; `useBreakAd`). The "watch an ad for one more AI request" reward is gone (`ad_reward()` returns -1).
- **How:** non-personalised only, Google's consent form where the law asks for one (UMP).

### Trying them before launch

Every account that isn't Premium sees ads now; test builds show Google's test ads. (The `ads_test_accounts` list from
the 20261113 migration isn't needed any more.) The old note, kept for reference:

```sql
update public.app_config set value = '["demo.arjun@example.com"]'::jsonb where key = 'ads_test_accounts';
```

Sign in with that account in a phone build: Google's **test ads** show (they earn nothing). Empty the list afterwards.

### Going live with your AdMob account

1. Create an AdMob account, add the Android and iOS apps, and create three ad units each: an **adaptive banner**, a
   **rewarded** ad and an **interstitial**. (Android: all three are set. iOS: still Google's test ids.)
2. In `app.json`:
   - in the `react-native-google-mobile-ads` plugin, set `androidAppId` and `iosAppId` (now Google's test app ids);
   - set `expo.extra.ads`: `androidBanner`, `androidRewarded`, `androidInterstitial` and the same three for `ios`. While these are empty
     the app uses Google's test units.
3. In AdMob: turn on **non-personalised ads** for the EU and UK and set up the **consent message** (Privacy &
   messaging); set the content rating to **PG**; and, later, **server-side verification** for the rewarded unit, so
   rewards can't be claimed without watching.
4. Make new store builds (native settings changed). Tell Google Play the app has ads, and that the AdMob SDK
   collects the device's advertising ID (data safety form).

## Still to build

1. **Buying:** built (RevenueCat): see `docs/subscriptions.md`. It needs the store products and RevenueCat keys to be
   switched on. On the web: Razorpay or Stripe, later.
2. **Ad reward verification** on the server (AdMob server-side verification), once the real AdMob account exists.
