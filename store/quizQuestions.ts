import { create } from 'zustand';

export interface QuizQuestionTranslation {
  lang_code: string;
  text: string;
  explanation: string;
}

export interface QuizQuestion {
  id: string;
  code: string;
  image_filename: string | null;
  image_url?: string | null;
  is_free: boolean;
  is_correct: boolean;
  category_id: string;
  created_at: string;
  position: number;
  translation: QuizQuestionTranslation | null;
  secondaryTranslation?: QuizQuestionTranslation | null;
}

interface QuizQuestionsState {
  questions: QuizQuestion[];
  setQuestions: (questions: QuizQuestion[]) => void;
}

export const useQuizQuestionsStore = create<QuizQuestionsState>((set) => ({
  questions: [],
  setQuestions: (questions) => set({ questions }),
}));
