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

  const cardBackgroundColor = useThemeColor({ light: '#FFFFFF', dark: '#1F2937' }, 'background');
  const borderColor = useThemeColor({ light: '#E5E7EB', dark: '#374151' }, 'background');
  const iconColor = useThemeColor({ light: '#6B7280', dark: '#9CA3AF' }, 'text');
  const badgeBorderColor = useThemeColor({ light: '#D1D5DB', dark: '#4B5563' }, 'icon');

  const handleBatchPress = (batchId: string, moduleIndex: number) => {
    const batchTitle = t('quiz.moduleName', { number: moduleIndex });
    router.push({ pathname: '/quiz', params: { batchId, batchTitle } });
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#2563EB" />
        </Pressable>
        <ThemedText type="title" style={styles.headerTitle}>{categoryName || t('quiz.chooseQuiz')}</ThemedText>
      </View>
      <ScrollView contentContainerStyle={styles.scrollViewContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color="#2563EB" style={styles.loader} />
        ) : !batches.length ? (
          <ThemedText style={styles.emptyState}>
            {t('quiz.comingSoon', 'Nessun quiz disponibile per questa categoria.')}
          </ThemedText>
        ) : (
          batches.map((batch) => (
            <Pressable
              key={batch.id}
              style={({ pressed }) => [
                styles.batchCard,
                {
                  backgroundColor: cardBackgroundColor,
                  borderColor: borderColor,
                },
                pressed && styles.cardPressed,
              ]}
              onPress={() => handleBatchPress(batch.id, batch.moduleIndex)}
            >
              <ThemedText style={styles.batchTitle} type="defaultSemiBold" numberOfLines={1}>
                {t('quiz.moduleName', { number: batch.moduleIndex })}
              </ThemedText>
              
              <View style={styles.rightContainer}>
                {batch.isCompleted ? (
                  batch.isPassed ? (
                    // ✅ SUPERATO
                    <View style={[styles.statusBadge, styles.passedBadge]}>
                      <Ionicons name="shield-checkmark" size={14} color="#FFFFFF" />
                      <ThemedText style={[styles.statusText, styles.badgeTextWhite]}>
                        {t('quiz.passed', 'Superato')}
                      </ThemedText>
                    </View>
                  ) : (
                    // ❌ NON SUPERATO
                    <View style={[styles.statusBadge, styles.failedBadge]}>
                      <Ionicons name="close-circle" size={14} color="#FFFFFF" />
                      <ThemedText style={[styles.statusText, styles.badgeTextWhite]}>
                        {t('quiz.failed', 'Non superato')} · {batch.incorrectCount} {t('quiz.errors', 'err.')}
                      </ThemedText>
                    </View>
                  )
                ) : batch.hasProgress ? (
                  <View style={[styles.statusBadge, styles.inProgressBadge]}>
                    <Ionicons name="time" size={14} color="#FFFFFF" />
                    <ThemedText style={[styles.statusText, styles.inProgressText]}>
                      {t('quiz.inProgress', 'In corso')} {batch.progress?.current_question || 1}/30
                    </ThemedText>
                  </View>
                ) : (
                  <View style={[styles.statusBadge, styles.notStartedBadge, { borderColor: badgeBorderColor }]}>
                    <Ionicons name="play-circle" size={14} color={iconColor} />
                    <ThemedText style={[styles.statusText, { color: iconColor }]}>
                      {t('quiz.start', 'Inizia')}
                    </ThemedText>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={18} color={iconColor} style={styles.chevron} />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: { flex: 1 },
  scrollViewContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 10,
  },
  loader: { marginTop: 50 },
  emptyState: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    opacity: 0.7,
  },
  batchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  batchTitle: {
    fontSize: 16,
    flex: 1,
    marginRight: 10,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  passedBadge: {
    backgroundColor: '#10B981', // verde success
  },
  failedBadge: {
    backgroundColor: '#EF4444', // rosso danger
  },
  inProgressBadge: {
    backgroundColor: '#F59E0B', // ambra warning
  },
  notStartedBadge: {
    backgroundColor: 'transparent',
    borderWidth: 1,
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
  chevron: {
    marginLeft: 2,
  },
});

