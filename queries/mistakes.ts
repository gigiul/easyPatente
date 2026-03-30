import { supabase } from '@/lib/supabase';

/**
 * Returns the number of unique questions in the user's mistakes list.
 */
export async function fetchMistakesCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_mistakes_count');
  if (error) throw error;
  return data ?? 0;
}

/**
 * Calls the Supabase RPC that records incorrect answers from a completed
 * exam batch into the user_mistakes table.
 */
export async function recordExamMistakes(batchId: string): Promise<void> {
  const { error } = await supabase.rpc('record_exam_mistakes', {
    p_batch_id: batchId,
  });
  if (error) throw error;
}

/**
 * Creates a new review quiz batch from the user's current mistakes and
 * returns the generated batch ID.
 */
export async function startMistakesReview(): Promise<string> {
  const { data: batchId, error } = await supabase.rpc('generate_mistakes_review_batch');
  if (error) throw error;
  return batchId as string;
}
