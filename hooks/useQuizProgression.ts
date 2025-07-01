import { fetchQuizProgression } from '@/queries/quizProgression';
import { useQuizProgressionStore } from '@/store/quizProgression';
import { useEffect, useState } from 'react';

export function useQuizProgression(userId: string, batchId: string) {
  const [loading, setLoading] = useState(true);
  const progress = useQuizProgressionStore((state) => state.progress);
  const setProgress = useQuizProgressionStore((state) => state.setProgress);

  useEffect(() => {
    if (!userId || !batchId) return;

    fetchQuizProgression(userId, batchId)
      .then((data) => {
        setProgress(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [userId, batchId, setProgress]);

  return { progress, loading };
}