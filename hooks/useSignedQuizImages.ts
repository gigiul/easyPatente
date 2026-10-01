import { getSignedImageUrl } from '@/lib/supabase';
import type { QuizQuestion } from '@/store/quizQuestions';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';

const PREFETCH_AHEAD = 2;

/**
 * Resolves and caches signed URLs for the quiz images:
 * - the current question image
 * - the next `PREFETCH_AHEAD` images (signed + pixel prefetch)
 * - the images of the failed questions shown in the results screen
 */
export function useSignedQuizImages(
  questions: QuizQuestion[],
  currentIndex: number,
  reviewQuestions: QuizQuestion[]
) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [reviewUrls, setReviewUrls] = useState<Record<string, string>>({});

  const resolveUrl = useCallback((filename: string | null | undefined, target: 'main' | 'review', key?: string) => {
    if (!filename) return;
    getSignedImageUrl(filename).then((url) => {
      if (!url) return;
      if (target === 'main') {
        setUrls((prev) => (prev[filename] ? prev : { ...prev, [filename]: url }));
      } else if (key) {
        setReviewUrls((prev) => (prev[key] ? prev : { ...prev, [key]: url }));
      }
    });
  }, []);

  const currentFilename = questions[currentIndex]?.image_filename;

  useEffect(() => {
    resolveUrl(currentFilename, 'main');
  }, [currentFilename, resolveUrl]);

  // Prefetch signed URL + pixels for the next questions so navigation is instant
  useEffect(() => {
    let cancelled = false;
    const targets: string[] = [];
    for (let i = 1; i <= PREFETCH_AHEAD; i++) {
      const filename = questions[currentIndex + i]?.image_filename;
      if (filename && !targets.includes(filename)) targets.push(filename);
    }
    if (targets.length === 0) return;
    targets.forEach((filename) => {
      getSignedImageUrl(filename).then((url) => {
        if (!url) return;
        if (!cancelled) {
          setUrls((prev) => (prev[filename] ? prev : { ...prev, [filename]: url }));
        }
        Image.prefetch(url).catch(() => {});
      });
    });
    return () => {
      cancelled = true;
    };
  }, [currentIndex, questions]);

  // Results screen: resolve the images of the failed questions
  useEffect(() => {
    reviewQuestions.forEach((question) => {
      if (question.image_filename && !reviewUrls[question.id]) {
        resolveUrl(question.image_filename, 'review', question.id);
      }
    });
  }, [reviewQuestions, reviewUrls, resolveUrl]);

  const getUrl = useCallback(
    (filename: string | null | undefined) => (filename ? urls[filename] ?? null : null),
    [urls]
  );

  const getReviewUrl = useCallback(
    (question: QuizQuestion | null | undefined) => (question ? reviewUrls[question.id] ?? null : null),
    [reviewUrls]
  );

  return { getUrl, getReviewUrl };
}

export type SignedQuizImages = ReturnType<typeof useSignedQuizImages>;
