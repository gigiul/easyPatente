import { ErrorListItem } from '@/components/quiz/ErrorListItem';
import { QuizBottomNav } from '@/components/quiz/QuizBottomNav';
import { QuizHeader } from '@/components/quiz/QuizHeader';
import { ScorePills } from '@/components/quiz/ScorePills';
import { ThemedButton } from '@/components/ThemedButton';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import type { QuizExplanations } from '@/hooks/useQuizExplanations';
import { useQuizColors } from '@/hooks/useQuizColors';
import { useQuizTheme } from '@/hooks/useQuizTheme';
import type { SignedQuizImages } from '@/hooks/useSignedQuizImages';
import type { QuizQuestion } from '@/store/quizQuestions';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

const MAX_ERRORS = 3;

interface QuizResultsScreenProps {
  title: string;
  score: number;
  incorrectCount: number;
  questions: QuizQuestion[];
  incorrectQuestions: QuizQuestion[];
  answers: Record<string, boolean>;
  explanationEnabled: boolean;
  secondaryLanguage?: string | null;
  explanations: QuizExplanations;
  images: SignedQuizImages;
  previousDisabled: boolean;
  onBack: () => void;
  onPrevious: () => void;
  onReset: () => void;
}

export function QuizResultsScreen({
  title,
  score,
  incorrectCount,
  questions,
  incorrectQuestions,
  answers,
  explanationEnabled,
  secondaryLanguage,
  explanations,
  images,
  previousDisabled,
  onBack,
  onPrevious,
  onReset,
}: QuizResultsScreenProps) {
  const { t } = useTranslation();
  const quizTheme = useQuizTheme();
  const { backgroundColor, textColor } = useQuizColors();

  const isPassed = incorrectCount <= MAX_ERRORS;
  const secondaryLanguageLabel = secondaryLanguage ? t(`user.language.${secondaryLanguage}`) : '';

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <QuizHeader
        title={title}
        subtitle={t('quiz.completed')}
        progressPercent={100}
        onBack={onBack}
      />

      <ScrollView
        key="results-scroll"
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isPassed ? (
          <View
            style={[
              styles.resultsCard,
              { backgroundColor: quizTheme.passed.bg, borderColor: quizTheme.passed.border, borderWidth: 2 },
            ]}
          >
            <View style={styles.resultsBanner}>
              <Ionicons name="shield-checkmark" size={64} color={quizTheme.passed.icon} />
              <ThemedText style={[styles.resultsTitle, { color: quizTheme.passed.title }]}>
                {t('quiz.results.passed.title')}
              </ThemedText>
              <ThemedText style={styles.resultsSubtitle}>{t('quiz.results.passed.subtitle')}</ThemedText>
            </View>

            <ScorePills score={score} incorrectCount={incorrectCount} totalQuestions={questions.length} variant="passed" />

            <View style={styles.restartContainer}>
              <ThemedButton title={t('quiz.restart')} onPress={onReset} />
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.resultsCard,
              { backgroundColor: quizTheme.failed.bg, borderColor: quizTheme.failed.border, borderWidth: 2 },
            ]}
          >
            <View style={styles.resultsBanner}>
              <Ionicons name="close-circle" size={64} color={quizTheme.failed.icon} />
              <ThemedText style={[styles.resultsTitle, { color: quizTheme.failed.title }]}>
                {t('quiz.results.failed.title')}
              </ThemedText>
              <ThemedText style={styles.resultsSubtitle}>
                {t('quiz.results.failed.subtitle', {
                  incorrect: incorrectCount,
                  total: questions.length,
                  max: MAX_ERRORS,
                })}
              </ThemedText>
            </View>

            <ScorePills score={score} incorrectCount={incorrectCount} totalQuestions={questions.length} variant="failed" />

            <View style={[styles.errorLimitBanner, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
              <Ionicons name="information-circle" size={18} color="#DC2626" />
              <ThemedText style={styles.errorLimitText}>
                {t('quiz.results.errorLimit', { max: MAX_ERRORS })}
              </ThemedText>
            </View>

            <View style={styles.restartContainer}>
              <ThemedButton title={t('quiz.retry')} onPress={onReset} />
            </View>
          </View>
        )}

        {incorrectQuestions.length > 0 && (
          <View style={styles.errorsSection}>
            <ThemedText style={[styles.errorsTitle, { color: textColor }]}>
              {t('quiz.incorrectQuestions')}
            </ThemedText>
            {incorrectQuestions.map((question, index) => (
              <ErrorListItem
                key={question.id}
                index={index}
                question={question}
                userAnswer={answers[question.id]}
                url={images.getReviewUrl(question)}
                explanationEnabled={explanationEnabled}
                explanation={explanations.getExplanation(question)}
                explanationLoading={explanations.isLoading(question)}
                onFetchExplanation={explanations.fetch}
                secondaryText={explanations.getSecondaryText(question)}
                secondaryExplanation={explanations.getSecondaryExplanation(question)}
                secondaryLanguageLabel={secondaryLanguageLabel}
                questionNumberOfLines={3}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <QuizBottomNav
        onPrevious={onPrevious}
        previousDisabled={previousDisabled}
        counter={`${questions.length} / ${questions.length}`}
        right={{ label: t('quiz.restart'), icon: 'refresh', onPress: onReset }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 20,
  },
  resultsCard: {
    borderRadius: 20,
    marginBottom: 20,
    overflow: 'hidden',
  },
  resultsBanner: {
    alignItems: 'center',
    padding: 28,
    paddingBottom: 20,
  },
  resultsTitle: {
    fontSize: 26,
    fontWeight: '800',
    marginTop: 14,
    textAlign: 'center',
  },
  resultsSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    opacity: 0.75,
  },
  errorLimitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorLimitText: {
    flex: 1,
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '500',
  },
  restartContainer: {
    width: '100%',
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  errorsSection: {
    marginTop: 8,
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
