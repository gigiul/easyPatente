import type { QuizBatch } from '@/types/quiz_batches';
import { create } from 'zustand';

interface QuizBatchesState {
  batchesByCategory: Record<string, QuizBatch[]>;
  setBatches: (categoryId: string, batches: QuizBatch[]) => void;
  getBatches: (categoryId: string) => QuizBatch[];
}

export const useQuizBatchesStore = create<QuizBatchesState>((set, get) => ({
  batchesByCategory: {},
  setBatches: (categoryId: string, batches: QuizBatch[]) => 
    set((state) => ({
      batchesByCategory: {
        ...state.batchesByCategory,
        [categoryId]: batches,
      },
    })),
  getBatches: (categoryId: string) => {
    const state = get();
    return state.batchesByCategory[categoryId] || [];
  },
}));
