import { supabase } from '@/lib/supabase';
import { Category } from '@/types/categories';

export async function fetchCategories(langCode: string = 'it'): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select(`
      id, color, sort_order, icon_url, created_at, is_active, is_premium, is_hard,
      category_translations!inner (
        title,
        description
      )
    `)
    .eq('is_active', true)
    .eq('category_translations.lang_code', langCode)
    .order('sort_order', { ascending: true });

  if (error) throw error;

  return (data as any[]).map(cat => ({
    ...cat,
    name: cat.category_translations[0]?.title || '',
    description: cat.category_translations[0]?.description || '',
  })) as Category[];
}

