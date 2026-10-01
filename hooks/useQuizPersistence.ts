import { updateQuizProgression } from '@/queries/quizProgression';
import { useCallback, useEffect, useRef } from 'react';

/** Coalesce rapid state changes into a single upsert per user action. */
const PERSIST_DEBOUNCE_MS = 300;

export interface QuizProgressPayload {
  answers: Record<string, boolean>;
  current_question: number;
  completed: boolean;
}

export const quizPayloadKey = (payload: QuizProgressPayload) => JSON.stringify(payload);

export const buildQuizPayload = (state: {
  answers: Record<string, boolean>;
  index: number;
  completed: boolean;
}): QuizProgressPayload => ({
  answers: state.answers,
  // Position (1-based) of the question to resume at.
  current_question: state.completed ? state.index : state.index + 1,
  completed: state.completed,
});

interface UseQuizPersistenceOptions {
  userId: string;
  batchId: string;
}

/**
 * Shared write path for `user_quiz_progress`: dedupes identical payloads,
 * debounces bursts of state changes and flushes on unmount/batch switch.
 */
export function useQuizPersistence({ userId, batchId }: UseQuizPersistenceOptions) {
  const lastPersistedKeyRef = useRef<string | null>(null);
  const pendingRef = useRef<{ payload: QuizProgressPayload; timer: ReturnType<typeof setTimeout> } | null>(null);

  const persist = useCallback(
    async (payload: QuizProgressPayload) => {
      if (pendingRef.current) {
        clearTimeout(pendingRef.current.timer);
        pendingRef.current = null;
      }
      const key = quizPayloadKey(payload);
      if (key === lastPersistedKeyRef.current) return;
      lastPersistedKeyRef.current = key;
      try {
        await updateQuizProgression(
          userId,
          batchId,
          payload.answers,
          payload.current_question,
          payload.completed
        );
      } catch (error) {
        console.error('Failed to persist quiz progression:', error);
        lastPersistedKeyRef.current = null;
      }
    },
    [userId, batchId]
  );

  const schedulePersist = useCallback(
    (payload: QuizProgressPayload) => {
      if (quizPayloadKey(payload) === lastPersistedKeyRef.current) return;
      if (pendingRef.current) clearTimeout(pendingRef.current.timer);
      const timer = setTimeout(() => {
        pendingRef.current = null;
        void persist(payload);
      }, PERSIST_DEBOUNCE_MS);
      pendingRef.current = { payload, timer };
    },
    [persist]
  );

  /** Remember what the DB already contains (skips the next identical write). */
  const setPersistedKey = useCallback((payload: QuizProgressPayload | null) => {
    lastPersistedKeyRef.current = payload ? quizPayloadKey(payload) : null;
  }, []);

  const cancelPending = useCallback(() => {
    if (pendingRef.current) {
      clearTimeout(pendingRef.current.timer);
      pendingRef.current = null;
    }
  }, []);

  // Flush any pending write when leaving the screen (or switching batch)
  useEffect(() => {
    return () => {
      const pending = pendingRef.current;
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingRef.current = null;
      const key = quizPayloadKey(pending.payload);
      if (key === lastPersistedKeyRef.current) return;
      lastPersistedKeyRef.current = key;
      updateQuizProgression(
        userId,
        batchId,
        pending.payload.answers,
        pending.payload.current_question,
        pending.payload.completed
      ).catch(() => {});
    };
  }, [userId, batchId]);

  return { persist, schedulePersist, setPersistedKey, cancelPending };
}
