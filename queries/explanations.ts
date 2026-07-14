import { supabase } from '@/lib/supabase';

export interface ExplanationResponse {
  explanation: string;
  secondary_explanation: string | null;
  sources: any[] | null;
  has_image: boolean;
  from_cache: boolean;
}

export async function fetchExplanation(
  questionId: string,
  questionText: string,
  langCode: string,
  secondaryLang?: string
): Promise<ExplanationResponse> {
  const { data: { session } } = await supabase.auth.getSession();

  const response = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/explain-question`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
        'apikey': process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
      },
      body: JSON.stringify({
        question_id: questionId,
        question_text: questionText,
        lang_code: langCode,
        secondary_lang: secondaryLang || undefined,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Explanation request failed: ${response.status}`);
  }

  return response.json();
}
