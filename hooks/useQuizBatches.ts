import { fetchQuizBatchesByCategory } from '@/queries/quizBatches';
import { useQuizBatchesStore } from '@/store/quizBatches';
import { useEffect } from 'react';

export function useQuizBatches(categoryId: string) {
  const batches = useQuizBatchesStore((state) => state.batches);
  const setBatches = useQuizBatchesStore((state) => state.setBatches);

  useEffect(() => {
    if (categoryId && batches.length === 0) {
      fetchQuizBatchesByCategory(categoryId).then(setBatches).catch(() => {});
    }
  }, [categoryId, batches.length, setBatches]);

  return { batches };
}
