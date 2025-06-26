import { fetchQuestionsByBatch } from '@/queries/quizQuestions';
import { useQuizQuestionsStore } from '@/store/quizQuestions';
import { useEffect } from 'react';

export function useQuizQuestions(batchId: string, langCode: string) {
  const questions = useQuizQuestionsStore((state) => state.questions);
  const setQuestions = useQuizQuestionsStore((state) => state.setQuestions);

  useEffect(() => {
    if (!batchId || !langCode) return;
    fetchQuestionsByBatch(batchId, langCode)
      .then(setQuestions)
      .catch(() => {});
  }, [batchId, langCode, setQuestions]);

  return { questions };
}
