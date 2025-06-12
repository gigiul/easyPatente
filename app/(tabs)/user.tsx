import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { LanguagePicker } from '@/components/LanguagePicker';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

export default function UserScreen() {
  const { t, i18n } = useTranslation();
  const [primaryLanguage, setPrimaryLanguage] = useState(i18n.language);
  const [secondaryLanguage, setSecondaryLanguage] = useState('');

  useEffect(() => {
    setPrimaryLanguage(i18n.language);
  }, [i18n.language]);

  const handlePrimaryLanguageChange = (langCode: string) => {
    setPrimaryLanguage(langCode);
    i18n.changeLanguage(langCode);
  };

  const handleSecondaryLanguageChange = (langCode: string) => {
    setSecondaryLanguage(langCode);
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.headerTitle}>{t('user.title')}</ThemedText>
      <ThemedText style={styles.subtitle}>{t('user.subtitle')}</ThemedText>

      <View style={styles.section}>
        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
          {t('user.language.title')}
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
}); 