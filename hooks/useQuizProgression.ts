import { fetchQuizProgression } from '@/queries/quizProgression';
import { useQuizProgressionStore } from '@/store/quizProgression';
import { useEffect, useState } from 'react';

export function useQuizProgression(userId: string, batchId: string) {
  const [loading, setLoading] = useState(true);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const progress = useQuizProgressionStore((state) => state.progress);
  const setProgress = useQuizProgressionStore((state) => state.setProgress);

  useEffect(() => {
    if (!userId || !batchId) return;

    // Se il batchId è cambiato, resetta tutto
    if (currentBatchId !== batchId) {
      setProgress([]);
      setCurrentBatchId(batchId);
      setLoading(true);
    }

    fetchQuizProgression(userId, batchId)
      .then((data) => {
        // Verifica che i dati siano ancora per il batch corrente
        if (batchId === currentBatchId) {
          setProgress(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (batchId === currentBatchId) {
          setLoading(false);
        }
      });
  }, [userId, batchId, setProgress, currentBatchId]);

  // Ritorna progress solo se è per il batch corrente
  const validProgress = currentBatchId === batchId ? progress : [];

  return { progress: validProgress, loading };
}