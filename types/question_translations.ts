export interface QuestionTranslation {
  id: string;
  question_id: string;
  lang_code: string;
  text: string;
  explanation?: string | null;
  created_at: string;
}
