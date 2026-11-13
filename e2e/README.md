# End-to-end tests

Browser tests that drive the web build of the app (react-native-web) with Playwright, in Microsoft Edge.
They cover sign-up/login, intro, dashboard, add task, focus timer, subjects, progress, profile,
settings, account deletion, per-account data isolation, the calendar, exam countdowns,
repeating tasks, editing exams and repeats, the smart daily plan, edit task and undo, swipe actions, filters and
search, backup and restore, week start, replaying the intro, accessibility roles and German date formats.
`npm run test:backup` runs the backup parser's unit tests, and `npm run test:planner` runs the
planner's unit tests (no browser needed).

## Run

1. Start the app: `npx expo start --web --port 8081`
2. In another terminal:
   - `npm run e2e`        full suite (about 3 minutes)
   - `npm run e2e:intro`  splash + intro slides

Set `APP_URL` to test another address, e.g. `APP_URL=http://localhost:8082 npm run e2e`.
Needs Microsoft Edge installed (it is used through Playwright's `msedge` channel).
Results go to `e2e/results.json`; failing steps save a screenshot in `e2e/shots/`.

## What these do not cover

They run in a desktop browser, so these still need a manual pass on a real phone:
phone notifications, vibration, the share sheet, the on-screen keyboard, safe areas / notches,
the Android back button, touch swiping on the intro slides, and performance.
