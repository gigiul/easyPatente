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
  primaryLanguage?: string;
  secondaryLanguage?: string | null;
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
  primaryLanguage, secondaryLanguage,
}: UseQuizSessionOptions) {
  const { t } = useTranslation();

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [finalResult, setFinalResult] = useState<{ score: number; incorrectCount: number } | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [isResetting, setIsResetting] = useState(false);

  const { persist, savedResult, saveState, retry, restart, finalizedSession, isSubmitting } = useQuizPersistence({
    userId,
    batchId, progress: progress[0], primaryLanguage, secondaryLanguage,
  });

  const hydratedRef = useRef(false);

  // Reset everything when the batch changes
  useEffect(() => {
    hydratedRef.current = false;
    setCurrentQuestionIndex(0);
    setQuizCompleted(false);
    setFinalResult(null);
    setAnswers({});
    setIsResetting(false);
  }, [batchId, userId]);

  // Hydrate local state from the stored progression (once per batch)
  useEffect(() => {
    if (progressLoading || isResetting || hydratedRef.current) return;
    if (loadedBatchId !== batchId) return;
    hydratedRef.current = true;

    const progressEntry = progress[0];
    const progressAnswers: Record<string, boolean> = progressEntry?.answers ?? {};
    const hasNoAnswers = Object.keys(progressAnswers).length === 0;
    const completed = !!progressEntry?.completed;
    const storedQuestion = progressEntry?.current_question ?? 1;
    const restoredIndex = hasNoAnswers
      ? 0
      : completed
        ? Math.max(storedQuestion, 0)
        : Math.max(storedQuestion - 1, 0);

    if (!hasNoAnswers || completed) {
      setAnswers(progressAnswers);
      setCurrentQuestionIndex(restoredIndex);
      if (completed) {
        setQuizCompleted(true);
        if (progressEntry.score != null && progressEntry.incorrect_count != null) setFinalResult({ score: progressEntry.score, incorrectCount: progressEntry.incorrect_count });
      }
    }
  }, [progress, progressLoading, isResetting, loadedBatchId, batchId]);


  useEffect(() => {
    if (!finalizedSession?.completed) return;
    setAnswers(finalizedSession.answers); setQuizCompleted(true);
    setCurrentQuestionIndex(questions.length);
    if (finalizedSession.score != null && finalizedSession.incorrect_count != null) setFinalResult({ score: finalizedSession.score, incorrectCount: finalizedSession.incorrect_count });
  }, [finalizedSession, questions.length]);

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
      if (!questionId || quizCompleted || isSubmitting()) return;
      const updated = { ...answers, [questionId]: value };
      setAnswers(updated);
      // Checkpoint locally before a later navigation/correction can overwrite the first answer.
      void persist(buildQuizPayload({ answers: updated, index: currentQuestionIndex, completed: false }));
    },
    [currentQuestion?.id, answers, currentQuestionIndex, persist, quizCompleted, isSubmitting]
  );

  const next = useCallback(() => {
    if (questions.length === 0) return;
    if (isSubmitting()) { void retry(); return; }
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      void persist(buildQuizPayload({ answers, index: currentQuestionIndex + 1, completed: false }));
      return;
    }
    Alert.alert(t('quiz.finishAlert.title'), t('quiz.finishAlert.message'), [
      { text: t('quiz.finishAlert.cancel'), style: 'cancel' },
      {
        text: t('quiz.finishAlert.confirm'),
        onPress: () => {
          const completedIndex = currentQuestionIndex + 1;
          void persist(buildQuizPayload({ answers, index: completedIndex, completed: true })).then((saved) => {
            if (saved) {
              const result = savedResult();
              if (result?.score != null && result.incorrect_count != null) setFinalResult({ score: result.score, incorrectCount: result.incorrect_count });
              setCurrentQuestionIndex(completedIndex); setQuizCompleted(true);
            } else Alert.alert(t('quiz.submitPendingTitle'), t('quiz.submitPending'));
          });
        },
      },
    ]);
  }, [currentQuestionIndex, questions.length, answers, persist, savedResult, t, isSubmitting, retry]);

  const previous = useCallback(() => {
    if (quizCompleted || isSubmitting()) {
      return; // Completed attempts are immutable; repeat creates a new attempt. results already include review.
    }
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      void persist(buildQuizPayload({ answers, index: currentQuestionIndex - 1, completed: false }));
    }
  }, [quizCompleted, currentQuestionIndex, answers, persist, isSubmitting]);

  const reset = useCallback(() => {
    setIsResetting(true);
    void restart().then((saved) => {
      if (saved) {
        setCurrentQuestionIndex(0); setQuizCompleted(false); setFinalResult(null); setAnswers({});
      }
      setIsResetting(false);
    });
  }, [restart]);



  return {
    saveState, retry,
    currentQuestion,
    currentQuestionIndex,
    quizCompleted,
    answers,
    hasAnswered,
    userAnswer,
    isCorrect,
    score: finalResult?.score ?? score,
    incorrectCount: finalResult?.incorrectCount ?? incorrectCount,
    incorrectQuestions,
    progressPercent,
    answer,
    next,
    previous,
    reset,
  };
}
