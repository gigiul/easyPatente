import { AppAlert as Alert } from '@/lib/alert';
import { buildQuizPayload, useQuizPersistence } from '@/hooks/useQuizPersistence';
import type { QuizQuestion } from '@/store/quizQuestions';
import type { UserQuizProgress } from '@/types/user_quiz_progress';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface UseQuizSessionOptions {
  userId: string;
  batchId: string;
  questions: QuizQuestion[];
  progress: UserQuizProgress[];
  progressLoading: boolean;
  /** Batch whose progression has been fetched – see useQuizProgression. */
  loadedBatchId: string | null;
  refreshProgression: () => void;
}

/**
 * Owns the quiz state machine: current question, answers, completion,
 * derived score and persistence of the progression to Supabase.
 */
export function useQuizSession({
  userId,
  batchId,
  questions,
  progress,
  progressLoading,
  loadedBatchId,
  refreshProgression,
}: UseQuizSessionOptions) {
  const { t } = useTranslation();

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [isResetting, setIsResetting] = useState(false);

  const { persist, schedulePersist, setPersistedKey, cancelPending } = useQuizPersistence({
    userId,
    batchId,
  });

  const hydratedRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset everything when the batch changes
  useEffect(() => {
    hydratedRef.current = false;
    setPersistedKey(null);
    cancelPending();
    setCurrentQuestionIndex(0);
    setQuizCompleted(false);
    setAnswers({});
    setIsResetting(false);
  }, [batchId, setPersistedKey, cancelPending]);

  // Hydrate local state from the stored progression (once per batch)
  useEffect(() => {
    if (progressLoading || isResetting || hydratedRef.current) return;
    if (loadedBatchId !== batchId) return;
    hydratedRef.current = true;

    const progressEntry = progress[0];
    const progressAnswers: Record<string, boolean> = progressEntry?.answers ?? {};
    const hasNoAnswers = Object.keys(progressAnswers).length === 0;
    const completed = hasNoAnswers ? false : !!progressEntry?.completed;
    const storedQuestion = progressEntry?.current_question ?? 1;
    const restoredIndex = hasNoAnswers
      ? 0
      : completed
        ? Math.max(storedQuestion, 0)
        : Math.max(storedQuestion - 1, 0);

    if (!hasNoAnswers) {
      setAnswers(progressAnswers);
      setCurrentQuestionIndex(restoredIndex);
      if (completed) setQuizCompleted(true);
    }

    setPersistedKey(
      buildQuizPayload({
        answers: hasNoAnswers ? {} : progressAnswers,
        index: hasNoAnswers ? 0 : restoredIndex,
        completed,
      })
    );
  }, [progress, progressLoading, isResetting, loadedBatchId, batchId, setPersistedKey]);

  // Single debounced write for every state change (answer, navigation, completion)
  useEffect(() => {
    if (!hydratedRef.current) return;
    schedulePersist(buildQuizPayload({ answers, index: currentQuestionIndex, completed: quizCompleted }));
  }, [answers, currentQuestionIndex, quizCompleted, schedulePersist]);

  const currentQuestion = questions[currentQuestionIndex];

  // Derived score – same semantics as the server side calculation:
  // every question counts, unanswered ones are simply not correct.
  const { score, incorrectCount } = useMemo(() => {
    let correct = 0;
    for (const question of questions) {
      if (answers[question.id] === question.is_correct) correct++;
    }
    return { score: correct, incorrectCount: questions.length - correct };
  }, [questions, answers]);

  const incorrectQuestions = useMemo(
    () =>
      questions.filter((question) => {
        const userAnswer = answers[question.id];
        return typeof userAnswer !== 'undefined' && userAnswer !== question.is_correct;
      }),
    [questions, answers]
  );

  const hasAnswered = typeof answers[currentQuestion?.id ?? ''] !== 'undefined';
  const userAnswer = answers[currentQuestion?.id ?? ''];
  const isCorrect = hasAnswered && userAnswer === currentQuestion?.is_correct;

  const progressPercent =
    questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;

  const answer = useCallback(
    (value: boolean) => {
      const questionId = currentQuestion?.id;
      if (!questionId) return;
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
    },
    [currentQuestion?.id]
  );

  const next = useCallback(() => {
    if (questions.length === 0) return;
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      return;
    }
    Alert.alert(t('quiz.finishAlert.title'), t('quiz.finishAlert.message'), [
      { text: t('quiz.finishAlert.cancel'), style: 'cancel' },
      {
        text: t('quiz.finishAlert.confirm'),
        onPress: () => {
          const completedIndex = currentQuestionIndex + 1;
          setCurrentQuestionIndex(completedIndex);
          setQuizCompleted(true);
          void persist(
            buildQuizPayload({ answers, index: completedIndex, completed: true })
          );
        },
      },
    ]);
  }, [currentQuestionIndex, questions.length, answers, persist, t]);

  const previous = useCallback(() => {
    if (quizCompleted) {
      setQuizCompleted(false);
      setCurrentQuestionIndex(Math.max(questions.length - 1, 0));
      return;
    }
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  }, [quizCompleted, currentQuestionIndex, questions.length]);

  const reset = useCallback(() => {
    setIsResetting(true);
    setCurrentQuestionIndex(0);
    setQuizCompleted(false);
    setAnswers({});
    // Persist first, then re-read: the refresh must not observe stale data.
    void persist(buildQuizPayload({ answers: {}, index: 0, completed: false })).then(() =>
      refreshProgression()
    );
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setIsResetting(false), 500);
  }, [persist, refreshProgression]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  return {
    currentQuestion,
    currentQuestionIndex,
    quizCompleted,
    answers,
    hasAnswered,
    userAnswer,
    isCorrect,
    score,
    incorrectCount,
    incorrectQuestions,
    progressPercent,
    answer,
    next,
    previous,
    reset,
  };
}
