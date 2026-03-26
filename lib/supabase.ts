import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

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