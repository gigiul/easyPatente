import { fetchQuestionsByBatch } from '@/queries/quizQuestions';
import { useQuizQuestionsStore } from '@/store/quizQuestions';
import { useEffect, useState } from 'react';

export function useQuizQuestions(
  batchId: string,
  langCode: string,
  secondaryLangCode?: string | null
) {
  const questions = useQuizQuestionsStore((state) => state.questions);
  const setQuestions = useQuizQuestionsStore((state) => state.setQuestions);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [loadedLang, setLoadedLang] = useState<string | null>(null);
  const [loadedSecondaryLang, setLoadedSecondaryLang] = useState<string | null>(null);

  useEffect(() => {
    if (!batchId || !langCode) return;

    let cancelled = false;
    setLoading(true);
    setError(false);

    fetchQuestionsByBatch(batchId, langCode, secondaryLangCode)
      .then((data) => {
        if (cancelled) return;
        setQuestions(data);
        setLoadedLang(langCode);
        setLoadedSecondaryLang(secondaryLangCode || null);
      })
      .catch((fetchError) => {
        console.error('[useQuizQuestions] fetch failed:', fetchError);
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [batchId, langCode, secondaryLangCode, setQuestions]);

  // Le domande nello store corrispondono alle lingue richieste solo dopo il fetch.
  // Se il fetch fallisce per un cambio lingua, loadedLang resta vecchio e
  // ready resta false: non si legge mai un testo con la lingua sbagliata.
  const ready =
    !loading &&
    loadedLang === langCode &&
    (secondaryLangCode || null) === loadedSecondaryLang;

  return { questions, loading, error, ready };
}
