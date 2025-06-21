export interface Profile {
  id: string;
  lang_primary?: string | null;
  lang_secondary?: string | null;
  is_premium: boolean;
  created_at: string;
}
