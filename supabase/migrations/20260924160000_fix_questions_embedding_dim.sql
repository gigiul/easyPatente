-- Fix: questions.embedding dimension mismatch
-- Column was vector(1024) but runtime generates 768-dim EmbeddingGemma vectors.
-- This caused silent UPDATE failures in the explain-question edge function
-- (supabase-js does not throw), so embeddings were never persisted and every
-- request regenerated them.
--
-- manual_chunks.embedding is already vector(768); match_manual_chunks expects vector(768).

-- Clear existing values first: pgvector cannot cast vector(1024) -> vector(768).
-- The 79 existing embeddings are stale / wrong-dimension; they will be
-- regenerated lazily by the edge function on next access.
UPDATE public.questions SET embedding = NULL;

ALTER TABLE public.questions ALTER COLUMN embedding TYPE vector(768);
