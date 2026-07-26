-- Aggiungi policy DELETE su chat_messages per permettere agli utenti di cancellare i propri messaggi
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Policy per SELECT (già esistente, ma la ricreo per sicurezza)
DROP POLICY IF EXISTS "chat_messages_select_policy" ON chat_messages;
CREATE POLICY "chat_messages_select_policy"
  ON chat_messages
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy per DELETE (nuova)
DROP POLICY IF EXISTS "chat_messages_delete_policy" ON chat_messages;
CREATE POLICY "chat_messages_delete_policy"
  ON chat_messages
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
