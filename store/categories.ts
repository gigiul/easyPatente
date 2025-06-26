import { Category } from '@/types/categories';
import { create } from 'zustand';

interface CategoriesState {
  categories: Category[];
  setCategories: (categories: Category[]) => void;
}

export const useCategoriesStore = create<CategoriesState>((set) => ({
  categories: [],
  setCategories: (categories) => set({ categories }),
}));
