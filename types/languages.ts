export interface Language {
  code: string;
  name: string;
  native_name: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}
