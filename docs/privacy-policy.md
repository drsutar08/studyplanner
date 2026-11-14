# Studyly privacy policy

*Last updated: 10 November 2026*

Studyly helps students plan and track their studies: tasks, exams, classes, focus sessions and progress. This
policy explains what the app keeps, why, who can see it, how long it's kept, and how to remove it. The same points
are in the app under **Settings → Privacy & data**.

> **Before publishing:** app stores need a public link to this policy, for example this file on GitHub or a page on
> your own site. Set that link as `expo.extra.legal.privacyUrl` in `app.json`, so the sign-up screen opens it.

## What the app keeps

| What | Why | Where |
|---|---|---|
| **Your account**: email address, name, school and, if you choose one, a profile photo | To sign you in and show your name | Supabase (database and sign-in) |
| **Premium**: your plan, through which store it was bought, and until when (never card or payment details) | To give Premium to the right account | Supabase, and RevenueCat |
| **Your study data**: tasks, steps, notes, exams and scores, classes and attendance, breaks, focus sessions, goals, flashcards, achievements and settings | To keep it on all your devices | Supabase database, locked to your account |
| **Photos you attach** to tasks | To show them on all your devices | Supabase storage, locked to your account |
| **A copy on each device** where you sign in | So the app works offline | That device; signing out removes it |
| **Study groups you make or join**: the group, its timetable and its board posts and replies | To share them with the group | Supabase database |
| **Classrooms you teach or join**: the classroom, its materials (files, links, notes), each student's name and whether the teacher approved them, and reports you send | To share materials with the teacher's approved students | Supabase database and storage |
| **AI helper use**: how many times you asked today | The daily limit of 30 | Supabase database |
| **Error reports**: what went wrong, the app version and the kind of device | To find and fix problems | Supabase database |

Each row in the database is locked to its account by database rules. No other user can read your data, and other
accounts can't change it.

## What's shared, and only when you choose

- **Study groups.** When you share your timetable with a group, the group's members see your classes, exam dates and
  breaks. Posts and replies on a group's board show your name to the group.
- **Studying now.** While your focus timer runs, the people in your study groups see your name, the subject and when
  the session ends. They never see the task. This isn't stored: it disappears when the timer stops or the app closes.
  You can turn it off in **Settings → Study groups**.
- **Classrooms.** When you ask to join a classroom, its teacher sees your name (never your email, tasks or grades)
  and decides whether to approve you. Students in a classroom never see each other. A teacher's name and the
  materials they share are seen only by the students they approved. A report you send about a classroom goes to
  the Studyly team, not to the teacher.
- **Progress reports** go only to the person you send them to, by the app you choose to share with.
- **The AI helper**, only when you use it. See below.

## The AI helper

The AI helper uses Claude, an AI made by Anthropic. Only when you ask it, Studyly's server sends Anthropic:
- the notes you paste, for flashcards or a quiz;
- or, for "What should I study now?", a short summary: task titles, due dates, exam dates, grades, attendance and focus
  times.

Your notes in tasks, your photos and your account details are never sent. The answer isn't stored on Studyly's
server, which keeps only how many times you asked that day. Anthropic handles what it receives under its own
[privacy policy](https://www.anthropic.com/legal/privacy).

## Who processes data for the app

| Service | What for |
|---|---|
| **Supabase** | The database, sign-in, photo storage and the server functions |
| **Anthropic** | The AI helper, only when you use it |
| **Google (Gmail)** | Sending sign-in and welcome emails |
| **Expo** | Building and delivering the app. Expo doesn't receive your study data |
| **RevenueCat** | Premium purchases: which plan was bought, through which store, and until when. Payment details stay with Google Play or the App Store |
| **Google AdMob** | Ads, for accounts without Premium, in the Android and iPhone apps (see [Ads](#ads)) |

## Ads

- **Who sees them:** every account that doesn't have **Premium**, in the Android and iPhone apps. **Premium** accounts see no
  ads, and the web app has none.
- **Students under 18:** accounts that said at sign-up they're under 18, and older accounts with no age recorded,
  are marked to Google as **under the age of consent**. Google then shows them only non-personalised ads rated for
  general audiences (G). Adults get non-personalised ads rated up to PG.
- **Where:** a banner under the quote on the Dashboard and one at the bottom of Progress, and now and then a
  full-screen ad at a natural break (when a break starts after a focus session, or when a finished flashcard review
  closes), at most once every 10 minutes. Never during a focus session, a review or a quiz.
- **Never personalised.** The app asks Google AdMob for non-personalised ads only, for everyone. Google
  still receives what any ad needs: the device type, the device's advertising ID, an approximate location from the IP
  address, and how the ad was
  seen, to show it, limit how often, and prevent fraud. Your study data, notes and account details are never sent.
- **Consent:** where the law requires it (for example in the EU and UK), Google's consent form asks first.
- Google's use of that data is described in its [privacy policy](https://policies.google.com/privacy) and
  [how Google uses information from apps](https://policies.google.com/technologies/partner-sites).

## What the app never does

- No personalised ads for anyone, and only general-audience (G) ads for anyone under 18.
- No analytics or tracking tools.
- No selling or renting of personal data, and no sharing with advertisers or data brokers.

Reminders and notifications are scheduled on your device. They aren't sent from a server.

## How long it's kept

- **Your data:** until you delete it or delete your account.
- **Nightly backups:** each copy is kept for 14 days, so the service can recover from a mistake or a failure.
- **Error reports:** deleted after 30 days.
- **AI usage counts:** deleted after 30 days.

## Your choices and rights

Everything is in the app:
- **See and change** your data: it's all in the app, and your name, school and photo are in your profile.
- **Get a copy:** Settings → Privacy & data → *Save a copy of your data*, or Settings → Data → Export. This saves one
  file with everything, which can also be restored.
- **Stop sharing:** leave a study group or a classroom, stop sharing a group you made, delete a classroom you teach,
  or turn off *Show my focus sessions to my groups*.
- **Delete your account:** Settings → Privacy & data → *Delete my account*. This removes your account and everything
  in it straight away: your study data, photos, groups you own (with their boards), classrooms you teach (with their materials and files), your classroom requests, your replies, error reports and
  your copies in the backups. There are a few seconds to undo it in the app first.

Depending on where you live, you may have more rights over your data, such as asking for a copy or for it to be
deleted. The options above cover those. You can also contact us.

## Children

Studyly is a study tool for students. At sign-up everyone chooses their age group. Anyone under 18 must
confirm that a parent or guardian knows about it and agrees, and everyone agrees to the terms of use and this
policy. The account keeps that choice, with the date and the version of the terms agreed to. A parent or guardian
can ask for a child's account and data to be deleted using the contact below.

## Security

- **In transit:** data travels encrypted (HTTPS).
- **Access:** each account can reach only its own data, enforced by the database.
- **Passwords:** handled by Supabase's sign-in service and never stored by the app.

## Changes

If this policy changes, the date at the top changes, and the app's Privacy & data page is updated to match.

## Contact

Questions or requests about your data: **drsutar08@gmail.com**.
