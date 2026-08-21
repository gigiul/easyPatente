-- Aggiunge la colonna email alla tabella profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Aggiorna il trigger handle_new_user per salvare anche l'email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, created_at, is_premium, email)
  VALUES (new.id, now(), false, new.email);
  RETURN new;
END;
$$;

-- Aggiorna i profili esistenti con l'email da auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;
