// All the migrations, in order, as one SQL file for a new Supabase project (the Development one), with the
// Production project's address swapped for the new project's (the welcome email calls an Edge Function by address).
//   node scripts/dev-setup-sql.mjs <project-ref>      e.g. node scripts/dev-setup-sql.mjs abcdefghijklmnop
// writes supabase/dev-setup.sql: paste it into the new project's SQL Editor and run it once.
import fs from 'node:fs';
import path from 'node:path';

const PRODUCTION_REF = 'xlqnkglftspdowyucioc';
const ref = (process.argv[2] || '').trim();
if (!/^[a-z0-9]{20}$/.test(ref)) {
  console.error('Give the new project\'s ref: the 20 letters and digits in its address, https://<ref>.supabase.co');
  process.exit(1);
}
if (ref === PRODUCTION_REF) {
  console.error('That is the Production project: this is for the Development one.');
  process.exit(1);
}
const dir = new URL('../supabase/migrations/', import.meta.url);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const parts = files.map((f) => `-- ==================== ${f} ====================\n${fs.readFileSync(new URL(f, dir), 'utf8').split(PRODUCTION_REF).join(ref)}`);
const out = new URL('../supabase/dev-setup.sql', import.meta.url);
fs.writeFileSync(
  out,
  `-- Study Planner: the whole database for the Development project (${ref}), made by scripts/dev-setup-sql.mjs from\n-- ${files.length} migrations. Run once in that project's SQL Editor. Never run it on Production.\n\n${parts.join('\n\n')}\n`
);
console.log(`${path.basename(out.pathname)}: ${files.length} migrations for ${ref}`);
