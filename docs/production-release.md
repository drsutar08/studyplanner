# Releasing Study Planner

How to build, test and ship. The full checklist of what has to be ready first (accounts, legal, store listings) is
in the production release checklist page; this file covers the commands.

## Before every release

```bash
npm run test:unit                 # unit tests
node e2e/run.mjs                  # browser tests (the web dev server must be running on :8081)
npx expo lint && npx tsc --noEmit
npx expo-doctor                   # 20/20
```

## Versions

- `expo.version` in `app.json` (now **1.0.0**) is the version people see. EAS sets the build numbers itself
  (`appVersionSource: remote`, with `autoIncrement` on production builds).
- **Over-the-air updates follow the version** (`runtimeVersion.policy: appVersion`). An update reaches every build with
  the same `version`. So:
  - a JavaScript-only change (screens, text, styles): publish an update, with no new store build;
  - a native change (a new native package, a config plugin, permissions, icons, `app.json` native settings): raise
    `version` (1.0.0 → 1.1.0) and make new store builds.

## Builds

| Profile | Use | Command |
|---|---|---|
| `development` | StudyPlanner Dev: an APK for testing, on the Development Supabase project (docs/environments.md) | `npm run build:dev:android` |
| `production` | The Play Store (AAB) and App Store | `npx eas-cli@latest build -p android --profile production` (and `-p ios`) |

Each build gets the Supabase address and publishable key from the EAS environment of the same name, because
`.env.local` isn't uploaded. The secret key and database password are never in the app.

## Submitting

```bash
npx eas-cli@latest submit -p android --profile production   # needs a Google Play service account key, once
npx eas-cli@latest submit -p ios --profile production       # needs an Apple Developer account
```

## Over-the-air updates

```bash
# a JavaScript fix to everyone on the production version
npx eas-cli@latest update --channel production --environment production --message "Fix: …"
# try it on the testing builds first
npx eas-cli@latest update --channel development --environment development --message "…"
```

An installed app picks the update up the next time it starts, then shows it after one more restart. To roll back,
republish the previous update from the EAS dashboard (Updates → the update → Republish).

## After a release

- Check `client_errors` in Supabase daily for the first week (see `docs/reliability.md`).
- Watch the Supabase usage page and Anthropic spending. Set a monthly spend limit in the Anthropic console.
