export interface Category {
  id: string;
  name: string;
  description?: string;
  code: string;
  icon_url?: string | null;
  created_at: string;
  is_active: boolean;
  is_premium: boolean;
}
