import { UserQuizProgress } from '@/types/user_quiz_progress';
import { create } from 'zustand';

interface QuizProgressionState {
  progress: UserQuizProgress[];
  setProgress: (progress: UserQuizProgress[]) => void;
}

export const useQuizProgressionStore = create<QuizProgressionState>((set) => ({
  progress: [],
  setProgress: (progress) => set({ progress }),
}));
