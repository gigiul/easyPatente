-- Reconcile schema drift between the migrations and the live DEV database.
-- Captured from DEV (source of truth) on 2026-09-28 after `supabase db diff --linked`.
-- Brings a database built from migrations to the exact DEV state: FORCE RLS flags,
-- column comment, rls_auto_enable event trigger (auto-enables RLS on new tables),
-- and the two policies whose WITH CHECK clause was absent on DEV.
-- Idempotent: every statement is re-runnable.

-- 1. Column comment
COMMENT ON COLUMN public.profiles.chat_daily_limit IS 'A per-user field specifying the limit usage of AI chat feature';

-- 2. FORCE ROW LEVEL SECURITY (apply RLS to the table owner as well)
ALTER TABLE public.categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.languages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.question_translations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.questions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_batch_questions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_quiz_progress FORCE ROW LEVEL SECURITY;

-- 3. Policy definitions as on DEV (no explicit WITH CHECK)
DROP POLICY IF EXISTS "Service role full access" ON public.feature_flags;
CREATE POLICY "Service role full access" ON public.feature_flags FOR ALL USING ((auth.role() = 'service_role'::text));

DROP POLICY IF EXISTS "Users can manage their own mistakes" ON public.user_mistakes;
CREATE POLICY "Users can manage their own mistakes" ON public.user_mistakes FOR ALL USING ((auth.uid() = user_id));

-- 4. RLS auto-enable helper (snapshotted from DEV)
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;


-- 5. Event trigger + grant
DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls ON ddl_command_end WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') EXECUTE FUNCTION public.rls_auto_enable();

GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";
