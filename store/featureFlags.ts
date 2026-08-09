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
  fetchFlags: () => Promise<void>;
  isEnabled: (name: string) => boolean;
}

export const useFeatureFlagsStore = create<FeatureFlagsState>()(
  (set, get) => ({
    flags: {},
    loading: false,

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

        set({ flags });
      } catch (error) {
        console.error('Failed to fetch feature flags:', error);
      } finally {
        set({ loading: false });
      }
    },

    isEnabled: (name: string) => {
      return get().flags[name] ?? false;
    },
  })
);
