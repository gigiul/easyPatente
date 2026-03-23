export interface QuizBatch {
  id: string;
  title: string;
  category_id?: string | null;
  is_random: boolean;
  created_at: string;
  // Progress information (added when fetching with user context)
  isCompleted?: boolean;
  hasProgress?: boolean;
  /** null = non ancora completato, true = superato (≤3 errori), false = non superato */
  isPassed?: boolean | null;
  incorrectCount?: number | null;
  progress?: {
    completed: boolean;
    completed_at?: string;
    current_question: number;
    answers: Record<string, any>;
  } | null;
}
