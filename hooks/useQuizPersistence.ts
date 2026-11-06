import { checkpointQuizDraft, writeQuizDraft } from '@/lib/quizDraft';
import { finalizeLearningAttempt } from '@/queries/learning';
import { restartQuizProgression } from '@/queries/quizProgression';
import type { LocalLearningSession, QuizDraft } from '@/types/learning';
import type { UserQuizProgress } from '@/types/user_quiz_progress';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

export interface QuizProgressPayload { answers: Record<string, boolean>; current_question: number; completed: boolean }
export const buildQuizPayload = (state: { answers: Record<string, boolean>; index: number; completed: boolean }): QuizProgressPayload => ({
  answers: state.answers, current_question: state.completed ? state.index : state.index + 1, completed: state.completed,
});
interface Options { userId: string; batchId: string; progress?: UserQuizProgress; primaryLanguage?: string; secondaryLanguage?: string | null }

/** Checkpoints touch only device storage. Only a sealed final submission reaches the server. */
export function useQuizPersistence({ userId, batchId, progress, primaryLanguage = 'it', secondaryLanguage = null }: Options) {
  const [saveState, setSaveState] = useState<'saved' | 'pending' | 'error'>('saved');
  const [finalized, setFinalized] = useState<{ userId: string; batchId: string; session: LocalLearningSession } | null>(null);
  const scope = useMemo(() => ({ userId, batchId, draft: null as QuizDraft | null,
    inFlight: null as Promise<boolean> | null, alive: true, autoRetry: true }), [userId, batchId]);
  if (!scope.draft && progress?.learning_draft?.user_id === userId && progress.learning_draft.batch_id === batchId) scope.draft = progress.learning_draft;

  const submit = useCallback((): Promise<boolean> => {
    if (scope.inFlight) return scope.inFlight;
    const draft = scope.draft;
    if (!draft?.pending_submission) return Promise.resolve(!!draft?.session.completed);
    if (scope.alive) setSaveState('pending');
    const upload = (async () => {
      try {
        // The complete immutable payload survives loss of connectivity or a lost HTTP response.
        await writeQuizDraft(draft);
        const session = await finalizeLearningAttempt(draft);
        const confirmed = { ...draft, session, answers: session.answers, pending_submission: false };
        scope.draft = confirmed;
        // The server is authoritative after acceptance; an old pending disk receipt is safe to replay.
        await writeQuizDraft(confirmed).catch(() => console.warn('Could not cache the confirmed quiz result'));
        if (scope.alive) { setSaveState('saved'); setFinalized({ userId: scope.userId, batchId: scope.batchId, session }); }
        return true;
      } catch (error) {
        // SQL validation/conflict/auth errors need a fresh session, not repeated background requests.
        scope.autoRetry = !(error as { code?: string }).code;
        if (scope.alive) setSaveState('error');
        return false;
      } finally { scope.inFlight = null; }
    })();
    scope.inFlight = upload;
    return upload;
  }, [scope]);

  const persist = useCallback(async (payload: QuizProgressPayload): Promise<boolean> => {
    if (!scope.draft || !userId || !batchId) return false;
    if (scope.draft.pending_submission) return payload.completed ? submit() : false;
    if (scope.draft.session.completed) return payload.completed;
    scope.draft = checkpointQuizDraft(scope.draft, payload.answers, payload.current_question, primaryLanguage, secondaryLanguage);
    if (payload.completed) scope.draft = { ...scope.draft, pending_submission: true };
    if (payload.completed) return submit();
    try { await writeQuizDraft(scope.draft); return true; }
    catch { if (scope.alive) setSaveState('error'); return false; }
  }, [scope, userId, batchId, primaryLanguage, secondaryLanguage, submit]);

  const restart = useCallback(async () => {
    if (!scope.draft || scope.inFlight || scope.draft.pending_submission) return false;
    try {
      scope.draft = await restartQuizProgression(scope.draft, primaryLanguage, secondaryLanguage);
      if (scope.alive) { setFinalized(null); setSaveState('saved'); }
      return true;
    } catch { if (scope.alive) setSaveState('error'); return false; }
  }, [scope, primaryLanguage, secondaryLanguage]);

  const hydrated = !!scope.draft;
  useEffect(() => {
    scope.alive = true;
    setSaveState('saved');
    if (!hydrated) return () => { scope.alive = false; };
    const retry = () => { if (scope.autoRetry && scope.draft?.pending_submission) void submit(); };
    retry();
    const timer = setInterval(retry, 30_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') retry(); });
    if (typeof window !== 'undefined') window.addEventListener('online', retry);
    return () => {
      scope.alive = false; clearInterval(timer); subscription.remove();
      if (typeof window !== 'undefined') window.removeEventListener('online', retry);
    };
  }, [scope, hydrated, submit]);

  const savedResult = useCallback(() => scope.draft?.session, [scope]);
  const savedAnswers = useCallback(() => scope.draft?.session.answers, [scope]);
  const isSubmitting = useCallback(() => !!scope.draft?.pending_submission || !!scope.inFlight, [scope]);
  const finalizedSession = finalized?.userId === userId && finalized.batchId === batchId && finalized.session.attempt_id === scope.draft?.session.attempt_id
    ? finalized.session : null;
  return { savedResult, savedAnswers, persist, restart, saveState, retry: submit, finalizedSession, isSubmitting };
}
