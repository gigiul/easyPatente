# supabase — Edge Functions

Supabase Edge Functions for the RAG backend.

## Structure

```
supabase/
├── functions/
│   ├── _shared/               # Shared modules (env, cors, llm, embedding, retrieval, guards)
│   ├── explain-question/
│   │   └── index.ts           # Question explanations (RAG + cache)
│   ├── chat/
│   │   └── index.ts           # Text assistant (RAG + rate limit)
│   ├── live/
│   │   └── index.ts           # Voice chat: WS proxy → Gemini Live API (RAG via tool)
│   ├── .env.local             # Environment variables (dev)
│   └── .env.production        # Environment variables (prod)
├── migrations/                # Versioned SQL migrations (source of truth)
└── config.toml                # Supabase CLI configuration ([functions.live] verify_jwt = false)
```

## SQL Migrations

SQL migrations live in `supabase/migrations/` (one file per change, never a bare `db execute`).

## explain-question

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

**Flow**:
1. Cache → if `question_translations.explanation` exists, return immediately
2. Fetch image from Supabase Storage (if present)
3. Question embedding (cache or generate)
4. Chunk matching → hybrid retrieval (sign-pinned or cosine + optional re-rank)
5. Generate explanation using LLM:
   - If image present: single-call with few-shot
   - If no image: text-only
6. Save to cache
7. Translate secondary language (if requested)

## chat

**Endpoint**: `POST /functions/v1/chat`

**Payload**: `{ "message": "...", "question_id": "optional uuid", "lang_code": "it", "history": [...] }`

Auth (`?` via `Authorization` header) → `profiles.has_ai` check → rate limit (`chat_daily_limit`,
5/day) → hybrid retrieval (same as explain-question, with `question_id` cache context) → LLM →
messages persisted in `chat_messages`. Response includes `remaining_requests`.

## live (voice chat)

**Endpoint**: `WS /functions/v1/live?access_token=<SUPABASE_JWT>`

Bidirectional WebSocket proxy to the **Gemini Live API** (`GEMINI_LIVE_MODEL`, default
`gemini-3.8-live`; reuses `GEMINI_API_KEY`). `config.toml` sets `verify_jwt = false` for this
function because the browser cannot send headers on a WS connection — the Supabase JWT is passed
in the query string and verified inside the function.

- **RAG on every answer**: Gemini calls the tool `retrieve_manual_context`
  (`behavior = BLOCKING`) → `_shared/retrieval.ts` `retrieveForVoice` (no re-rank).
- Guards (`_shared/guards.ts`): `4401` no token / `4403` no `has_ai` / `4429` quota.
- Each completed turn persists transcription pairs to `chat_messages` and consumes 1 daily request
  (event `proxyStatus { used, remaining, rate }`).
- Session setup includes chat history (last 6 `chat_messages`), the UI language, and an ASR
  `customVocabulary` (base terms + `sign_to_chunk.sign_name` + `VOICE_CUSTOM_VOCAB`).
- Close codes: `4000` session cap (`VOICE_SESSION_MAX_SECONDS`; on DEV = `145` because the
  free-tier platform cuts any WS at ~150s wall-clock — verified 2026-09-30, close `1006`),
  `4408` idle (`VOICE_IDLE_SECONDS`, default 120), `1011` upstream.
  The web client auto-reconnects on `4000`, so sessions chain seamlessly.

**Local run** (never deployed yet):
```bash
supabase functions serve --env-file <env-file> --no-verify-jwt
```

## Deploy

```bash
# 1. Update secrets
supabase secrets set LLM_PROVIDER=gemini GEMINI_API_KEY="your-key" GEMINI_MODEL="gemini-flash-latest"
supabase secrets set EMBEDDING_PROVIDER=cloudflare CLOUDFLARE_ACCOUNT_ID="..." CLOUDFLARE_API_TOKEN="..."
supabase secrets set STORAGE_URL=https://<PROJECT>.supabase.co/storage/v1/object/public/easypatente
supabase secrets set SUPABASE_URL=https://<PROJECT>.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-key

# 2. Deploy (voice is opt-in: also set the flag afterwards)
supabase functions deploy explain-question
supabase functions deploy chat
supabase functions deploy live
# UPDATE public.feature_flags SET is_active = true WHERE name = 'voice';
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `LLM_PROVIDER` | `lmstudio` or `gemini` |
| `LLM_ENDPOINT` | URL of the LM Studio server (ngrok or VPS) |
| `LLM_MODEL` | Name of the LLM model |
| `GEMINI_API_KEY` | Gemini API key (used by chat/explain/live) |
| `EMBEDDING_MODEL` | Name of the embedding model |
| `STORAGE_URL` | Base URL for Supabase Storage |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `GEMINI_LIVE_MODEL` | Voice model (default `gemini-3.8-live`) |
| `VOICE_SESSION_MAX_SECONDS` | Voice session cap (default `300`) |
| `VOICE_IDLE_SECONDS` | Idle timeout before closing the WS (default `120`) |
| `VOICE_CUSTOM_VOCAB` | Extra comma-separated ASR vocabulary terms |

## Testing

```bash
curl -X POST https://<PROJECT>.supabase.co/functions/v1/explain-question \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"question_id": "UUID", "lang_code": "it"}'
```
