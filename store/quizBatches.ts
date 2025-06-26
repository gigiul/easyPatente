import { create } from 'zustand';

interface QuizBatch {
  id: string;
  title: string;
  category_id: string;
  is_random: boolean;
  created_at: string;
}

interface QuizBatchesState {
  batches: QuizBatch[];
  setBatches: (batches: QuizBatch[]) => void;
}

export const useQuizBatchesStore = create<QuizBatchesState>((set) => ({
  batches: [],
  setBatches: (batches) => set({ batches }),
}));
