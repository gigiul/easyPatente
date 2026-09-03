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

// Private bucket: signed URLs cached for quiz duration (2400s = 40min > 30min exam)
// Bucket differs DEV=easypatente vs PROD=easyPatenteProd — derive from storage URL or supabaseUrl
function getStorageBucket(): string {
  // Prefer explicit env, else derive from STORAGE_URL, else fallback by project ref
  const envBucket = process.env.EXPO_PUBLIC_SUPABASE_BUCKET;
  if (envBucket) return envBucket;
  if (supabaseStorageUrl) {
    const parts = supabaseStorageUrl.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && last !== 'public') return last; // .../public/<bucket>
  }
  if (supabaseUrl?.includes('pydwxyxvnkytelbapbsk')) return 'easyPatenteProd';
  return 'easypatente';
}
const signedUrlCache = new Map<string, { url: string; exp: number }>();
export async function getSignedImageUrl(filename: string | null | undefined, ttlSeconds = 2400): Promise<string | null> {
  if (!filename) return null;
  console.log('[getSignedImageUrl] filename=', JSON.stringify(filename));
  const cached = signedUrlCache.get(filename);
  if (cached && cached.exp > Date.now()) return cached.url;
  const bucket = getStorageBucket();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filename, ttlSeconds);
  if (error || !data?.signedUrl) {
    console.warn('getSignedImageUrl failed for', JSON.stringify(filename), 'bucket=', bucket, error?.message);
    return null; // do not cache failures
  }
  signedUrlCache.set(filename, { url: data.signedUrl, exp: Date.now() + ttlSeconds * 1000 - 5000 });
  return data.signedUrl;
}

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