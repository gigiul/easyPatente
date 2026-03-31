import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/hooks/useAuth';
import { useQuizTheme } from '@/hooks/useQuizTheme';
import { useThemeColor } from '@/hooks/useThemeColor';
import { supabase } from '@/lib/supabase';
import { fetchMistakesCount, startMistakesReview } from '@/queries/mistakes';
import { fetchExamHistory } from '@/queries/quizProgression';

export default function ExamTab() {
  const router = useRouter();
  const { session } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [examHistory, setExamHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [mistakesCount, setMistakesCount] = useState(0);
  const [loadingReview, setLoadingReview] = useState(false);
  const themeColors = useQuizTheme();

  // Secondary text color for description
  const secondaryTextColor = useThemeColor({ light: '#6B7280', dark: '#9CA3AF' }, 'text');

  useFocusEffect(
    useCallback(() => {
      if (session?.user?.id) {
        setLoadingHistory(true);
        fetchExamHistory(session.user.id)
          .then(setExamHistory)
          .catch((err) => console.error('Error fetching history:', err))
          .finally(() => setLoadingHistory(false));

        fetchMistakesCount()
          .then(setMistakesCount)
          .catch((err) => console.warn('Error fetching mistakes count:', err));
      } else {
        setExamHistory([]);
        setMistakesCount(0);
        setLoadingHistory(false);
      }
    }, [session?.user?.id])
  );

  const startExam = async () => {
    if (!session?.user?.id) {
      Alert.alert(t('exam.alerts.error'), t('exam.alerts.notLoggedIn'));
      return;
    }

    setLoading(true);
    try {
      const { data: batchId, error } = await supabase.rpc('generate_exam_batch', {
        p_user_id: session.user.id,
      });

      if (error) {
        console.error('Error generating exam:', error);
        Alert.alert(t('exam.alerts.error'), t('exam.alerts.startFailed'));
      } else if (batchId) {
        // Navigate to the exam screen
        router.push({
          pathname: '/examQuiz',
          params: { batchId },
        });
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      Alert.alert(t('exam.alerts.error'), t('exam.alerts.unexpected'));
    } finally {
      setLoading(false);
    }
  };

  const startReview = async () => {
    if (!session?.user?.id) {
      Alert.alert(t('exam.alerts.error'), t('exam.alerts.notLoggedIn'));
      return;
    }
    if (mistakesCount === 0) return;

    setLoadingReview(true);
    try {
      const batchId = await startMistakesReview();
      router.push({
        pathname: '/examQuiz',
        params: { batchId },
      });
    } catch (err: any) {
      console.error('Error starting review:', err);
      Alert.alert(t('exam.alerts.error'), t('exam.alerts.reviewStartFailed'));
    } finally {
      setLoadingReview(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.headerTitle}>{t('exam.title')}</ThemedText>
      <ThemedText style={styles.subtitle}>{t('exam.subtitle')}</ThemedText>

      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView
          style={styles.infoCard}
          lightColor="#F3F4F6"
          darkColor="#1F2937"
        >
          <View style={styles.infoRow}>
            <Ionicons name="document-text" size={32} color="#2563EB" />
            <View style={styles.infoTextContainer}>
              <ThemedText style={styles.infoTitle}>{t('exam.info.questions.title')}</ThemedText>
              <ThemedText style={[styles.infoDescription, { color: secondaryTextColor }]}>{t('exam.info.questions.description')}</ThemedText>
            </View>
          </View>

          <ThemedView style={styles.divider} lightColor="#E5E7EB" darkColor="#374151" />

          <View style={styles.infoRow}>
            <Ionicons name="timer" size={32} color="#F59E0B" />
            <View style={styles.infoTextContainer}>
              <ThemedText style={styles.infoTitle}>{t('exam.info.time.title')}</ThemedText>
              <ThemedText style={[styles.infoDescription, { color: secondaryTextColor }]}>{t('exam.info.time.description')}</ThemedText>
            </View>
          </View>

          <ThemedView style={styles.divider} lightColor="#E5E7EB" darkColor="#374151" />

          <View style={styles.infoRow}>
            <Ionicons name="close-circle" size={32} color="#EF4444" />
            <View style={styles.infoTextContainer}>
              <ThemedText style={styles.infoTitle}>{t('exam.info.errors.title')}</ThemedText>
              <ThemedText style={[styles.infoDescription, { color: secondaryTextColor }]}>{t('exam.info.errors.description')}</ThemedText>
            </View>
          </View>
        </ThemedView>

        <View style={styles.buttonContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.startButton,
              pressed && styles.startButtonPressed,
              loading && styles.startButtonDisabled,
            ]}
            onPress={startExam}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <ThemedText style={styles.startButtonText}>{t('exam.start')}</ThemedText>
                <Ionicons name="arrow-forward" size={24} color="#fff" />
              </>
            )}
          </Pressable>

          {mistakesCount > 0 && (
            <Pressable
              style={({ pressed }) => [
                styles.reviewButton,
                pressed && styles.startButtonPressed,
                loadingReview && styles.startButtonDisabled,
              ]}
              onPress={startReview}
              disabled={loadingReview}
            >
              {loadingReview ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="refresh-circle" size={24} color="#fff" />
                  <ThemedText style={styles.reviewButtonText}>
                    {t('exam.reviewMistakes', { count: mistakesCount })}
                  </ThemedText>
                </>
              )}
            </Pressable>
          )}
        </View>

        {/* Exam History Section */}
        <View style={styles.historyContainer}>
          <ThemedText style={styles.historyTitle}>{t('exam.history.title')}</ThemedText>

          {loadingHistory ? (
            <ActivityIndicator color="#059669" style={{ marginVertical: 20 }} />
          ) : examHistory.length === 0 ? (
            <ThemedText style={styles.emptyHistory}>
              {t('exam.history.empty')}
            </ThemedText>
          ) : (
            examHistory.map((exam: any) => {
              const isPassed = exam.incorrect_count <= 3;
              if (!exam.completed) {
                return (
                  <ThemedView
                    key={exam.batch_id}
                    style={styles.historyCard}
                    lightColor={themeColors.abandoned.bg}
                    darkColor={themeColors.abandoned.bg}
                  >
                    <View style={styles.historyCardHeader}>
                      <ThemedText style={styles.historyDate}>
                        {new Date(exam.started_at).toLocaleDateString()}
                      </ThemedText>
                      <View style={[styles.statusBadge, { backgroundColor: themeColors.abandoned.badge }]}>
                        <ThemedText style={[styles.statusText, { color: themeColors.abandoned.text }]}>
                          {t('exam.history.abandoned')}
                        </ThemedText>
                      </View>
                    </View>
                  </ThemedView>
                );
              }

              const colors = isPassed ? themeColors.passed : themeColors.failed;

              return (
                <ThemedView
                  key={exam.batch_id}
                  style={styles.historyCard}
                  lightColor={colors.bg || "#FFFFFF"}
                  darkColor={colors.bg || "#1F2937"}
                >
                  <View style={styles.historyCardHeader}>
                    <ThemedText style={styles.historyDate}>
                      {new Date(exam.started_at).toLocaleDateString()}
                    </ThemedText>
                    <View style={[styles.statusBadge, { backgroundColor: colors.badge }]}>
                      <ThemedText style={[styles.statusText, { color: colors.text }]}>
                        {isPassed ? t('exam.history.passed') : t('exam.history.failed')}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.historyCardBody}>
                    <ThemedText style={styles.historyScore}>
                      {t('exam.history.score', { correct: exam.score, total: exam.total })}
                    </ThemedText>
                    <ThemedText style={[styles.historyErrors, { color: colors.errorLabel }]}>
                      {t('exam.history.errors', { count: exam.incorrect_count })}
                    </ThemedText>
                  </View>
                </ThemedView>
              );
            })
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerTitle: {
    marginTop: 60,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  subtitle: {
    marginBottom: 24,
    opacity: 0.7,
    paddingHorizontal: 16,
  },
  content: {
    padding: 16,
    flexGrow: 1,
  },
  infoCard: {
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    marginBottom: 32,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  infoDescription: {
    fontSize: 14,
    opacity: 0.8,
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  buttonContainer: {
    marginTop: 'auto',
    marginBottom: 20,
  },
  startButton: {
    backgroundColor: '#059669', // Distinctive green for exam
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  startButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
  reviewButton: {
    backgroundColor: '#D97706', // Amber — visually distinct from the green exam button
    borderRadius: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 12,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  reviewButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  historyContainer: {
    marginTop: 32,
    marginBottom: 20,
  },
  historyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  emptyHistory: {
    fontSize: 15,
    opacity: 0.6,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 10,
  },
  historyCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyDate: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  historyCardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyScore: {
    fontSize: 15,
    fontWeight: '600',
  },
  historyErrors: {
    fontSize: 15,
    fontWeight: '700',
  },
});
