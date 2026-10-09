-- Feature flag "device_binding": blocco del login a un solo dispositivo
-- (tabella public.user_devices + RPC validate_device/register_device).
-- Default TRUE: il blocco resta attivo finché non viene spento esplicitamente
--   UPDATE public.feature_flags SET is_active = false WHERE name = 'device_binding';
-- (eseguito su DEV per poter testare lo stesso account su più dispositivi;
--  su PROD non serve nessuna azione: il blocco resta acceso).
-- ON CONFLICT DO NOTHING: su un ambiente dove il flag esiste già non viene sovrascritto.

insert into public.feature_flags (id, name, description, is_active)
values (
  '420ddee4-59f7-41d2-8cdd-48a87681a693',
  'device_binding',
  'Associa ogni account a un solo dispositivo alla volta (blocca il login su device diverso)',
  true
)
on conflict (name) do nothing;
