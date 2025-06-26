import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useLanguage } from '@/hooks/useLanguage';
import { useQuizQuestions } from '@/hooks/useQuizQuestions';
import { ThemedButton } from '../components/ThemedButton';

interface UserAnswer {
  questionId: string;
  answer: boolean;
  isCorrect: boolean;
}

export default function QuizScreen() {
  const { t, i18n } = useTranslation();
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
  const router = useRouter();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [showExplanation, setShowExplanation] = useState(false);
  const { secondaryLanguage } = useLanguage();
  const [userAnswer, setUserAnswer] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [quizCompleted, setQuizCompleted] = useState(false);

  // Fetch questions from store/hook
  const { questions } = useQuizQuestions(String(batchId), i18n.language);
  console.log("🚀 ~ QuizScreen ~ questions:", questions)
  const currentQuestion = questions[currentQuestionIndex];
  console.log("🚀 ~ QuizScreen ~ currentQuestion:", currentQuestion)

  const getTranslatedQuestion = () => {
    return currentQuestion?.translation?.text || '';
  };

  const getTranslatedExplanation = () => {
    return currentQuestion?.translation?.explanation || '';
  };

  const handleAnswer = (answer: boolean) => {
    setUserAnswer(answer);
    setShowExplanation(true);
    // Non c'è più answer nel backend: qui dovrai gestire la logica di risposta corretta in base ai dati reali (es: opzioni/soluzione)
    // if (answer === currentQuestion.answer) {
    //   setScore(score + 1);
    // }
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setShowExplanation(false);
      setUserAnswer(null);
    } else {
      setQuizCompleted(true);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      setShowExplanation(false);
      setUserAnswer(null);
    }
  };

  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

  const getSecondaryTranslation = (type: 'question' | 'explanation') => {
    if (!secondaryLanguage || secondaryLanguage === 'none') return null;
    // Nel backend ora hai solo currentQuestion.translation per la lingua principale
    return null;
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
    const secondaryText = getSecondaryTranslation('question');
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
            setShowExplanation(false);
            setUserAnswer(null);
            setScore(0);
            setQuizCompleted(false);
          }}
        />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </Pressable>
        <ThemedText type="title" style={styles.title}>
          {t(`quiz.categories.${batchId}.title`)}
        </ThemedText>
      </View>

      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: `${progress}%` }]} />
        <ThemedText style={styles.progressText}>
          {t('quiz.questionCount', { current: currentQuestionIndex + 1, total: questions.length })}
        </ThemedText>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentContainer}>
          <View style={styles.questionCard}>
            <View style={styles.questionHeader}>
              <Ionicons name="help-circle-outline" size={24} color="#007AFF" />
              <ThemedText type="defaultSemiBold" style={styles.questionTitle}>
                {t('quiz.question')}
              </ThemedText>
              <Pressable onPress={handleSpeakQuestion} style={styles.speakButton}>
                <Ionicons name="volume-medium" size={24} color="#007AFF" />
              </Pressable>
            </View>
            <View style={styles.questionContent}>
              <ThemedText style={styles.questionText}>{getTranslatedQuestion()}</ThemedText>
              
              {currentQuestion?.image_url && (
                <View style={styles.imageContainer}>
                  <Image
                    source={{ uri: currentQuestion.image_url }}
                    style={styles.questionImage}
                    resizeMode="contain"
                  />
                </View>
              )}
              
              {getSecondaryTranslation('question') && (
                <View style={styles.translationContainer}>
                  <View style={styles.translationHeader}>
                    <ThemedText style={styles.translationLabel}>
                      {t(`user.language.${secondaryLanguage}`)}:
                    </ThemedText>
                    <Pressable onPress={handleSpeakSecondaryQuestion} style={styles.speakButton}>
                      <Ionicons name="volume-medium" size={24} color="#007AFF" />
                    </Pressable>
                  </View>
                  <ThemedText style={styles.translationText}>
                    {getSecondaryTranslation('question')}
                  </ThemedText>
                </View>
              )}
            </View>
          </View>

          {!showExplanation ? (
            <View style={styles.answerButtons}>
              <ThemedButton
                title={t('quiz.true')}
                onPress={() => handleAnswer(true)}
                style={styles.answerButton}
              />
              <ThemedButton
                title={t('quiz.false')}
                onPress={() => handleAnswer(false)}
                style={styles.answerButton}
              />
            </View>
          ) : (
            <View style={styles.explanationContainer}>
              <View style={styles.explanationHeader}>
                <Ionicons name="bulb-outline" size={24} color="#FFB800" />
                <ThemedText type="defaultSemiBold" style={styles.explanationTitle}>
                  {t('quiz.explanation')}
                </ThemedText>
                <Pressable onPress={handleSpeakExplanation} style={styles.speakButton}>
                  <Ionicons name="volume-medium" size={24} color="#007AFF" />
                </Pressable>
              </View>
              <View style={styles.explanationContent}>
                <ThemedText style={styles.explanationText}>
                  {getTranslatedExplanation()}
                </ThemedText>
                
                {getSecondaryTranslation('explanation') && (
                  <View style={styles.translationContainer}>
                    <View style={styles.translationHeader}>
                      <ThemedText style={styles.translationLabel}>
                        {t(`user.language.${secondaryLanguage}`)}:
                      </ThemedText>
                      <Pressable onPress={handleSpeakSecondaryExplanation} style={styles.speakButton}>
                        <Ionicons name="volume-medium" size={24} color="#007AFF" />
                      </Pressable>
                    </View>
                    <ThemedText style={styles.translationText}>
                      {getSecondaryTranslation('explanation')}
                    </ThemedText>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {showExplanation && (
        <BlurView intensity={30} tint="light" style={styles.navigationButtons}>
          <View style={styles.navButtonContainer}>
            {currentQuestionIndex > 0 && (
              <Pressable onPress={handlePrevious} style={styles.navButton}>
                <Ionicons name="chevron-back" size={24} color="#007AFF" />
              </Pressable>
            )}
          </View>
          <View style={[styles.navButtonContainer, styles.rightButtonContainer]}>
            {currentQuestionIndex < questions.length - 1 && (
              <Pressable onPress={handleNext} style={styles.navButton}>
                <Ionicons name="chevron-forward" size={24} color="#007AFF" />
              </Pressable>
            )}
          </View>
        </BlurView>
      )}
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
    padding: 16,
    paddingTop: 60,
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    fontSize: 20,
  },
  progressContainer: {
    height: 4,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#007AFF',
  },
  progressText: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: 12,
    color: '#666',
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  questionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  questionTitle: {
    fontSize: 18,
    color: '#333',
  },
  questionContent: {
    gap: 12,
  },
  questionText: {
    fontSize: 18,
    lineHeight: 24,
  },
  translationContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  translationLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  translationText: {
    fontSize: 14,
    lineHeight: 20,
  },
  answerButtons: {
    flexDirection: 'row',
    gap: 12,
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
  answerButton: {
    flex: 1,
    padding: 16,
    marginBottom: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  explanationContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  explanationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  explanationTitle: {
    fontSize: 18,
    color: '#333',
  },
  explanationContent: {
    gap: 12,
  },
  explanationText: {
    fontSize: 16,
    lineHeight: 22,
  },
  navigationButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    padding: 16,
    marginBottom: 32,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  navButtonContainer: {
    flex: 1,
  },
  rightButtonContainer: {
    alignItems: 'flex-end',
  },
  navButton: {
    padding: 8,
  },
  rightButton: {
    justifyContent: 'flex-end',
  },
  navButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
  score: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  imageContainer: {
    marginVertical: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  questionImage: {
    width: '100%',
    height: 200,
  },
  textWithSpeakButton: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  speakButton: {
    marginLeft: 'auto',
    padding: 4,
  },
  translationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
});