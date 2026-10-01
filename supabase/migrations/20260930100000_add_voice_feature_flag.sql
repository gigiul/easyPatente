-- Feature flag "voice": chat vocale full-duplex (Gemini Live API, doc/PLAN_VOICE_CHAT.md).
-- Default false: la voce resta disattivata finché non viene accesa esplicitamente
--   UPDATE public.feature_flags SET is_active = true WHERE name = 'voice';
-- ON CONFLICT DO NOTHING: su un ambiente dove il flag esiste già (es. DEV locale
-- con voice=true per i test) non viene sovrascritto.

insert into public.feature_flags (id, name, description, is_active)
values (
  '5ed323a4-b629-4eeb-b0b2-845113586eb5',
  'voice',
  'Abilita la chat vocale full-duplex (Gemini Live API) nella schermata chat',
  false
)
on conflict (name) do nothing;
