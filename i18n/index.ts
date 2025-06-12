import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import es from './locales/es.json';
import it from './locales/it.json';

const resources = {
  en: {
    translation: en,
  },
  es: {
    translation: es,
  },
  it: {
    translation: it,
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'it', // default language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });

export default i18n; 