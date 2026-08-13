import { supabase } from '@/lib/supabase';
import { Category } from '@/types/categories';

export async function fetchCategories(langCode: string = 'it'): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select(`
      id, color, sort_order, icon_url, created_at, is_active, is_premium, is_hard,
      category_translations (
        title,
        description,
        lang_code
      ),
      quiz_batches(count)
    `)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  if (!data) return [];

  return (data as any[]).map(cat => {
    const translations = cat.category_translations || [];
    let translation = translations.find((t: any) => t.lang_code === langCode);
    if (!translation && translations.length > 0) {
      translation = translations[0];
    }

    const batchesCount = cat.quiz_batches?.[0]?.count ?? 0;

    return {
      ...cat,
      name: translation?.title || '',
      description: translation?.description || '',
      batchesCount,
    };
  }) as Category[];
}
