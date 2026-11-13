import { createContext, useContext } from 'react';

// Lets Settings ask the app to show the intro slides again.
export const IntroContext = createContext({ replay: () => {} });
export const useIntro = () => useContext(IntroContext);
