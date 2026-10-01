import { AppAlert as Alert } from '@/lib/alert';
import { useQuizPersistence } from '@/hooks/useQuizPersistence';
import { recordExamMistakes } from '@/queries/mistakes';
import type { QuizQuestion } from '@/store/quizQuestions';
import type { UserQuizProgress } from '@/types/user_quiz_progress';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const EXAM_DURATION_SECONDS = 20 * 60;

interface UseExamSessionOptions {
  userId: string;
  batchId: string;
  questions: QuizQuestion[];
  progress: UserQuizProgress[];
  progressLoading: boolean;
  /** Batch whose progression has been fetched – see useQuizProgression. */
  loadedBatchId: string | null;
}

/**
 * Exam state machine: answers with auto-advance, 20 minute timer with resume
 * from `started_at`, submit flow and locally derived score.
 */
export function useExamSession({
  userId,
  batchId,
  questions,
  progress,
  progressLoading,
  loadedBatchId,
}: UseExamSessionOptions) {
  const { t } = useTranslation();

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(EXAM_DURATION_SECONDS);

  const { persist, setPersistedKey, cancelPending } = useQuizPersistence({ userId, batchId });

  const hydratedRef = useRef(false);
  const submittedRef = useRef(false);

  // Reset everything when the batch changes
  useEffect(() => {
    hydratedRef.current = false;
    submittedRef.current = false;
    setPersistedKey(null);
    cancelPending();
    setCurrentQuestionIndex(0);
    setAnswers({});
    setQuizCompleted(false);
    setTimeLeft(EXAM_DURATION_SECONDS);
  }, [batchId, setPersistedKey, cancelPending]);

  const currentQuestion = questions[currentQuestionIndex];

  const submit = useCallback(
    async (finalAnswers: Record<string, boolean>, timeOutAlert = false) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      if (timeOutAlert) {
        Alert.alert(t('exam.alerts.timeOutTitle'), t('exam.alerts.timeOutMessage'));
      }
      setQuizCompleted(true);
      await persist({
        answers: finalAnswers,
        current_question: currentQuestionIndex + 1,
        completed: true,
      });
      // Record mistakes in the background (non-blocking)
      recordExamMistakes(batchId).catch((err) =>
        console.warn('Could not record exam mistakes:', err)
      );
    },
    [persist, currentQuestionIndex, batchId, t]
  );

  // --- Initialization & State Restoration ---
  useEffect(() => {
    if (progressLoading || hydratedRef.current || loadedBatchId !== batchId) return;
    hydratedRef.current = true;

    const record = progress[0];
    if (!record) return;

    const recordAnswers: Record<string, boolean> = record.answers ?? {};
    if (Object.keys(recordAnswers).length > 0) setAnswers(recordAnswers);

    if (record.completed) {
      setQuizCompleted(true);
      submittedRef.current = true;
      return;
    }

    if (record.started_at) {
      const startedTime = new Date(record.started_at).getTime();
      const elapsed = Math.floor((Date.now() - startedTime) / 1000);
      const remaining = Math.max(EXAM_DURATION_SECONDS - elapsed, 0);
      setTimeLeft(remaining);
      if (remaining === 0) void submit(recordAnswers);
    }
  }, [progress, progressLoading, loadedBatchId, batchId, submit]);

  // --- Timer: tick every second while the exam is running ---
  const timerFinished = timeLeft <= 0;

  useEffect(() => {
    if (quizCompleted || timerFinished || questions.length === 0) return;
    const timer = setInterval(() => setTimeLeft((prev) => Math.max(prev - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [quizCompleted, timerFinished, questions.length]);

  // --- Timer expired: submit once (with the timeout alert) ---
  useEffect(() => {
    if (!timerFinished || quizCompleted || submittedRef.current) return;
    void submit(answers, true);
  }, [timerFinished, quizCompleted, answers, submit]);

  // --- Derived values (score is computed locally, no round trip) ---
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

  const userAnswer = answers[currentQuestion?.id ?? ''];
  const hasAnswered = typeof userAnswer !== 'undefined';

  const progressPercent =
    questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;

  // --- Actions ---
  const answer = useCallback(
    (value: boolean) => {
      const questionId = currentQuestion?.id;
      if (!questionId) return;
      const updatedAnswers = { ...answers, [questionId]: value };
      setAnswers(updatedAnswers);

      // Auto advance without showing result
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        void persist({
          answers: updatedAnswers,
          current_question: currentQuestionIndex + 2,
          completed: false,
        });
      } else {
        void persist({
          answers: updatedAnswers,
          current_question: currentQuestionIndex + 1,
          completed: false,
        });
      }
    },
    [answers, currentQuestion?.id, currentQuestionIndex, questions.length, persist]
  );

  const next = useCallback(() => {
    if (currentQuestionIndex >= questions.length - 1) return;
    setCurrentQuestionIndex(currentQuestionIndex + 1);
    void persist({
      answers,
      current_question: currentQuestionIndex + 2,
      completed: false,
    });
  }, [answers, currentQuestionIndex, questions.length, persist]);

  const previous = useCallback(() => {
    if (currentQuestionIndex === 0) return;
    const newIndex = currentQuestionIndex - 1;
    setCurrentQuestionIndex(newIndex);
    void persist({
      answers,
      current_question: newIndex + 1,
      completed: false,
    });
  }, [answers, currentQuestionIndex, persist]);

  const attemptSubmit = useCallback(() => {
    const answeredCount = Object.keys(answers).length;
    let message = t('exam.alerts.submitConfirm');
    if (answeredCount < questions.length) {
      message = t('exam.alerts.submitIncomplete', {
        answered: answeredCount,
        total: questions.length,
      });
    }

    Alert.alert(t('exam.alerts.submitTitle'), message, [
      { text: t('exam.alerts.cancel'), style: 'cancel' },
      {
        text: t('exam.alerts.submit'),
        style: 'destructive',
        onPress: () => {
          void submit(answers);
        },
      },
    ]);
  }, [answers, questions.length, submit, t]);

  return {
    currentQuestion,
    currentQuestionIndex,
    quizCompleted,
    timeLeft,
    answers,
    hasAnswered,
    userAnswer,
    score,
    incorrectCount,
    incorrectQuestions,
    progressPercent,
    answer,
    next,
    previous,
    attemptSubmit,
  };
}
