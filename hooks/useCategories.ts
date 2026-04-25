import { fetchCategories } from '@/queries/categories';
import { useCategoriesStore } from '@/store/categories';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function useCategories() {
  const categories = useCategoriesStore((state) => state.categories);
  const hardCategories = useCategoriesStore((state) => state.hardCategories);
  const setCategories = useCategoriesStore((state) => state.setCategories);
  const setHardCategories = useCategoriesStore((state) => state.setHardCategories);
  const [loading, setLoading] = useState(categories.length === 0);
  const { i18n } = useTranslation();

  useEffect(() => {
    let isMounted = true;
    if (categories.length === 0) setLoading(true);

    fetchCategories(i18n.language)
      .then((all) => {
        if (!isMounted) return;
        setCategories(all.filter((c) => !c.is_hard));
        setHardCategories(all.filter((c) => c.is_hard));
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error fetching categories:', error);
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [i18n.language, setCategories, setHardCategories]);

  return {
    categories,
    hardCategories,
    loading: loading && (categories.length === 0 || hardCategories.length === 0)
  };
}
