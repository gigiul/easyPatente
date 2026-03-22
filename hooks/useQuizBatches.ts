import { fetchQuizBatchesByCategory, fetchQuizBatchesWithProgress } from '@/queries/quizBatches';
import { useQuizBatchesStore } from '@/store/quizBatches';
import { useEffect, useState } from 'react';

export function useQuizBatches(categoryId: string, userId?: string) {
  const [loading, setLoading] = useState(false);
  const [lastUserId, setLastUserId] = useState<string | undefined>();
  const setBatches = useQuizBatchesStore((state) => state.setBatches);
  const getBatches = useQuizBatchesStore((state) => state.getBatches);
  
  const batches = getBatches(categoryId);

  useEffect(() => {
    if (!categoryId) return;

    // Fetch se:
    // 1. Non abbiamo batches per questa categoria, oppure
    // 2. L'userId è cambiato (per aggiornare le informazioni di progresso)
    const shouldFetch = batches.length === 0 || (userId && userId !== lastUserId);
    
    if (shouldFetch) {
      setLoading(true);
      
      const fetchFunction = userId 
        ? fetchQuizBatchesWithProgress(categoryId, userId)
        : fetchQuizBatchesByCategory(categoryId);
        
      fetchFunction
        .then((data) => {
          setBatches(categoryId, data || []);
          setLastUserId(userId);
        })
        .catch((error) => {
          console.error('Error fetching quiz batches:', error);
          setBatches(categoryId, []); // Imposta array vuoto in caso di errore
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [categoryId, userId, batches.length, lastUserId, setBatches]);

  return { batches, loading };
}
