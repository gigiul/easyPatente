export interface Profile {
  id: string;
  email?: string | null;
  lang_primary?: string | null;
  lang_secondary?: string | null;
  is_premium: boolean;
  created_at: string;
  has_ai: boolean;
}
