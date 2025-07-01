import { supabase } from '@/lib/supabase';

export async function fetchQuizProgression(userId: string, batchId: string) {
  const { data, error } = await supabase
    .from('user_quiz_progress')
    .select('id, user_id, batch_id, current_question, answers, completed, started_at, completed_at')
    .eq('user_id', userId)
    .eq('batch_id', batchId);
  if (error) throw error;
  return data || [];
}

export async function updateQuizProgression(userId: string, batchId: string, answers: any, currentQuestion: number, completed: boolean) {
  const { data, error } = await supabase
    .from('user_quiz_progress')
    .upsert([
      {
        user_id: userId,
        batch_id: batchId,
        answers,
        current_question: currentQuestion,
        completed,
        completed_at: completed ? new Date().toISOString() : null,
      },
    ], { onConflict: 'user_id,batch_id' });
  if (error) throw error;
  return data;
}
