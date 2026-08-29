# Supabase Workflow — EasyPatente

> DEV is source of truth. Never edit schema via SQL Editor. All schema changes must go through versioned migrations in `supabase/migrations/`.

## Projects
- **DEV** `mvkxafzywzuohnbqjqmo` (West EU, Ireland) — `easypatente`
- **PROD** `pydwxyxvnkytelbapbsk` (Central EU, Frankfurt) — `easyPatenteProd`
- Linked ref stored in `supabase/.temp/project-ref`. Check with `supabase projects list` (● = linked) or `cat supabase/.temp/project-ref`.

## Baseline (2026-08-27)
- `supabase/migrations/20260301000000_initial_schema.sql` (744 lines) captures full DEV state as of 2026-08-27.
- Covers: 3 extensions (`vector` 768/1024, `uuid-ossp`, `pgcrypto`), 15 tables, FKs with `ON DELETE CASCADE/SET NULL/RESTRICT`, 5 non-PK indexes + uniques, `CHECK` on `chat_messages.role`, 12 functions (`is_premium`, `handle_new_user`, `check_registration_email_domain`, `generate_exam_batch`, `get_user_exam_history`, `record_exam_mistakes`, `generate_mistakes_review_batch`, `get_mistakes_count`, `register_device`, `validate_device`, `reset_device_association`, `unlink_device`), 2 triggers on `auth.users`, 29 RLS policies, seed for `languages` (13), `categories` (46), `allowed_email_domains` (15), `feature_flags` (3).
- Verified: `supabase db diff --linked` → `No schema changes found` and `supabase migration list --linked` → `20260301000000` Local|Remote aligned.
- `supabase/config.toml` regenerated via `supabase init --force` (CLI 2.109.1 → min 2.116.0). Do not manually add `organization_id` or old `[auth]`/`[storage]` keys.

## Daily Development (requires Docker / Rancher Desktop)
```bash
supabase link --project-ref mvkxafzywzuohnbqjqmo  # ensure DEV
supabase start                                     # local Postgres on 54322
supabase migration new add_xxx                     # creates supabase/migrations/<ts>_add_xxx.sql
# edit SQL file
supabase db reset                                  # applies all migrations + seed locally; test app with http://127.0.0.1:54321
git add supabase/migrations/... && git commit
supabase db push --linked                          # push to DEV
supabase db diff --linked                          # must be "No changes" after push
supabase stop                                      # free ports
```

## Edge Functions (already versioned, do not modify unless needed)
- `supabase/functions/chat/index.ts`
- `supabase/functions/explain-question/index.ts`
```bash
supabase secrets set --linked LLM_ENDPOINT=... LLM_MODEL=... EMBEDDING_MODEL=...
supabase functions deploy chat --linked
supabase functions deploy explain-question --linked
```

## Creating / Syncing PROD
```bash
supabase link --project-ref pydwxyxvnkytelbapbsk
supabase db push --linked          # applies baseline (or new migrations) to empty PROD
supabase migration list --linked   # should show Local|Remote aligned
supabase db query --linked "select count(*) from information_schema.tables where table_schema='public'" # expect 15
# configure PROD secrets/env (different anon key, URL) and EAS production profile
supabase link --project-ref mvkxafzywzuohnbqjqmo  # back to DEV
```

## Keychain Prompt on macOS
`supabase login` stores token in Keychain as "Supabase CLI". First `db push` triggers macOS prompt "supabase wants to use keychain" → enter **Mac user password**, click **Allow Always**. If loop: Keychain Access → Supabase CLI → Access Control → Allow all applications.

## Do / Don't
- DO: test migrations locally with `db reset` before `db push`.
- DO: keep `supabase/.gitignore` ignoring `.temp`.
- DON'T: edit DEV via Dashboard SQL Editor for schema.
- DON'T: create migrations in root `migrations/` — only `supabase/migrations/`.
- DON'T: run `supabase link` without `--project-ref` in CI.

## Verification Checklist for a fresh PROD
- [ ] `supabase migration list --linked` shows all locals as Remote applied
- [ ] `supabase db diff --linked` → No changes
- [ ] Table Editor shows 15 tables, RLS enabled
- [ ] `select * from pg_extension where extname='vector'` → 0.8.0
- [ ] Test auth trigger: sign up with allowed domain → `profiles` row created
