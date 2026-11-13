// Builds a sample backup with records in every part of the app, dated around today, for demos and testing.
// Load it in the app with Settings -> Restore from backup (it replaces the current data; Undo is offered).
//   npm run sample-data   ->  docs/sample-data/studyplanner-sample.json
// It is checked with the app's own parseBackup, so a restore keeps every record.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('..', import.meta.url);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sample-'));
fs.writeFileSync(path.join(tmp, 'attachments.mjs'), fs.readFileSync(new URL('src/attachments.js', root), 'utf8'));
fs.writeFileSync(path.join(tmp, 'backup.mjs'), fs.readFileSync(new URL('src/backup.js', root), 'utf8').replace("'./attachments'", "'./attachments.mjs'"));
fs.writeFileSync(path.join(tmp, 'sampleData.mjs'), fs.readFileSync(new URL('src/sampleData.js', root), 'utf8'));
const { buildBackup, parseBackup } = await import(pathToFileURL(path.join(tmp, 'backup.mjs')).href);
const { sampleData } = await import(pathToFileURL(path.join(tmp, 'sampleData.mjs')).href);

const now = new Date();
const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = keyOf(now);


const data = sampleData(now);
const { subjects, tasks, exams, recurring, classes, vacations, sessions } = data;
const text = buildBackup(data, { email: 'sample@studyplanner.app' });

// a restore must keep every record
const back = parseBackup(text);
if (back.error) throw new Error('parseBackup: ' + back.error);
for (const k of ['subjects', 'tasks', 'sessions', 'exams', 'recurring', 'classes', 'vacations']) {
  if (back.data[k].length !== data[k].length) throw new Error(`${k}: ${data[k].length} written, ${back.data[k].length} restored`);
}

const outDir = new URL('docs/sample-data/', root);
fs.mkdirSync(outDir, { recursive: true });
const out = new URL('studyplanner-sample.json', outDir);
fs.writeFileSync(out, text);
const lessons = classes.filter((c) => c.kind !== 'activity').length;
console.log(
  `docs/sample-data/studyplanner-sample.json (${today}): ${subjects.length} subjects, ${tasks.length} tasks (${recurring.length} repeating), ${exams.length} exams, ` +
    `${lessons} classes, ${classes.length - lessons} activities, ${vacations.length} breaks, ${sessions.length} focus sessions`
);
