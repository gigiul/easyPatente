# EasyPatente — General Project Documentation

## Overview

EasyPatente is a mobile app for preparing for the Italian driving license exam. It consists of three main components:

1. **easyPatente/** — React Native (Expo) mobile app
2. **ragPipeline/** — Pipeline to process the driver's manual and create a RAG system
3. **quizConverter/** — Pipeline to import quizzes from Excel files into the database

All components share a single **Supabase** database (PostgreSQL + pgvector).

---

## General Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE (Cloud)                         │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ questions    │ │ manual_chunks│ │ chat_messages        │ │
│  │ translations │ │              │ │ feature_flags        │ │
│  │ batches      │ │              │ │ profiles (has_ai)    │ │
│  │ profiles     │ │              │ │ user_devices         │ │
│  └──────┬──────┘ └──────┬───────┘ └──────────┬───────────┘ │
│         │               │                    │               │
│  ┌──────┴──────────────┴────────────────────┴────────────┐  │
│  │              Edge Functions (CORS)                     │  │
│  │  • explain-question (RAG + CORS)                      │  │
│  │  • chat (RAG + rate limit + history + CORS)           │  │
│  └───────────────────────┬────────────────────────────────┘ │
└──────────────────────────┼──────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              v            v            v
   ┌──────────────────┐ ┌──────────┐ ┌──────────────┐
   │ RN App / Web App │ │ LLM API  │ │ Storage      │
   │ (Expo static)    │ │ (LM/Gemini)│ │ (Images)     │
   └──────────────────┘ └──────────┘ └──────────────┘
```

---

## Components

### 1. easyPatente/ — Mobile App + Web

- **Technology**: Expo SDK 55, React Native 0.83, Expo Router, `react-native-web` (static `output: static`)
- **State management**: Zustand (7 stores)
- **Auth**: Supabase Auth (email + password) + single-device `user_devices`
- **Languages**: i18next with primary + secondary language
- **Build**: EAS Build (Android preview + production) + `expo export --platform web --clear` (`web:export:dev` → DEV `mvkx...`, `web:export:prod` → PROD `pydw...`) + `npx serve dist` / Vercel (`*.vercel.app` free, env `EXPO_PUBLIC_*` da `.env.production`)

**Main screens**:
- Login/Signup (with allowed email domain)
- Home: quiz categories (standard + hard)
- Quiz: T/F questions with AI explanations
- Chat: AI assistant with RAG and rate limiting
- Exam: exam simulation
- User: profile and language settings

### 2. ragPipeline/ — Manual Processing

**Flow**: Manual PDF → images → OCR → structured chunks → embedding → Supabase

| Script | Input | Output |
|--------|-------|--------|
| `transcribe_images.py` | PNG manual pages | MD files (OCR text) |
| `manual_chunker.py` | MD files | `manual_chunks.json` |
| `embed_chunks.py` | `manual_chunks.json` | `manual_chunks_embedded.json` |
| `upload_chunks.py` | `manual_chunks_embedded.json` | `manual_chunks` table |

**External dependencies**: LM Studio (localhost:8000) with VL models + embedding

### 3. quizConverter/ — Quiz Import

**Flow**: Excel → images + JSON → translation → Supabase

| Script | Input | Output |
|--------|-------|--------|
| `inspect_xlsx.py` | XLSX files | Structure analysis |
| `pipeline.py` | XLSX files | CSV + images + JSON |
| `translate_questions.py` | Italian CSV | Translated CSVs (12 languages) |
| `translate_categories.py` | Supabase `category_translations` | Category translations |
| `import_to_supabase.py` | CSV | 4 Supabase tables |

---

## Database Schema

### Main Tables

| Table | Description |
|-------|-------------|
| `questions` | Quiz questions (code, image, correct answer, embedding) |
| `question_translations` | Text + explanation for question per language |
| `categories` | Quiz categories (rules, road signs, etc.) |
| `category_translations` | Title + description of categories per language |
| `quiz_batches` | Quiz batches (by category) |
| `quiz_batch_questions` | Question assignment to batches (with position) |
| `profiles` | User profile (languages, premium, has_ai, request_count, laste_request_at, chat_daily_limit) |
| `user_quiz_progress` | User quiz progress |
| `user_mistakes` | User mistakes (for review) |
| `languages` | Available languages |
| `allowed_email_domains` | Allowed email domains for registration |
| `feature_flags` | Boolean flags to enable/disable features |

### RAG Tables

| Table | Description |
|-------|-------------|
| `manual_chunks` | Manual chunks with embeddings (768 vector dim) |

### Chat Tables

| Table | Description |
|-------|-------------|
| `chat_messages` | Chat messages (user_id, role, content, created_at) |

### Key Relationships

```
questions.category_id → categories.id
questions.id → question_translations.question_id
quiz_batches.category_id → categories.id
quiz_batch_questions.batch_id → quiz_batches.id
quiz_batch_questions.question_id → questions.id
user_quiz_progress.user_id → profiles.id (auth.users.id)
user_quiz_progress.batch_id → quiz_batches.id
user_mistakes.user_id → profiles.id
user_mistakes.question_id → questions.id
category_translations.category_id → categories.id
chat_messages.user_id → profiles.id (auth.users.id)
```

---

## Edge Functions

### explain-question

**Endpoint**: `POST /functions/v1/explain-question`

**Payload**:
```json
{
  "question_id": "uuid",
  "question_text": "optional text",
  "lang_code": "it",
  "secondary_lang": "es"
}
```

**Response**:
```json
{
  "explanation": "explanation...",
  "secondary_explanation": "translation...",
  "sources": [{ "chapter": "...", "section": "...", "page_start": 42 }],
  "has_image": true,
  "from_cache": false,
  "retrieval_path": "sign | cosine",
  "identified_sign": "Divieto di sosta | null",
  "reranked": false,
  "sections": [{ "section": "...", "chunk_id": "v1/cap-04/sez-33/001" }]
}
```

**Flow**:
1. Cache check → if `question_translations.explanation` exists, return immediately
2. Question embedding (cache or generate)
3. **Retrieval ibrida** (`_shared/retrieval.ts` → `retrieveChunks`):
   - **Path A (sign)**: se `questions.image_sign_type` ≠ `NON_IDENTIFICATO` **e** la categoria è segnaletica
     (`SIGN_CATEGORY_IDS`) → RPC `match_chunks_by_sign` (chunk fissato dal segnale)
   - **Path B (cosine)**: `match_manual_chunks` con `filter_category_id` (categoria base: `resolveChunkCategory`
     mappa le categorie "hard" su quella base) → **re-rank** con `gemini-flash-lite-latest`
     (`rerankByQuestion`, solo domande segnaletiche, best-effort)
4. Generate explanation using LLM (`runLLM`/`geminiComplete`):
   - If image present: single call with image + question + context + few-shot
   - If no image: text-only call with context
5. Save to cache (`question_translations.explanation`)
6. Translate to secondary language (if requested)

> Moduli condivisi: `supabase/functions/_shared/{env,cors,llm,embedding,retrieval}.ts`
> (usati sia da `explain-question` che da `chat`). Il modello LLM è scelto da `GEMINI_MODEL`
> (DEV: `gemini-flash-lite-latest`), il re-rank da `GEMINI_RERANK_MODEL`.

### chat

**Endpoint**: `POST /functions/v1/chat`

**Payload**:
```json
{
  "message": "your question",
  "question_id": "uuid (opzionale: la domanda aperta dalla quiz)",
  "lang_code": "it",
  "history": [
    { "role": "user", "content": "previous question" },
    { "role": "assistant", "content": "previous answer" }
  ]
}
```

**Response**:
```json
{
  "response": "AI response...",
  "remaining_requests": 4,
  "sources": [{ "chapter": "...", "section": "..." }],
  "retrieval_path": "sign | cosine",
  "reranked": false
}
```

**Flow**:
1. User authentication
2. Profile `has_ai` check
3. Rate limiting (default 5 requests/day, resets at midnight)
4. Se arriva `question_id`: retrieval **ibrida identica a `explain-question`**
   (Path A sign-pinned / Path B cosine + re-rank) + contesto dalla **spiegazione cache**
   di quella domanda (`question_translations.explanation`) e nota sul segnale
5. Altrimenti: embedding della sola domanda + cosine + re-rank
6. Generate response using LLM (includes chat history)
7. Save messages in `chat_messages`

> Il client (`store/chat.ts` → `app/quiz.tsx`) manda `question_id` solo quando la chat
   è aperta da una domanda; il campo viene azzerato da `clearChat`.
8. Increment request counter

**Chat Features**:
- Conversational history (last 10 messages)
- "Clear chat" button to reset context
- Rate limiting with daily count
- RAG context for responses based on the manual

### live (chat vocale full-duplex)

**Endpoint**: `WS /functions/v1/live?access_token=<SUPABASE_JWT>`

**Ruolo**: proxy bidirezionale tra browser e **Gemini Live API**
(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`),
modello da `GEMINI_LIVE_MODEL` (default `gemini-3.8-live`). Config in
`config.toml`: `[functions.live] verify_jwt = false` — il token Supabase
arriva in query string (i browser non possono mandare header su una connessione
WS) e viene verificato dentro la funzione (`?access_token`).

**Flow**:
1. Upgrade WS → auth via `?access_token` (gli eventi in arrivo durante
   l'handshake vengono accodati in un outbox e rilasciati dopo l'apertura)
2. `guardChatAccess` (`_shared/guards.ts`): `4401` senza token, `4403` senza
   `profiles.has_ai`, `4429` quota esaurita (risponde anche in testo JSON
   prima della chiusura)
3. Setup sessione Gemini: `systemInstruction` (lingua + history ultime 6
   `chat_messages`), `tools` = **`retrieve_manual_context`** (`behavior = BLOCKING`,
   obbligatorio su ogni risposta) + tool `rate_limit` in-sessione,
   `inputAudioTranscription.customVocabulary` (BASE_VOCAB + `sign_to_chunk.sign_name`
   + `VOICE_CUSTOM_VOCAB`)
4. Audio/testo in arrivo → `realtimeInput` verso Gemini; a ogni tool call →
   `retrieveForVoice` (`_shared/retrieval.ts`, **senza re-rank**, con fast-path
   cache su `question_id`) → risposta dello strumento → generazione
5. A `turnComplete`: persistenza in `chat_messages` (trascrizioni input/output;
   fallback su `realtimeInput.text` per la riga user) + `consumeChatRequest`
   (1 richiesta/turno) → evento `proxyStatus { used, remaining, rate }`
6. Chiusure custom: `4000` cap sessione (`VOICE_SESSION_MAX_SECONDS`, default
   300s), `4401/4403/4429` guard, `4408` idle (`VOICE_IDLE_SECONDS`, default
   120s), `1011` upstream Gemini

> Client: `lib/liveVoice.ts` (session manager Zustand) + `lib/liveAudio.web.ts`
> (AudioWorklet PCM16 16 kHz, barge-in), store `store/voice.ts`, UI in
> `app/(tabs)/chat.tsx`. Flag `feature_flags.voice` (migration
> `20260930100000_add_voice_feature_flag`, default `false`). Piano e fasi:
> `doc/PLAN_VOICE_CHAT.md`.

---

## LLM Models

### Supported Providers

| Provider | Model | Use | Notes |
|----------|-------|-----|-------|
| **LM Studio** (local) | `google/gemma-4-26b-a4b-qat` | Explanation/response generation | Requires ngrok in dev |
| **LM Studio** (local) | `text-embedding-embeddinggemma-300m` | Text embedding (768 dim) | Always used for embeddings |
| **Gemini API** (cloud) | `gemini-flash-latest` | Explanation/response generation | Free tier: 15 RPM |
| **Gemini Live API** (cloud) | `gemini-3.8-live` | Voice chat (WS, funzione `live`) | Richiede `GEMINI_API_KEY`; cap sessione 300s |

### Provider Configuration

Use `LLM_PROVIDER` to select the LLM provider:
- `lmstudio` — use local LM Studio (default)
- `gemini` — use Google Gemini API

Use `EMBEDDING_PROVIDER` to select the embedding provider:
- `cloudflare` — use Cloudflare EmbeddingGemma (default)
- `lmstudio` — use local LM Studio

---

## Environment Variables

### Supabase Edge Function (.env.local / .env.production)

```
# LLM Provider
LLM_PROVIDER=lmstudio|gemini
LLM_ENDPOINT=https://ngrok-url or http://vps:8000
LLM_MODEL=google/gemma-4-26b-a4b-qat

# Gemini API (only if LLM_PROVIDER=gemini)
GEMINI_API_KEY=your-api-key
GEMINI_MODEL=gemini-flash-latest

# Voice — Gemini Live API (funzione `live`; usa la stessa GEMINI_API_KEY)
GEMINI_LIVE_MODEL=gemini-3.8-live
VOICE_SESSION_MAX_SECONDS=300
VOICE_IDLE_SECONDS=120
VOICE_CUSTOM_VOCAB=extra,termini,separati,da,virgole

# Embedding Provider
EMBEDDING_PROVIDER=cloudflare|lmstudio
EMBEDDING_MODEL=@cf/google/embeddinggemma-300m

# Cloudflare (only if EMBEDDING_PROVIDER=cloudflare)
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token

# Supabase
SUPABASE_URL=https://mvkxafzywzuohnbqjqmo.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
STORAGE_URL=https://mvkxafzywzuohnbqjqmo.supabase.co/storage/v1/object/public/easypatente
```

### React Native / Web (.env / .env.production)

```
# .env (DEV)
EXPO_PUBLIC_SUPABASE_URL=https://mvkxafzywzuohnbqjqmo.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
EXPO_PUBLIC_SUPABASE_STORAGE_URL=https://mvkxafzywzuohnbqjqmo.supabase.co/storage/v1/object/public/easypatente

# .env.production (PROD)
EXPO_PUBLIC_SUPABASE_URL=https://pydwxyxvnkytelbapbsk.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_nnkHpNeg907UqeO-1wMfgQ_YN6MCfET
EXPO_PUBLIC_SUPABASE_STORAGE_URL=https://pydwxyxvnkytelbapbsk.supabase.co/storage/v1/object/public/easyPatenteProd
```

Web export: `npx dotenv-cli -e .env -- expo export --platform web --clear` (DEV) / `-e .env.production` (PROD) — `app.config.ts` legge `EXPO_PUBLIC_*` via `dotenv` e `lib/supabase.ts` priorizza `Constants.expoConfig.extra`.

### Deploy env vars to Supabase

```bash
# LM Studio (default)
supabase secrets set LLM_PROVIDER=lmstudio LLM_ENDPOINT="https://ngrok-url" LLM_MODEL="google/gemma-4-26b-a4b-qat"

# Gemini API
supabase secrets set LLM_PROVIDER=gemini GEMINI_API_KEY="your-api-key" GEMINI_MODEL="gemini-flash-latest"

# Voice (Gemini Live — funzione `live`, opzionale, default già corretti)
supabase secrets set GEMINI_LIVE_MODEL="gemini-3.8-live" VOICE_SESSION_MAX_SECONDS="300" VOICE_IDLE_SECONDS="120"

# Cloudflare Embedding (default)
supabase secrets set EMBEDDING_PROVIDER=cloudflare CLOUDFLARE_ACCOUNT_ID="your-account-id" CLOUDFLARE_API_TOKEN="your-api-token"

# LM Studio Embedding
supabase secrets set EMBEDDING_PROVIDER=lmstudio EMBEDDING_MODEL="text-embedding-embeddinggemma-300m"
```

---

## Category UUID Map

Category UUIDs are shared constants between quizConverter and the DB:

| UUID | Name |
|------|------|
| `41d2be33-...` | Vehicles and Roads |
| (see `quizConverter/pipeline.py` for the full list) | ... |

---

## Other Directories

| Directory | Content |
|-----------|---------|
| `domandeVF/` | PNG pages extracted from the T/F questions PDF (source for quizConverter) |
| `supabase/` | Supabase CLI configuration + Edge Functions |
| `supabase/functions/` | Edge Functions (explain-question, chat, live) |
| `supabase_backup/` | Database backups |
| `signs.json` | Italian road sign database (80 signs, used by signImageMatcher) |
| `tmp/` | Temporary files |

---

## Feature Flags

| Flag | Description |
|------|-------------|
| `explanation` | Show/hide AI explanations in questions |
| `chat` | Enable/disable AI Chat tab |
| `chat_explanation` | Show/hide the "explain this question" button in chat |
| `voice` | Enable/disable voice chat (Gemini Live); default `false`, richiede inoltre `chat` + `profiles.has_ai` |

**Note**: Chat also requires `profiles.has_ai = true` to be visible.

---

## Development Notes

1. **Embedding consistency**: All embeddings (questions, chunks) must use the same model
2. **Explanation cache**: Explanations saved in `question_translations.explanation` do not expire.
   For questions whose answer depends on the **figure** (e.g. category "Precedenze", 510 questions on 85
   intersection images) the cache is **pre-filled offline**: the model never receives the image, so an
   LLM would invent the scene. Explanations are written directly into the cache (agent vision + the
   right-of-way rules, verdict validated against `questions.is_correct`) → runtime is a cache hit, no LLM.
   See `doc/EXECUTION_PLAN_RAG_IMAGES.md` → "Fase 5".
3. **Languages**: Quiz translations are generated offline with NLLB-200, explanations via LLM
4. **ngrok**: Needed to expose LM Studio to the internet during development (URL changes on restart)
5. **Category UUID**: Same UUIDs used in `quizConverter/pipeline.py` and in the database
6. **Feature flags**: `feature_flags` table to toggle features (e.g. explanation, chat)
7. **Chat rate limit**: 5 requests/day per user, resets at midnight
8. **Multi-provider**: Supports LM Studio (local) and Gemini API (cloud) via `LLM_PROVIDER`
9. **Web**: `app.config.ts` `web.favicon`, `app/_layout.tsx` `Head`/`document.title`, `AppImageViewer`/ `usePreventScreenCapture`/ `AppAlert` wrappers (`.web.ts`), `metro.config.js` `unstable_enablePackageExports:false` + `babel-plugin-transform-import-meta` per `zustand@5` `import.meta`
10. **Migrations are the source of truth**: every schema/data change must land in a versioned
    `supabase/migrations/` file (never a bare `db execute`), then `db push` to both environments.
    PROD (`pydwxyxvnkytelbapbsk`) was brought to parity with DEV (`mvkxafzywzuohnbqjqmo`) on 2026-09-28:
    10/10 migrations, 134/134 identical function bodies, secrets + `chat`/`explain-question` deployed
    (stale direct edits were converted into `20260928130000_reconcile_dev_schema_drift` and
    `20260928130200_align_function_definitions`). Left intentionally different in PROD: category
    `icon_url`/`category_translations.title`, storage policy `easyPatenteProd`, and runtime/user data
    (`chat_messages`, `user_devices`, `user_quiz_progress`).
11. **Voice (Gemini Live)**: il flag `feature_flags.voice` va attivato esplicitamente sul DB target
    dopo il deploy (`UPDATE ... SET is_active = true WHERE name = 'voice'`). **Wall-clock free tier
    VERIFICATO il 2026-09-30**: le sessioni WS vengono tagliate dalla piattaforma a ~150s (close
    `1006`); su DEV `VOICE_SESSION_MAX_SECONDS=145` fa chiudere la funzione pulitamente con `4000`
    **pima** del taglio, e il client riconnette automaticamente (catena di sessioni illimitata).
    Con il piano a pagamento (400s) si può rialzare il cap.
