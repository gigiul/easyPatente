import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/hooks/useAuth';
import { useQuizBatches } from '@/hooks/useQuizBatches';
import { useThemeColor } from '@/hooks/useThemeColor';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

export default function QuizBatchScreen() {
  const { t } = useTranslation();
  const { categoryId, categoryName } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id || '';
  const { batches, loading, refresh } = useQuizBatches(String(categoryId), userId);

  // Re-fetch every time the screen comes into focus (e.g. returning from quiz)
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const cardBackgroundColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({}, 'icon');
  const iconColor = useThemeColor({}, 'icon');

  const handleBatchPress = (batchId: string, moduleIndex: number) => {
    const batchTitle = t('quiz.moduleName', { number: moduleIndex });
    router.push({ pathname: '/quiz', params: { batchId, batchTitle } });
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.headerTitle}>{categoryName || t('quiz.chooseQuiz')}</ThemedText>
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
              onPress={() => handleBatchPress(batch.id, batch.moduleIndex)}
            >
              <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                  <ThemedText style={styles.batchTitle}>
                    {t('quiz.moduleName', { number: batch.moduleIndex })}
                  </ThemedText>
                  <View style={styles.statusContainer}>
                    {batch.isCompleted ? (
                      batch.isPassed ? (
                        // ✅ SUPERATO
                        <View style={[styles.statusBadge, styles.passedBadge]}>
                          <Ionicons name="shield-checkmark" size={15} color="#FFFFFF" />
                          <ThemedText style={[styles.statusText, styles.badgeTextWhite]}>
                            {t('quiz.passed', 'Superato')}
                          </ThemedText>
                        </View>
                      ) : (
                        // ❌ NON SUPERATO
                        <View style={[styles.statusBadge, styles.failedBadge]}>
                          <Ionicons name="close-circle" size={15} color="#FFFFFF" />
                          <ThemedText style={[styles.statusText, styles.badgeTextWhite]}>
                            {t('quiz.failed', 'Non superato')} · {batch.incorrectCount} {t('quiz.errors', 'err.')}
                          </ThemedText>
                        </View>
                      )
                    ) : batch.hasProgress ? (
                      <View style={[styles.statusBadge, styles.inProgressBadge]}>
                        <Ionicons name="time" size={16} color="#FFFFFF" />
                        <ThemedText style={[styles.statusText, styles.inProgressText]}>
                          {t('quiz.inProgress', 'In corso')} {batch.progress?.current_question || 1}/30
                        </ThemedText>
                      </View>
                    ) : (
                      <View style={[styles.statusBadge, styles.notStartedBadge]}>
                        <Ionicons name="play-circle" size={16} color={iconColor} />
                        <ThemedText style={[styles.statusText, { color: iconColor }]}>
                          {t('quiz.start', 'Inizia')}
                        </ThemedText>
                      </View>
                    )}
                  </View>
                </View>
              </View>
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
  loader: { marginTop: 50 },
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
  cardContent: { flex: 1 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  batchTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  statusContainer: { alignItems: 'flex-end' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  passedBadge: {
    backgroundColor: '#10B981', // verde
  },
  failedBadge: {
    backgroundColor: '#EF4444', // rosso
  },
  inProgressBadge: {
    backgroundColor: '#F59E0B', // giallo
  },
  notStartedBadge: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgeTextWhite: {
    color: '#FFFFFF',
  },
  inProgressText: {
    color: '#FFFFFF',
  },
});
