import { fetchQuizBatchesByCategory } from '@/queries/quizBatches';
import { useQuizBatchesStore } from '@/store/quizBatches';
import { useEffect, useState } from 'react';

export function useQuizBatches(categoryId: string) {
  const [loading, setLoading] = useState(false);
  const setBatches = useQuizBatchesStore((state) => state.setBatches);
  const getBatches = useQuizBatchesStore((state) => state.getBatches);
  
  const batches = getBatches(categoryId);

  useEffect(() => {
    if (!categoryId) return;

    // Se non abbiamo già i batches per questa categoria, li fetchiamo
    if (batches.length === 0) {
      setLoading(true);
      fetchQuizBatchesByCategory(categoryId)
        .then((data) => {
          setBatches(categoryId, data || []);
        })
        .catch((error) => {
          console.error('Error fetching quiz batches:', error);
          setBatches(categoryId, []); // Imposta array vuoto in caso di errore
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [categoryId, batches.length, setBatches]);

  return { batches, loading };
}
