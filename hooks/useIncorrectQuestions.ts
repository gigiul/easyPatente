import { fetchIncorrectQuestions } from '@/queries/quizProgression';
import { useEffect, useState } from 'react';

export function useIncorrectQuestions(userId: string, batchId?: string) {
  const [incorrectQuestions, setIncorrectQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    const fetchIncorrect = async () => {
      try {
        setLoading(true);
        const questions = await fetchIncorrectQuestions(userId, batchId);
        setIncorrectQuestions(questions);
      } catch (error) {
        console.error('Error fetching incorrect questions:', error);
        setIncorrectQuestions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchIncorrect();
  }, [userId, batchId]);

  return { incorrectQuestions, loading };
}
