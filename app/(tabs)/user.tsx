import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { LanguagePicker } from '@/components/LanguagePicker';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';

export default function UserScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { signOut } = useAuth();
  const [primaryLanguage, setPrimaryLanguage] = useState(i18n.language);
  const { secondaryLanguage, setSecondaryLanguagePreference } = useLanguage();

  useEffect(() => {
    setPrimaryLanguage(i18n.language);
  }, [i18n.language]);

  const handlePrimaryLanguageChange = async (langCode: string) => {
    setPrimaryLanguage(langCode);
    await i18n.changeLanguage(langCode);
  };

  const handleSecondaryLanguageChange = async (langCode: string) => {
    await setSecondaryLanguagePreference(langCode || null);
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
}); 