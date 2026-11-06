import { createQuizDraft, readQuizDraft, writeQuizDraft } from '@/lib/quizDraft';
import { beginLearningAttempt } from '@/queries/learning';
import type { QuizDraft } from '@/types/learning';
import type { UserQuizProgress } from '@/types/user_quiz_progress';
import { supabase } from '@/lib/supabase';

const sameAnswers = (a: Record<string, boolean>, b: Record<string, boolean>) =>
  JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

export function draftProgress(draft: QuizDraft): UserQuizProgress {
  return {
    id: draft.progress_id, user_id: draft.user_id, batch_id: draft.batch_id,
    answers: draft.answers, current_question: draft.current_question, completed: draft.session.completed,
    started_at: draft.session.started_at, learning_revision: draft.session.revision,
    score: draft.session.completed ? draft.session.score : null,
    incorrect_count: draft.session.completed ? draft.session.incorrect_count : null, learning_draft: draft,
  };
}

export async function fetchQuizProgression(userId: string, batchId: string, primary = 'it', secondary: string | null = null): Promise<UserQuizProgress[]> {
  if (!userId) return [];
  const local = await readQuizDraft(userId, batchId);
  let remote: Awaited<ReturnType<typeof beginLearningAttempt>>;
  try { remote = await beginLearningAttempt(batchId, primary, secondary); }
  catch (error) {
    // Authentication, validation and ownership failures must not turn into offline authorization.
    const code = (error as { code?: string }).code;
    if (local && !code) return [draftProgress(local)];
    throw error;
  }
  let draft = createQuizDraft(userId, batchId, remote.id, remote.learning_session, primary, secondary);
  if (local && local.session.attempt_id === draft.session.attempt_id) {
    if (remote.completed) {
      if (local.pending_submission && !sameAnswers(local.answers, remote.answers)) throw new Error('attempt_conflict');
    } else {
      if (local.session.revision !== draft.session.revision && !sameAnswers(local.session.answers, remote.answers)) throw new Error('attempt_conflict');
      draft = { ...local, session: draft.session, clock_offset_ms: draft.clock_offset_ms,
        mixed_language: local.mixed_language || local.primary_language !== primary || local.secondary_language !== secondary };
    }
  } else if (local?.pending_submission) {
    throw new Error('attempt_conflict'); // Preserve the pending receipt; never overwrite an unsent submission.
  }
  if (remote.completed) await writeQuizDraft(draft).catch(() => {});
  else await writeQuizDraft(draft);
  return [draftProgress(draft)];
}

export async function restartQuizProgression(draft: QuizDraft, primary: string, secondary: string | null): Promise<QuizDraft> {
  if (draft.pending_submission) throw new Error('submission_pending');
  const progress = await beginLearningAttempt(draft.batch_id, primary, secondary, draft.session.attempt_id);
  const next = createQuizDraft(draft.user_id, draft.batch_id, progress.id, progress.learning_session, primary, secondary);
  await writeQuizDraft(next);
  return next;
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
