import { supabase } from '../lib/supabase';
import { useLanguagesStore } from '../store/languages';
import { Language } from '../types/languages';

export async function fetchLanguages() {
  const { data, error } = await supabase
    .from('languages')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    console.error('[fetchLanguages] Error:', error);
    throw error;
  }
  
  if (data) {
    useLanguagesStore.getState().setLanguages(data as Language[]);
    return data as Language[];
  }
  return [];
}