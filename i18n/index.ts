import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import bn from './locales/bn.json';
import es from './locales/es.json';
import it from './locales/it.json';

const resources = {
  it: { translation: it },
  es: { translation: es },
  bn: { translation: bn },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'it', // default language
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
    react: {
      useSuspense: false, // recommended for React Native
    },
  });

export default i18n;
