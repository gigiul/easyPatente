export interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string | null;
  sort_order?: number | null;
  icon_url?: string | null;
  created_at: string;
  is_active: boolean;
  is_premium: boolean;
  is_hard: boolean;
  batchesCount: number;
}
