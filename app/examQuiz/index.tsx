import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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

import { ThemedButton } from '@/components/ThemedButton';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/hooks/useAuth';
import { useQuizProgression } from '@/hooks/useQuizProgression';
import { useQuizQuestions } from '@/hooks/useQuizQuestions';
import { useQuizScore } from '@/hooks/useQuizScore';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useQuizTheme } from '@/hooks/useQuizTheme';
import { updateQuizProgression } from '@/queries/quizProgression';

const EXAM_DURATION_SECONDS = 20 * 60; // 20 minutes

export default function ExamQuizScreen() {
  const { t, i18n } = useTranslation();
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id || '';

  const { progress: quizProgress, loading: progressLoading } = useQuizProgression(userId, String(batchId));
  const { questions } = useQuizQuestions(String(batchId), i18n.language, undefined);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<any>({});
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(EXAM_DURATION_SECONDS);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { score, incorrectCount } = useQuizScore(userId, String(batchId), answers, quizCompleted);
  const currentQuestion = questions[currentQuestionIndex] as any;

  // Theme colors
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const iconColor = useThemeColor({}, 'icon');
  const cardBackgroundColor = useThemeColor({ light: '#FFFFFF', dark: '#1F2937' }, 'background');
  const borderColor = useThemeColor({ light: '#E2E8F0', dark: '#374151' }, 'icon');
  const secondaryBackgroundColor = useThemeColor({ light: '#F8FAFC', dark: '#111827' }, 'background');
  const quizTheme = useQuizTheme();

  // --- Initialization & State Restoration ---
  useEffect(() => {
    if (quizProgress && quizProgress.length > 0 && Object.keys(answers).length === 0) {
      const progressRecord = quizProgress[0];
      if (progressRecord.answers) {
        setAnswers(progressRecord.answers);
      }
      if (progressRecord.completed) {
        setQuizCompleted(true);
      }
      // Resume timer logic if needed based on started_at, but for now just start fresh or use remaining time
      if (!progressRecord.completed && progressRecord.started_at) {
        const startedTime = new Date(progressRecord.started_at).getTime();
        const now = new Date().getTime();
        const diffSeconds = Math.floor((now - startedTime) / 1000);
        const remaining = Math.max(EXAM_DURATION_SECONDS - diffSeconds, 0);
        setTimeLeft(remaining);
        if (remaining === 0) {
          submitExam(progressRecord.answers);
        }
      }
    }
  }, [quizProgress]);

  // --- Timer logic ---
  useEffect(() => {
    if (quizCompleted || timeLeft <= 0 || questions.length === 0) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          // Timer finished
          submitExam(answers, true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current!);
  }, [quizCompleted, timeLeft, answers, questions.length]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const getTranslatedQuestion = () => currentQuestion?.translation?.text || '';

  // --- Actions ---
  const handleAnswer = async (answer: boolean) => {
    const questionId = currentQuestion?.id;
    const updatedAnswers = { ...answers, [questionId]: answer };
    setAnswers(updatedAnswers);

    // Auto advance without showing result
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      // Background save
      updateQuizProgression(userId, String(batchId), updatedAnswers, currentQuestionIndex + 2, false);
    } else {
      await updateQuizProgression(userId, String(batchId), updatedAnswers, currentQuestionIndex + 1, false);
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      updateQuizProgression(userId, String(batchId), answers, currentQuestionIndex + 2, false);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      updateQuizProgression(userId, String(batchId), answers, currentQuestionIndex, false);
    }
  };

  const attemptSubmit = () => {
    // Check for missed questions
    const answeredCount = Object.keys(answers).length;
    let message = t('exam.alerts.submitConfirm');
    if (answeredCount < questions.length) {
      message = t('exam.alerts.submitIncomplete', { answered: answeredCount, total: questions.length });
    }

    Alert.alert(
      t('exam.alerts.submitTitle'),
      message,
      [
        { text: t('exam.alerts.cancel'), style: 'cancel' },
        {
          text: t('exam.alerts.submit'),
          style: 'destructive',
          onPress: () => submitExam(answers)
        }
      ]
    );
  };

  const submitExam = async (finalAnswers: any, isTimeOut = false) => {
    if (isTimeOut) {
      Alert.alert(t('exam.alerts.timeOutTitle'), t('exam.alerts.timeOutMessage'));
    }
    setQuizCompleted(true);
    await updateQuizProgression(userId, String(batchId), finalAnswers, currentQuestionIndex + 1, true);
  };

  // --- Rendering ---
  if (progressLoading || questions.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color="#059669" style={{ flex: 1 }} />
      </ThemedView>
    );
  }

  // 1. RESULTS SCREEN
  if (quizCompleted) {
    const MAX_ERRORS = 3;
    const isPassed = incorrectCount <= MAX_ERRORS;

    return (
      <ThemedView style={[styles.container, { backgroundColor }]}>
        <View style={[styles.header, { backgroundColor: cardBackgroundColor, borderBottomColor: borderColor }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#059669" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <ThemedText style={[styles.headerTitle, { color: textColor }]}>
              {t('exam.results.title')}
            </ThemedText>
            <ThemedText style={[styles.headerSubtitle, { color: iconColor }]}>
              {t('exam.results.timeTaken', { time: formatTime(EXAM_DURATION_SECONDS - timeLeft) })}
            </ThemedText>
          </View>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={[styles.resultsCard, { backgroundColor: isPassed ? quizTheme.passed.bg : quizTheme.failed.bg }]}>
            <View style={styles.resultsBanner}>
              <Ionicons name={isPassed ? "shield-checkmark" : "close-circle"} size={64} color={isPassed ? quizTheme.passed.icon : quizTheme.failed.icon} />
              <ThemedText style={[styles.resultsTitlePassed, { color: isPassed ? quizTheme.passed.title : quizTheme.failed.title }]}>
                {isPassed ? t('exam.results.passed') : t('exam.results.failed')}
              </ThemedText>
              <ThemedText style={styles.resultsSubtitle}>
                {isPassed
                  ? t('exam.results.passedMessage')
                  : t('exam.results.failedMessage', { incorrect: incorrectCount, total: questions.length, max: MAX_ERRORS })}
              </ThemedText>
            </View>

            <View style={styles.scorePillsRow}>
              <View style={[styles.scorePill, { backgroundColor: quizTheme.scorePills.correct.bg, borderColor: quizTheme.scorePills.correct.border }]}>
                <ThemedText style={[styles.scorePillValue, { color: quizTheme.scorePills.correct.text }]}>{score}</ThemedText>
                <ThemedText style={[styles.scorePillLabel, { color: quizTheme.scorePills.correct.text }]}>{t('exam.results.correct')}</ThemedText>
              </View>
              <View style={[styles.scorePill, { backgroundColor: quizTheme.scorePills.incorrect.bg, borderColor: quizTheme.scorePills.incorrect.border }]}>
                <ThemedText style={[styles.scorePillValue, { color: quizTheme.scorePills.incorrect.text }]}>{incorrectCount}</ThemedText>
                <ThemedText style={[styles.scorePillLabel, { color: quizTheme.scorePills.incorrect.text }]}>{t('exam.results.incorrect')}</ThemedText>
              </View>
            </View>

            <View style={styles.restartContainer}>
              <ThemedButton title={t('exam.results.backToHome')} onPress={() => router.replace('/(tabs)')} />
            </View>
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  // 2. EXAM ACTIVE SCREEN
  const progressPercent = ((currentQuestionIndex + 1) / questions.length) * 100;
  const userAnswer = answers[currentQuestion?.id];
  const hasAnswered = typeof userAnswer !== 'undefined';

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>

      {/* ── Header with Timer ── */}
      <View style={[styles.header, { backgroundColor: cardBackgroundColor, borderBottomColor: borderColor }]}>
        <View style={styles.headerTitleRow}>
          <View style={styles.timerBadge}>
            <Ionicons name="timer-outline" size={18} color={timeLeft < 120 ? '#DC2626' : '#2563EB'} />
            <ThemedText style={[styles.timerText, { color: timeLeft < 120 ? '#DC2626' : '#2563EB' }]}>
              {formatTime(timeLeft)}
            </ThemedText>
          </View>
          <ThemedText style={[styles.questionIndicator, { color: textColor }]}>
            {t('exam.questionOf', { current: currentQuestionIndex + 1, total: questions.length })}
          </ThemedText>
        </View>

        <View style={[styles.headerProgressTrack, { backgroundColor: borderColor }]}>
          <View style={[styles.headerProgressFill, { width: `${progressPercent}%` }]} />
        </View>
      </View>

      {/* ── Question Content ── */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.questionCard, { backgroundColor: cardBackgroundColor }]}>
          <ThemedText style={[styles.questionText, { color: textColor }]}>
            {getTranslatedQuestion()}
          </ThemedText>

          {currentQuestion?.image_url && (
            <View style={[styles.imageContainer, { backgroundColor: secondaryBackgroundColor }]}>
              <Image source={{ uri: currentQuestion.image_url }} style={styles.questionImage} resizeMode="contain" />
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Sticky Answer Bar (Exclusive Selection) ── */}
      <View style={[styles.stickyAnswerBar, { backgroundColor: cardBackgroundColor, borderTopColor: borderColor }]}>
        <View style={styles.answerButtons}>
          <Pressable
            style={({ pressed }) => [
              styles.answerButton,
              styles.falseButton,
              pressed && styles.answerButtonPressed,
              hasAnswered && userAnswer === false && styles.selectedFalseButton,
            ]}
            onPress={() => handleAnswer(false)}
          >
            <Ionicons name="close-circle" size={32} color={hasAnswered && userAnswer === false ? '#fff' : '#DC2626'} />
            <ThemedText style={[styles.answerButtonText, { color: hasAnswered && userAnswer === false ? '#fff' : '#DC2626' }]}>
              {t('exam.false')}
            </ThemedText>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.answerButton,
              styles.trueButton,
              pressed && styles.answerButtonPressed,
              hasAnswered && userAnswer === true && styles.selectedTrueButton,
            ]}
            onPress={() => handleAnswer(true)}
          >
            <Ionicons name="checkmark-circle" size={32} color={hasAnswered && userAnswer === true ? '#fff' : '#059669'} />
            <ThemedText style={[styles.answerButtonText, { color: hasAnswered && userAnswer === true ? '#fff' : '#059669' }]}>
              {t('exam.true')}
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {/* ── Bottom Navigation Bar ── */}
      <BlurView intensity={80} tint={backgroundColor === '#000000' ? 'dark' : 'light'} style={[styles.navigationBar, { borderTopColor: borderColor }]}>
        <View style={styles.navContent}>
          <Pressable
            style={[styles.navButton, currentQuestionIndex === 0 && styles.navButtonDisabled]}
            onPress={handlePrevious}
            disabled={currentQuestionIndex === 0}
          >
            <Ionicons name="chevron-back" size={20} color={currentQuestionIndex === 0 ? '#9CA3AF' : '#2563EB'} />
            <ThemedText style={[styles.navButtonText, currentQuestionIndex === 0 && styles.navButtonTextDisabled]}>
              {t('exam.back')}
            </ThemedText>
          </Pressable>

          {currentQuestionIndex === questions.length - 1 ? (
            <Pressable style={styles.submitButton} onPress={attemptSubmit}>
              <ThemedText style={styles.submitButtonText}>{t('exam.submit')}</ThemedText>
            </Pressable>
          ) : (
            <Pressable style={styles.navButton} onPress={handleNext}>
              <ThemedText style={styles.navButtonText}>{t('exam.next')}</ThemedText>
              <Ionicons name="chevron-forward" size={20} color="#2563EB" />
            </Pressable>
          )}
        </View>
      </BlurView>

    </ThemedView>
  );
}

// Same styles as quiz.tsx roughly, tailored for exam mode
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backButton: { marginRight: 10 },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerSubtitle: { fontSize: 14, marginTop: 2 },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  timerText: { fontSize: 16, fontWeight: '700' },
  questionIndicator: { fontSize: 15, fontWeight: '600' },
  headerProgressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  headerProgressFill: { height: '100%', backgroundColor: '#059669', borderRadius: 3 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 20 },
  questionCard: {
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    minHeight: 200,
    justifyContent: 'center',
  },
  questionText: { fontSize: 20, lineHeight: 30, fontWeight: '500', textAlign: 'center' },
  imageContainer: { marginTop: 20, borderRadius: 12, overflow: 'hidden' },
  questionImage: { width: '100%', height: 200 },
  stickyAnswerBar: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderTopWidth: 1 },
  answerButtons: { flexDirection: 'row', gap: 12 },
  answerButton: {
    flex: 1, paddingVertical: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8, borderWidth: 2,
  },
  answerButtonPressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
  trueButton: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' },
  falseButton: { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' },
  selectedTrueButton: { backgroundColor: '#059669', borderColor: '#059669' },
  selectedFalseButton: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  answerButtonText: { fontSize: 18, fontWeight: '700' },
  navigationBar: { paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 28, borderTopWidth: 1 },
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
  resultsCard: { padding: 24, borderRadius: 20, alignItems: 'center' },
  resultsBanner: { alignItems: 'center', marginBottom: 24 },
  resultsTitlePassed: { fontSize: 24, fontWeight: '800', marginTop: 12 },
  resultsTitleFailed: { fontSize: 24, fontWeight: '800', marginTop: 12 },
  resultsSubtitle: { fontSize: 16, textAlign: 'center', marginTop: 8, opacity: 0.8 },
  scorePillsRow: { flexDirection: 'row', gap: 16, marginBottom: 30, width: '100%', justifyContent: 'center' },
  scorePill: { alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, width: 100 },
  scorePillValue: { fontSize: 28, fontWeight: '800', marginVertical: 4 },
  scorePillLabel: { fontSize: 14, fontWeight: '600' },
  restartContainer: { width: '100%', marginTop: 10 },
});
