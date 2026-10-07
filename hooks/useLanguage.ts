import { clampSiteLanguages } from '@/lib/siteConfig';
import { useUserProfileStore } from '@/store/user';
import { useTranslation } from 'react-i18next';

export function useLanguage() {
  const { i18n } = useTranslation();
  const userProfile = useUserProfileStore((state) => state.user);
  // On a dedicated site the secondary is always the subdomain's fixed pair
  // (clamped client-side only, no DB write).
  const secondaryLanguage = clampSiteLanguages(userProfile?.lang_primary, userProfile?.lang_secondary)
    .secondary;

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