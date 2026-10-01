import { AnswerBar } from '@/components/quiz/AnswerBar';
import { AnsweredSection } from '@/components/quiz/AnsweredSection';
import { QuestionCard } from '@/components/quiz/QuestionCard';
import { QuizBottomNav } from '@/components/quiz/QuizBottomNav';
import { QuizHeader } from '@/components/quiz/QuizHeader';
import { QuizResultsScreen } from '@/components/quiz/QuizResultsScreen';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { usePreventScreenCapture } from '@/hooks/usePreventScreenCapture';
import { useQuizColors } from '@/hooks/useQuizColors';
import { useQuizExplanations } from '@/hooks/useQuizExplanations';
import { useQuizProgression } from '@/hooks/useQuizProgression';
import { useQuizQuestions } from '@/hooks/useQuizQuestions';
import { useQuizSession } from '@/hooks/useQuizSession';
import { useSignedQuizImages } from '@/hooks/useSignedQuizImages';
import { useChatStore } from '@/store/chat';
import { useFeatureFlagsStore } from '@/store/featureFlags';
import { useLanguagesStore } from '@/store/languages';
import { useUserProfileStore } from '@/store/user';
import type { QuizQuestion } from '@/store/quizQuestions';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';

/** Stable empty list so the review images are only resolved once the quiz is completed. */
const NO_QUESTIONS: QuizQuestion[] = [];

export default function QuizScreen() {
  const { t, i18n } = useTranslation();
  const { batchId, batchTitle } = useLocalSearchParams<{ batchId: string; batchTitle: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id || '';
  const sendMessage = useChatStore((state) => state.sendMessage);
  const { secondaryLanguage } = useLanguage();
  const { languages } = useLanguagesStore();

  const {
    progress,
    loading: progressLoading,
    loadedBatchId,
    refresh: refreshProgression,
  } = useQuizProgression(userId, String(batchId));
  const { questions } = useQuizQuestions(String(batchId), i18n.language, secondaryLanguage);

  const explanationEnabled = useFeatureFlagsStore((state) => state.flags.explanation);
  const chatExplanationEnabled = useFeatureFlagsStore((state) => state.flags.chat_explanation);
  const profile = useUserProfileStore((state) => state.user);

  // Prevent screenshots (no-op on web via hook wrapper)
  usePreventScreenCapture();

  const quiz = useQuizSession({
    userId,
    batchId: String(batchId),
    questions,
    progress,
    progressLoading,
    loadedBatchId,
    refreshProgression,
  });

  const question = quiz.currentQuestion;
  const explanations = useQuizExplanations({
    language: i18n.language,
    secondaryLanguage,
    question,
  });
  const images = useSignedQuizImages(
    questions,
    quiz.currentQuestionIndex,
    quiz.quizCompleted ? quiz.incorrectQuestions : NO_QUESTIONS
  );
  const colors = useQuizColors();

  const translatedQuestion = question?.translation?.text || '';
  const explanation = explanations.getExplanation(question);
  const secondaryText = explanations.getSecondaryText(question);
  const secondaryExplanation = explanations.getSecondaryExplanation(question);
  const secondaryLanguageLabel = secondaryLanguage ? t(`user.language.${secondaryLanguage}`) : '';

  const speakText = useCallback(
    async (text: string, langCode: string) => {
      try {
        await Speech.stop();
        const lang = languages.find((l) => l.code === langCode);
        Speech.speak(text, {
          language: lang?.tts_locale || langCode,
          pitch: 1.0,
          rate: 0.9,
          volume: 1.0,
        });
      } catch (error) {
        console.error('Error speaking text:', error);
      }
    },
    [languages]
  );

  const handleSpeakQuestion = () => speakText(translatedQuestion, i18n.language);
  const handleSpeakSecondaryQuestion = () => {
    if (secondaryText && secondaryLanguage) speakText(secondaryText, secondaryLanguage);
  };
  const handleSpeakExplanation = () => speakText(explanation, i18n.language);
  const handleSpeakSecondaryExplanation = () => {
    if (secondaryExplanation && secondaryLanguage) speakText(secondaryExplanation, secondaryLanguage);
  };

  const handleAskAIChat = useCallback(() => {
    if (!translatedQuestion) return;
    sendMessage(translatedQuestion, i18n.language, [], question?.id);
    router.navigate('/(tabs)/chat');
  }, [translatedQuestion, question?.id, i18n.language, sendMessage, router]);

  if (progressLoading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color="#2563EB" style={{ flex: 1 }} />
      </ThemedView>
    );
  }

  if (quiz.quizCompleted) {
    return (
      <QuizResultsScreen
        title={String(batchTitle ?? '')}
        score={quiz.score}
        incorrectCount={quiz.incorrectCount}
        questions={questions}
        incorrectQuestions={quiz.incorrectQuestions}
        answers={quiz.answers}
        explanationEnabled={explanationEnabled}
        secondaryLanguage={secondaryLanguage}
        explanations={explanations}
        images={images}
        previousDisabled={quiz.currentQuestionIndex === 0}
        onBack={() => router.back()}
        onPrevious={quiz.previous}
        onReset={quiz.reset}
      />
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.backgroundColor }]}>
      <QuizHeader
        title={String(batchTitle ?? '')}
        progressPercent={quiz.progressPercent}
        progressLabel={`${quiz.currentQuestionIndex + 1}/${questions.length}`}
        onBack={() => router.back()}
      />

      <ScrollView
        key="quiz-scroll"
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <QuestionCard
          key={question?.id ?? 'no-question'}
          question={question}
          text={translatedQuestion}
          secondaryText={secondaryText}
          languageLabel={secondaryLanguageLabel}
          imageUrl={images.getUrl(question?.image_filename)}
          onSpeak={handleSpeakQuestion}
          onSpeakSecondary={handleSpeakSecondaryQuestion}
        />

        {quiz.hasAnswered && (
          <AnsweredSection
            isCorrect={quiz.isCorrect}
            userAnswer={quiz.userAnswer}
            questionIsCorrect={!!question?.is_correct}
            explanationEnabled={explanationEnabled}
            chatExplanationEnabled={chatExplanationEnabled}
            showChatAI={!!profile?.has_ai}
            onAskAI={handleAskAIChat}
            explanation={explanation}
            explanationLoading={explanations.isLoading(question)}
            onFetchExplanation={() => explanations.fetch(question)}
            onSpeakExplanation={handleSpeakExplanation}
            secondaryExplanation={secondaryExplanation}
            secondaryLanguageLabel={secondaryLanguageLabel}
            onSpeakSecondaryExplanation={handleSpeakSecondaryExplanation}
          />
        )}
      </ScrollView>

      {!quiz.hasAnswered && <AnswerBar onAnswer={quiz.answer} />}

      <QuizBottomNav
        onPrevious={quiz.previous}
        previousDisabled={quiz.currentQuestionIndex === 0}
        counter={`${quiz.currentQuestionIndex + 1} / ${questions.length}`}
        right={{
          label: quiz.hasAnswered ? t('quiz.nextQuestion') : t('quiz.skipQuestion'),
          icon: 'chevron-forward',
          onPress: quiz.next,
          disabled: quiz.currentQuestionIndex === questions.length,
          reverse: true,
        }}
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
});
