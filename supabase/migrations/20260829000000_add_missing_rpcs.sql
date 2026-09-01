-- Patch: functions missing from baseline 20260301000000
-- Found in DEV but not in baseline: match_manual_chunks (RAG) and delete_user_account
-- This ensures PROD gets them; DEV already has them but REPLACE is idempotent.

-- delete_user_account() - self-deletion (GDPR)
create or replace function public.delete_user_account()
returns void
language plpgsql
security definer
as $function$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.user_quiz_progress where user_id = v_user_id;
  delete from public.user_mistakes where user_id = v_user_id;
  delete from public.profiles where id = v_user_id;
  delete from auth.users where id = v_user_id;
end;
$function$;

-- match_manual_chunks() - used by explain-question Edge Function for RAG
create or replace function public.match_manual_chunks(query_embedding vector(768), match_count integer default 5, filter_language text default 'it'::text, filter_category_id uuid default null::uuid)
returns table(id uuid, chunk_id text, chapter text, section text, page_start integer, page_end integer, article_ref text[], keywords text[], text text, llm_context text, similarity double precision)
language plpgsql
as $function$
begin
  return query
  select
    mc.id,
    mc.chunk_id,
    mc.chapter,
    mc.section,
    mc.page_start,
    mc.page_end,
    mc.article_ref,
    mc.keywords,
    mc.text,
    mc.llm_context,
    1 - (mc.embedding <=> query_embedding) as similarity
  from public.manual_chunks mc
  where mc.language = filter_language
    and (filter_category_id is null or mc.category_id = filter_category_id)
    and mc.embedding is not null
  order by mc.embedding <=> query_embedding
  limit match_count;
end;
$function$;
