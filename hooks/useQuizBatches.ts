import { fetchQuizBatchesByCategory, fetchQuizBatchesWithProgress } from '@/queries/quizBatches';
import { useQuizBatchesStore } from '@/store/quizBatches';
import { useCallback, useEffect, useState } from 'react';

export function useQuizBatches(categoryId: string, userId?: string) {
  const [loading, setLoading] = useState(false);
  const setBatches = useQuizBatchesStore((state) => state.setBatches);
  const getBatches = useQuizBatchesStore((state) => state.getBatches);

  const batches = getBatches(categoryId);

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

  // Fetch iniziale
  useEffect(() => {
    if (batches.length === 0) {
      fetchBatches();
    }
  }, [batches.length, fetchBatches]);

  return { batches, loading, refresh: fetchBatches };
}
