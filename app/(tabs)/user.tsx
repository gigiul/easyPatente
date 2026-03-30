import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { LanguagePicker } from '@/components/LanguagePicker';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/hooks/useAuth';
import i18n from '@/i18n';
import { deleteUserAccount, updateUserLanguage } from '@/queries/user';
import { useLanguagesStore } from '@/store/languages';
import { useUserProfileStore } from '@/store/user';

export default function UserScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signOut } = useAuth();
  const languages = useLanguagesStore((state) => state.languages);
  const userProfile = useUserProfileStore((state) => state.user);
  const [primaryLanguage, setPrimaryLanguage] = useState<string>('');
  const [secondaryLanguage, setSecondaryLanguage] = useState<string | null>('');


  useEffect(() => {
    // retrieve userProfile languages if set
    const { lang_primary, lang_secondary } = userProfile || {};
    if (lang_primary) {
      setPrimaryLanguage(lang_primary);
      i18n.changeLanguage(lang_primary);
    }
    if (lang_secondary) {
      setSecondaryLanguage(lang_secondary);
    }
    // If no primary language is set, default to the first available language
    if (!lang_primary && languages.length > 0) {
      const setDefaultLanguage = async () => {
        const defaultLang = languages.find((l) => l.is_default) || languages[0];
        setPrimaryLanguage(defaultLang.code);
        await i18n.changeLanguage(defaultLang.code);
      };
      setDefaultLanguage();
    }
  }, [languages, userProfile]);

  const handlePrimaryLanguageChange = async (langCode: string) => {
    setPrimaryLanguage(langCode);
    await i18n.changeLanguage(langCode);
    //save on user profile
    await updateUserLanguage(langCode, 'primary')
  };

  const handleSecondaryLanguageChange = async (langCode: string) => {
    setSecondaryLanguage(langCode || null);
    //save on user profile
    await updateUserLanguage(langCode || null, 'secondary')
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            const { error } = await signOut();
            if (error) {
              Alert.alert('Error', error.message);
              return;
            }
            router.replace('/login');
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('user.deleteAccount'),
      t('user.deleteAccountConfirm'),
      [
        {
          text: t('user.cancel'),
          style: 'cancel',
        },
        {
          text: t('user.deleteAccount'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUserAccount();
              await signOut();
              router.replace('/login');
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ],
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.headerTitle}>{t('user.title')}</ThemedText>
      <ThemedText style={styles.subtitle}>{t('user.subtitle')}</ThemedText>

      <View style={styles.section}>
        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
          {t('user.language.title')}
        </ThemedText>
        <ThemedText style={styles.sectionDescription}>
          {t('user.language.description')}
        </ThemedText>
        <LanguagePicker
          value={primaryLanguage}
          onChange={handlePrimaryLanguageChange}
          title={t('user.language.title')}
          excludeLanguage={secondaryLanguage}
          languages={languages}
        />
      </View>

      <View style={styles.section}>
        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
          {t('user.secondaryLanguage.title')}
        </ThemedText>
        <ThemedText style={styles.sectionDescription}>
          {t('user.secondaryLanguage.description')}
        </ThemedText>
        <LanguagePicker
          value={secondaryLanguage}
          onChange={handleSecondaryLanguageChange}
          title={t('user.secondaryLanguage.title')}
          excludeLanguage={primaryLanguage}
          allowNone
          languages={languages}
        />
      </View>

      <View style={styles.section}>
        <Pressable
          style={({ pressed }) => [
            styles.logoutButton,
            pressed && styles.logoutButtonPressed,
          ]}
          onPress={handleLogout}
        >
          <ThemedText style={styles.logoutButtonText}>Logout</ThemedText>
        </Pressable>

        <Pressable onPress={handleDeleteAccount} style={styles.deleteAccountButton}>
          <ThemedText style={styles.deleteAccountText}>{t('user.deleteAccount')}</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  headerTitle: {
    marginTop: 60,
    marginBottom: 8,
  },
  subtitle: {
    marginBottom: 24,
    opacity: 0.7,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    marginBottom: 8,
  },
  sectionDescription: {
    marginBottom: 16,
    opacity: 0.7,
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutButtonPressed: {
    opacity: 0.8,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteAccountButton: {
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  deleteAccountText: {
    color: '#FF3B30',
    fontSize: 14,
  },
});