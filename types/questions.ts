export interface Question {
  id: string;
  code: string;
  image_url?: string | null;
  is_free: boolean;
  category_id: string;
  created_at: string;
}
