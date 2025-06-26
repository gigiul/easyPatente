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
