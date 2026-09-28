-- Align function definitions and a column default with the live DEV database.
-- Source: snapshot of DEV (source of truth), 2026-09-28.
-- These are COSMETIC-only differences (keyword case, comments, literal cast form):
-- a normalized comparison confirmed identical behaviour, but they keep
-- `supabase db diff --linked` reporting noise. Idempotent (CREATE OR REPLACE).


CREATE OR REPLACE FUNCTION public.check_registration_email_domain()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  is_allowed_domain boolean;
BEGIN
  -- Check if domain exists and is active in whitelist
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_email_domains 
    WHERE domain = lower(split_part(NEW.email, '@', 2)) AND is_active = true
  ) INTO is_allowed_domain;
  
  -- Prevent insert if domain is NOT in whitelist
  IF NOT is_allowed_domain THEN
    RAISE EXCEPTION 'Registration restricted to common email domains only (e.g. Gmail, Outlook, Yahoo).';
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_exam_batch(p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_batch_id uuid;
  v_is_premium boolean;
BEGIN
  -- Check if user is premium
  SELECT is_premium INTO v_is_premium FROM public.profiles WHERE id = p_user_id;
  IF v_is_premium IS NULL THEN
    v_is_premium := false;
  END IF;

  -- Create new exam batch with i18n key
  INSERT INTO public.quiz_batches (title, is_random, batch_type)
  VALUES ('exam.title', true, 'exam')
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
$function$;

CREATE OR REPLACE FUNCTION public.generate_mistakes_review_batch()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

  -- Create batch of type 'exam' for history, with i18n key for title
  INSERT INTO public.quiz_batches (title, batch_type, created_at)
    VALUES ('exam.reviewTitle', 'exam', now())
    RETURNING id INTO v_batch_id;

  -- Link questions, limiting to 30
  FOR v_mistake IN
    SELECT question_id
      FROM public.user_mistakes
     WHERE user_id = v_user_id
     ORDER BY last_incorrect_at DESC
     LIMIT 30
  LOOP
    INSERT INTO public.quiz_batch_questions (batch_id, question_id, position)
      VALUES (v_batch_id, v_mistake.question_id, v_position);
    v_position := v_position + 1;
  END LOOP;

  -- Initialize progress
  INSERT INTO public.user_quiz_progress (user_id, batch_id, current_question, answers, completed)
  VALUES (v_user_id, v_batch_id, 1, '{}'::jsonb, false);

  RETURN v_batch_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_mistakes_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT COUNT(*)::integer
    FROM public.user_mistakes
   WHERE user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.get_user_exam_history(p_user_id uuid)
 RETURNS TABLE(batch_id uuid, title text, started_at timestamp with time zone, completed_at timestamp with time zone, completed boolean, score bigint, incorrect_count bigint, total bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    p.batch_id,
    b.title,
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
  AND (b.batch_type = 'exam' OR b.batch_type = 'review')
  ORDER BY p.started_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, created_at, is_premium, email)
  VALUES (new.id, now(), false, new.email);
  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_premium()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN COALESCE(
    (SELECT is_premium FROM public.profiles WHERE id = auth.uid()),
    false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_exam_mistakes(p_batch_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id   uuid;
  v_answers   jsonb;
  v_question  record;
BEGIN
  v_user_id := auth.uid();

  SELECT answers
    INTO v_answers
    FROM public.user_quiz_progress
   WHERE user_id = v_user_id
     AND batch_id = p_batch_id
     AND completed = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_question IN
    SELECT q.id, q.is_correct
      FROM public.quiz_batch_questions qbq
      JOIN public.questions q ON q.id = qbq.question_id
     WHERE qbq.batch_id = p_batch_id
  LOOP
    DECLARE
      v_user_answer boolean;
    BEGIN
      -- Check if user answered (jsonb key existence check)
      IF v_answers ? (v_question.id::text) THEN
        v_user_answer := (v_answers->>(v_question.id::text))::boolean;

        IF v_user_answer IS DISTINCT FROM v_question.is_correct THEN
          -- Recorded as MISTAKE
          INSERT INTO public.user_mistakes (user_id, question_id, incorrect_count, last_incorrect_at)
            VALUES (v_user_id, v_question.id, 1, now())
            ON CONFLICT (user_id, question_id) DO UPDATE
              SET incorrect_count   = user_mistakes.incorrect_count + 1,
                  last_incorrect_at = now();
        ELSE
          -- Answered CORRECTLY -> Remove from mistakes list
          DELETE FROM public.user_mistakes 
           WHERE user_id = v_user_id AND question_id = v_question.id;
        END IF;
      ELSE
          -- Not answered at all -> Treat as mistake if it was part of an exam
          INSERT INTO public.user_mistakes (user_id, question_id, incorrect_count, last_incorrect_at)
            VALUES (v_user_id, v_question.id, 1, now())
            ON CONFLICT (user_id, question_id) DO UPDATE
              SET last_incorrect_at = now();
      END IF;
    END;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.register_device(p_device_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.user_devices (user_id, device_id)
  VALUES (auth.uid(), p_device_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_device_association(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM public.user_devices
  WHERE user_id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.unlink_device()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM public.user_devices
  WHERE user_id = auth.uid();
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_device(p_device_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.user_devices
    WHERE user_id = auth.uid()
      AND device_id = p_device_id
  ) INTO v_exists;

  -- Se non c'è nessun record, è il primo accesso → consenti
  IF NOT v_exists THEN
    RETURN NOT EXISTS (
      SELECT 1 FROM public.user_devices WHERE user_id = auth.uid()
    );
  END IF;

  RETURN v_exists;
END;
$function$;

-- Column default in the same form as DEV
ALTER TABLE public.profiles ALTER COLUMN chat_daily_limit SET DEFAULT '20'::numeric;

-- Private bucket read policy for the DEV bucket 'easypatente'.
-- Unconditional (migration 20260924170000 is guarded by bucket existence, which
-- leaves a fresh/shadow database without it). On PROD this is a no-op policy:
-- no bucket with that id exists there, so it matches nothing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'auth read easypatente'
  ) THEN
    CREATE POLICY "auth read easypatente"
      ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'easypatente');
  END IF;
END $$;
