// The easier-to-read font (Lexend, from Google Fonts) for Settings → Appearance. Loaded only once someone turns it
// on; until it's ready the app keeps the usual font. Weights as theme.js asks for them.
import { useEffect, useState } from 'react';
import * as Font from 'expo-font';
import { Lexend_400Regular } from '@expo-google-fonts/lexend/400Regular';
import { Lexend_500Medium } from '@expo-google-fonts/lexend/500Medium';
import { Lexend_600SemiBold } from '@expo-google-fonts/lexend/600SemiBold';
import { Lexend_700Bold } from '@expo-google-fonts/lexend/700Bold';
import { Lexend_800ExtraBold } from '@expo-google-fonts/lexend/800ExtraBold';

const FONTS = { Lexend_400Regular, Lexend_500Medium, Lexend_600SemiBold, Lexend_700Bold, Lexend_800ExtraBold };
let loaded = false;
let loading = null;

// true once the font can be used (false while it loads, or if it can't be loaded)
export function useReadingFont(wanted) {
  const [ready, setReady] = useState(loaded);
  useEffect(() => {
    if (!wanted || loaded) return undefined;
    let alive = true;
    loading =
      loading ||
      Font.loadAsync(FONTS).then(() => {
        loaded = true;
      });
    loading
      .then(() => alive && setReady(true))
      .catch(() => {
        loading = null; // try again next time
      });
    return () => {
      alive = false;
    };
  }, [wanted]);
  return wanted && (ready || loaded);
}
