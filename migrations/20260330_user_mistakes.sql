-- ============================================================
-- Migration: Review Mistakes Feature
-- Creates user_mistakes table and two RPCs:
--   1. record_exam_mistakes(p_batch_id) - called after exam submit
--   2. generate_mistakes_review_batch() - generates a review quiz batch
-- ============================================================

-- 1. user_mistakes table
CREATE TABLE IF NOT EXISTS public.user_mistakes (
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id       uuid        NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  incorrect_count   integer     NOT NULL DEFAULT 1,
  last_incorrect_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);

ALTER TABLE public.user_mistakes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own mistakes"
  ON public.user_mistakes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own mistakes"
  ON public.user_mistakes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own mistakes"
  ON public.user_mistakes FOR UPDATE
  USING (auth.uid() = user_id);

-- 2. RPC: record_exam_mistakes
-- Called right after an exam batch is marked as completed.
-- It reads the answers from user_quiz_progress and upserts
-- any incorrectly answered questions into user_mistakes.
CREATE OR REPLACE FUNCTION public.record_exam_mistakes(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id   uuid;
  v_answers   jsonb;
  v_question  record;
BEGIN
  -- Get caller identity and their answers for this batch
  v_user_id := auth.uid();

  SELECT answers
    INTO v_answers
    FROM public.user_quiz_progress
   WHERE user_id = v_user_id
     AND batch_id = p_batch_id
     AND completed = true;

  IF NOT FOUND THEN
    RETURN; -- Batch not yet completed or not found, nothing to do
  END IF;

  -- Iterate over questions in the batch and record mistakes
  FOR v_question IN
    SELECT q.id, q.is_correct
      FROM public.quiz_batch_questions qbq
      JOIN public.questions q ON q.id = qbq.question_id
     WHERE qbq.batch_id = p_batch_id
  LOOP
    DECLARE
      v_user_answer boolean;
    BEGIN
      v_user_answer := (v_answers->>(v_question.id::text))::boolean;

      -- Record as mistake if answer is wrong or was not given
      IF v_user_answer IS DISTINCT FROM v_question.is_correct THEN
        INSERT INTO public.user_mistakes (user_id, question_id, incorrect_count, last_incorrect_at)
          VALUES (v_user_id, v_question.id, 1, now())
          ON CONFLICT (user_id, question_id) DO UPDATE
            SET incorrect_count   = user_mistakes.incorrect_count + 1,
                last_incorrect_at = now();
      END IF;
    END;
  END LOOP;
END;
$$;

-- 3. RPC: generate_mistakes_review_batch
-- Creates a new quiz_batch containing the user's current mistakes
-- and returns the new batch_id.
CREATE OR REPLACE FUNCTION public.generate_mistakes_review_batch()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id    uuid;
  v_batch_id   uuid;
  v_position   integer := 1;
  v_mistake    record;
  v_count      integer;
BEGIN
  v_user_id := auth.uid();

  -- Count how many mistakes exist
  SELECT COUNT(*) INTO v_count
    FROM public.user_mistakes
   WHERE user_id = v_user_id;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'no_mistakes' USING HINT = 'No mistake questions available for review';
  END IF;

  -- Create a new batch of type 'review'
  INSERT INTO public.quiz_batches (user_id, title, batch_type, created_at)
    VALUES (v_user_id, 'Revisione Errori', 'review', now())
    RETURNING id INTO v_batch_id;

  -- Link mistake questions to the new batch ordered by most recent mistake first
  FOR v_mistake IN
    SELECT question_id
      FROM public.user_mistakes
     WHERE user_id = v_user_id
     ORDER BY last_incorrect_at DESC
  LOOP
    INSERT INTO public.quiz_batch_questions (batch_id, question_id, position)
      VALUES (v_batch_id, v_mistake.question_id, v_position);
    v_position := v_position + 1;
  END LOOP;

  RETURN v_batch_id;
END;
$$;

-- 4. RPC: get_mistakes_count
-- Returns number of unique questions currently in user_mistakes.
CREATE OR REPLACE FUNCTION public.get_mistakes_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::integer
    FROM public.user_mistakes
   WHERE user_id = auth.uid();
$$;
