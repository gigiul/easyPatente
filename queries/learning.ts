import { supabase } from '@/lib/supabase';
import type { LearningStats, LearningSession } from '@/types/learning';

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
