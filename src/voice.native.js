// Speech to text for quick add in the phone apps (expo-speech-recognition: the phone's own recogniser). Only in
// development and store builds: Expo Go has no such module, so the mic button doesn't show there. The web uses the
// browser's speech recognition instead (voice.js); both give the same callbacks.
import { requireOptionalNativeModule } from 'expo';
import { getLanguage } from './i18n';

const Speech = requireOptionalNativeModule('ExpoSpeechRecognition');
export const voiceSupported = () => !!Speech;

const TAGS = { en: 'en-US', hi: 'hi-IN', or: 'or-IN', es: 'es-ES' };
const tagNow = () => TAGS[getLanguage()] || 'en-US';

// Listen once: onText(text, final) as words come in; onEnd(error?) when it stops ('deniedApp' | 'nothing' | 'failed').
// Returns stop().
export function listen({ onText, onEnd }) {
  if (!Speech) {
    onEnd('failed');
    return () => {};
  }
  let heard = '';
  let error = null;
  let done = false;
  const subs = [];
  const finish = () => {
    if (done) return;
    done = true;
    subs.forEach((s) => s.remove());
    onEnd(error || (heard ? null : 'nothing'));
  };
  subs.push(
    Speech.addListener('result', (e) => {
      const text = (e && e.results && e.results[0] && e.results[0].transcript) || '';
      if (!text) return;
      heard = text.trim();
      onText(heard, !!e.isFinal);
    }),
    Speech.addListener('error', (e) => {
      const code = e && e.error;
      error = code === 'not-allowed' ? 'deniedApp' : code === 'no-speech' || code === 'speech-timeout' ? 'nothing' : code === 'aborted' ? null : 'failed';
    }),
    Speech.addListener('end', finish)
  );
  (async () => {
    try {
      const perm = await Speech.requestPermissionsAsync();
      if (!perm || !perm.granted) {
        error = 'deniedApp';
        finish();
        return;
      }
      Speech.start({ lang: tagNow(), interimResults: true, continuous: false });
    } catch {
      error = 'failed';
      finish();
    }
  })();
  return () => {
    try {
      Speech.stop();
    } catch {
      finish();
    }
  };
}
