import { readQuizDraft } from '@/lib/quizDraft';
import { supabase } from '@/lib/supabase';

export const MAX_ALLOWED_ERRORS = 3;

export async function fetchQuizBatchesByCategory(categoryId: string) {
  const { data, error } = await supabase
    .from('quiz_batches')
    .select('*')
    .eq('category_id', categoryId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  
  return (data || []).map((batch, index) => ({
    ...batch,
    moduleIndex: index + 1
  }));
}

export async function fetchQuizBatchesWithProgress(categoryId: string, userId: string) {
  const { data, error } = await supabase
    .from('quiz_batches')
    .select(`
      *,
      user_quiz_progress!left (
        completed,
        completed_at,
        current_question,
        learning_revision,
        answers
      ),
      quiz_batch_questions (
        question_id,
        questions!inner (
          id,
          is_correct
        )
      )
    `)
    .eq('category_id', categoryId)
    .eq('user_quiz_progress.user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const drafts = await Promise.all((data ?? []).map(batch => readQuizDraft(userId, batch.id).catch(() => null)));
  return data?.map((batch, index) => {
    const remote = batch.user_quiz_progress?.[0] || null;
    const draft = drafts[index];
    const progress = draft && remote && !remote.completed && draft.session.revision === remote.learning_revision
      ? { ...remote, answers: draft.answers, current_question: draft.current_question } : remote;
    const answers: Record<string, boolean> = progress?.answers || {};

    // Calcola errori per determinare se il quiz è stato superato
    let incorrectCount = 0;
    if (progress?.completed) {
      (batch.quiz_batch_questions || []).forEach((bq: any) => {
        const q = bq.questions;
        const userAnswer = answers[q.id];
        if (userAnswer !== q.is_correct) {
          incorrectCount++;
        }
      });
    }

    return {
      ...batch,
      quiz_batch_questions: undefined, // pulizia: non serve nel componente
      isCompleted: progress?.completed || false,
      hasProgress: !!progress,
      isPassed: progress?.completed ? incorrectCount <= MAX_ALLOWED_ERRORS : null,
      incorrectCount: progress?.completed ? incorrectCount : null,
      progress,
      moduleIndex: index + 1
    };
  }) || [];
}
