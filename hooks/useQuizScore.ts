import { calculateQuizScore } from '@/queries/quizProgression';
import { useEffect, useState } from 'react';

export function useQuizScore(userId: string, batchId: string, answers: Record<string, boolean>, forceRefresh?: boolean) {
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || !batchId) return;

    const fetchScore = async () => {
      try {
        setLoading(true);
        const scoreData = await calculateQuizScore(userId, batchId);
        setScore(scoreData.score);
        setTotal(scoreData.total);
        setIncorrectCount(scoreData.incorrectCount);
      } catch (error) {
        console.error('Error calculating quiz score:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchScore();
  }, [userId, batchId, answers, forceRefresh]);

  return { score, total, incorrectCount, loading };
}
