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
import { updateQuizProgression } from '@/queries/quizProgression';
import { ThemedButton } from '../components/ThemedButton';

export default function QuizScreen() {
  const { t, i18n } = useTranslation();
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id || '';
  const { progress: quizProgress, loading: progressLoading } = useQuizProgression(userId, String(batchId));
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const { secondaryLanguage } = useLanguage();
  const [score, setScore] = useState(0);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [answers, setAnswers] = useState<any>({});
  const { questions } = useQuizQuestions(String(batchId), i18n.language, secondaryLanguage);
  const currentQuestion = questions[currentQuestionIndex] as any;

  const getTranslatedQuestion = () => {
    return currentQuestion?.translation?.text || '';
  };

  const getTranslatedExplanation = () => {
    return currentQuestion?.translation?.explanation || '';
  };

  // Popola answers da quizProgress se presente
  useEffect(() => {
    if (quizProgress && quizProgress.length > 0 && Object.keys(answers).length === 0) {
      const progressAnswers = quizProgress[0]?.answers || {};
      setAnswers(progressAnswers);
      if (quizProgress[0]?.current_question) {
        setCurrentQuestionIndex(quizProgress[0].current_question - 1);
      }
      if (quizProgress[0]?.completed) {
        setQuizCompleted(true);
      }
    }
  }, [quizProgress, answers]);

  // Aggiorna Supabase quando l'utente risponde
  const handleAnswer = async (answer: boolean) => {
    console.log("🚀 ~ handleAnswer ~ answer:", answer)
    console.log("currentQuestion?.is_correct:", currentQuestion?.is_correct);

    const questionId = currentQuestion?.id;
    const updatedAnswers = { ...answers, [questionId]: answer };
    setAnswers(updatedAnswers);
    
    // Calcola se la risposta è corretta
    const isCorrect = answer === currentQuestion?.is_correct;
    if (isCorrect) {
      setScore(prev => prev + 1);
    }
    
    await updateQuizProgression(userId, String(batchId), updatedAnswers, currentQuestionIndex + 1, false);
  };

  // Aggiorna Supabase quando il quiz è completato
  const handleNext = async () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      await updateQuizProgression(userId, String(batchId), answers, currentQuestionIndex + 2, false);
    } else {
      setQuizCompleted(true);
      await updateQuizProgression(userId, String(batchId), answers, currentQuestionIndex + 1, true);
    }
  };

  const handlePrevious = async () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      await updateQuizProgression(userId, String(batchId), answers, currentQuestionIndex, false);
    }
  };

  const progressPercent = ((currentQuestionIndex + 1) / questions.length) * 100;

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
      <ThemedView style={styles.container}>
        <ThemedText style={styles.title}>{t('quiz.completed')}</ThemedText>
        <ThemedText style={styles.score}>
          {t('quiz.score', { score, total: questions.length })}
        </ThemedText>
        <ThemedButton
          title={t('quiz.restart')}
          onPress={() => {
            setCurrentQuestionIndex(0);
            setScore(0);
            setQuizCompleted(false);
            setAnswers({});
            updateQuizProgression(userId, String(batchId), {}, 1, false);
          }}
        />
      </ThemedView>
    );
  }

  const hasAnswered = typeof answers[currentQuestion?.id] !== 'undefined';
  const userAnswer = answers[currentQuestion?.id];
  const isCorrect = userAnswer === currentQuestion?.is_correct;

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#2563EB" />
        </Pressable>
        <View style={styles.headerContent}>
          <ThemedText type="title" style={styles.title}>
            {t(`quiz.categories.${batchId}.title`)}
          </ThemedText>
          <ThemedText style={styles.questionCounter}>
            {t('quiz.questionOf', { current: currentQuestionIndex + 1, total: questions.length })}
          </ThemedText>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressWrapper}>
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
        </View>
        <ThemedText style={styles.progressText}>
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
        <View style={styles.questionCard}>
          <View style={styles.questionHeader}>
            <View style={styles.questionBadge}>
              <Ionicons name="help-circle" size={20} color="#2563EB" />
              <ThemedText style={styles.questionBadgeText}>{t('quiz.question')}</ThemedText>
            </View>
            <Pressable onPress={handleSpeakQuestion} style={styles.speakButton}>
              <Ionicons name="volume-high" size={24} color="#2563EB" />
            </Pressable>
          </View>
          
          <ThemedText style={styles.questionText}>
            {getTranslatedQuestion()}
          </ThemedText>
          
          {currentQuestion?.image_url && (
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: currentQuestion.image_url }}
                style={styles.questionImage}
                resizeMode="contain"
              />
            </View>
          )}
          
          {getSecondaryTranslation('text') && (
            <View style={styles.secondaryLanguageCard}>
              <View style={styles.secondaryHeader}>
                <View style={styles.languageBadge}>
                  <ThemedText style={styles.languageBadgeText}>
                    {t(`user.language.${secondaryLanguage}`)}
                  </ThemedText>
                </View>
                <Pressable onPress={handleSpeakSecondaryQuestion} style={styles.speakButtonSmall}>
                  <Ionicons name="volume-high" size={20} color="#6B7280" />
                </Pressable>
              </View>
              <ThemedText style={styles.secondaryText}>
                {getSecondaryTranslation('text')}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Answer Section */}
        {!hasAnswered ? (
          <View style={styles.answerSection}>
            <ThemedText style={styles.answerPrompt}>
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
              isCorrect ? styles.correctCard : styles.incorrectCard
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
              <ThemedText style={styles.userAnswerText}>
                {t('quiz.yourAnswer', { answer: userAnswer ? t('quiz.true') : t('quiz.false') })}
              </ThemedText>
              {!isCorrect && (
                <ThemedText style={styles.correctAnswerText}>
                  {t('quiz.correctAnswerIs', { answer: currentQuestion?.is_correct ? t('quiz.true') : t('quiz.false') })}
                </ThemedText>
              )}
            </View>

            {/* Explanation Card */}
            <View style={styles.explanationCard}>
              <View style={styles.explanationHeader}>
                <View style={styles.explanationBadge}>
                  <Ionicons name="bulb" size={20} color="#F59E0B" />
                  <ThemedText style={styles.explanationBadgeText}>{t('quiz.explanation')}</ThemedText>
                </View>
                <Pressable onPress={handleSpeakExplanation} style={styles.speakButton}>
                  <Ionicons name="volume-high" size={24} color="#F59E0B" />
                </Pressable>
              </View>
              
              <ThemedText style={styles.explanationText}>
                {getTranslatedExplanation()}
              </ThemedText>
              
              {getSecondaryTranslation('explanation') && (
                <View style={styles.secondaryLanguageCard}>
                  <View style={styles.secondaryHeader}>
                    <View style={styles.languageBadge}>
                      <ThemedText style={styles.languageBadgeText}>
                        {t(`user.language.${secondaryLanguage}`)}
                      </ThemedText>
                    </View>
                    <Pressable onPress={handleSpeakSecondaryExplanation} style={styles.speakButtonSmall}>
                      <Ionicons name="volume-high" size={20} color="#6B7280" />
                    </Pressable>
                  </View>
                  <ThemedText style={styles.secondaryText}>
                    {getSecondaryTranslation('explanation')}
                  </ThemedText>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Navigation Bar */}
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
            <View style={styles.questionDots}>
              {questions.slice(Math.max(0, currentQuestionIndex - 2), currentQuestionIndex + 3).map((_, index) => {
                const actualIndex = Math.max(0, currentQuestionIndex - 2) + index;
                const isCurrentQuestion = actualIndex === currentQuestionIndex;
                const isAnswered = typeof answers[questions[actualIndex]?.id] !== 'undefined';
                
                return (
                  <View
                    key={actualIndex}
                    style={[
                      styles.dot,
                      isCurrentQuestion && styles.currentDot,
                      isAnswered && !isCurrentQuestion && styles.answeredDot
                    ]}
                  />
                );
              })}
            </View>
          </View>

          <Pressable
            style={[
              styles.navButton,
              styles.navButtonRight,
              currentQuestionIndex === questions.length - 1 && styles.navButtonDisabled
            ]}
            onPress={handleNext}
            disabled={currentQuestionIndex === questions.length - 1}
          >
            <ThemedText style={[
              styles.navButtonText,
              currentQuestionIndex === questions.length - 1 && styles.navButtonTextDisabled
            ]}>
              {hasAnswered ? t('quiz.nextQuestion') : t('quiz.skipQuestion')}
            </ThemedText>
            <Ionicons 
              name="chevron-forward" 
              size={24} 
              color={currentQuestionIndex === questions.length - 1 ? "#9CA3AF" : "#2563EB"} 
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
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
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
    color: '#1E293B',
    marginBottom: 4,
  },
  questionCounter: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  progressWrapper: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  progressContainer: {
    height: 6,
    backgroundColor: '#E2E8F0',
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
    color: '#64748B',
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
    backgroundColor: '#FFFFFF',
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
    borderBottomColor: '#F1F5F9',
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
    color: '#1E293B',
    fontWeight: '500',
  },
  imageContainer: {
    marginTop: 20,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
  },
  questionImage: {
    width: '100%',
    height: 200,
  },
  secondaryLanguageCard: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  secondaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  languageBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  languageBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  secondaryText: {
    fontSize: 16,
    lineHeight: 22,
    color: '#475569',
  },
  speakButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  speakButtonSmall: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  answerSection: {
    margin: 20,
    marginTop: 0,
  },
  answerPrompt: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
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
  correctCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  incorrectCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
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
    color: '#374151',
    marginBottom: 4,
  },
  correctAnswerText: {
    fontSize: 16,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  explanationCard: {
    backgroundColor: '#FFFFFF',
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
    borderBottomColor: '#F1F5F9',
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
    color: '#374151',
  },
  navigationBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
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
    backgroundColor: '#F8FAFC',
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
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
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
});