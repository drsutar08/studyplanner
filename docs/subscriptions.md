# Subscriptions: buying Premium

How students buy Premium in the phone apps, and how to set it up. The plans and limits are in `docs/premium.md`.

## How it works

1. **The app** (`src/purchases.native.js`, RevenueCat's `react-native-purchases`) signs in to RevenueCat with the
   Study Planner account id, shows the store's plans and prices on the Premium page (Settings → Study Planner
   Premium), and buys through **Google Play Billing** or Apple's **in-app purchase**.
2. **RevenueCat** tells the server about every purchase, renewal, cancellation and expiry: the
   `revenuecat-webhook` Edge Function (`supabase/functions/revenuecat-webhook`) writes `public.subscriptions`.
3. **The server decides** who is Premium, from that table: limits, ads and the Premium page all follow. The app
   can't make itself Premium.

The web has no buying yet: Razorpay or Stripe later.

## Setup

### 1. The products in the stores

- **Google Play Console** (needs the $25 developer account): Monetize → Products → **Subscriptions** → create
  `premium` with two base plans:
  - `monthly`: $2.99 / month, auto-renewing;
  - `yearly`: $19.99 / year, auto-renewing.

  Leave the other countries on Play's conversion of the dollar price (don't set separate local prices). Play only lets you sell after a build has been
  uploaded to a testing track.
- **App Store Connect** (needs the Apple Developer account): a subscription group "Premium" with
  `premium_monthly` and `premium_yearly`.

### 2. RevenueCat (free up to about $2.5k a month)

1. Create a project at app.revenuecat.com. Add the apps:
   - **Google Play**, package `com.studyly.studyplanner.app`, with a Google service account key (RevenueCat's guide
     walks through it);
   - **App Store**, bundle `com.studyly.studyplanner.app`, later;
   - **Test Store**, for the Development app. It needs no store account, and its purchases are free test
     purchases.
2. Products → import the store products. **Entitlements** → create `premium` and attach all the Premium products.
3. **Offerings** → the default offering with two packages: **Monthly** and **Annual**, pointing at the products.
4. **API keys** (Project settings → API keys): each app's **public SDK key**. These are meant to be in the app. Send
   them to me (never a secret key):
   - Google Play app: `androidKey`;
   - App Store app: `iosKey`;
   - Test Store: `devAndroidKey` (and `devIosKey`), for StudyPlanner Dev.

   They go in `app.json` → `expo.extra.revenuecat`.

   RevenueCat accepts the Test Store key only in a **debuggable** build. Otherwise the app shows a "Wrong API Key"
   alert and closes. So the Development APK is built debuggable (`plugins/with-debuggable-release.js`, added only
   for the Development variant in `app.config.js`). The Production app must use the Google Play / App Store keys.

### 3. The webhook (in each Supabase project)

1. Deploy the `revenuecat-webhook` function with **Verify JWT off**: RevenueCat can't sign in, so the secret below is
   the check.
2. Make a long random secret, add it as the function secret **`REVENUECAT_WEBHOOK_SECRET`** in Supabase.
3. In RevenueCat: Integrations → **Webhooks** → add:
   - URL `https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook`;
   - Authorization header: the same secret.

   Production: the Google Play / App Store apps. Development: the Test Store app, pointing at the Development
   project's function.
4. RevenueCat's "Send test event" should get `200 {"ok":true,"ignored":"test"}`.

### 4. Try it

1. The Development app (Test Store key): Premium page → pick a plan → buy (Test Store purchases are free) → "Payment
   received: turning Premium on…" → "Welcome to Premium". The Premium row in Settings then says "You have
   Premium".
2. Production: Google Play's **license testers** (Play Console → Settings → License testing) can buy for free on
   an internal testing build.
3. Launch: `select public.start_free_limits(90);` (`docs/premium.md`) turns the Free limits on.

## Events and what they do

| RevenueCat event | Effect on `subscriptions` |
|---|---|
| Initial purchase, renewal, product change, un-cancellation, extension, billing issue (grace) | Premium until the event's expiry (a longer gift keeps its date) |
| Cancellation | Stays Premium until the end of the paid period |
| Expiration | Premium ends (a gift or a hand-set Premium is left alone) |
| Test | Nothing (answers OK) |
