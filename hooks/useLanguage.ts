import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { storage } from '@/lib/storage';

const SECONDARY_LANGUAGE_KEY = 'secondary_language';

export function useLanguage() {
  const { i18n } = useTranslation();
  const [secondaryLanguage, setSecondaryLanguageState] = useState('none');

  useEffect(() => {
    // Load secondary language preference on mount
    const loadSecondaryLanguage = async () => {
      const savedLanguage = await storage.get(SECONDARY_LANGUAGE_KEY);
      if (savedLanguage) {
        setSecondaryLanguageState(savedLanguage);
      }
    };
    loadSecondaryLanguage();
  }, []);

  const setLanguage = async (language: string) => {
    await i18n.changeLanguage(language);
  };

  const setSecondaryLanguagePreference = async (language: string | null) => {
    if (language) {
      await storage.set(SECONDARY_LANGUAGE_KEY, language);
      setSecondaryLanguageState(language);
    } else {
      await storage.delete(SECONDARY_LANGUAGE_KEY);
      setSecondaryLanguageState('none');
    }
  };

  return {
    currentLanguage: i18n.language,
    secondaryLanguage,
    setLanguage,
    setSecondaryLanguagePreference,
  };
} 