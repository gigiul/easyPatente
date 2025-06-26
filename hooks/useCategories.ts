import { fetchCategories } from '@/queries/categories';
import { useCategoriesStore } from '@/store/categories';
import { useEffect } from 'react';

export function useCategories() {
  const categories = useCategoriesStore((state) => state.categories);
  const setCategories = useCategoriesStore((state) => state.setCategories);

  useEffect(() => {
    if (categories.length === 0) {
      fetchCategories().then(setCategories).catch(() => {});
    }
  }, [categories.length, setCategories]);

  return { categories };
}
