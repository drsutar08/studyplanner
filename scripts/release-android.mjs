// Production Android build that raises the app version first: 1.0.0 -> 1.0.1 (patch) in app.json and package.json.
// EAS raises the Android versionCode itself (appVersionSource: remote + autoIncrement).
// Usage: npm run release:android            (patch bump)
//        npm run release:android -- minor   (1.0.x -> 1.1.0)   |   -- major   |   -- none (build only)
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const kind = process.argv[2] || 'patch';
const appPath = new URL('../app.json', import.meta.url);
const pkgPath = new URL('../package.json', import.meta.url);
const app = readFileSync(appPath, 'utf8');
const [maj, min, pat] = JSON.parse(app).expo.version.split('.').map(Number);
const next = { patch: [maj, min, pat + 1], minor: [maj, min + 1, 0], major: [maj + 1, 0, 0], none: [maj, min, pat] }[kind];
if (!next) throw new Error('Use patch, minor, major or none');
const version = next.join('.');
const old = `${maj}.${min}.${pat}`;
if (version !== old) {
  writeFileSync(appPath, app.replace(`"version": "${old}"`, `"version": "${version}"`));
  const pkg = readFileSync(pkgPath, 'utf8');
  writeFileSync(pkgPath, pkg.replace(`"version": "${old}"`, `"version": "${version}"`));
}
console.log(`Version ${old} -> ${version}`);
const r = spawnSync('npx', ['eas-cli@latest', 'build', '-p', 'android', '--profile', 'production', '--non-interactive', '--no-wait'], { stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
