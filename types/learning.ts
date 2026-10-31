export interface LearningSession {
  attempt_id: string;
  revision: number;
  score?: number;
  incorrect_count?: number;
  deadline_at: string | null;
  answers: Record<string, boolean>;
  completed: boolean;
}
export interface LearningCategory {
  id: string; title: string; total: number; seen: number; recent_unique: number;
  mastery: number; accuracy: number | null; samples: number; last_at: string | null; accessible: number;
}
export interface LearningHistory {
  id: string; batch_id: string | null; started_at: string; submitted_at: string | null;
  status: 'completed' | 'in_progress' | 'expired' | 'abandoned'; errors: number; total: number; legacy: boolean; italian: boolean | null;
}
export interface LearningStats {
  version: number; updated_at: string;
  readiness: { score: number | null; state: string; exam: number | null; mastery: number; breadth: number;
    exam_count: number; recent_unique: number; recent_categories: number; total_categories: number; gates_met: boolean; enough: boolean };
  coverage: { seen: number; total: number };
  categories: LearningCategory[];
  exams: { completed: number; passed: number; eligible: number; mean_errors: number | null; open: number; interrupted: number };
  history: LearningHistory[]; history_total: number;
  trend: { at: string; errors: number; legacy: boolean }[];
  mistakes: { current: number; recurring: number; recovered: number; consolidated: number; relapsed: number };
  preferences: { exam_date: string | null; daily_goal: number | null; timezone: string } | null;
  today: number; legacy_count: number; resume: { batch_id: string; mode: string; force_italian: boolean } | null;
}
