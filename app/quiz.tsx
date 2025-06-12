import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

export default function QuizScreen() {
  const { categoryId } = useLocalSearchParams();
  const { t } = useTranslation();

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.headerTitle}>
        {t(`quiz.categories.${categoryId}.title`)}
      </ThemedText>
      <ThemedText style={styles.subtitle}>{t('quiz.comingSoon')}</ThemedText>
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
}); 