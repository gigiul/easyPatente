import type { UserQuizProgress } from '@/types/user_quiz_progress';
import { supabase } from '@/lib/supabase';
import type { LearningStats, LearningSession, LocalLearningSession, QuizDraft } from '@/types/learning';

export async function openLearningAttempt(batchId: string, primary: string, secondary: string | null): Promise<LearningSession> {
  const { data, error } = await supabase.rpc('open_learning_attempt', { p_batch_id: batchId, p_primary: primary, p_secondary: secondary });
  if (error) throw error;
  return data;
}

export async function saveLearningProgress(batchId: string, session: LearningSession, answers: Record<string, boolean>, current: number, completed: boolean, primary: string, secondary: string | null): Promise<LearningSession> {
  const { data, error } = await supabase.rpc('save_learning_progress', {
    p_batch_id: batchId, p_attempt_id: session.attempt_id, p_revision: session.revision,
    p_answers: answers, p_current: current, p_completed: completed, p_primary: primary, p_secondary: secondary,
  });
  if (error) throw error;
  return { ...session, answers, completed, ...data };
}

export async function fetchLearningStats(days = 30, offset = 0): Promise<LearningStats> {
  const { data, error } = await supabase.rpc('get_my_learning_stats', { p_days: days, p_offset: offset });
  if (error) throw error;
  return data;
}

export async function setLearningPreferences(date: string | null, goal: number | null, timezone: string) {
  const { error } = await supabase.rpc('set_learning_preferences', { p_date: date, p_goal: goal, p_timezone: timezone });
  if (error) throw error;
}

export async function beginLearningAttempt(batchId: string, primary: string, secondary: string | null, restartFrom: string | null = null): Promise<UserQuizProgress & { learning_session: LocalLearningSession }> {
  const { data, error } = await supabase.rpc('begin_learning_attempt', {
    p_batch_id: batchId, p_primary: primary, p_secondary: secondary, p_restart_from: restartFrom,
  });
  if (error) throw error;
  return data;
}

export async function finalizeLearningAttempt(draft: QuizDraft): Promise<LocalLearningSession> {
  const { data, error } = await supabase.rpc('finalize_learning_attempt', {
    p_batch_id: draft.batch_id, p_attempt_id: draft.session.attempt_id, p_revision: draft.session.revision,
    p_submission_id: draft.session.submission_id, p_answers: draft.answers, p_first_answers: draft.first_answers,
    p_first_answered_at: draft.first_answered_at, p_answered_at: draft.answered_at, p_current: draft.current_question,
    p_primary: draft.mixed_language ? null : draft.primary_language,
    p_secondary: draft.mixed_language ? null : draft.secondary_language,
  });
  if (error) throw error;
  return { ...draft.session, ...data };
}
