import { ExamAnswerBar } from '@/components/exam/ExamAnswerBar';
import { ExamHeader } from '@/components/exam/ExamHeader';
import { ExamQuestionCard } from '@/components/exam/ExamQuestionCard';
import { ExamResultsScreen } from '@/components/exam/ExamResultsScreen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/hooks/useAuth';
import { useExamSession } from '@/hooks/useExamSession';
import { useLanguage } from '@/hooks/useLanguage';
import { usePreventScreenCapture } from '@/hooks/usePreventScreenCapture';
import { useQuizColors } from '@/hooks/useQuizColors';
import { useQuizProgression } from '@/hooks/useQuizProgression';
import { useQuizQuestions } from '@/hooks/useQuizQuestions';
import { useSignedQuizImages } from '@/hooks/useSignedQuizImages';
import type { QuizQuestion } from '@/store/quizQuestions';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

/** Stable empty list so the review images are only resolved once the exam is completed. */
const NO_QUESTIONS: QuizQuestion[] = [];

export default function ExamQuizScreen() {
  const { t, i18n } = useTranslation();
  const { batchId, forceItalian } = useLocalSearchParams<{ batchId: string; forceItalian?: string }>();
  const isForcedItalian = forceItalian === 'true';
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id || '';

  const { progress, loading: progressLoading, loadedBatchId } = useQuizProgression(
    userId,
    String(batchId)
  );
  const { secondaryLanguage } = useLanguage();
  const { questions } = useQuizQuestions(
    String(batchId),
    isForcedItalian ? 'it' : i18n.language,
    isForcedItalian ? null : secondaryLanguage
  );

  // Prevent screenshots (no-op on web via hook wrapper)
  usePreventScreenCapture();

  const exam = useExamSession({
    userId,
    batchId: String(batchId),
    questions,
    progress,
    progressLoading,
    loadedBatchId,
  });

  const question = exam.currentQuestion;
  const images = useSignedQuizImages(
    questions,
    exam.currentQuestionIndex,
    exam.quizCompleted ? exam.incorrectQuestions : NO_QUESTIONS
  );
  const colors = useQuizColors();

  const translatedQuestion = question?.translation?.text || '';
  const secondaryText = question?.secondaryTranslation?.text || null;
  const secondaryLanguageLabel = secondaryLanguage ? t(`user.language.${secondaryLanguage}`) : '';

  if (progressLoading || questions.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color="#059669" style={{ flex: 1 }} />
      </ThemedView>
    );
  }

  if (exam.quizCompleted) {
    return (
      <ExamResultsScreen
        score={exam.score}
        incorrectCount={exam.incorrectCount}
        questions={questions}
        incorrectQuestions={exam.incorrectQuestions}
        answers={exam.answers}
        secondaryLanguage={secondaryLanguage}
        images={images}
        onBackToHome={() => router.replace('/(tabs)/exam')}
      />
    );
  }

  const isFirst = exam.currentQuestionIndex === 0;
  const isLast = exam.currentQuestionIndex === questions.length - 1;

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.backgroundColor }]}>
      {/* ── Header with Timer ── */}
      <ExamHeader
        current={exam.currentQuestionIndex + 1}
        total={questions.length}
        timeLeft={exam.timeLeft}
      />

      {/* ── Question Content ── */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <ExamQuestionCard
          key={question?.id ?? 'no-question'}
          question={question}
          text={translatedQuestion}
          secondaryText={secondaryText}
          languageLabel={secondaryLanguageLabel}
          imageUrl={images.getUrl(question?.image_filename)}
        />
      </ScrollView>

      {/* ── Sticky Answer Bar (Exclusive Selection) ── */}
      <ExamAnswerBar hasAnswered={exam.hasAnswered} userAnswer={exam.userAnswer} onAnswer={exam.answer} />

      {/* ── Bottom Navigation Bar ── */}
      <BlurView
        intensity={80}
        tint={colors.backgroundColor === '#000000' ? 'dark' : 'light'}
        style={[styles.navigationBar, { borderTopColor: colors.borderColor }]}
      >
        <View style={styles.navContent}>
          <Pressable
            style={[styles.navButton, isFirst && styles.navButtonDisabled]}
            onPress={exam.previous}
            disabled={isFirst}
          >
            <Ionicons name="chevron-back" size={20} color={isFirst ? '#9CA3AF' : '#2563EB'} />
            <ThemedText style={[styles.navButtonText, isFirst && styles.navButtonTextDisabled]}>
              {t('exam.back')}
            </ThemedText>
          </Pressable>

          {isLast ? (
            <Pressable style={styles.submitButton} onPress={exam.attemptSubmit}>
              <ThemedText style={styles.submitButtonText}>{t('exam.submit')}</ThemedText>
            </Pressable>
          ) : (
            <Pressable style={styles.navButton} onPress={exam.next}>
              <ThemedText style={styles.navButtonText}>{t('exam.next')}</ThemedText>
              <Ionicons name="chevron-forward" size={20} color="#2563EB" />
            </Pressable>
          )}
        </View>
      </BlurView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 20 },
  navigationBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
  },
  navContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  navButton: { flexDirection: 'row', alignItems: 'center', padding: 8, gap: 4 },
  navButtonText: { fontSize: 16, fontWeight: '600', color: '#2563EB' },
  navButtonDisabled: { opacity: 0.5 },
  navButtonTextDisabled: { color: '#9CA3AF' },
  submitButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
