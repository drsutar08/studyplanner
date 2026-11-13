# Quality checks

## On every push (GitHub Actions)

`.github/workflows/ci.yml` runs `npx expo lint` and `npm run test:unit` on every push and pull request.

The browser tests (`e2e/run.mjs`) sign up real accounts on the Supabase project, so they only run when started by
hand: **Actions → CI → Run workflow**, with "Also run the browser tests" ticked. They need two repository secrets
(Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | the same as in `.env.local` |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the same as in `.env.local` (never the secret / service_role key) |

Screenshots of any failures are attached to the run.

## Accessibility: `npm run test:a11y`

With the web app running (`npx expo start --web`), `e2e/a11y.mjs` signs up a throwaway account and runs axe
(WCAG 2.1 A and AA) on each screen and the new task sheet. It covers phone and desktop sizes, in light and dark
mode. The details go to `e2e/shots/a11y.json`, and the account is deleted at the end.

Rules the app follows because of it:

- Text colours come from the theme (`colors.ink`, `muted`, `accent`, …), and each one reads at 4.5:1 or more on
  the page, cards and soft panels in both modes. `npm run test:contrast` checks this.
- `colors.accent` is for text and icons. Use `colors.accentFill` behind white text, since dark mode needs a
  deeper blue there.
- A subject's colour used as text goes through `readable(color)`. Used behind white text, it goes through
  `solid(color)`. Both are in `src/theme.js`.
- `colors.faint` is only for things that don't need to be read: disabled days, unchecked boxes, chevrons.
- A checkbox says `aria-checked` even when it's false; React Native Web leaves it out otherwise.
- A control's label contains the words it shows ("25 min focus session" on a button that says "25 min"). If the
  words can't be kept together, leave the label out and let the visible text be the name.

## Performance: `node e2e/perf.mjs`

With the web app running, this measures the app with its sample data and again with a heavy year of data:
2,000 tasks, 150 exams, 12 subjects and 1,500 focus sessions. It covers cold start, each screen, ticking a task,
opening the new task sheet and typing. Each action reports the time, main-thread blocks over 50 ms and the busiest
app functions. `PERF_PHONE=1` measures at phone size. The results go to `e2e/shots/perf.json`.
