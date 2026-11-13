// Language tag used for dates and times (e.g. 'en-US', 'hi'). Set by i18n's applyLanguage(); until then
// it is the browser language on the web and undefined (the device language) on a phone.
export let LOCALE = typeof navigator !== 'undefined' && navigator.language ? navigator.language : undefined;

export function setLocale(tag) {
  LOCALE = tag || LOCALE;
}
