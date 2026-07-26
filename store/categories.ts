import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { Category } from '@/types/categories';

interface CategoriesState {
  categories: Category[];
  hardCategories: Category[];
  setCategories: (categories: Category[]) => void;
  setHardCategories: (categories: Category[]) => void;
}

export const useCategoriesStore = create<CategoriesState>()(
  persist(
    (set) => ({
      categories: [],
      hardCategories: [],
      setCategories: (categories) => set({ categories }),
      setHardCategories: (hardCategories) => set({ hardCategories }),
    }),
    {
      name: 'categories-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Non persistere se i dati sono vuoti
      partialize: (state) => ({
        categories: state.categories.length > 0 ? state.categories : undefined,
        hardCategories: state.hardCategories.length > 0 ? state.hardCategories : undefined,
      }),
    }
  )
);
