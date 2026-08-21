-- ============================================================
-- Device Binding: associa ogni account a un solo dispositivo
-- ============================================================

-- 1. Tabella user_devices
CREATE TABLE public.user_devices (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL,
  device_id  text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_devices_pkey PRIMARY KEY (id),
  CONSTRAINT user_devices_user_id_unique UNIQUE (user_id),
  CONSTRAINT user_devices_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indice per lookup rapido su device_id
CREATE INDEX idx_user_devices_device_id ON public.user_devices (device_id);

-- 2. RLS
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

-- Utente autenticato può leggere solo il proprio record
CREATE POLICY "Users can read own device"
  ON public.user_devices FOR SELECT
  USING (auth.uid() = user_id);

-- Utente autenticato può inserire solo il proprio record
CREATE POLICY "Users can insert own device"
  ON public.user_devices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Utente autenticato può aggiornare solo il proprio record
CREATE POLICY "Users can update own device"
  ON public.user_devices FOR UPDATE
  USING (auth.uid() = user_id);

-- Utente autenticato può cancellare solo il proprio record
CREATE POLICY "Users can delete own device"
  ON public.user_devices FOR DELETE
  USING (auth.uid() = user_id);

-- 3. RPC: register_device
-- Registra il dispositivo corrente per l'utente autenticato.
-- Se l'utente ha già un dispositivo associato, ignora l'inserimento (idempotente).
CREATE OR REPLACE FUNCTION public.register_device(p_device_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_devices (user_id, device_id)
  VALUES (auth.uid(), p_device_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- 4. RPC: validate_device
-- Verifica che il dispositivo corrente corrisponda a quello registrato.
-- Restituisce true se valido, false altrimenti.
-- Se l'utente non ha ancora un dispositivo associato, restituisce true
-- (primo accesso dopo reset o registrazione).
CREATE OR REPLACE FUNCTION public.validate_device(p_device_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
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
$$;

-- 5. RPC: reset_device_association
-- Rimuove l'associazione dispositivo per un utente (uso admin/supporto).
-- Parametro: p_user_id — l'utente da resettare.
CREATE OR REPLACE FUNCTION public.reset_device_association(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.user_devices
  WHERE user_id = p_user_id;
END;
$$;

-- 6. RPC: unlink_device
-- Rimuove l'associazione del dispositivo per l'utente corrente.
CREATE OR REPLACE FUNCTION public.unlink_device()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.user_devices
  WHERE user_id = auth.uid();
END;
$$;
