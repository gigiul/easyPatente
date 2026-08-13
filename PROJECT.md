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
│  │ profiles     │ │              │ └──────────────────────┘ │
│  └──────┬──────┘ └──────┬───────┘                          │
│         │               │                                  │
│  ┌──────┴──────────────┴────────────────────────────────┐  │
│  │              Edge Functions                            │ │
│  │  • explain-question (RAG: embedding + LLM + cache)    │ │
│  │  • chat (RAG + rate limit + history)                  │ │
│  └───────────────────────┬────────────────────────────────┘ │
└──────────────────────────┼──────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              v            v            v
        ┌──────────┐ ┌──────────┐ ┌──────────────┐
        │ RN App   │ │ LLM API  │ │ Storage      │
        │ (Client) │ │ (LM or   │ │ (Images)     │
        └──────────┘ │  Gemini) │ └──────────────┘
                     └──────────┘
```

---

## Components

### 1. easyPatente/ — Mobile App

- **Technology**: Expo SDK 55, React Native 0.83, Expo Router
- **State management**: Zustand (7 stores)
- **Auth**: Supabase Auth (email + password)
- **Languages**: i18next with primary + secondary language
- **Build**: EAS Build (Android preview + production)

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
  "from_cache": false
}
```

**Flow**:
1. Cache check → if `question_translations.explanation` exists, return immediately
2. Fetch image (if present) from Supabase Storage
3. Question embedding (cache or generate)
4. Chunk matching → embedding search on manual_chunks (5 most relevant chunks)
5. Generate explanation using LLM:
   - If image present: single call with image + question + context + few-shot
   - If no image: text-only call with context
6. Save to cache (`question_translations.explanation`)
7. Translate to secondary language (if requested)

### chat

**Endpoint**: `POST /functions/v1/chat`

**Payload**:
```json
{
  "message": "your question",
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
  "sources": [{ "chapter": "...", "section": "..." }]
}
```

**Flow**:
1. User authentication
2. Profile `has_ai` check
3. Rate limiting (5 requests/day, resets at midnight)
4. Question embedding
5. Chunk matching (5 most relevant chunks)
6. Generate response using LLM (includes chat history)
7. Save messages in `chat_messages`
8. Increment request counter

**Chat Features**:
- Conversational history (last 10 messages)
- "Clear chat" button to reset context
- Rate limiting with daily count
- RAG context for responses based on the manual

---

## LLM Models

### Supported Providers

| Provider | Model | Use | Notes |
|----------|-------|-----|-------|
| **LM Studio** (local) | `google/gemma-4-26b-a4b-qat` | Explanation/response generation | Requires ngrok in dev |
| **LM Studio** (local) | `text-embedding-embeddinggemma-300m` | Text embedding (768 dim) | Always used for embeddings |
| **Gemini API** (cloud) | `gemini-flash-latest` | Explanation/response generation | Free tier: 15 RPM |

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

### React Native (.env)

```
EXPO_PUBLIC_SUPABASE_URL=https://mvkxafzywzuohnbqjqmo.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
EXPO_PUBLIC_SUPABASE_STORAGE_URL=https://mvkxafzywzuohnbqjqmo.supabase.co/storage/v1/object/public/easypatente
```

### Deploy env vars to Supabase

```bash
# LM Studio (default)
supabase secrets set LLM_PROVIDER=lmstudio LLM_ENDPOINT="https://ngrok-url" LLM_MODEL="google/gemma-4-26b-a4b-qat"

# Gemini API
supabase secrets set LLM_PROVIDER=gemini GEMINI_API_KEY="your-api-key" GEMINI_MODEL="gemini-flash-latest"

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
| `supabase/functions/` | Edge Functions (explain-question, chat) |
| `supabase_backup/` | Database backups |
| `signs.json` | Italian road sign database (80 signs, used by signImageMatcher) |
| `tmp/` | Temporary files |

---

## Feature Flags

| Flag | Description |
|------|-------------|
| `explanation` | Show/hide AI explanations in questions |
| `chat` | Enable/disable AI Chat tab |

**Note**: Chat also requires `profiles.has_ai = true` to be visible.

---

## Development Notes

1. **Embedding consistency**: All embeddings (questions, chunks) must use the same model
2. **Explanation cache**: Explanations saved in `question_translations.explanation` do not expire
3. **Languages**: Quiz translations are generated offline with NLLB-200, explanations via LLM
4. **ngrok**: Needed to expose LM Studio to the internet during development (URL changes on restart)
5. **Category UUID**: Same UUIDs used in `quizConverter/pipeline.py` and in the database
6. **Feature flags**: `feature_flags` table to toggle features (e.g. explanation, chat)
7. **Chat rate limit**: 5 requests/day per user, resets at midnight
8. **Multi-provider**: Supports LM Studio (local) and Gemini API (cloud) via `LLM_PROVIDER`
