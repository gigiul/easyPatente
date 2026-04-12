import { Category } from '@/types/categories';
import { create } from 'zustand';

interface CategoriesState {
  categories: Category[];
  hardCategories: Category[];
  setCategories: (categories: Category[]) => void;
  setHardCategories: (categories: Category[]) => void;
}

export const useCategoriesStore = create<CategoriesState>((set) => ({
  categories: [],
  hardCategories: [],
  setCategories: (categories) => set({ categories }),
  setHardCategories: (hardCategories) => set({ hardCategories }),
}));
