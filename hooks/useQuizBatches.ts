import { fetchQuizBatchesByCategory, fetchQuizBatchesWithProgress } from '@/queries/quizBatches';
import { useQuizBatchesStore } from '@/store/quizBatches';
import { useCallback, useState } from 'react';

export function useQuizBatches(categoryId: string, userId?: string) {
  const [loading, setLoading] = useState(false);

  // Restituiamo undefined dal selettore e assegnamo l'array vuoto fuori.
  // Se restituisci `|| []` *dentro* il selettore, Zustand riceve un array nuovo ogni volta
  // se undefined, e scatena un loop infinito ("Maximum update depth exceeded").
  const batches = useQuizBatchesStore((state) => state.batchesByCategory[categoryId]) || [];
  const setBatches = useQuizBatchesStore((state) => state.setBatches);

  const fetchBatches = useCallback(() => {
    if (!categoryId) return;

    setLoading(true);

    const fetchFunction = userId
      ? fetchQuizBatchesWithProgress(categoryId, userId)
      : fetchQuizBatchesByCategory(categoryId);

    fetchFunction
      .then((data) => {
        setBatches(categoryId, data || []);
      })
      .catch((error) => {
        console.error('Error fetching quiz batches:', error);
        setBatches(categoryId, []);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [categoryId, userId, setBatches]);

  return { batches, loading, refresh: fetchBatches };
}
