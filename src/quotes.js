// Bundled so the quote works offline. One is picked per calendar day.
// The quote text lives in the translations (quotes.items in i18n/en/today.js); the English list sets the count.
import { t } from './i18n';
import en from './i18n/en/today';

export const QUOTE_COUNT = en.quotes.items.length;

// Read at render time so a language change shows the quote in the new language.
export const quoteAt = (i) => ({ text: t(`quotes.items.${i}.text`), author: t(`quotes.items.${i}.author`) });

const dayNumber = (d = new Date()) =>
  Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);

export const quoteIndexForToday = () => dayNumber() % QUOTE_COUNT;
