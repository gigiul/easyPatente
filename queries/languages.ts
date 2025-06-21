import { supabase } from '../lib/supabase';
import { useLanguagesStore } from '../store/languages';
import { Language } from '../types/languages';

export async function fetchLanguages() {
    
const { data, error } = await supabase
    .from('languages')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw error;
  if (data) {
    useLanguagesStore.getState().setLanguages(data as Language[]);
  }
}