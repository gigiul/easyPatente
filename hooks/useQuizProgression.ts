import { fetchQuizProgression } from '@/queries/quizProgression';
import { useQuizProgressionStore } from '@/store/quizProgression';
import { useCallback, useEffect, useState } from 'react';

/** Failed reads never hydrate an empty attempt over an existing remote session. */
export function useQuizProgression(userId: string, batchId: string, primary = 'it', secondary: string | null = null) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loadedScope, setLoadedScope] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const progress = useQuizProgressionStore(state => state.progress);
  const setProgress = useQuizProgressionStore(state => state.setProgress);
  const scope = `${userId}:${batchId}`;
  const refresh = useCallback(() => setRefreshTrigger(previous => previous + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(false); setLoadedScope('');
    if (!userId || !batchId) { setLoading(false); return; }
    fetchQuizProgression(userId, batchId, primary, secondary).then(data => {
      if (!active) return;
      setProgress(data); setLoadedScope(scope);
    }).catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, batchId, scope, primary, secondary, refreshTrigger, setProgress]);
  const valid = loadedScope === scope;
  return { progress: valid ? progress : [], loading: loading || (!valid && !error), error, loadedBatchId: valid ? batchId : null, refresh };
}
