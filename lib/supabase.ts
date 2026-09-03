import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl = 
  Constants.expoConfig?.extra?.supabaseUrl ??
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 
  process.env.SUPABASE_URL;

const supabasePublishableKey = 
  Constants.expoConfig?.extra?.supabaseAnonKey ??
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY;

export const supabaseStorageUrl = 
  Constants.expoConfig?.extra?.supabaseStorageUrl ??
  process.env.EXPO_PUBLIC_SUPABASE_STORAGE_URL ?? 
  process.env.SUPABASE_STORAGE_URL;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);

// Types for your database schema
export type Quiz = {
  id: string;
  key: string;
  image_filename: string | null;
  is_free: boolean;
  created_at: string;
};

export type Subscription = {
  user_id: string;
  is_active: boolean;
  language_primary: string | null;
  language_secondary: string | null;
  full_name: string | null;
}; 