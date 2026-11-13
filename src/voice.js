// Speech to text for quick add, on the web: the browser's own speech recognition (Chrome, Edge, Safari). Where it
// isn't there (Firefox, and the phone apps, see voice.native.js) the mic button doesn't show; on a phone the
// keyboard's own mic types into the box.
import { getLanguage } from './i18n';

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
export const voiceSupported = () => !!Recognition;

// the app's language as a speech language
const TAGS = { en: 'en-US', hi: 'hi-IN', or: 'or-IN', es: 'es-ES' };
const tagNow = () => {
  const lang = getLanguage();
  if (TAGS[lang]) return TAGS[lang];
  return (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
};

// Listen once: onText(text, final) as words come in; onEnd(error?) when it stops ('denied' | 'nothing' | 'failed').
// Returns stop().
export function listen({ onText, onEnd }) {
  if (!Recognition) {
    onEnd('failed');
    return () => {};
  }
  const r = new Recognition();
  r.lang = tagNow();
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  let heard = '';
  let error = null;
  r.onresult = (e) => {
    let text = '';
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      if (e.results[i].isFinal) final = true;
    }
    heard = text.trim();
    onText(heard, final);
  };
  r.onerror = (e) => {
    error = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : e.error === 'no-speech' ? 'nothing' : e.error === 'aborted' ? null : 'failed';
  };
  r.onend = () => onEnd(error || (heard ? null : 'nothing'));
  try {
    r.start();
  } catch {
    onEnd('failed');
  }
  return () => {
    try {
      r.stop();
    } catch {
      // already stopped
    }
  };
}
