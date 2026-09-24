-- Sign-aware RAG retrieval (DEV feature: image_sign_type + sign_to_chunk + RPC)
--
-- Motivation: for road-sign questions the question text is generic
-- ("Vero o False: questo segnale vieta la sosta?") so pure embedding
-- retrieval returns wrong/generic chunks. We identify the sign offline
-- (batch VL script) and map sign_name -> manual_chunks chunk_id, so the
-- edge function can retrieve the exact section of the manual.

-- ─────────────────────────────────────────────────────────────
-- 1. questions.image_sign_type: official sign name identified offline
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS image_sign_type text;

CREATE INDEX IF NOT EXISTS idx_questions_image_sign_type
  ON public.questions (image_sign_type)
  WHERE image_sign_type IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. sign_to_chunk: maps signs.json name -> manual_chunks.chunk_id
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sign_to_chunk (
  sign_name     text PRIMARY KEY,
  sign_category text NOT NULL,
  chunk_id      text NOT NULL,
  keywords      text[],
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sign_to_chunk_category
  ON public.sign_to_chunk (sign_category);

ALTER TABLE public.sign_to_chunk ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sign_to_chunk_select" ON public.sign_to_chunk;
CREATE POLICY "sign_to_chunk_select"
  ON public.sign_to_chunk
  FOR SELECT
  TO authenticated
  USING (true);

-- service_role bypasses RLS for INSERT/UPDATE from batch scripts.

-- ─────────────────────────────────────────────────────────────
-- 3. match_chunks_by_sign: structured lookup with cosine fallback
--    Path A: exact chunks for a sign's section (via sign_to_chunk)
--    Path B: cosine similarity fallback (same as match_manual_chunks)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_chunks_by_sign(
  p_sign_name text DEFAULT NULL,
  p_query_embedding vector(768) DEFAULT NULL,
  p_match_count integer DEFAULT 5,
  p_filter_language text DEFAULT 'it'::text
)
RETURNS TABLE (
  id uuid,
  chunk_id text,
  chapter text,
  section text,
  page_start integer,
  page_end integer,
  article_ref text[],
  keywords text[],
  text text,
  llm_context text,
  similarity double precision
)
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
  -- Path A: structured lookup by identified sign
  IF p_sign_name IS NOT NULL AND p_sign_name <> '' AND p_sign_name <> 'NON_IDENTIFICATO' THEN
    RETURN QUERY
    SELECT
      mc.id,
      mc.chunk_id,
      mc.chapter,
      mc.section,
      mc.page_start,
      mc.page_end,
      mc.article_ref,
      mc.keywords,
      mc.text,
      mc.llm_context,
      1.0::double precision AS similarity
    FROM public.manual_chunks mc
    JOIN public.sign_to_chunk stc ON stc.chunk_id = mc.chunk_id
    WHERE stc.sign_name = p_sign_name
      AND mc.language = p_filter_language
    ORDER BY mc.chunk_id
    LIMIT p_match_count;

    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  -- Path B: cosine fallback
  IF p_query_embedding IS NOT NULL THEN
    RETURN QUERY
    SELECT
      mc.id,
      mc.chunk_id,
      mc.chapter,
      mc.section,
      mc.page_start,
      mc.page_end,
      mc.article_ref,
      mc.keywords,
      mc.text,
      mc.llm_context,
      1 - (mc.embedding <=> p_query_embedding) AS similarity
    FROM public.manual_chunks mc
    WHERE mc.language = p_filter_language
      AND mc.embedding IS NOT NULL
    ORDER BY mc.embedding <=> p_query_embedding
    LIMIT p_match_count;
  END IF;
END;
$function$;
