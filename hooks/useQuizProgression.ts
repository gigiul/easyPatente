import { fetchQuizProgression } from '@/queries/quizProgression';
import { useQuizProgressionStore } from '@/store/quizProgression';
import { useEffect, useState } from 'react';
import type { UserQuizProgress } from '@/types/user_quiz_progress';

export function useQuizProgression(userId: string, batchId: string) {
  const [loading, setLoading] = useState(true);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  // Batch whose progression has been fetched (or failed) – consumers can rely
  // on `progress` only once this matches the batch they asked for.
  const [loadedBatchId, setLoadedBatchId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const progress = useQuizProgressionStore((state) => state.progress);
  const setProgress = useQuizProgressionStore((state) => state.setProgress);

  const refresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  useEffect(() => {
    if (!userId || !batchId) return;

    // Se il batchId è cambiato, resetta tutto
    if (currentBatchId !== batchId) {
      setProgress([]);
      setCurrentBatchId(batchId);
      setLoadedBatchId(null);
      setLoading(true);
    }

    fetchQuizProgression(userId, batchId)
      .then((data) => {
        // Verifica che i dati siano ancora per il batch corrente
        if (batchId === currentBatchId || currentBatchId === null) {
          setProgress(data);
          setLoadedBatchId(batchId);
          setLoading(false);
        }
      })
      .catch(() => {
        if (batchId === currentBatchId || currentBatchId === null) {
          setLoadedBatchId(batchId);
          setLoading(false);
        }
      });
  }, [userId, batchId, setProgress, currentBatchId, refreshTrigger]);

  // Ritorna progress solo se è per il batch corrente
  const validProgress = currentBatchId === batchId ? progress : [];

  return { progress: validProgress, loading, loadedBatchId, refresh };
}
