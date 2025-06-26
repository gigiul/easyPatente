import { supabase } from '@/lib/supabase';
import { Category } from '@/types/categories';

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as Category[];
}
