// Shared words used across the app. Area-specific text lives in the other files in this folder.
export default {
  common: {
    today: 'Today',
    tomorrow: 'Tomorrow',
    yesterday: 'Yesterday',
    inDays: { one: 'in {count} day', other: 'in {count} days' },
    daysAgo: { one: '{count} day ago', other: '{count} days ago' },
    save: 'Save',
    saveChanges: 'Save changes',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    undo: 'Undo',
    close: 'Close',
    closeSheet: 'Close sheet',
    optional: 'Optional',
    none: 'None',
    noSubject: 'No subject',
    minutes: '{count} min',
  },
  days: {
    long: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    short: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    narrow: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  },
  // Home-screen widget (shown outside the app, so keep it short)
  // Long-press shortcuts on the app icon (appShortcutLinks.js)
  appShortcuts: {
    newTask: 'New task',
    focus: 'Start focus',
    cards: 'Review flashcards',
  },
  widget: {
    nextClass: 'NEXT CLASS',
    empty: 'No more classes today',
    now: 'NOW',
    online: 'Online',
    dayTime: '{day} · {time}',
    // the "Today" widget
    today: 'TODAY',
    tasksLeft: { one: '1 task left', other: '{count} tasks left' },
    allDone: 'All done for today',
    overdue: { one: '1 overdue', other: '{count} overdue' },
    focus: '{done} / {goal} min focus',
    cards: { one: '1 flashcard to review', other: '{count} flashcards to review' },
    openToSee: 'Open the app to see your day',
  },
  // Buttons on task reminder notifications
  reminderActions: {
    done: 'Mark done',
    snooze: 'Snooze 1 hour',
    snoozedTitle: 'Reminder',
  },
  // Month names and date layouts, used only where the phone cannot format dates in this language
  months: {
    long: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    short: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
  dateFormats: {
    wdm: '{weekday}, {month} {day}',
    wdmy: '{weekday}, {month} {day}, {year}',
    dm: '{month} {day}',
    dmy: '{month} {day}, {year}',
    my: '{month} {year}',
    m: '{month}',
    w: '{weekday}',
  },
  appearance: {
    title: 'Appearance',
    theme: 'Theme',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeHint: 'System follows your phone’s light or dark mode.',
    language: 'Language',
    languageSystem: 'System',
    languageHint: 'System uses your phone’s language when the app has it, otherwise English.',
    themeA11y: 'Theme: {name}',
    languageA11y: 'Language: {name}',
  },
};
