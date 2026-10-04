import { fetchExplanation as fetchExplanationApi } from '@/queries/explanations';
import type { QuizQuestion } from '@/store/quizQuestions';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseQuizExplanationsOptions {
  language: string;
  secondaryLanguage?: string | null;
  /** Current question – its secondary explanation is auto loaded when missing. */
  question?: QuizQuestion | null;
}

/**
 * Local cache of (possibly AI generated) explanations, keyed by
 * `${questionId}_${lang}` for both the primary and the secondary language.
 */
export function useQuizExplanations({
  language,
  secondaryLanguage,
  question,
}: UseQuizExplanationsOptions) {
  const [local, setLocal] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const requestedRef = useRef<Set<string>>(new Set());

  // Le cache sono per lingua: cambiando lingua non deve restare il testo vecchio.
  const primaryCacheKey = useCallback(
    (questionId: string) => `${questionId}_${language}`,
    [language]
  );
  const secondaryCacheKey = useCallback(
    (questionId: string) => `${questionId}_${secondaryLanguage || 'none'}`,
    [secondaryLanguage]
  );

  const fetch = useCallback(
    async (questionId: string, questionText: string) => {
      const cacheKey = primaryCacheKey(questionId);
      setLoading((prev) => ({ ...prev, [cacheKey]: true }));
      try {
        const data = await fetchExplanationApi(
          questionId,
          questionText,
          language,
          secondaryLanguage || undefined
        );
        if (data.explanation) {
          setLocal((prev) => ({ ...prev, [cacheKey]: data.explanation }));
        }
        if (data.secondary_explanation && secondaryLanguage) {
          const key = secondaryCacheKey(questionId);
          const secondary = data.secondary_explanation;
          setLocal((prev) => ({ ...prev, [key]: secondary }));
        }
      } catch (error) {
        console.error('Failed to fetch explanation:', error);
      } finally {
        setLoading((prev) => ({ ...prev, [cacheKey]: false }));
      }
    },
    [language, secondaryLanguage, primaryCacheKey, secondaryCacheKey]
  );

  const fetchForQuestion = useCallback(
    (target: QuizQuestion | null | undefined) => {
      if (!target) return;
      void fetch(target.id, target.translation?.text || target.code);
    },
    [fetch]
  );

  // Load the secondary explanation of the current question when it is not stored yet
  useEffect(() => {
    if (!question || !secondaryLanguage) return;
    if (question.secondaryTranslation?.explanation) return;
    if (!question.translation?.explanation) return;
    const requestKey = `${question.id}:${language}:${secondaryLanguage}`;
    if (requestedRef.current.has(requestKey)) return;
    requestedRef.current.add(requestKey);
    void fetch(question.id, question.translation.text || question.code);
  }, [question, secondaryLanguage, language, fetch]);

  const getExplanation = useCallback(
    (target: QuizQuestion | null | undefined) =>
      (target && local[primaryCacheKey(target.id)]) || target?.translation?.explanation || '',
    [local, primaryCacheKey]
  );

  const getSecondaryText = useCallback(
    (target: QuizQuestion | null | undefined) => target?.secondaryTranslation?.text || null,
    []
  );

  const getSecondaryExplanation = useCallback(
    (target: QuizQuestion | null | undefined) => {
      if (!target || !secondaryLanguage) return null;
      return (
        local[secondaryCacheKey(target.id)] ||
        target.secondaryTranslation?.explanation ||
        null
      );
    },
    [local, secondaryLanguage, secondaryCacheKey]
  );

  const isLoading = useCallback(
    (target: QuizQuestion | null | undefined) => !!target && !!loading[primaryCacheKey(target.id)],
    [loading, primaryCacheKey]
  );

  return {
    fetch: fetchForQuestion,
    getExplanation,
    getSecondaryText,
    getSecondaryExplanation,
    isLoading,
  };
}

export type QuizExplanations = ReturnType<typeof useQuizExplanations>;
