# Piano — Chat vocale full-duplex (Gemini Live API + RAG)

**Stato**: ✅ Fase 5 COMPLETATA — migration + docs + **deploy DEV** (funzione `live`, flag `voice=true`,
secrets, E2E verificato su DEV con corpus completo, wall-clock free tier misurato 150.47s e mitigato
con cap 145s + auto-reconnect). Resta solo il test manuale in browser.
**Data**: 2026-09-30
**Modello di riferimento**: `gemini-3.8-live`

---

## 1. Obiettivo

Aggiungere alla chat esistente una modalità **voce full-duplex** (microfono aperto, barge-in, risposta parlata continua, come l'app Gemini) in cui **ogni risposta passa obbligatoriamente dal RAG** su Supabase/pgvector, riusando auth, `has_ai`, rate limit, history e UI della chat testuale.

## 2. Decisioni architetturali

| # | Decisione | Motivo |
|---|---|---|
| D1 | **Proxy Edge Function WS** (`Deno.upgradeWebSocket`) tra client e Gemini | `GEMINI_API_KEY` solo server; auth/`has_ai`/rate limit/RAG tool tutti server-side; una implementazione per native + web |
| D2 | **Full-duplex** (non push-to-talk) | UX tipo app Gemini; VAD e barge-in gestiti dalla Live API |
| D3 | **RAG via function calling** — tool `retrieve_manual_context` obbligatoria prima di ogni risposta | Unica garanzia che *ogni* turno sia grounded (un contesto iniettato nel `systemInstruction` drifterebbe dal 2° turno) |
| D4 | **Re-rank RIMOSSO dalla via vocale** | Riguarda pochi casi isolati (solo segnaletiche in path cosine), costa 300–800ms per turno vocale. Resta invariato per `explain-question` e chat testuale |
| D5 | **Niente Vertex AI RAG Engine** | Prodotto GCP Pre-GA, corpus chiuso: incompatibile con il retrieval ibrido (sign-pinned + filtro categoria + cache) |
| D6 | **`behavior="BLOCKING"`** sulla tool RAG | Garanzia strutturale "sempre RAG": il modello si ferma finché il proxy non ritorna i chunk. 3.8 Live aggiunge auto-cancel (l'utente che parla cancella la call in volo → nuovo turno → nuova toolCall) e scheduling `WHEN_IDLE` (niente risposte che si sovrappongono). Fallback documentato: async + regola prompt se il silenzio residuo risultasse fastidioso |
| D7 | **Niente `gemini-3.8-live-extended-thinking`** | Function calling **async-only** (perderebbe D6), thinking non aiuta (la retrieval è I/O-bound, non reasoning-bound), state machine più complessa (`interaction_status` invece di `turnComplete`), costo extra inutili per spiegazioni T/F |
| D8 | **Web-first** | AudioWorklet pulito, zero lib native; la variante native (lib PCM streaming) viene in una fase successiva per ridurre il rischio |
| D9 | **Rate limit voce = riuso `chat_daily_limit`** | Un solo contatore coerente: 1 richiesta a turno vocale completato |
| D10 | **Cap durata sessione = 5 min** | Soggetto a verifica sul piano Supabase in Fase 0 (wall-clock 150s free / 400s paid) |

## 3. Architettura

```
┌──────────── Client (RN/web) ────────────┐
│ lib/liveVoice.ts   (WS session manager) │
│ lib/liveAudio/     (PCM in/out, .web.ts)│
│ store/voice.ts     (stato Zustand)      │
└──────────────┬──────────────────────────┘
               │ wss://…/functions/v1/live  (audio PCM16 16kHz base64 + testo)
               ▼
┌──── Edge Function supabase/functions/live/ ────┐
│ 1. upgradeWebSocket + EdgeRuntime.waitUntil    │
│    (socketClosedPromise → niente EarlyDrop)    │
│ 2. auth (?access_token → getUser) → has_ai     │
│    → rate limit                                │
│ 3. WSS upstream → Gemini Live (key server)     │
│ 4. setup: modello + systemInstruction (regole  │
│    RAG + lang + question_id) + tools           │
│    behavior="BLOCKING" + trascrizioni attive   │
│ 5. INTERCEPT toolCall retrieve_manual_context  │
│      → _shared/retrieval (NO rerank)           │
│      → fast-path cache question_id             │
│      → toolResponse strutturato (chunk)        │
│ 6. INTERCEPT transcriptions → chat_messages    │
│    + decremento rate limit a turno completato  │
│ 7. eventi proxy {proxyStatus: retrieving|...}  │
└──────────────┬─────────────────────────────────┘
               ▼
        Gemini Live (WSS) ←→ Supabase (profiles, chat_messages, manual_chunks)
```

**Note protocollo**:
- I browser non possono mandare header su WebSocket → `[functions.live] verify_jwt = false` in `supabase/config.toml`, auth manuale via `?access_token=` validata con `supabase.auth.getUser` (stessa logica di `chat/index.ts:26-31`).
- Il client manda i messaggi standard della Live API (`realtimeInput` audio/testo); il proxy li inoltra verbatim e intercetta solo `setup`, `toolCall` e le trascrizioni, più iniezione degli eventi `proxyStatus`.
- Audio in: chunk **50–100ms**, 16kHz 16-bit mono PCM (`audio/pcm;rate=16000`). Audio out: 24kHz mono PCM.
- Reconnect a scadenza wall-clock: il client riconnette e il proxy re-inietta history (max 10 turni) nel `setup`, **dopo il frame `setup_complete`** con `HistoryConfig(initial_history_in_client_content=True)`.

## 4. Fasi di lavoro

### Fase 0 — Spike di validazione (0.5–1 gg) ✅ COMPLETATA (locale, 2026-09-30)
Edge function grezza `live` con solo: upgrade WS + `EdgeRuntime.waitUntil` + echo + WSS upstream a Gemini con `setup` base e 1 frame audio in/out.

**Exit criteria** (misurare in DEV):
- [x] Durata massima reale della sessione WS: **300.4s locali** → cap `VOICE_SESSION_MAX_SECONDS=300` (code 4000 `session_limit`) sparato perfettamente, **nessun EarlyDrop/kill del runtime**. ⚠️ Su hosted il wall-clock è 150s free / 400s paid: da verificare con deploy DEV (fuori scope "solo locale" di questa fase)
- [x] Niente EarlyDrop con `EdgeRuntime.waitUntil(socketClosedPromise)` (warning wall-clock presente ma nessuna chiusura forzata)
- [x] Deno edge runtime raggiunge Gemini con `WebSocket` client (Docker → internet ok)
- [x] **`gemini-3.8-live` disponibile via API key** su `generativelanguage.googleapis.com` → Vertex/ADC **non necessario**; setup completo (tools + `behavior="BLOCKING"` + trascrizioni) accettato senza errori
- [x] Latenza `toolCall → toolResponse`: **315–608ms** (embed Cloudflare 281–576ms + query pgvector 28–184ms), target < 1,5s **superato con margine**

**Exit criteria bonus validati** (oltre al piano):
- [x] RAG grounded end-to-end: trascrizione domanda → toolCall → 3 chunk → risposta parlata basata solo sul contesto seed locale
- [x] Audio IN completo: VAD (`voiceActivity ACTIVITY_START/END`), `inputTranscription`, PCM 16kHz streammato correttamente
- [x] Audio OUT: frame PCM 24kHz ricevuti, `outputTranscription`, `generationComplete`
- [x] Structured error della tool → modello avvisa l'utente (nessun loop di re-query), come da regole 3.8 Live

**Scoperte tecniche da portare in Fase 2**:
1. **Gemini incapsula i JSON in frame WebSocket binari (UTF-8)**: vanno decodificati, altrimenti ogni messaggio upstream viene silenziosamente droppato (bug trovato e fixato nello spike).
2. **`sessionResumptionUpdate` con `newHandle` + `resumable: true`**: la sessione è risumabile — candidato per sopravvivere al wall-clock hosted (150/400s) senza ri-speech; da valutare in Fase 2/contingenza.
3. **VAD trailing silence ~0.9s**: servono ~900ms di silenzio in coda (streammandoli continuamente) prima di `ACTIVITY_END`; sotto 0.6s il turno non parte. Il client dovrà streammare silenzio finché la sessione è aperta.
4. **Budget latenza reale (percorso vocale)**: fine parlato → primo audio ≈ **2.4–2.7s** (VAD ~0.9s + tool 315–608ms + primo token ~0.9s). Sopra il target di 1.5s ma sotto/nella soglia dei 2.5s; il fast-path cache `question_id` (~50ms al posto della tool) porta tutto a ~1.9s. I `{}` vuoti ricevuti sono heartbeat/ack del server.

**Artefatti spike** (solo locale, non nel repo): proxy in `supabase/functions/live/index.ts` (evolverà in Fase 2), client di test in `tmp/` opencode (test testuale, test audio, seed 3 `manual_chunks` sintetici con embedding Cloudflare reali nel DB locale).

### Fase 1 — Refactor condiviso ✅ COMPLETATA (locale, 2026-09-30)

- [x] **`_shared/guards.ts`**: estratti `guardChatAccess` (auth → `has_ai` → rate limit a mezzanotte, errori 401/403/429 byte-identici), `consumeChatRequest` (incremento contatore con stesso `now` della verifica) e `createAdminClient`. `chat/index.ts` riusa le guard; `live/index.ts` riusa `createAdminClient` (auth WS arriva in Fase 2).
- [x] **`_shared/retrieval.ts` → `retrieveForVoice`**: nessun re-rank (nessun `questionText` passato a `retrieveChunks`), fast-path se `question_id` ha la spiegazione in cache (zero embedding + zero query), path ibrido con embedding già in DB, free-text = coseno "it" come la chat.
- [x] **`live/index.ts`** collegato: tool handler usa `retrieveForVoice` con `sessionQuestionId`/`sessionLang` dal `hello`; `proxyStatus.tool_latency` ora riporta `path` + `from_cache`.

**Verifica chat testuale invariata** (utente locale, chunks seedati, `LLM_PROVIDER=gemini`):
- [x] 401 senza token e con token falso → `{"error":"Unauthorized"}` identici
- [x] 403 `AI_NOT_ENABLED` con `has_ai=false` → body identico all'originale
- [x] 429 `RATE_LIMIT` con `request_count=20` → body identico all'originale
- [x] 200 end-to-end: risposta grounded su Cap.4 4.1/4.2, `retrieval_path=cosine`, `reranked=false`, `remaining_requests=19`, `chat_messages` persistiti, contatore 0→1

**Verifica path vocale** (3 percorsi di retrieval, tutti sotto target 1,5s):
- [x] Free-text: **409ms** `path=cosine` 3 chunks → risposta grounded
- [x] Fast-path cache: **29ms** `path=cache, from_cache=true` 0 chunks → risposta basata sulla spiegazione cacheata (primo audio 2048ms vs 2541ms del cosine)
- [x] Ibrido question_id senza cache: **300ms** `path=sign` 3 chunks → zero chiamate di embedding
- `supabase/functions/_shared/guards.ts`: estrarre auth → `has_ai` → rate limit da `chat/index.ts:26-61`; `chat` e `live` lo riusano.
- `supabase/functions/_shared/retrieval.ts`: wrapper `retrieveForVoice(question, questionId?, lang)` = path ibrido **senza rerank** + fast-path: se `question_id` ha spiegazione in cache (`question_translations.explanation`) → restituisce contesto immediatamente, zero embedding/query.
- ✅ Verifica: chat testuale invariata (stesse risposte/`retrieval_path`).

### Fase 2 — Edge function `live/` ✅ COMPLETATA (locale, 2026-09-30)

- [x] **Auth WS** via `?access_token` → `guardChatAccess` prima di aprire l'upstream; fallimenti → evento `proxyStatus auth_error` + close: **4401** (unauthorized), **4403** (`AI_NOT_ENABLED`), **4429** (`RATE_LIMIT`). Coda outbox per gli eventi inviati mentre il socket è ancora `CONNECTING` (altrimenti `auth_error` andava perso).
- [x] **Setup Gemini**: `inputAudioTranscription.customVocabulary` accettato (BASE_VOCAB fisso + `sign_to_chunk.sign_name` freschi a ogni connessione + `VOICE_CUSTOM_VOCAB` extra → 235 termini), history recente (ultime 6 `chat_messages`) e lingua nel `systemInstruction`.
- [x] **Persistenza a `turnComplete`**: trascrizioni accumulate (`inputTranscription`/`outputTranscription`) → insert `chat_messages` (user/assistant) + **1 richiesta consumata per turno con risposta** (D9). Fallback: i testi `realtimeInput.text` (che non producono `inputTranscription`) vengono persistiti come riga user. Flush delle trascrizioni anche a chiusura sessione.
- [x] **Rate limit in sessione**: tool `rate_limit` strutturato se `used >= daily_limit` (il modello lo comunica), evento `proxyStatus rate` con remaining dopo ogni turno.
- [x] **Idle timeout** `VOICE_IDLE_SECONDS` (default 120) → close **4408**; cap 300s → close **4000** (invariato).
- [x] **`supabase/config.toml`**: `[functions.live] verify_jwt = false` (l'handshake WS del browser non può mandare header Authorization).

**Verifica locale** (tutti i test superati, zero errori nei log):
- [x] senza token → `auth_error 401` + close 4401 in ~200ms; `has_ai=false` → 4403; contatore esaurito → 4429
- [x] `auth_ok` (used/remaining) → setup 572ms (customVocabulary + history accettati) → tool 691ms → turnComplete → righe `chat_messages` + `rate {used,remaining}`
- [x] audio IN completo: trascrizione utente persistita come riga user, contatore consumato
- [x] sessione a 2 turni: 2 consumi (`request_count` 6→8), 2 righe user + 2 assistant, 2 tool call (468/296ms)
- [x] idle 8s (test) → close 4408; history=6 e vocab=235 nel systemInstruction

**Nota**: l'evento `rate` del secondo turno può non essere consegnato se il client chiude subito dopo `turnComplete` (race, puramente cosmético — il consumo in DB avviene comunque).
- `supabase/functions/live/index.ts`:
  - Connessione client → validazione token/`has_ai`/rate limit → WSS Gemini → `setup` con `responseModalities:["AUDIO"]`, `input/output_audio_transcription` attive (+ `custom_vocabulary`), `systemInstruction` = prompt attuale (`chat/index.ts:121-152`) + "PRIMA di ogni risposta chiama `retrieve_manual_context`" + retry policy (max 2 tool call consecutive senza parlare, `no_results` → dillo all'utente) + lingua + `question_id` + history recente.
  - Forward verbatim dei messaggi client/server.
  - Handler `toolCall` → `retrieveForVoice` → `toolResponse` **strutturato** (`status`, `retryable`, `message`, `chunks`), match rigido `id`.
  - `inputTranscription`/`outputTranscription` → accumulate fino a `turnComplete` → insert `chat_messages` (ruolo user/assistant) → decremento `remaining_requests`.
  - Cap durata sessione (5 min) + idle timeout → chiusura con codice dedicato.
  - Invio eventi `{"proxyStatus": ...}` al client.
- `supabase/config.toml`: `[functions.live] verify_jwt = false`.
- Secrets: `GEMINI_LIVE_MODEL=gemini-3.8-live`, `VOICE_SESSION_MAX_SECONDS=300`, `VOICE_CUSTOM_VOCAB` (terminologia da `sign_to_chunk.sign_name` + "codice della strada", "patente B", ecc.).

### Fase 3 — Client: sessione + audio (web-first)
- `lib/liveVoice.ts`: connessione WS al proxy, handshake (`hello` con lang/question_id), riconnessione automatica con ri-iniezione history a scadenza, dispatch eventi.
- `lib/liveAudio/` con varianti `.web.ts` (pattern già usato per `alert`, `AppImageViewer`):
  - **web**: mic → AudioWorklet → PCM 16kHz mono base64 (~1 frame/100ms); out → Web Audio queue con **stop immediato su barge-in** (`interrupted`/`aborted` in `serverContent`).
  - **native** (fase successiva, D8): spike lib PCM — `expo-audio` (SDK 55) probabilmente senza `useAudioStream` → valutare `expo-audio-stream-pcm` / `@edkimmel/expo-audio-stream`. Dev build EAS + plugin permission mic in `app.config.ts`.
- `store/voice.ts` (Zustand): `active, status('listening'|'thinking'|'speaking'), liveTranscript, error`.

### Fase 3 — Client: sessione + audio (web-first) ✅ COMPLETATA (2026-09-30)

- [x] **`store/voice.ts`** (Zustand): `active`, `status ('idle'|'connecting'|'listening'|'thinking'|'speaking')`, `userTranscript`/`assistantTranscript` parziali per turno, `error` come codice traducibile (`auth|notEnabled|rateLimit|idle|sessionEnded|connection|micDenied` → chiavi `voice.errors.*` in Fase 4).
- [x] **`store/chat.ts`** esteso: `addVoiceTurn(user, assistant)` (copia locale dopo la persistenza server) + `setRemainingRequests(n)` dagli eventi `rate`.
- [x] **`lib/liveVoice.ts`** (session manager): token via `supabase.auth.getSession()` → `?access_token`, handshake `hello` (lang da quiz/`i18n`, `question_id` dal chat store), dispatch eventi (`auth_ok`→remaining, `ready`→avvia mic, `tool_latency`→thinking, transcrizioni→store, `turnComplete`→`finalizeTurn`, barge-in `interrupted/aborted`→stop output), close codes → errori mappati (4401/4403/4429/4408/4000), **1 tentativo di riconnessione** sulle chiusure impreviste (1011), auth-timeout 10s, `sendVoiceText` per apertura da quiz.
- [x] **`lib/liveAudio.web.ts`**: AudioWorklet `pcm-capture` (downsample media → PCM16 16kHz mono, frame 100ms → base64), `getUserMedia` con `echoCancellation/noiseSuppression/autoGainControl`; output in coda `AudioBuffer` 24kHz con `stopOutput()` immediato su barge-in; import `@/lib/liveAudio` risolve la variante `.web.ts` su web / stub nativo su mobile (D8).
- [x] **Stub nativo** `lib/liveAudio.ts` (`VOICE_NATIVE_AUDIO_UNSUPPORTED`): la UI lo mappa su `connection` finché non arriva la fase native.

**Verifica**: `npx tsc --noEmit` zero errori sui nuovi file (gli errori residui sono pre-esistenti), `expo lint` pulito sui nuovi file, `expo export --platform web` riuscito.

### Fase 3 — Variante NATIVA ✅ COMPLETATA (2026-10-02)

- [x] **`@edkimmel/expo-audio-stream@1.1.1`**: mic PCM16 16kHz mono (eventi base64 ogni 100ms, `requestPermissionsAsync` integrato) + `Pipeline` playback nativo jitter-buffered (PCM16 24kHz, `targetBufferMs: 80`, `playbackMode: 'voiceProcessing'` per AEC iOS; Android usa sorgente mic `VOICE_COMMUNICATION` con AEC di sistema).
- [x] **`lib/liveAudio.ts`** riscritto (stesso contratto `LiveAudioIO`, nessun cambio nei consumatori): `isVoiceSupported() → true` su native; prime spinte in coda finché `Pipeline.connect` non risolve; turno output aperto dalla prima spinta e chiuso da `stopOutput()` → `invalidateTurn` (barge-in).
- [x] **`app.config.ts`**: plugin `@edkimmel/expo-audio-stream` (NSMicrophoneUsageDescription) + `android.permissions: ['RECORD_AUDIO']`.
- ⚠️ Richiede **dev build** (`expo run:android` / EAS): il modulo nativo non esiste in Expo Go. **Da verificare su dispositivo** (mic + playback + barge-in): non testabile in CI/locale.

**Verifica**: `npx tsc --noEmit` zero errori, `expo lint` 0 errori (7 warning pre-esistenti), `expo config --type prebuild` risolve plugin e permessi.

### Fase 4 — UI in `app/(tabs)/chat.tsx`
- Toggle microfono nella barra input (visibile solo se `feature_flags.voice && chat && profile.has_ai`).
- Indicatore stato live (waveform "in ascolto", "cerco nel manuale…" da `proxyStatus`, onda "risposta in corso").
- Bolle con trascrizioni live (ruoli identici ai messaggi testuali), tap su microfono = chiudi sessione.
- Riusa: `questionId` sticky (`store/chat.ts:56`), `remainingRequests`, banner limite, `clearChat`.
- Tasto "Chiedi all'AI" dalla quiz → apre chat in modalità voce con `question_id` (fast-path cache, risposta istantanea).
- Aggiornare **tutte** le locale in `i18n/locales/` (chiavi voce).

### Fase 4 — UI in `app/(tabs)/chat.tsx` ✅ COMPLETATA (2026-09-30)

- [x] **Toggle microfono** nella barra input (40px bordato, prima del send), visibile se `flags.voice && chat && profile.has_ai && isVoiceSupported() && remaining > 0`. Avvia/ferma la sessione con `questionId` sticky dallo store.
- [x] **Barra sessione vocale** che sostituisce l'input quando attiva: pill con icona+testo per stato (`connecting` sync / `listening` mic blu / `thinking` search ambra + `TypingIndicator` / `speaking` speaker verde) e pulsante stop rosso `close`.
- [x] **Bolle live** in FlatList: trascrizione parziale user (blu, opacità 0.75) e assistant (themed, testo pieno non markdown) come righe sintetiche `__voice_user__`/`__voice_assistant__`, rimosse a `turnComplete` (il turno confermato entra in `messages` via `addVoiceTurn`). Auto-scroll inclusa nelle firme.
- [x] **Banner errore voce** (`voice.errors.*`) con dismiss, sotto il banner chat; mostrato solo a sessione chiusa.
- [x] **Stop su blur**: `useFocusEffect` cleanup → la sessione (e il microfono) non resta aperta fuori dalla chat.
- [x] **Quiz** (`app/quiz.tsx`): `handleAskAIChat` apre la chat in modalità voce con `question_id` corrente quando `flags.voice && isVoiceSupported()`, altrimenti mantiene il flusso testuale esistente (nativo).
- [x] **`isVoiceSupported()`** esportato da `lib/liveAudio.web.ts` (true) e `lib/liveAudio.ts` (false, D8): nessun `Platform.OS` nei consumatori.
- [x] **i18n**: blocco `voice` (micButton, stopButton, status×4, errors×7) aggiunto a **tutti e 13** i locale (`i18n/locales/*.json`), tradotto in tutte le lingue.
- [x] Flag locale `feature_flags.voice = true` inserito nel DB di sviluppo per i test (la migration ufficiale con `false` è Fase 5).

**Verifica**: `tsc --noEmit` zero errori sui file modificati, `expo lint` invariato rispetto al baseline (15 problemi pre-esistenti), `expo export --platform web` riuscito con chat+quiz che importano `liveVoice`/`liveAudio`.

### Fase 5 — Feature flag, docs, deploy
- [x] Migrazione `supabase/migrations/20260930100000_add_voice_feature_flag.sql`:
      insert `feature_flags.voice = false` con `on conflict (name) do nothing`
      (applicata al DB locale → flag esistente `true` preservato per i test).
- [x] Docs (obbligatorie): `doc/PROJECT.md` (sezione `live`, env `GEMINI_LIVE_MODEL`/
      `VOICE_*`, tabella modelli e feature flags, note #11), `doc/APP_STRUCTURE.md`
      (sezione schermata Chat AI, store/lib, Edge Functions `live`, roadmap voce
      🟡), `supabase/README.md` (albero + `live` + env + deploy).
- [x] Test locale completo: il DB locale ha solo **3 chunk** `manual_chunks` (seed sintetico dello
      spike) → retrieval locale inadeguato (la domanda su "precedenza" non trova il capitolo).
      Il corpus completo (553 chunk) vive su DEV; test locale RAG completi richiedono il seed del
      corpus locale (fuori scope, deciso: si testa su DEV).
- [x] **Deploy DEV** (2026-09-30): `db push` (migration flag), `functions deploy live --no-verify-jwt`,
      secrets (`GEMINI_LIVE_MODEL`, `VOICE_SESSION_MAX_SECONDS=145`, `VOICE_IDLE_SECONDS=120`),
      flag `voice=true`, utente test `voicetest2026@gmail.com` creato su DEV (`has_ai=true`).
- [x] **E2E su DEV**: auth_ok → setup (gemini-3.8-live) → tool RAG 937-1099ms (cosine, 5 chunks,
      corpus completo) → risposta groundata su "precedenza" → audio → trascrizioni + `request_count`
      persistiti in `chat_messages` → evento `rate`. **Wall-clock free tier: taglio a 150.47s (1006)**
      → mitigazione `VOICE_SESSION_MAX_SECONDS=145` (close pulita `4000` + auto-reconnect in catena).
- [ ] Test manuale in browser su DEV: `npm run web:export:dev`.

## 5. Latenza — budget e mitigazioni

Budget: fine-parlato → prima audio **< 1,5s** (con cache `question_id` < 700ms).

| Fase | Stima |
|---|---|
| VAD turn-end (Gemini) | 300–600ms |
| `toolCall` → proxy | ~100ms |
| Embedding (Cloudflare) | 150–400ms (fino a ~1s cold) |
| Query pgvector | <50ms |
| `toolResponse` → primo chunk audio | 300–700ms |
| **Totale atteso** | **~1,2–1,8s** (era 2,5–3s col re-rank) |

| Mitigazione | Risparmio | Fase |
|---|---|---|
| Re-rank **off** su via vocale (D4) | −300/800ms | F1 |
| Fast-path cache con `question_id` | −800ms (→<200ms) | F1 |
| Pre-warm context in `setup` da `question_id` | 1° turno istantaneo | F2 |
| Evento `status: retrieving` + indicatore UI | percezione | F2/F4 |
| Warm-up embedding (1 chiamata dummy al setup) | −500ms first hit | F2 |

Se lo spike supera i 2,5s costanti → analisi prima di procedere. Fallback last-resort: systemInstruction con filler conversazionale (switch da `BLOCKING` ad async, D6).

## 6. Rate limit e costi
- Unità di consumo: **1 richiesta a turno vocale completato** (`outputTranscription` + `turnComplete`) → riuso `chat_daily_limit`/`request_count` (D9).
- Cap di durata sessione 5 min (D10) + idle timeout → cap giornaliero implicito.
- La Live API ha pricing dedicato (token audio in continuo + eventuali thinking): da monitorare dopo il primo periodo DEV.

## 7. Regole obbligatorie 3.8 Live (checklist Fase 2)
1. `FunctionResponse` **strutturato e mai vuoto**: `{status:"ok"|"no_results", retryable:false, message, chunks:[...]}` — altrimenti il modello loopa con re-query.
2. `systemInstruction` con **retry policy**: "max 2 tool call consecutive senza parlare; se `no_results` dillo all'utente invece di riprovare".
3. Match **rigido `id`** FunctionCall → FunctionResponse.
4. Audio: in chunk 20–100ms, 16kHz mono; out 24kHz mono.
5. **Non** impostare `enable_affective_dialog`/`proactivity` (default on; `proactive_audio:false` → errore).
6. **Seeding history al reconnect**: aspettare `setup_complete` + `HistoryConfig(initial_history_in_client_content=True)`.
7. Barge-in "polite" e affective dialogue sono attivi di default → UX migliore, nessuna config.

## 8. Rischi e contingenza

| Rischio | Impatto | Contingenza |
|---|---|---|
| Wall-clock 150s (piano free) | Sessioni ~2,5 min invece di 5 | Reconnect loop già previsto; oppure upgrade Supabase paid |
| `gemini-3.8-live` solo su Vertex (non con API key) | Setup upstream diverso | Proxy autentica con service account/ADC; architettura invariata |
| Lib PCM native inaffidabile | Rallenta fase native | Rilascio **web-first** (D8); native in versione successiva |
| Latenza retrieval > 2,5s | UX rovinata | Fast-path cache obbligatorio + niente pre-warm; fallback async con filler |
| Barge-in non pulito (audio in ritardo) | UX scadente | Fallback: push-to-talk come modo sicuro |
| Modello Live deprecato/cambiato | Rallenta | `GEMINI_LIVE_MODEL` è env: switch senza deploy codice |

## 9. Out of scope
Chat testuale invariata · Vertex AI RAG Engine · `gemini-3.8-live-extended-thinking` (D7) · input video/avatar · token effimeri (non necessari col proxy) · audio in background · traduzione voce (la risposta segue `lang_code` come la testuale) · client native (fase successiva al web-first).

## 10. Alternativa valutata e scartata
**Vertex AI RAG Engine** (doc Pre-GA Google Cloud): corpus Vertex chiuso con embedding Google — incompatibile con il retrieval ibrido Supabase/pgvector (path segnale-pinnato, filtro categoria, cache spiegazioni). Il RAG resta su Supabase con custom function calling (D3/D5).
