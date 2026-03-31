-- ============================================================
-- Migration: Remove is_exam from quiz_batches
-- The column is_exam is being dropped in favor of using
-- batch_type uniformly to avoid confusion.
-- Categories and standard quizzes will use batch_type='module'
-- Exams will use batch_type='exam'
-- Reviews will use batch_type='review'
-- ============================================================

-- Change default batch_type from 'exam' to 'module'
ALTER TABLE public.quiz_batches ALTER COLUMN batch_type SET DEFAULT 'module';

-- Update existing records: if they were not exams, they are normal modules
UPDATE public.quiz_batches
SET batch_type = 'module'
WHERE is_exam = false AND batch_type = 'exam';

-- For actual exams, ensure they are 'exam'
UPDATE public.quiz_batches
SET batch_type = 'exam'
WHERE is_exam = true;

-- Drop RLS policy dependent on is_exam
DROP POLICY IF EXISTS "Authenticated users can view exam batches" ON public.quiz_batches;

-- Drop 'is_exam' column as it's no longer needed
ALTER TABLE public.quiz_batches DROP COLUMN IF EXISTS is_exam;

-- Recreate RLS policy using batch_type
CREATE POLICY "Authenticated users can view exam batches"
ON public.quiz_batches
FOR SELECT
TO authenticated
USING (batch_type IN ('exam', 'review'));

-- Update generate_exam_batch to insert batch_type = 'exam' instead of is_exam = true
CREATE OR REPLACE FUNCTION public.generate_exam_batch(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch_id uuid;
  v_is_premium boolean;
BEGIN
  -- Check if user is premium
  SELECT is_premium INTO v_is_premium FROM public.profiles WHERE id = p_user_id;
  IF v_is_premium IS NULL THEN
    v_is_premium := false;
  END IF;

  -- Create new exam batch
  INSERT INTO public.quiz_batches (title, is_random, batch_type)
  VALUES ('Exam - ' || p_user_id::text, true, 'exam')
  RETURNING id INTO v_batch_id;

  -- Add 30 random accessible questions
  WITH random_questions AS (
    SELECT id
    FROM public.questions
    WHERE is_free = true OR v_is_premium = true
    ORDER BY random()
    LIMIT 30
  )
  INSERT INTO public.quiz_batch_questions (batch_id, question_id, position)
  SELECT v_batch_id, id, row_number() over ()
  FROM random_questions;

  -- Initialize progress to 0
  INSERT INTO public.user_quiz_progress (user_id, batch_id, current_question, answers, completed)
  VALUES (p_user_id, v_batch_id, 1, '{}'::jsonb, false);

  RETURN v_batch_id;
END;
$$;

-- Drop the old unused 1-argument version of generated_mistakes_review_batch
DROP FUNCTION IF EXISTS public.generate_mistakes_review_batch(uuid);

-- Recreate generate_mistakes_review_batch (0 args) just to ensure it's up to date 
-- It was already using batch_type, so we verify its code doesn't implicitly rely on dropped columns
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

  -- Count mistakes
  SELECT COUNT(*) INTO v_count
    FROM public.user_mistakes
   WHERE user_id = v_user_id;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'no_mistakes' USING HINT = 'No mistake questions available for review';
  END IF;

  -- Create batch of type review
  INSERT INTO public.quiz_batches (title, batch_type, created_at)
    VALUES ('Revisione Errori - ' || v_user_id::text, 'review', now())
    RETURNING id INTO v_batch_id;

  -- Link questions
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

  -- Initialize progress for user
  INSERT INTO public.user_quiz_progress (user_id, batch_id, current_question, answers, completed)
  VALUES (v_user_id, v_batch_id, 1, '{}'::jsonb, false);

  RETURN v_batch_id;
END;
$$;

-- Update get_user_exam_history to filter by batch_type = 'exam'
CREATE OR REPLACE FUNCTION public.get_user_exam_history(p_user_id uuid)
RETURNS TABLE(batch_id uuid, started_at timestamp with time zone, completed_at timestamp with time zone, completed boolean, score bigint, incorrect_count bigint, total bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.batch_id,
    p.started_at,
    p.completed_at,
    p.completed,
    (SELECT count(*) FROM quiz_batch_questions qbq 
     JOIN questions q ON q.id = qbq.question_id 
     WHERE qbq.batch_id = p.batch_id 
     AND (p.answers->>q.id::text)::boolean = q.is_correct) as score,
    (SELECT count(*) FROM quiz_batch_questions qbq 
     JOIN questions q ON q.id = qbq.question_id 
     WHERE qbq.batch_id = p.batch_id 
     AND ((p.answers->>q.id::text) IS NULL OR (p.answers->>q.id::text)::boolean != q.is_correct)) as incorrect_count,
    (SELECT count(*) FROM quiz_batch_questions qbq WHERE qbq.batch_id = p.batch_id) as total
  FROM user_quiz_progress p
  JOIN quiz_batches b ON b.id = p.batch_id
  WHERE p.user_id = p_user_id
  AND b.batch_type = 'exam'
  ORDER BY p.started_at DESC;
END;
$$;
