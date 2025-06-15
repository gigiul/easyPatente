import bn from '@/i18n/locales/bn.json';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';
import it from '@/i18n/locales/it.json';
import { useCallback } from 'react';
import { useLanguage } from './useLanguage';

type TranslationType = typeof en;
type LanguageCode = keyof typeof translations;

const translations = {
  en,
  it,
  es,
  bn,
} as const;

type TranslationKey = string;
type TranslationParams = Record<string, string | number>;

export function useTranslation() {
  const { currentLanguage } = useLanguage();
  const currentTranslations = translations[currentLanguage as LanguageCode] || translations.en;

  const t = useCallback((key: TranslationKey, params?: TranslationParams): string => {
    const keys = key.split('.');
    let value: any = currentTranslations;

    for (const k of keys) {
      if (value === undefined) {
        console.warn(`Translation key not found: ${key}`);
        return key;
      }
      value = value[k];
    }

    if (typeof value !== 'string') {
      console.warn(`Translation value is not a string: ${key}`);
      return key;
    }

    if (params) {
      return value.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return String(params[key] || `{{${key}}}`);
      });
    }

    return value;
  }, [currentLanguage]);

  return { t };
} 