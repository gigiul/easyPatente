import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchLearningStats } from '@/queries/learning';
import type { LearningStats } from '@/types/learning';

export function useLearningStats(userId: string | undefined, days = 30, offset = 0, enabled = true) {
  const [snapshot, setSnapshot] = useState<{ userId: string; data: LearningStats } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!userId || !enabled) { setSnapshot(null); setLoading(false); return; }
    setLoading(true); setError(false);
    try {
      const data = await fetchLearningStats(days, offset);
      if (generation.current === request) setSnapshot({ userId, data });
    } catch {
      if (generation.current === request) setError(true);
    } finally {
      if (generation.current === request) setLoading(false);
    }
  }, [userId, days, offset, enabled]);
  useFocusEffect(useCallback(() => {
    void refresh();
    return () => { generation.current++; };
  }, [refresh]));
  return { data: snapshot && snapshot.userId === userId ? snapshot.data : null, loading, error, refresh };
}
