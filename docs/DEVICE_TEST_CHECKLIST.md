# Device test checklist (real phones)

The automated tests run in a desktop browser. These are the things only a real phone can prove.
Run on at least one Android and one iPhone, ideally one older and one newer. Tick each box, and write down the phone model and OS version.

Phone: ______________________   OS version: ______   App build: ______   Tester: ______   Date: ______

## 1. Install and first launch
- [ ] App installs and opens; the splash screen shows, then the intro slides
- [ ] **Swipe** left and right between the intro slides with a finger (this could not be automated)
- [ ] Skip works; "Get started" goes to login
- [ ] App icon and name look right on the home screen

## 2. Account
- [ ] Create an account; the keyboard does not cover the buttons
- [ ] The Next key on the keyboard moves between fields; Go submits
- [ ] Wrong password shows the red message and the card shakes
- [ ] Close the app completely and reopen: you are still signed in
- [ ] Sign out lands on the login screen

## 3. Tasks
- [ ] Add a task from the round + button; the sheet slides up above the keyboard
- [ ] **Swipe a task right** (completes) and **left** (deletes, Undo appears); a gentle vertical scroll does not trigger a swipe
- [ ] Tap a task to edit it; long-press deletes with Undo
- [ ] Repeating task: create "Every day", check copies appear on the Calendar
- [ ] The floating bottom bar is not hidden by the gesture bar or home indicator; the last task in a long list is reachable

## 4. Focus timer and notifications
- [ ] Settings > Phone notifications > turn on: the phone asks permission; allow it
- [ ] Create a task with a **5 minute** estimate, open Focus, pick it (timer shows 05:00), press play
- [ ] Lock the phone / switch to another app: a "Focus session complete" notification arrives at about 5 minutes
- [ ] Open Focus again while a session runs: the screen stays on (Settings > Keep screen on)
- [ ] Phone vibrates when a session finishes with the app open
- [ ] Pause, then reset: no stray notification arrives later
- [ ] Daily study reminder: set it to the next hour and confirm it arrives
- [ ] Add an exam for tomorrow: an "Exam tomorrow" notification is scheduled (arrives 6 PM the day before)

## 5. Calendar, plan and data
- [ ] Calendar months, day selection, exam cards (swipe sideways) feel smooth
- [ ] Smart plan: change time with + and -, mark done, "Start first task" opens Focus with that task
- [ ] Settings > Export backup opens the phone's share sheet; save/send it
- [ ] Reset study data, then Restore from backup by pasting the text; Undo works

## 6. Look and accessibility
- [ ] Rotate the phone: the app stays portrait
- [ ] Phone font size set to the largest: nothing is cut off or overlapping on Dashboard, Focus, Calendar
- [ ] Turn on TalkBack (Android) or VoiceOver (iPhone): tabs, buttons and the task tick boxes are announced with sensible names; a task offers "Mark as done" and "Delete" actions
- [ ] Phone set to a non-English language: dates and weekday letters follow it
- [ ] Phone in dark mode: the app stays light and readable
- [ ] No text is clipped on a small screen (about 5 inch) or behind a notch/camera cut-out

## 7. Robustness
- [ ] Airplane mode: everything still works (no network is needed)
- [ ] Add about 50 tasks quickly: scrolling stays smooth
- [ ] Low battery / battery saver on: notifications still arrive (note the delay)
- [ ] Delete the account: the app returns to login and the data is gone

## Result
Pass / Fail: ______   Issues found (number, short description, screenshot): 
