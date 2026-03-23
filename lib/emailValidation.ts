import { supabase } from './supabase';

// Default fallback whitelist (stessa del DB)
export let ALLOWED_EMAIL_DOMAINS: string[] = [
  'gmail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.it',
  'yahoo.com',
  'yahoo.it',
  'icloud.com',
  'libero.it',
  'virgilio.it',
  'tiscali.it',
  'proton.me',
  'protonmail.com',
  'live.com',
  'live.it',
  'me.com'
];

/**
 * Fetches the latest allowed domains from Supabase.
 * Useful to keep the frontend updated without code changes.
 */
export const fetchAllowedDomains = async (): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('allowed_email_domains')
      .select('domain')
      .eq('is_active', true);

    if (error) throw error;

    if (data && data.length > 0) {
      ALLOWED_EMAIL_DOMAINS = data.map(row => row.domain);
    }

    return ALLOWED_EMAIL_DOMAINS;
  } catch (err) {
    console.warn('[EmailValidation] Error fetching allowed domains, using fallback:', err);
    return ALLOWED_EMAIL_DOMAINS;
  }
};

/**
 * Validates if the email domain is in the allowed list.
 * @param email The email to validate
 * @returns boolean True if the domain is allowed
 */
export const isAllowedEmailDomain = (email: string): boolean => {
  if (!email || !email.includes('@')) return false;

  const domain = email.split('@')[1].toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
};
