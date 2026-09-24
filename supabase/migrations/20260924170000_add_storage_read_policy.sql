-- Private bucket read policy for DEV bucket 'easypatente'.
-- Mirrors PROD policy "auth read easyPatenteProd" (SELECT TO authenticated).
-- Environment-guarded: no-op on PROD (where only bucket 'easyPatenteProd' exists
-- and its own policy is already in place).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'easypatente')
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'storage' AND tablename = 'objects'
         AND policyname = 'auth read easypatente'
     )
  THEN
    CREATE POLICY "auth read easypatente"
      ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'easypatente');
  END IF;
END $$;
