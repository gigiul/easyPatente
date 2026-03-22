import { supabase } from '@/lib/supabase';

export async function fetchQuizBatchesByCategory(categoryId: string) {
  const { data, error } = await supabase
    .from('quiz_batches')
    .select('*')
    .eq('category_id', categoryId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
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
        answers
      )
    `)
    .eq('category_id', categoryId)
    .eq('user_quiz_progress.user_id', userId)
    .order('created_at', { ascending: true });
    
  if (error) throw error;
  
  // Transform data to include progress information
  return data?.map(batch => ({
    ...batch,
    isCompleted: batch.user_quiz_progress?.[0]?.completed || false,
    hasProgress: !!batch.user_quiz_progress?.[0],
    progress: batch.user_quiz_progress?.[0] || null
  })) || [];
}
