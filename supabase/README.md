# supabase — Edge Functions

Supabase Edge Functions for the RAG backend.

## Structure

```
supabase/
├── functions/
│   ├── explain-question/
│   │   └── index.ts          # Main Edge Function
│   ├── .env.local            # Environment variables (dev)
│   └── .env.production       # Environment variables (prod)
└── config.toml               # Supabase CLI configuration
```

## SQL Migrations

SQL migrations are located in `easyPatente/migrations/`:
- `create_feature_flags.sql` — feature_flags table

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
4. Chunk matching → embedding search (5 most relevant chunks)
5. Generate explanation using LLM:
   - If image present: single-call with few-shot
   - If no image: text-only
6. Save to cache
7. Translate secondary language (if requested)

## Deploy

```bash
# 1. Update secrets
supabase secrets set LLM_MODEL=google/gemma-4-26b-a4b-qat
supabase secrets set EMBEDDING_MODEL=text-embedding-embeddinggemma-300m
supabase secrets set LLM_ENDPOINT=https://your-ngrok-url.ngrok-free.app
supabase secrets set STORAGE_URL=https://mvkxafzywzuohnbqjqmo.supabase.co/storage/v1/object/public/easypatente
supabase secrets set SUPABASE_URL=https://mvkxafzywzuohnbqjqmo.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-key

# 2. Deploy
supabase functions deploy explain-question
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `LLM_ENDPOINT` | URL of the LM Studio server (ngrok or VPS) |
| `LLM_MODEL` | Name of the LLM model |
| `EMBEDDING_MODEL` | Name of the embedding model |
| `STORAGE_URL` | Base URL for Supabase Storage |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |

## Testing

```bash
curl -X POST https://<PROJECT>.supabase.co/functions/v1/explain-question \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"question_id": "UUID", "lang_code": "it"}'
```
