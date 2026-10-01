import { ErrorListItem } from '@/components/quiz/ErrorListItem';
import { ThemedButton } from '@/components/ThemedButton';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useQuizColors } from '@/hooks/useQuizColors';
import { useQuizTheme } from '@/hooks/useQuizTheme';
import type { QuizQuestion } from '@/store/quizQuestions';
import type { SignedQuizImages } from '@/hooks/useSignedQuizImages';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

const MAX_ERRORS = 3;

interface ExamResultsScreenProps {
  score: number;
  incorrectCount: number;
  questions: QuizQuestion[];
  incorrectQuestions: QuizQuestion[];
  answers: Record<string, boolean>;
  secondaryLanguage: string | null;
  images: SignedQuizImages;
  onBackToHome: () => void;
}

export function ExamResultsScreen({
  score,
  incorrectCount,
  questions,
  incorrectQuestions,
  answers,
  secondaryLanguage,
  images,
  onBackToHome,
}: ExamResultsScreenProps) {
  const { t } = useTranslation();
  const { backgroundColor, textColor } = useQuizColors();
  const quizTheme = useQuizTheme();

  const isPassed = incorrectCount <= MAX_ERRORS;
  const secondaryLanguageLabel = secondaryLanguage ? t(`user.language.${secondaryLanguage}`) : '';

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.resultsScrollContent}>
        <View style={[styles.resultsCard, { backgroundColor: isPassed ? quizTheme.passed.bg : quizTheme.failed.bg }]}>
          <View style={styles.resultsBanner}>
            <Ionicons
              name={isPassed ? 'shield-checkmark' : 'close-circle'}
              size={64}
              color={isPassed ? quizTheme.passed.icon : quizTheme.failed.icon}
            />
            <ThemedText
              style={[
                styles.resultsTitle,
                { color: isPassed ? quizTheme.passed.title : quizTheme.failed.title },
              ]}
            >
              {isPassed ? t('exam.results.passed') : t('exam.results.failed')}
            </ThemedText>
            <ThemedText style={styles.resultsSubtitle}>
              {isPassed
                ? t('exam.results.passedMessage')
                : t('exam.results.failedMessage', {
                    incorrect: incorrectCount,
                    total: questions.length,
                    max: MAX_ERRORS,
                  })}
            </ThemedText>
          </View>

          <View style={styles.scorePillsRow}>
            <View
              style={[
                styles.scorePill,
                {
                  backgroundColor: quizTheme.scorePills.correct.bg,
                  borderColor: quizTheme.scorePills.correct.border,
                },
              ]}
            >
              <ThemedText style={[styles.scorePillValue, { color: quizTheme.scorePills.correct.text }]}>
                {score}
              </ThemedText>
              <ThemedText style={[styles.scorePillLabel, { color: quizTheme.scorePills.correct.text }]}>
                {t('exam.results.correct')}
              </ThemedText>
            </View>
            <View
              style={[
                styles.scorePill,
                {
                  backgroundColor: quizTheme.scorePills.incorrect.bg,
                  borderColor: quizTheme.scorePills.incorrect.border,
                },
              ]}
            >
              <ThemedText style={[styles.scorePillValue, { color: quizTheme.scorePills.incorrect.text }]}>
                {incorrectCount}
              </ThemedText>
              <ThemedText style={[styles.scorePillLabel, { color: quizTheme.scorePills.incorrect.text }]}>
                {t('exam.results.incorrect')}
              </ThemedText>
            </View>
          </View>

          <View style={styles.restartContainer}>
            <ThemedButton title={t('exam.results.backToHome')} onPress={onBackToHome} />
          </View>
        </View>

        {/* ── ERRORS LIST ────────────────────────────────────────── */}
        {incorrectQuestions.length > 0 && (
          <View style={styles.errorsSection}>
            <ThemedText style={[styles.errorsTitle, { color: textColor }]}>
              {t('exam.incorrectQuestions')}
            </ThemedText>
            {incorrectQuestions.map((question, index) => (
              <ErrorListItem
                key={question.id}
                index={index}
                question={question}
                userAnswer={answers[question.id]}
                url={images.getReviewUrl(question)}
                explanationEnabled={false}
                secondaryText={question.secondaryTranslation?.text || null}
                secondaryLanguageLabel={secondaryLanguageLabel}
                accentColor="#059669"
              />
            ))}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  resultsScrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  resultsCard: { padding: 24, borderRadius: 20, alignItems: 'center' },
  resultsBanner: { alignItems: 'center', marginBottom: 24 },
  resultsTitle: { fontSize: 24, fontWeight: '800', marginTop: 12 },
  resultsSubtitle: { fontSize: 16, textAlign: 'center', marginTop: 8, opacity: 0.8 },
  scorePillsRow: { flexDirection: 'row', gap: 16, marginBottom: 30, width: '100%', justifyContent: 'center' },
  scorePill: { alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, width: 100 },
  scorePillValue: { fontSize: 28, fontWeight: '800', marginVertical: 4 },
  scorePillLabel: { fontSize: 14, fontWeight: '600' },
  restartContainer: { width: '100%', marginTop: 10 },
  errorsSection: {
    marginTop: 20,
    paddingBottom: 40,
    gap: 12,
  },
  errorsTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
});
