import { useTranslation } from 'react-i18next';
import { useUserProfileStore } from '@/store/user';

export function useLanguage() {
  const { i18n } = useTranslation();
  const userProfile = useUserProfileStore((state) => state.user);
  const secondaryLanguage = userProfile?.lang_secondary || null;

  const setLanguage = async (language: string) => {
    await i18n.changeLanguage(language);
  };

  // We keep this but it might need to also update the database if used elsewhere
  const setSecondaryLanguagePreference = async (language: string | null) => {
    // This hook is now reactive to the store, so it will update when the profile changes.
    // However, if we need to call database update from here, we could.
  };

  return {
    currentLanguage: i18n.language,
    secondaryLanguage,
    setLanguage,
    setSecondaryLanguagePreference,
  };
} 