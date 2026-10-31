import { openLearningAttempt, saveLearningProgress } from '@/queries/learning';
import type { LearningSession } from '@/types/learning';
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface QuizProgressPayload { answers: Record<string, boolean>; current_question: number; completed: boolean }
export const quizPayloadKey = (payload: QuizProgressPayload) => JSON.stringify(payload);
export const buildQuizPayload = (state: { answers: Record<string, boolean>; index: number; completed: boolean }): QuizProgressPayload => ({
  answers: state.answers, current_question: state.completed ? state.index : state.index + 1, completed: state.completed,
});
interface Options { userId: string; batchId: string; primaryLanguage?: string; secondaryLanguage?: string | null }

/** A scope owns its queue, including unmount flushes. A later scope cannot mutate its session. */
export function useQuizPersistence({ userId, batchId, primaryLanguage = 'it', secondaryLanguage = null }: Options) {
  const [saveState, setSaveState] = useState<'saved' | 'pending' | 'error'>('saved');
  const scope = useMemo(() => ({
    userId, batchId, baseline: null as Record<string, boolean> | null,
    session: null as LearningSession | null, key: null as string | null,
    queue: Promise.resolve(), failed: null as QuizProgressPayload | null, latest: null as QuizProgressPayload | null, alive: true,
  }), [userId, batchId]);
  const persist = useCallback((payload: QuizProgressPayload): Promise<boolean> => {
    if (!userId || !batchId) return Promise.resolve(false);
    scope.latest = payload;
    if (scope.alive) setSaveState('pending');
    let success = false;
    scope.queue = scope.queue.catch(() => {}).then(async () => {
      try {
        if (scope.failed && quizPayloadKey(scope.failed) !== quizPayloadKey(payload)) { if (scope.alive) setSaveState('error'); return; }
        if (scope.key === quizPayloadKey(payload)) { success = true; return; }
        if (!scope.session) {
          const opened = await openLearningAttempt(batchId, primaryLanguage, secondaryLanguage);
          const normalized = (answers: Record<string, boolean>) => JSON.stringify(Object.entries(answers).sort(([a], [b]) => a.localeCompare(b)));
          if (scope.baseline && normalized(scope.baseline) !== normalized(opened.answers)) throw new Error('attempt_conflict');
          scope.session = opened;
        }
        scope.session = await saveLearningProgress(batchId, scope.session, payload.answers, payload.current_question, payload.completed, primaryLanguage, secondaryLanguage);
        scope.key = quizPayloadKey(payload); scope.failed = null; success = true;
      } catch {
        // Keep the latest complete state for explicit retry, never silently discard an answer.
        scope.failed = payload;
      } finally {
        if (scope.alive) setSaveState(success ? 'saved' : 'error');
      }
    });
    return scope.queue.then(() => success);
  }, [scope, userId, batchId, primaryLanguage, secondaryLanguage]);
  const retry = useCallback(async () => {
    if (!scope.failed) return true;
    const failed = scope.failed;
    const latest = scope.latest;
    const saved = await persist(failed);
    return saved && latest && quizPayloadKey(latest) !== quizPayloadKey(failed) ? persist(latest) : saved;
  }, [persist, scope]);
  const setPersistedKey = useCallback((payload: QuizProgressPayload | null) => { scope.key = payload ? quizPayloadKey(payload) : null; scope.baseline = payload?.answers ?? null; }, [scope]);
  useEffect(() => { scope.alive = true; setSaveState('saved'); return () => { scope.alive = false; }; }, [scope]);
  const savedResult = useCallback(() => scope.session, [scope]);
  const savedAnswers = useCallback(() => scope.session?.answers, [scope]);
  return { savedResult, savedAnswers, persist, setPersistedKey, saveState, retry };
}
