import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useQuizBatches } from '@/hooks/useQuizBatches';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';

export default function QuizBatchScreen() {
  const { t } = useTranslation();
  const { categoryId } = useLocalSearchParams();
  const router = useRouter();
  const { batches, loading } = useQuizBatches(String(categoryId));
  
  const cardBackgroundColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({}, 'icon');

  const handleBatchPress = (batchId: string) => {
    router.push({ pathname: '/quiz', params: { batchId } });
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.headerTitle}>{t('quiz.chooseQuiz')}</ThemedText>
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        {loading ? (
          <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
        ) : !batches.length ? (
          <ThemedText style={styles.emptyState}>
            {t('quiz.comingSoon', 'Nessun quiz disponibile per questa categoria.')}
          </ThemedText>
        ) : (
          batches.map((batch) => (
            <Pressable
              key={batch.id}
              style={[
                styles.batchCard,
                { 
                  backgroundColor: cardBackgroundColor,
                  borderWidth: 1,
                  borderColor: borderColor,
                  shadowColor: borderColor,
                }
              ]}
              onPress={() => handleBatchPress(batch.id)}
            >
              <ThemedText style={styles.batchTitle}>
                {String(t(`quiz.batches.${batch.title}`, batch.title))}
              </ThemedText>
            </Pressable>
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitle: { marginTop: 60, marginBottom: 8, paddingHorizontal: 16 },
  scrollViewContent: { padding: 16 },
  loader: {
    marginTop: 50,
  },
  emptyState: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    opacity: 0.7,
  },
  batchCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  batchTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
});
