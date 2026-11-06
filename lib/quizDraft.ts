import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabaseUrl } from '@/lib/supabase';
import type { LocalLearningSession, QuizDraft } from '@/types/learning';

const prefix = `quiz-draft:v1:${encodeURIComponent(supabaseUrl ?? '')}:`;
const writes = new Map<string, Promise<void>>();
const keyFor = (userId: string, batchId: string) => `${prefix}${userId}:${batchId}`;
const booleanRecord = (value: unknown): value is Record<string, boolean> =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(v => typeof v === 'boolean');

export async function readQuizDraft(userId: string, batchId: string): Promise<QuizDraft | null> {
  const key = keyFor(userId, batchId);
  await writes.get(key);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  const draft = JSON.parse(raw) as QuizDraft;
  if (typeof draft.pending_submission !== 'boolean' || !Number.isFinite(Date.parse(draft.session?.started_at)) ||
    (draft.session.deadline_at !== null && !Number.isFinite(Date.parse(draft.session.deadline_at))) || draft.version !== 1 || draft.user_id !== userId || draft.batch_id !== batchId || !draft.session?.attempt_id ||
    !draft.session.submission_id || !Number.isInteger(draft.session.revision) || !booleanRecord(draft.answers) ||
    !booleanRecord(draft.first_answers) || !draft.first_answered_at || !draft.answered_at || !Number.isFinite(draft.clock_offset_ms) ||
    !Number.isInteger(draft.current_question) || draft.current_question < 1) throw new Error('invalid_quiz_draft');
  return draft;
}

/** Writes for a user/batch remain ordered even when its screen is unmounted. Storage errors propagate. */
export function writeQuizDraft(draft: QuizDraft): Promise<void> {
  const key = keyFor(draft.user_id, draft.batch_id);
  const json = JSON.stringify(draft);
  const write = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(() => AsyncStorage.setItem(key, json));
  writes.set(key, write);
  void write.finally(() => { if (writes.get(key) === write) writes.delete(key); }).catch(() => {});
  return write;
}

export function createQuizDraft(userId: string, batchId: string, progressId: string, session: LocalLearningSession, primary: string, secondary: string | null): QuizDraft {
  return {
    version: 1, user_id: userId, batch_id: batchId, progress_id: progressId, session,
    answers: { ...session.answers }, first_answers: { ...session.first_answers },
    first_answered_at: { ...session.first_answered_at }, answered_at: { ...session.answered_at },
    current_question: session.current_question, pending_submission: false,
    primary_language: primary, secondary_language: secondary, mixed_language: false,
    clock_offset_ms: Date.parse(session.server_time) - Date.now(),
  };
}

/** First responses and timestamps are captured on the action, before feedback or a later correction. */
export function checkpointQuizDraft(draft: QuizDraft, answers: Record<string, boolean>, current: number, primary: string, secondary: string | null, now = Date.now()): QuizDraft {
  if (draft.session.completed || draft.pending_submission) return draft;
  // Freeze the last valid answers at the deadline, including the small gap between timer ticks.
  if (draft.session.deadline_at && now + draft.clock_offset_ms > Date.parse(draft.session.deadline_at)) {
    return { ...draft, current_question: current };
  }
  const first = { ...draft.first_answers };
  const firstAt = { ...draft.first_answered_at };
  const answeredAt = { ...draft.answered_at };
  const timestamp = new Date(now + draft.clock_offset_ms).toISOString();
  for (const [id, value] of Object.entries(answers)) {
    if (!Object.prototype.hasOwnProperty.call(draft.answers, id)) { first[id] = value; firstAt[id] = timestamp; }
    if (draft.answers[id] !== value) answeredAt[id] = timestamp;
  }
  return { ...draft, answers: { ...answers }, first_answers: first, first_answered_at: firstAt, answered_at: answeredAt,
    current_question: current,
    mixed_language: draft.mixed_language || draft.primary_language !== primary || draft.secondary_language !== secondary };
}

export async function clearQuizDrafts(userId: string) {
  const userPrefix = `${prefix}${userId}:`;
  await Promise.allSettled([...writes.entries()].filter(([key]) => key.startsWith(userPrefix)).map(([, write]) => write));
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(userPrefix));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}
