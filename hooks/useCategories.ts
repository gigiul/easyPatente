import { fetchCategories } from '@/queries/categories';
import { useCategoriesStore } from '@/store/categories';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export function useCategories() {
  const categories = useCategoriesStore((state) => state.categories);
  const hardCategories = useCategoriesStore((state) => state.hardCategories);
  const setCategories = useCategoriesStore((state) => state.setCategories);
  const setHardCategories = useCategoriesStore((state) => state.setHardCategories);
  const { i18n } = useTranslation();

  useEffect(() => {
    fetchCategories(i18n.language)
      .then((all) => {
        setCategories(all.filter((c) => !c.is_hard));
        setHardCategories(all.filter((c) => c.is_hard));
      })
      .catch((error) => console.error('Error fetching categories:', error));
  }, [i18n.language, setCategories, setHardCategories]);

  return { categories, hardCategories };
}
