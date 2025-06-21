export interface UserQuizProgress {
  id: string;
  user_id: string;
  batch_id: string;
  current_question: number;
  answers: any; // puoi tipizzare meglio se conosci la struttura
  completed: boolean;
  started_at: string;
  completed_at?: string | null;
}
