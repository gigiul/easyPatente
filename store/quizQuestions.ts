import { create } from 'zustand';

export interface QuizQuestion {
  id: string;
  code: string;
  image_url: string | null;
  is_free: boolean;
  category_id: string;
  created_at: string;
  position: number;
  translation: {
    lang_code: string;
    text: string;
    explanation: string;
  } | null;
}

interface QuizQuestionsState {
  questions: QuizQuestion[];
  setQuestions: (questions: QuizQuestion[]) => void;
}

export const useQuizQuestionsStore = create<QuizQuestionsState>((set) => ({
  questions: [],
  setQuestions: (questions) => set({ questions }),
}));
