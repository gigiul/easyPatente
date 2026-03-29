import { fetchCategories } from '@/queries/categories';
import { useCategoriesStore } from '@/store/categories';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export function useCategories() {
  const categories = useCategoriesStore((state) => state.categories);
  const setCategories = useCategoriesStore((state) => state.setCategories);
  const { i18n } = useTranslation();

  useEffect(() => {
    fetchCategories(i18n.language)
      .then(setCategories)
      .catch((error) => console.error('Error fetching categories:', error));
  }, [i18n.language, setCategories]);

  return { categories };
}
