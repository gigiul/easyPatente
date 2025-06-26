import { supabase } from '@/lib/supabase';

export async function fetchQuestionsByBatch(batchId: string, langCode: string) {
  const { data, error } = await supabase
    .from('quiz_batch_questions')
    .select(`position, question_id, questions(id, code, image_url, is_free, category_id, created_at, question_translations(lang_code, text, explanation))`)
    .eq('batch_id', batchId)
    .order('position', { ascending: true });
  if (error) throw error;
  // Mappa i dati per estrarre la traduzione giusta
  return (data || []).map((item: any) => {
    const question = item.questions;
    const translation = question.question_translations.find((t: any) => t.lang_code === langCode) || null;
    return {
      ...question,
      position: item.position,
      translation,
    };
  });
}
