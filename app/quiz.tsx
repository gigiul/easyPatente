import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

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
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
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
  const { score } = useQuizScore(userId, String(batchId), answers, quizCompleted);
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

  const getTranslatedQuestion = () => {
    return currentQuestion?.translation?.text || '';
  };

  const getTranslatedExplanation = () => {
    return currentQuestion?.translation?.explanation || '';
  };

  // Reset state quando cambia il batchId
  useEffect(() => {
    setCurrentQuestionIndex(0);
    setQuizCompleted(false);
    setAnswers({});
    setIsResetting(false);
  }, [batchId]);

  // Popola answers da quizProgress se presente (solo se non stiamo resettando)
  useEffect(() => {
    if (!isResetting && quizProgress && quizProgress.length > 0 && Object.keys(answers).length === 0) {
      // Controllo aggiuntivo: se il progresso è un reset recente, ignoralo
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

  // Aggiorna Supabase quando l'utente risponde
  const handleAnswer = async (answer: boolean) => {
    const questionId = currentQuestion?.id;
    const updatedAnswers = { ...answers, [questionId]: answer };
    setAnswers(updatedAnswers);

    await updateQuizProgression(userId, String(batchId), updatedAnswers, currentQuestionIndex + 1, false);
  };

  // Aggiorna Supabase quando il quiz è completato
  const handleNext = async () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      await updateQuizProgression(userId, String(batchId), answers, currentQuestionIndex + 2, false);
    } else {
      // Quiz completato
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      
      // Prima aggiorna il database con tutte le risposte
      await updateQuizProgression(userId, String(batchId), answers, currentQuestionIndex + 1, true);
      
      // Poi imposta il quiz come completato per aggiornare l'UI
      setQuizCompleted(true);
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

  const progressPercent = ((currentQuestionIndex + 1) / questions.length) * 100;

  const handleReset = async () => {
    setIsResetting(true);
    
    // Prima resettiamo lo stato locale
    setCurrentQuestionIndex(0);
    setQuizCompleted(false);
    setAnswers({});
    
    // Poi aggiorniamo il database
    await updateQuizProgression(userId, String(batchId), {}, 1, false);
    
    // Forziamo il refresh del progresso
    refreshProgression();
    
    // Attendiamo un po' di più per assicurarci che tutto sia sincronizzato
    setTimeout(() => {
      setIsResetting(false);
    }, 500);
  };

  const getSecondaryTranslation = (type: 'text' | 'explanation') => {
    return currentQuestion?.secondaryTranslation?.[type] || null;
  };

  const speakText = async (text: string, language: string) => {
    try {
      await Speech.stop();
      // Use es-MX for Spanish to get Latin American accent
      const ttsLanguage = language === 'es' ? 'es-MX' : language;
      Speech.speak(text, {
        language: ttsLanguage,
        pitch: 1.0,
        rate: 0.9,
      });
    } catch (error) {
      console.error('Error speaking text:', error);
    }
  };

  const handleSpeakQuestion = () => {
    const questionText = getTranslatedQuestion();
    speakText(questionText, i18n.language);
  };

  const handleSpeakSecondaryQuestion = () => {
    const secondaryText = getSecondaryTranslation('text');
    if (secondaryText && secondaryLanguage) {
      speakText(secondaryText, secondaryLanguage);
    }
  };

  const handleSpeakExplanation = () => {
    const explanationText = getTranslatedExplanation();
    speakText(explanationText, i18n.language);
  };

  const handleSpeakSecondaryExplanation = () => {
    const secondaryText = getSecondaryTranslation('explanation');
    if (secondaryText && secondaryLanguage) {
      speakText(secondaryText, secondaryLanguage);
    }
  };

  // Show loading indicator while progress is loading
  if (progressLoading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" style={{ flex: 1, justifyContent: 'center' }} />
      </ThemedView>
    );
  }

  if (quizCompleted) {
    return (
      <ThemedView style={[styles.container, { backgroundColor }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: cardBackgroundColor, borderBottomColor: borderColor }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color="#2563EB" />
          </Pressable>
          <View style={styles.headerContent}>
            <ThemedText type="title" style={[styles.title, { color: textColor }]}>
              {t(`quiz.categories.${batchId}.title`)}
            </ThemedText>
            <ThemedText style={[styles.questionCounter, { color: iconColor }]}>
              {t('quiz.completed')}
            </ThemedText>
          </View>
        </View>

        {/* Progress Bar - Completed */}
        <View style={[styles.progressWrapper, { backgroundColor: cardBackgroundColor, borderBottomColor: borderColor }]}>
          <View style={[styles.progressContainer, { backgroundColor: borderColor }]}>
            <View style={[styles.progressBar, { width: '100%' }]} />
          </View>
          <ThemedText style={[styles.progressText, { color: iconColor }]}>
            {t('quiz.percentCompleted', { percent: 100 })}
          </ThemedText>
        </View>

        {/* Results Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.questionCard, styles.resultsCard, { backgroundColor: cardBackgroundColor }]}>
            <View style={styles.resultsHeader}>
              <Ionicons name="trophy" size={48} color="#F59E0B" />
              <ThemedText style={[styles.resultsTitle, { color: textColor }]}>{t('quiz.completed')}</ThemedText>
            </View>

            <View style={[styles.scoreContainer, { backgroundColor: secondaryBackgroundColor, borderColor }]}>
              <ThemedText style={[styles.scoreText, { color: textColor }]}>
                {t('quiz.score', { score, total: questions.length })}
              </ThemedText>
              <ThemedText style={styles.scorePercentage}>
                {Math.round((score / questions.length) * 100)}%
              </ThemedText>
            </View>

            <View style={styles.restartContainer}>
              <ThemedButton
                title={t('quiz.restart')}
                onPress={handleReset}
              />
            </View>
          </View>
        </ScrollView>

        {/* Navigation Bar  */}
        <BlurView intensity={80} tint="light" style={styles.navigationBar}>
          <View style={styles.navContent}>
            <Pressable
              style={[
                styles.navButton,
                currentQuestionIndex === 0 && styles.navButtonDisabled
              ]}
              onPress={handlePrevious}
              disabled={currentQuestionIndex === 0}
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color={currentQuestionIndex === 0 ? "#9CA3AF" : "#2563EB"}
              />
              <ThemedText style={[
                styles.navButtonText,
                currentQuestionIndex === 0 && styles.navButtonTextDisabled
              ]}>
                {t('quiz.previous')}
              </ThemedText>
            </Pressable>

            <View style={styles.navCenter}>
            </View>

            <Pressable
              style={styles.navButton}
              onPress={handleReset}
            >
              <ThemedText style={styles.navButtonText}>
                {t('quiz.restart')}
              </ThemedText>
              <Ionicons name="refresh" size={24} color="#2563EB" />
            </Pressable>
          </View>
        </BlurView>
      </ThemedView>
    );
  }

  const hasAnswered = typeof answers[currentQuestion?.id] !== 'undefined';
  const userAnswer = answers[currentQuestion?.id];
  const isCorrect = userAnswer === currentQuestion?.is_correct;

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: cardBackgroundColor, borderBottomColor: borderColor }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#2563EB" />
        </Pressable>
        <View style={styles.headerContent}>
          <ThemedText type="title" style={[styles.title, { color: textColor }]}>
            {t(`quiz.categories.${batchId}.title`)}
          </ThemedText>
          <ThemedText style={[styles.questionCounter, { color: iconColor }]}>
            {t('quiz.questionOf', { current: currentQuestionIndex + 1, total: questions.length })}
          </ThemedText>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={[styles.progressWrapper, { backgroundColor: cardBackgroundColor, borderBottomColor: borderColor }]}>
        <View style={[styles.progressContainer, { backgroundColor: borderColor }]}>
          <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
        </View>
        <ThemedText style={[styles.progressText, { color: iconColor }]}>
          {t('quiz.percentCompleted', { percent: Math.round(progressPercent) })}
        </ThemedText>
      </View>

      {/* Main Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Question Card */}
        <View style={[styles.questionCard, { backgroundColor: cardBackgroundColor }]}>
          <View style={[styles.questionHeader, { borderBottomColor: borderColor }]}>
            <View style={styles.questionBadge}>
              <Ionicons name="help-circle" size={20} color="#2563EB" />
              <ThemedText style={styles.questionBadgeText}>{t('quiz.question')}</ThemedText>
            </View>
            <Pressable onPress={handleSpeakQuestion} style={[styles.speakButton, { backgroundColor: secondaryBackgroundColor }]}>
              <Ionicons name="volume-high" size={24} color="#2563EB" />
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
                  <Ionicons name="volume-high" size={20} color="#6B7280" />
                </Pressable>
              </View>
              <ThemedText style={[styles.secondaryText, { color: iconColor }]}>
                {getSecondaryTranslation('text')}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Answer Section */}
        {!hasAnswered ? (
          <View style={styles.answerSection}>
            <ThemedText style={[styles.answerPrompt, { color: textColor }]}>
              {t('quiz.selectAnswer')}
            </ThemedText>
            <View style={styles.answerButtons}>
              <Pressable
                style={[styles.answerButton, styles.trueButton]}
                onPress={() => handleAnswer(true)}
              >
                <Ionicons name="checkmark-circle" size={32} color="#059669" />
                <ThemedText style={styles.answerButtonText}>{t('quiz.true')}</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.answerButton, styles.falseButton]}
                onPress={() => handleAnswer(false)}
              >
                <Ionicons name="close-circle" size={32} color="#DC2626" />
                <ThemedText style={styles.answerButtonText}>{t('quiz.false')}</ThemedText>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.answeredSection}>
            {/* User Answer Display */}
            <View style={[
              styles.answerResultCard,
              {
                backgroundColor: isCorrect ? correctCardColor : incorrectCardColor,
                borderColor: isCorrect ? '#10B981' : '#EF4444'
              }
            ]}>
              <View style={styles.answerResultHeader}>
                <Ionicons
                  name={isCorrect ? "checkmark-circle" : "close-circle"}
                  size={28}
                  color={isCorrect ? "#059669" : "#DC2626"}
                />
                <ThemedText style={[
                  styles.answerResultText,
                  { color: isCorrect ? "#059669" : "#DC2626" }
                ]}>
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

            {/* Explanation Card */}
            {getTranslatedExplanation() && (
              <View style={[styles.explanationCard, { backgroundColor: cardBackgroundColor }]}>
                <View style={[styles.explanationHeader, { borderBottomColor: borderColor }]}>
                  <View style={styles.explanationBadge}>
                    <Ionicons name="bulb" size={20} color="#F59E0B" />
                    <ThemedText style={styles.explanationBadgeText}>{t('quiz.explanation')}</ThemedText>
                  </View>
                  <Pressable onPress={handleSpeakExplanation} style={[styles.speakButton, { backgroundColor: secondaryBackgroundColor }]}>
                    <Ionicons name="volume-high" size={24} color="#F59E0B" />
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
                        <Ionicons name="volume-high" size={20} color="#6B7280" />
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

      {/* Navigation Bar */}
      <BlurView intensity={80} tint="light" style={[styles.navigationBar, { backgroundColor: cardBackgroundColor + 'F0', borderTopColor: borderColor }]}>
        <View style={styles.navContent}>
          <Pressable
            style={[
              styles.navButton,
              { backgroundColor: secondaryBackgroundColor },
              currentQuestionIndex === 0 && styles.navButtonDisabled
            ]}
            onPress={handlePrevious}
            disabled={currentQuestionIndex === 0}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={currentQuestionIndex === 0 ? "#9CA3AF" : "#2563EB"}
            />
            <ThemedText style={[
              styles.navButtonText,
              currentQuestionIndex === 0 && styles.navButtonTextDisabled
            ]}>
              {t('quiz.previous')}
            </ThemedText>
          </Pressable>

          <View style={styles.navCenter}>
            <ThemedText style={[styles.questionIndicator, { color: iconColor }]}>
              {currentQuestionIndex + 1} / {questions.length}
            </ThemedText>
          </View>

          <Pressable
            style={[
              styles.navButton,
              styles.navButtonRight,
              { backgroundColor: secondaryBackgroundColor },
              currentQuestionIndex === questions.length && styles.navButtonDisabled
            ]}
            onPress={handleNext}
            disabled={currentQuestionIndex === questions.length}
          >
            <ThemedText style={[
              styles.navButtonText,
              currentQuestionIndex === questions.length && styles.navButtonTextDisabled
            ]}>
              {hasAnswered ? t('quiz.nextQuestion') : t('quiz.skipQuestion')}
            </ThemedText>
            <Ionicons
              name="chevron-forward"
              size={24}
              color={currentQuestionIndex === questions.length ? "#9CA3AF" : "#2563EB"}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    marginRight: 16,
    padding: 8,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  questionCounter: {
    fontSize: 14,
    fontWeight: '500',
  },
  progressWrapper: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  progressContainer: {
    height: 6,
    borderRadius: 3,
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  questionCard: {
    margin: 20,
    marginBottom: 16,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  questionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  questionBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
  },
  questionText: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '500',
  },
  imageContainer: {
    marginTop: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  questionImage: {
    width: '100%',
    height: 200,
  },
  secondaryLanguageCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  languageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  languageBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  secondaryText: {
    fontSize: 16,
    lineHeight: 22,
  },
  speakButton: {
    padding: 8,
    borderRadius: 8,
  },
  speakButtonSmall: {
    padding: 6,
    borderRadius: 6,
  },
  answerSection: {
    margin: 20,
    marginTop: 0,
  },
  answerPrompt: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
  },
  answerButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  answerButton: {
    flex: 1,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  trueButton: {
    backgroundColor: '#ECFDF5',
    borderWidth: 2,
    borderColor: '#A7F3D0',
  },
  falseButton: {
    backgroundColor: '#FEF2F2',
    borderWidth: 2,
    borderColor: '#FECACA',
  },
  answerButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
  },
  answeredSection: {
    margin: 20,
    marginTop: 0,
    gap: 16,
  },
  answerResultCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
  },
  answerResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  answerResultText: {
    fontSize: 18,
    fontWeight: '700',
  },
  userAnswerText: {
    fontSize: 16,
    marginBottom: 4,
  },
  correctAnswerText: {
    fontSize: 16,
    fontStyle: 'italic',
  },
  explanationCard: {
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  explanationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  explanationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  explanationBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F59E0B',
  },
  explanationText: {
    fontSize: 16,
    lineHeight: 24,
  },
  navigationBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 32,
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 6,
  },
  navButtonRight: {
    flexDirection: 'row-reverse',
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563EB',
  },
  navButtonTextDisabled: {
    color: '#9CA3AF',
  },
  navCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 20,
  },
  questionDots: {
    flexDirection: 'row',
    gap: 8,
  },
  questionIndicator: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  currentDot: {
    backgroundColor: '#2563EB',
    width: 12,
    height: 8,
    borderRadius: 4,
  },
  answeredDot: {
    backgroundColor: '#10B981',
  },
  score: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  resultsCard: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  resultsHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  resultsTitle: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  scoreContainer: {
    alignItems: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderRadius: 16,
    borderWidth: 2,
    minWidth: 200,
  },
  scoreText: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  scorePercentage: {
    fontSize: 32,
    fontWeight: '800',
    color: '#2563EB',
    textAlign: 'center',
  },
  restartContainer: {
    width: '100%',
    paddingHorizontal: 20,
  },
});