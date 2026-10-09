import { create } from 'zustand';
import { supabase } from '../lib/supabase';

interface FeatureFlag {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface FeatureFlagsState {
  flags: Record<string, boolean>;
  loading: boolean;
  loaded: boolean;
  fetchFlags: () => Promise<void>;
  isEnabled: (name: string) => boolean;
  isLoaded: () => boolean;
}

export const useFeatureFlagsStore = create<FeatureFlagsState>()(
  (set, get) => ({
    flags: {},
    loading: false,
    loaded: false,

    fetchFlags: async () => {
      set({ loading: true });
      try {
        const { data, error } = await supabase
          .from('feature_flags')
          .select('name, is_active');

        if (error) {
          console.error('Feature flags error:', error);
          throw error;
        }

        const flags: Record<string, boolean> = {};
        (data || []).forEach((f: any) => {
          flags[f.name] = f.is_active;
        });

        set({ flags, loaded: true });
      } catch (error) {
        console.error('Failed to fetch feature flags:', error);
        set({ loaded: false });
      } finally {
        set({ loading: false });
      }
    },

    isEnabled: (name: string) => {
      return get().flags[name] ?? false;
    },

    isLoaded: () => {
      return get().loaded;
    },
  })
);

/**
 * Legge un flag dal DB. Ritorna `fallback` quando il flag non è presente o non
 * si riesce a leggere (fetch fallito / non ancora autenticato), così il
 * chiamante resta in uno stato prevedibile: i flag si leggono solo da utente
 * autenticato (RLS "Authenticated read").
 */
export async function isFeatureFlagEnabled(
  name: string,
  fallback: boolean
): Promise<boolean> {
  const store = useFeatureFlagsStore.getState();
  if (!store.isLoaded()) {
    await store.fetchFlags();
  }

  const { isLoaded, flags } = useFeatureFlagsStore.getState();
  if (!isLoaded() || !(name in flags)) return fallback;
  return flags[name];
}
