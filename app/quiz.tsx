import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useQuizProgression } from '@/hooks/useQuizProgression';
import { useQuizQuestions } from '@/hooks/useQuizQuestions';
import { useQuizScore } from '@/hooks/useQuizScore';
import { useThemeColor } from '@/hooks/useThemeColor';
import { updateQuizProgression } from '@/queries/quizProgression';
import { ThemedButton } from '../components/ThemedButton';

export default function QuizScreen() {
  const { t, i18n } = useTranslation();
  const { batchId, batchTitle } = useLocalSearchParams<{ batchId: string; batchTitle: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id || '';
  const { progress: quizProgress, loading: progressLoading, refresh: refreshProgression } = useQuizProgression(userId, String(batchId));
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const { secondaryLanguage } = useLanguage();
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [answers, setAnswers] = useState<any>({});
  const [isResetting, setIsResetting] = useState(false);
  const { questions } = useQuizQuestions(String(batchId), i18n.language, secondaryLanguage);
  const { score, incorrectCount } = useQuizScore(userId, String(batchId), answers, quizCompleted);
  const currentQuestion = questions[currentQuestionIndex] as any;

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const iconColor = useThemeColor({}, 'icon');
  const cardBackgroundColor = useThemeColor({ light: '#FFFFFF', dark: '#1F2937' }, 'background');
  const borderColor = useThemeColor({ light: '#E2E8F0', dark: '#374151' }, 'icon');
  const secondaryBackgroundColor = useThemeColor({ light: '#F8FAFC', dark: '#111827' }, 'background');

  // Answer result colors
  const correctCardColor = useThemeColor({ light: '#ECFDF5', dark: '#065F46' }, 'background');
  const incorrectCardColor = useThemeColor({ light: '#FEF2F2', dark: '#991B1B' }, 'background');

  const getTranslatedQuestion = () => currentQuestion?.translation?.text || '';
  const getTranslatedExplanation = () => currentQuestion?.translation?.explanation || '';

  // Reset state quando cambia il batchId
  useEffect(() => {
    setCurrentQuestionIndex(0);
    setQuizCompleted(false);
    setAnswers({});
    setIsResetting(false);
  }, [batchId]);

  // Popola answers da quizProgress se presente
  useEffect(() => {
    if (!isResetting && quizProgress && quizProgress.length > 0 && Object.keys(answers).length === 0) {
      const progressAnswers = quizProgress[0]?.answers || {};
      const hasNoAnswers = Object.keys(progressAnswers).length === 0;
      if (!hasNoAnswers) {
        setAnswers(progressAnswers);
        if (quizProgress[0]?.current_question) {
          setCurrentQuestionIndex(quizProgress[0].current_question - 1);
        }
        if (quizProgress[0]?.completed) {
          setQuizCompleted(true);
        }
      }
    }
  }, [quizProgress, answers, isResetting]);

  const handleAnswer = async (answer: boolean) => {
    const questionId = currentQuestion?.id;
    const updatedAnswers = { ...answers, [questionId]: answer };
    setAnswers(updatedAnswers);
    await updateQuizProgression(userId, String(batchId), updatedAnswers, currentQuestionIndex + 1, false);
  };

  const handleNext = async () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      await updateQuizProgression(userId, String(batchId), answers, currentQuestionIndex + 2, false);
    } else {
      Alert.alert(
        t('quiz.finishAlert.title'),
        t('quiz.finishAlert.message'),
        [
          { text: t('quiz.finishAlert.cancel'), style: 'cancel' },
          {
            text: t('quiz.finishAlert.confirm'),
            onPress: async () => {
              setCurrentQuestionIndex(currentQuestionIndex + 1);
              await updateQuizProgression(userId, String(batchId), answers, currentQuestionIndex + 1, true);
              setQuizCompleted(true);
            }
          }
        ]
      );
    }
  };

  const handlePrevious = async () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      await updateQuizProgression(userId, String(batchId), answers, currentQuestionIndex, false);
      if (currentQuestionIndex <= questions.length) {
        setQuizCompleted(false);
      }
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    setCurrentQuestionIndex(0);
    setQuizCompleted(false);
    setAnswers({});
    await updateQuizProgression(userId, String(batchId), {}, 1, false);
    refreshProgression();
    setTimeout(() => setIsResetting(false), 500);
  };

  const getSecondaryTranslation = (type: 'text' | 'explanation') =>
    currentQuestion?.secondaryTranslation?.[type] || null;

  const speakText = async (text: string, language: string) => {
    try {
      await Speech.stop();
      const ttsLanguage = language === 'es' ? 'es-MX' : language;
      Speech.speak(text, { language: ttsLanguage, pitch: 1.0, rate: 0.9, volume: 1.0 });
    } catch (error) {
      console.error('Error speaking text:', error);
    }
  };

  const handleSpeakQuestion = () => speakText(getTranslatedQuestion(), i18n.language);
  const handleSpeakSecondaryQuestion = () => {
    const secondaryText = getSecondaryTranslation('text');
    if (secondaryText && secondaryLanguage) speakText(secondaryText, secondaryLanguage);
  };
  const handleSpeakExplanation = () => speakText(getTranslatedExplanation(), i18n.language);
  const handleSpeakSecondaryExplanation = () => {
    const secondaryText = getSecondaryTranslation('explanation');
    if (secondaryText && secondaryLanguage) speakText(secondaryText, secondaryLanguage);
  };

  const progressPercent = questions.length > 0
    ? ((currentQuestionIndex + 1) / questions.length) * 100
    : 0;

  if (progressLoading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color="#2563EB" style={{ flex: 1 }} />
      </ThemedView>
    );
  }

  // ─── RESULTS SCREEN ────────────────────────────────────────────
  if (quizCompleted) {
    const MAX_ERRORS = 3;
    const isPassed = incorrectCount <= MAX_ERRORS;

    return (
      <ThemedView style={[styles.container, { backgroundColor }]}>
        {/* Compact Header */}
        <View style={[styles.header, { backgroundColor: cardBackgroundColor, borderBottomColor: borderColor }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#2563EB" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <ThemedText style={[styles.headerTitle, { color: textColor }]}>
              {String(t(`quiz.batches.${batchTitle}`, batchTitle))}
            </ThemedText>
            <ThemedText style={[styles.headerSubtitle, { color: iconColor }]}>
              {t('quiz.completed')}
            </ThemedText>
          </View>
          <View style={styles.headerProgressWrapper}>
            <View style={[styles.headerProgressTrack, { backgroundColor: borderColor }]}>
              <View style={[styles.headerProgressFill, { width: '100%' }]} />
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {isPassed ? (
            /* ✅ SUPERATO */
            <View style={[styles.resultsCard, styles.passedCard]}>
              <View style={styles.resultsBanner}>
                <Ionicons name="shield-checkmark" size={64} color="#10B981" />
                <ThemedText style={styles.resultsTitlePassed}>{t('quiz.results.passed.title')}</ThemedText>
                <ThemedText style={styles.resultsSubtitle}>
                  {t('quiz.results.passed.subtitle')}
                </ThemedText>
              </View>

              {/* Score pills row */}
              <View style={styles.scorePillsRow}>
                <View style={[styles.scorePill, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  <ThemedText style={[styles.scorePillValue, { color: '#065F46' }]}>{score}</ThemedText>
                  <ThemedText style={[styles.scorePillLabel, { color: '#065F46' }]}>{t('quiz.results.correct')}</ThemedText>
                </View>
                <View style={[styles.scorePill, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                  <ThemedText style={[styles.scorePillValue, { color: '#991B1B' }]}>{incorrectCount}</ThemedText>
                  <ThemedText style={[styles.scorePillLabel, { color: '#991B1B' }]}>{t('quiz.results.incorrect')}</ThemedText>
                </View>
                <View style={[styles.scorePill, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <Ionicons name="trophy" size={20} color="#2563EB" />
                  <ThemedText style={[styles.scorePillValue, { color: '#1D4ED8' }]}>
                    {Math.round((score / questions.length) * 100)}%
                  </ThemedText>
                  <ThemedText style={[styles.scorePillLabel, { color: '#1D4ED8' }]}>{t('quiz.results.scoreLabel')}</ThemedText>
                </View>
              </View>

              <View style={styles.restartContainer}>
                <ThemedButton title={t('quiz.restart')} onPress={handleReset} />
              </View>
            </View>
          ) : (
            /* ❌ NON SUPERATO */
            <View style={[styles.resultsCard, styles.failedCard]}>
              <View style={styles.resultsBanner}>
                <Ionicons name="close-circle" size={64} color="#EF4444" />
                <ThemedText style={styles.resultsTitleFailed}>{t('quiz.results.failed.title')}</ThemedText>
                <ThemedText style={styles.resultsSubtitle}>
                  {t('quiz.results.failed.subtitle', { incorrect: incorrectCount, total: questions.length, max: MAX_ERRORS })}
                </ThemedText>
              </View>

              {/* Score pills row */}
              <View style={styles.scorePillsRow}>
                <View style={[styles.scorePill, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  <ThemedText style={[styles.scorePillValue, { color: '#065F46' }]}>{score}</ThemedText>
                  <ThemedText style={[styles.scorePillLabel, { color: '#065F46' }]}>{t('quiz.results.correct')}</ThemedText>
                </View>
                <View style={[styles.scorePill, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                  <ThemedText style={[styles.scorePillValue, { color: '#991B1B' }]}>{incorrectCount}</ThemedText>
                  <ThemedText style={[styles.scorePillLabel, { color: '#991B1B' }]}>{t('quiz.results.incorrect')}</ThemedText>
                </View>
                <View style={[styles.scorePill, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
                  <Ionicons name="bar-chart" size={20} color="#EA580C" />
                  <ThemedText style={[styles.scorePillValue, { color: '#9A3412' }]}>
                    {Math.round((score / questions.length) * 100)}%
                  </ThemedText>
                  <ThemedText style={[styles.scorePillLabel, { color: '#9A3412' }]}>{t('quiz.results.scoreLabel')}</ThemedText>
                </View>
              </View>

              <View style={[styles.errorLimitBanner, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                <Ionicons name="information-circle" size={18} color="#DC2626" />
                <ThemedText style={styles.errorLimitText}>
                  {t('quiz.results.errorLimit', { max: MAX_ERRORS })}
                </ThemedText>
              </View>

              <View style={styles.restartContainer}>
                <ThemedButton title={t('quiz.retry')} onPress={handleReset} />
              </View>
            </View>
          )}
        </ScrollView>

        {/* Bottom Nav */}
        <BlurView intensity={80} tint={backgroundColor === '#000000' ? 'dark' : 'light'} style={[styles.navigationBar, { borderTopColor: borderColor }]}>
          <View style={styles.navContent}>
            <Pressable
              style={[styles.navButton, currentQuestionIndex === 0 && styles.navButtonDisabled]}
              onPress={handlePrevious}
              disabled={currentQuestionIndex === 0}
            >
              <Ionicons name="chevron-back" size={20} color={currentQuestionIndex === 0 ? '#9CA3AF' : '#2563EB'} />
              <ThemedText style={[styles.navButtonText, currentQuestionIndex === 0 && styles.navButtonTextDisabled]}>
                {t('quiz.previous')}
              </ThemedText>
            </Pressable>
            <ThemedText style={[styles.questionIndicator, { color: iconColor }]}>
              {questions.length} / {questions.length}
            </ThemedText>
            <Pressable style={styles.navButton} onPress={handleReset}>
              <ThemedText style={styles.navButtonText}>{t('quiz.restart')}</ThemedText>
              <Ionicons name="refresh" size={20} color="#2563EB" />
            </Pressable>
          </View>
        </BlurView>
      </ThemedView>
    );
  }


  // ─── MAIN QUIZ SCREEN ───────────────────────────────────────────
  const hasAnswered = typeof answers[currentQuestion?.id] !== 'undefined';
  const userAnswer = answers[currentQuestion?.id];
  const isCorrect = userAnswer === currentQuestion?.is_correct;

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>

      {/* ── Compact Header with integrated progress bar ── */}
      <View style={[styles.header, { backgroundColor: cardBackgroundColor, borderBottomColor: borderColor }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#2563EB" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <ThemedText style={[styles.headerTitle, { color: textColor }]} numberOfLines={1}>
            {String(t(`quiz.batches.${batchTitle}`, batchTitle))}
          </ThemedText>
          <View style={styles.headerProgressRow}>
            <View style={[styles.headerProgressTrack, { backgroundColor: borderColor }]}>
              <View style={[styles.headerProgressFill, { width: `${progressPercent}%` }]} />
            </View>
            <ThemedText style={[styles.headerProgressLabel, { color: iconColor }]}>
              {currentQuestionIndex + 1}/{questions.length}
            </ThemedText>
          </View>
        </View>
      </View>

      {/* ── Scrollable Question Content ── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Question Card */}
        <View style={[styles.questionCard, { backgroundColor: cardBackgroundColor }]}>
          <View style={styles.questionBadgeRow}>
            <View style={styles.questionBadge}>
              <Ionicons name="help-circle" size={16} color="#2563EB" />
              <ThemedText style={styles.questionBadgeText}>{t('quiz.question')}</ThemedText>
            </View>
            <Pressable onPress={handleSpeakQuestion} style={[styles.speakButtonSmall, { backgroundColor: secondaryBackgroundColor }]}>
              <Ionicons name="volume-high" size={20} color="#2563EB" />
            </Pressable>
          </View>

          <ThemedText style={[styles.questionText, { color: textColor }]}>
            {getTranslatedQuestion()}
          </ThemedText>

          {currentQuestion?.image_url && (
            <View style={[styles.imageContainer, { backgroundColor: secondaryBackgroundColor }]}>
              <Image
                source={{ uri: currentQuestion.image_url }}
                style={styles.questionImage}
                resizeMode="contain"
              />
            </View>
          )}

          {getSecondaryTranslation('text') && (
            <View style={[styles.secondaryLanguageCard, { backgroundColor: secondaryBackgroundColor, borderColor }]}>
              <View style={styles.secondaryHeader}>
                <View style={[styles.languageBadge, { backgroundColor: borderColor }]}>
                  <ThemedText style={[styles.languageBadgeText, { color: iconColor }]}>
                    {t(`user.language.${secondaryLanguage}`)}
                  </ThemedText>
                </View>
                <Pressable onPress={handleSpeakSecondaryQuestion} style={[styles.speakButtonSmall, { backgroundColor: borderColor }]}>
                  <Ionicons name="volume-high" size={18} color="#6B7280" />
                </Pressable>
              </View>
              <ThemedText style={[styles.secondaryText, { color: iconColor }]}>
                {getSecondaryTranslation('text')}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Answer Result + Explanation (shown after answering) */}
        {hasAnswered && (
          <View style={styles.answeredSection}>
            <View style={[
              styles.answerResultCard,
              {
                backgroundColor: isCorrect ? correctCardColor : incorrectCardColor,
                borderColor: isCorrect ? '#10B981' : '#EF4444',
              }
            ]}>
              <View style={styles.answerResultHeader}>
                <Ionicons
                  name={isCorrect ? 'checkmark-circle' : 'close-circle'}
                  size={26}
                  color={isCorrect ? '#059669' : '#DC2626'}
                />
                <ThemedText style={[styles.answerResultText, { color: isCorrect ? '#059669' : '#DC2626' }]}>
                  {isCorrect ? t('quiz.correctAnswer') : t('quiz.incorrectAnswer')}
                </ThemedText>
              </View>
              <ThemedText style={[styles.userAnswerText, { color: textColor }]}>
                {t('quiz.yourAnswer', { answer: userAnswer ? t('quiz.true') : t('quiz.false') })}
              </ThemedText>
              {!isCorrect && (
                <ThemedText style={[styles.correctAnswerText, { color: iconColor }]}>
                  {t('quiz.correctAnswerIs', { answer: currentQuestion?.is_correct ? t('quiz.true') : t('quiz.false') })}
                </ThemedText>
              )}
            </View>

            {getTranslatedExplanation() && (
              <View style={[styles.explanationCard, { backgroundColor: cardBackgroundColor }]}>
                <View style={[styles.explanationHeader, { borderBottomColor: borderColor }]}>
                  <View style={styles.explanationBadge}>
                    <Ionicons name="bulb" size={16} color="#F59E0B" />
                    <ThemedText style={styles.explanationBadgeText}>{t('quiz.explanation')}</ThemedText>
                  </View>
                  <Pressable onPress={handleSpeakExplanation} style={[styles.speakButtonSmall, { backgroundColor: secondaryBackgroundColor }]}>
                    <Ionicons name="volume-high" size={18} color="#F59E0B" />
                  </Pressable>
                </View>
                <ThemedText style={[styles.explanationText, { color: textColor }]}>
                  {getTranslatedExplanation()}
                </ThemedText>
                {getSecondaryTranslation('explanation') && (
                  <View style={[styles.secondaryLanguageCard, { backgroundColor: secondaryBackgroundColor, borderColor }]}>
                    <View style={styles.secondaryHeader}>
                      <View style={[styles.languageBadge, { backgroundColor: borderColor }]}>
                        <ThemedText style={[styles.languageBadgeText, { color: iconColor }]}>
                          {t(`user.language.${secondaryLanguage}`)}
                        </ThemedText>
                      </View>
                      <Pressable onPress={handleSpeakSecondaryExplanation} style={[styles.speakButtonSmall, { backgroundColor: borderColor }]}>
                        <Ionicons name="volume-high" size={18} color="#6B7280" />
                      </Pressable>
                    </View>
                    <ThemedText style={[styles.secondaryText, { color: iconColor }]}>
                      {getSecondaryTranslation('explanation')}
                    </ThemedText>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── STICKY Answer Buttons (always visible, above nav bar) ── */}
      {!hasAnswered && (
        <View style={[styles.stickyAnswerBar, { backgroundColor: cardBackgroundColor, borderTopColor: borderColor }]}>
          <ThemedText style={[styles.answerPrompt, { color: iconColor }]}>
            {t('quiz.selectAnswer')}
          </ThemedText>
          <View style={styles.answerButtons}>
            {/* FALSE button */}
            <Pressable
              style={({ pressed }) => [styles.answerButton, styles.falseButton, pressed && styles.answerButtonPressed]}
              onPress={() => handleAnswer(false)}
            >
              <Ionicons name="close-circle" size={36} color="#DC2626" />
              <ThemedText style={[styles.answerButtonText, { color: '#DC2626' }]}>{t('quiz.false')}</ThemedText>
            </Pressable>
            {/* TRUE button */}
            <Pressable
              style={({ pressed }) => [styles.answerButton, styles.trueButton, pressed && styles.answerButtonPressed]}
              onPress={() => handleAnswer(true)}
            >
              <Ionicons name="checkmark-circle" size={36} color="#059669" />
              <ThemedText style={[styles.answerButtonText, { color: '#059669' }]}>{t('quiz.true')}</ThemedText>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Bottom Navigation Bar ── */}
      <BlurView
        intensity={80}
        tint={backgroundColor === '#000000' ? 'dark' : 'light'}
        style={[styles.navigationBar, { borderTopColor: borderColor }]}
      >
        <View style={styles.navContent}>
          <Pressable
            style={[styles.navButton, currentQuestionIndex === 0 && styles.navButtonDisabled]}
            onPress={handlePrevious}
            disabled={currentQuestionIndex === 0}
          >
            <Ionicons name="chevron-back" size={20} color={currentQuestionIndex === 0 ? '#9CA3AF' : '#2563EB'} />
            <ThemedText style={[styles.navButtonText, currentQuestionIndex === 0 && styles.navButtonTextDisabled]}>
              {t('quiz.previous')}
            </ThemedText>
          </Pressable>

          <ThemedText style={[styles.questionIndicator, { color: iconColor }]}>
            {currentQuestionIndex + 1} / {questions.length}
          </ThemedText>

          <Pressable
            style={[
              styles.navButton,
              styles.navButtonRight,
              currentQuestionIndex === questions.length && styles.navButtonDisabled,
            ]}
            onPress={handleNext}
            disabled={currentQuestionIndex === questions.length}
          >
            <ThemedText style={[
              styles.navButtonText,
              currentQuestionIndex === questions.length && styles.navButtonTextDisabled,
            ]}>
              {hasAnswered ? t('quiz.nextQuestion') : t('quiz.skipQuestion')}
            </ThemedText>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={currentQuestionIndex === questions.length ? '#9CA3AF' : '#2563EB'}
            />
          </Pressable>
        </View>
      </BlurView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    gap: 10,
  },
  backButton: {
    padding: 6,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  headerProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerProgressWrapper: {
    // For results screen (full width inside header column)
    marginTop: 4,
  },
  headerProgressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
  },
  headerProgressFill: {
    height: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 3,
  },
  headerProgressLabel: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 36,
    textAlign: 'right',
  },
  speakButtonHeader: {
    padding: 8,
    borderRadius: 10,
  },

  // ── Scroll Content ──
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 20,
  },

  // ── Question Card ──
  questionCard: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  questionBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  questionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 5,
    alignSelf: 'flex-start',
  },
  questionBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  questionText: {
    fontSize: 18,
    lineHeight: 27,
    fontWeight: '500',
  },
  imageContainer: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  questionImage: {
    width: '100%',
    height: 180,
  },
  secondaryLanguageCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  languageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  languageBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  secondaryText: {
    fontSize: 15,
    lineHeight: 21,
  },
  speakButtonSmall: {
    padding: 5,
    borderRadius: 8,
  },

  // ── Answered Section ──
  answeredSection: {
    gap: 14,
    marginBottom: 8,
  },
  answerResultCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
  },
  answerResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  answerResultText: {
    fontSize: 17,
    fontWeight: '700',
  },
  userAnswerText: {
    fontSize: 15,
    marginBottom: 2,
  },
  correctAnswerText: {
    fontSize: 15,
    fontStyle: 'italic',
  },
  explanationCard: {
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  explanationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 14,
  },
  explanationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 5,
  },
  explanationBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F59E0B',
  },
  explanationText: {
    fontSize: 15,
    lineHeight: 23,
  },

  // ── Sticky Answer Bar ──
  stickyAnswerBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
  },
  answerPrompt: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  answerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  answerButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  answerButtonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
  trueButton: {
    backgroundColor: '#F0FDF4',
    borderWidth: 2.5,
    borderColor: '#86EFAC',
  },
  falseButton: {
    backgroundColor: '#FFF1F2',
    borderWidth: 2.5,
    borderColor: '#FECDD3',
  },
  answerButtonText: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // ── Bottom Navigation ──
  navigationBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
  },
  navContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 4,
  },
  navButtonRight: {
    flexDirection: 'row-reverse',
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2563EB',
  },
  navButtonTextDisabled: {
    color: '#9CA3AF',
  },
  questionIndicator: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },

  // ── Results Screen ──
  resultsCard: {
    borderRadius: 20,
    marginBottom: 20,
    overflow: 'hidden',
  },
  passedCard: {
    borderWidth: 2,
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  failedCard: {
    borderWidth: 2,
    borderColor: '#FECACA',
    backgroundColor: '#FFF1F2',
  },
  resultsBanner: {
    alignItems: 'center',
    padding: 28,
    paddingBottom: 20,
  },
  resultsTitlePassed: {
    fontSize: 26,
    fontWeight: '800',
    color: '#065F46',
    marginTop: 14,
    textAlign: 'center',
  },
  resultsTitleFailed: {
    fontSize: 26,
    fontWeight: '800',
    color: '#991B1B',
    marginTop: 14,
    textAlign: 'center',
  },
  resultsSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    opacity: 0.75,
    color: '#991B1B',
  },
  scorePillsRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 10,
  },
  scorePill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 4,
  },
  scorePillValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  scorePillLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
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
});