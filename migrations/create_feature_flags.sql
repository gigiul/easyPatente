-- Tabella feature_flags per controllare funzionalità dell'app
CREATE TABLE IF NOT EXISTS feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read" ON feature_flags
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role full access" ON feature_flags
  FOR ALL USING (auth.role() = 'service_role');

-- Inserisci i flag iniziali
INSERT INTO feature_flags (name, description, is_active) VALUES
  ('explanation', 'Mostra la sezione spiegazioni AI nelle domande del quiz', true),
ON CONFLICT (name) DO NOTHING;
