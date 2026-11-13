// The web app on THIS computer, against the PRODUCTION Supabase project, on port 8083 (npm run web:prod).
// npx expo start (port 8081) is Development; this one reads .env.local (Production) and passes it in the environment,
// which wins over .env.development.local. The two ports are separate sites, so each keeps its own sign-in and data.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs
    .readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
if (!/xlqnkglftspdowyucioc/.test(env.EXPO_PUBLIC_SUPABASE_URL || '')) {
  console.error('.env.local should hold the Production project (xlqnkglftspdowyucioc): not starting.');
  process.exit(1);
}
console.log('Starting the web app on http://localhost:8083 against PRODUCTION (real accounts and data).');
const child = spawn('npx', ['expo', 'start', '--web', '--port', '8083', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ...env },
});
child.on('exit', (code) => process.exit(code ?? 0));
