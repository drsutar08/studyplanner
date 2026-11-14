# Classes: teachers share study materials with their students (plan)

Status: **Phase 1 built 2026-11-14** (not yet tried on a phone). Called **Classrooms** in the app (Menu → Classrooms),
so it isn't confused with timetable classes. Its own tables, not study groups: `20261117000000_classrooms.sql`.

Code: `src/classrooms.js` (logic, tested by `e2e/classrooms.test.mjs`), `src/cloud/classrooms.js` (server calls, live
alerts), `src/components/Classrooms.js` and `src/screens/ClassroomsScreen.js` (the page), `src/materialFile(.native).js` (upload and open files).

Phase 1 limits to know: "New material" and "join request" alerts are in-app messages while the app is open (no push
notification when it's closed yet). Classrooms aren't in the nightly backup. Files are opened by downloading them and
handing them to the phone's PDF, Office or photo app.

## Decisions

| Question | Decision |
|---|---|
| Who can create a class | Any account (like study groups). Safety comes from approval-only joining and Report. |
| How students join | Class code or link leads to a **join request**; the teacher approves or declines. The teacher can remove students and reset the code. |
| Free / Premium | Students: always free to join and read. Teachers on Free: 1 class, 200 MB of files. Premium: 10 classes, 5 GB. Numbers go through `plan_limit()` behind `limits_enforced`. |
| Phase 1 materials | PDF, images (JPG/PNG/WebP), Office files (Word, PowerPoint, Excel), links (YouTube, Drive, websites) and text notes. Max 20 MB per file. |

## How it works

- **Classroom** (`classrooms`): name, subject, the teacher's name and an 8-letter join code (no 0/O, 1/I/L).
- **Membership** (`classroom_members`) has a `status`: `pending` | `approved`. Only `approved` students pass
  `is_classroom_student()`, so pending or removed students see nothing. Students list their classrooms through
  `my_classrooms()`, which never returns the code to them.
- **Materials** (`classroom_materials`): kind (`file` | `link` | `note`), title, description, pinned, file path, size,
  type, url. Teacher writes; approved students read. Reports go to `classroom_reports` (read them in the SQL editor).
- **Files** live in a private `materials` bucket at `materials/<class id>/<material id>.<ext>`. Storage policies:
  only the class owner can upload or delete, and only approved members can read. The app opens files with signed
  URLs that expire after 1 hour, so a forwarded link stops working.
- **Storage limit** is checked by the bucket's upload rule: the teacher's files in the bucket vs.
  `plan_limit(uid, 'storage_mb')`. `classroom_quota()` tells the app how much is used.
- **Alerts**: "New in Physics 10-B: …" for approved students, "Asha wants to join…" for the teacher and "You're in!"
  when approved (in-app, live). A "New" badge until the student opens the classroom (kept on the device).

## Privacy and safety (students may be under 18)

- Students see only the teacher's name and the materials, never other students' names or emails.
- The teacher sees students' display names, not their tasks, grades or emails.
- Report a material or a classroom (`20261118000000_classroom_reports.sql`). The teacher sees reports about their
  materials in the classroom's **Reports** tab, without the reporter's name, and can resolve them or delete the
  material. Studyly admins (emails in `app_config.report_admins`, first `drsutar08@gmail.com`) see every report with
  the reporter under Menu → Classrooms → **Reports to review**, and can resolve, remove the material or delete
  the classroom. At most 20 reports per person a day. `20261119000000_classroom_reports_fix.sql` fills in reports sent
  before 20261118 was applied (they had no material title, so the teacher didn't see them).
- Update before release: privacy policy, terms (teacher responsibility for uploaded content and copyright),
  the Privacy & data page, and the Play data-safety form (names shared with teachers; files stored).

## Phases

| Phase | Scope |
|---|---|
| 1 | Create a class; request, approve, decline and remove students; reset code; materials (files, links, notes); signed-URL viewing; notifications and "New" badge; limits; Report |
| 2 | Topics/folders, "seen by" list, link a material to a task or exam, save for offline |
| 3 | Web teacher dashboard for bulk uploads, roster import by email (auto-approve) |

## Steps on the owner's side

1. Run the new migration in the SQL editor: Development first, then Production.
2. Update the legal pages and store forms (above).
3. Make a new build (the document picker, `expo-document-picker`, is a native module).
4. Update the feature guide (new "Classes" section with screenshots).
