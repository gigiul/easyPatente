export interface QuizBatch {
  id: string;
  title: string;
  category_id?: string | null;
  is_random: boolean;
  created_at: string;
}
