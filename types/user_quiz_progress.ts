import type { QuizDraft } from './learning';
export interface UserQuizProgress {
  id: string;
  learning_draft?: QuizDraft;
  learning_revision?: number;
  score?: number | null;
  incorrect_count?: number | null;
  user_id: string;
  batch_id: string;
  current_question: number;
  answers: any;
  completed: boolean;
  started_at: string;
  completed_at?: string | null;
}
