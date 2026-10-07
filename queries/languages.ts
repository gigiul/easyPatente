import { getSiteConfig } from '../lib/siteConfig';
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

  // Dedicated site (e.g. bn.easypatente.it): only the site's fixed language pair.
  // Filtering happens upstream → propagates through the store to LanguagePicker
  // and the default-language fallbacks.
  const site = getSiteConfig();
  const rows = (data as Language[] | null) ?? [];
  const filtered = site ? rows.filter((l) => site.languages.includes(l.code)) : rows;

  useLanguagesStore.getState().setLanguages(filtered);
  return filtered;
}
