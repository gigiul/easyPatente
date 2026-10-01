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

export async function fetchIncorrectQuestions(userId: string, batchId?: string) {
  let query = supabase
    .from('user_quiz_progress')
    .select(`
      answers,
      batch_id,
      quiz_batches!inner(
        id,
        title,
        quiz_batch_questions!inner(
          question_id,
          position,
          questions!inner(
            id,
            code,
            is_correct,
            image_url,
            question_translations(
              lang_code,
              text,
              explanation
            )
          )
        )
      )
    `)
    .eq('user_id', userId)
    .eq('completed', true);

  // Se è specificato un batchId, filtra per esso
  if (batchId) {
    query = query.eq('batch_id', batchId);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Processa i dati per trovare solo le domande sbagliate
  const incorrectQuestions: any[] = [];
  
  data?.forEach((progress: any) => {
    const answers = progress.answers || {};
    
    progress.quiz_batches.quiz_batch_questions?.forEach((batchQuestion: any) => {
      const question = batchQuestion.questions;
      const questionId = question.id;
      const userAnswer = answers[questionId];
      
      // Se la risposta è sbagliata o non data
      if (userAnswer !== question.is_correct) {
        incorrectQuestions.push({
          ...question,
          userAnswer,
          batchId: progress.batch_id,
          batchTitle: progress.quiz_batches.title,
          position: batchQuestion.position
        });
      }
    });
  });

  return incorrectQuestions;
}

export async function fetchExamHistory(userId: string) {
  const { data, error } = await supabase.rpc('get_user_exam_history', {
    p_user_id: userId,
  });
  if (error) throw error;
  return data || [];
}
