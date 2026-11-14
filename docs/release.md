# Building StudyPlanner for testers (Expo EAS)

This gets an installable app onto real phones so UAT does not depend on Expo Go. For production releases (store builds,
over-the-air updates, submitting) see [production-release.md](production-release.md).
Everything below is already configured in `app.json` and `eas.json`; the steps that need your Expo or Apple account are marked **(you)**.

## 0. Before the first build

| Step | Detail |
|---|---|
| **(you)** Create a free Expo account | https://expo.dev/signup |
| **(you)** Log in | `npx eas-cli login` |
| **(you)** Link the project | `npx eas-cli init` (adds the EAS project id to `app.json`) |
| **(you)** Decide the app identifier | Currently `com.studyly.studyplanner.app` (Android `package` and iOS `bundleIdentifier` in `app.json`). **Change it now if you want something else, e.g. your company's reverse domain. It cannot be changed after the app is published.** |

## 1. Android test build (easiest, no store account needed)

```
npm run build:dev:android
```

EAS builds an APK in the cloud (about 10-15 minutes) and gives you a link and QR code. Testers open it on an Android phone, allow "install unknown apps", and install. No Google Play account is needed.

## 2. iOS test build

iOS needs a paid Apple Developer account (US$99/year) **(you)**.

- Quick test on named phones: `npx eas-cli device:create` (each tester registers their iPhone), then `npm run build:dev:ios`.
- Wider testing: `npm run build:prod:ios`, then `npx eas-cli submit --platform ios` to send it to TestFlight.

## 3. Store releases

- Android: `npm run build:prod:android` makes an `.aab`; upload it in Google Play Console (a one-off US$25 developer fee).
- You will need: a privacy policy URL ([privacy-policy.md](privacy-policy.md), published), app icon (already in `assets`), screenshots, a content rating and the "data safety" answers. The app syncs to Supabase: answer the data safety form from the privacy policy (account details, study data, photos, error reports; encrypted in transit; deletable in the app).

## 4. Versioning

- `version` in `app.json` is what users see (1.0.0).
- Build numbers (`versionCode` / `buildNumber`) go up by themselves on production builds.

### Asking people to update (forced update)

The app checks `app_config.app_update` on Supabase at launch and whenever it comes back to the front
(migration `20261116000000_app_update.sql`, popup in `src/components/UpdateGate.js`). Numbers are **build numbers**
(the Android versionCode shown in Play Console, e.g. `1.0.1 (6)` is build 6), not the `1.0.1` version name.

| Setting | Effect on phones with an older build |
|---|---|
| `latest_build` | "Update available" popup with **Later**; shown again only for a newer build |
| `min_build` | "Update required" screen that can't be closed; only **Update now** (opens Google Play) |

After a release is **live on Google Play** (not before, or people are sent to a page with no update yet), run in the
Supabase SQL editor, Development first, then Production:

```sql
-- offer build 7 to everyone
update public.app_config set value = jsonb_set(value, '{android,latest_build}', '7') where key = 'app_update';
-- and, for a release everyone must have, block older builds
update public.app_config set value = jsonb_set(value, '{android,min_build}', '7') where key = 'app_update';
```

Set a value back to `0` to turn that check off. Offline phones, the web app and Expo Go are never blocked. Builds made
before this feature (build 6 and older) don't have the check, so they can't be forced.

## 5. Permissions the Android app asks for

Internet, notifications (Android 13+ shows a prompt when the user turns on phone notifications in Settings), vibration (session end), wake lock (keep the screen on while focusing) and the microphone (voice quick add, asked the first time the mic is tapped). Camera, storage and "draw over other apps" permissions are removed on purpose.

## 6. Known limits to tell testers

- **Data is in the cloud.** It syncs to the account (Supabase), so a lost phone loses nothing; it also works offline. Settings > Privacy & data > Save a copy of your data saves a file.
- **Reminder timing on Android.** Android may delay scheduled alerts by up to a few minutes to save battery, so a "session finished" or "due today" notification may not arrive on the exact second.
- **Four languages:** English, Hindi, Odia and Spanish (Settings > Appearance).

## 7. Checks to run before each build

```
npm run doctor        # Expo project health check (should say 20/20 passed)
npm run test:unit     # logic tests, no phone or browser needed
npm start -- --web    # then, in another terminal:  npm run e2e
```

Then go through `docs/DEVICE_TEST_CHECKLIST.md` on at least one Android and one iPhone.
