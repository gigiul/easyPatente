#!/usr/bin/env python3
"""Generate a guarded data migration. No Supabase credentials or writes are used.

--embed calls either Cloudflare Workers AI or a local OpenAI-compatible
embedding endpoint, verifies three existing embeddings, and fills patch.json.
--render is safe without credentials: the resulting draft SQL refuses to run
until real embeddings have been generated.
"""
import argparse
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.request

HERE=Path(__file__).resolve().parent
MUTABLE=['chunk_id','manual_version','language','chapter','chapter_id','section','section_id','subsection','chunk_type','category_id','page_start','page_end','chunk_index','prev_chunk_id','next_chunk_id','text','embedding_text','llm_context','token_count','char_count','source_file','article_ref','keywords','embedding']
CLOUDFLARE_MODEL='@cf/google/embeddinggemma-300m'
LOCAL_MODEL='unsloth/embeddinggemma-300m-GGUF'
LOCAL_PREPROCESSING='raw text; GGUF mean pooling; 2_Dense 768->3072; 3_Dense 3072->768; L2 normalize; no prompt prefix'
DIM=768

def valid_vector(v):
    return isinstance(v,list) and len(v)==DIM and all(isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x) for x in v) and sum(x*x for x in v)>0

def cosine(a,b):
    if not valid_vector(a) or not valid_vector(b):raise ValueError('Invalid reference vector')
    return sum(x*y for x,y in zip(a,b))/math.sqrt(sum(x*x for x in a)*sum(x*x for x in b))

def embed_cloudflare(texts):
    account=os.environ.get('CLOUDFLARE_ACCOUNT_ID','')
    token=os.environ.get('CLOUDFLARE_API_TOKEN','')
    if not re.fullmatch(r'[a-fA-F0-9]{32}',account) or not token:
        raise ValueError('Configure CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the environment; never commit them.')
    request=urllib.request.Request(f'https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{CLOUDFLARE_MODEL}',data=json.dumps({'text':texts}).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+token},method='POST')
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request,timeout=40) as response:body=json.load(response)
            vectors=body.get('result',{}).get('data',[])
            if body.get('success') is False or len(vectors)!=len(texts) or not all(valid_vector(v) for v in vectors):
                raise ValueError('Cloudflare returned invalid embeddings')
            return vectors
        except urllib.error.HTTPError as exc:
            if exc.code not in (429,500,502,503,504) or attempt==2:
                raise RuntimeError(f'Cloudflare HTTP {exc.code}; no credentials or response body logged') from None
            time.sleep(2**attempt)

def embed_local(texts,endpoint,model,api_key=''):
    endpoint=endpoint.rstrip('/')
    if not endpoint.endswith('/embeddings'):endpoint+='/embeddings'
    headers={'Content-Type':'application/json'}
    if api_key:headers['Authorization']='Bearer '+api_key
    request=urllib.request.Request(endpoint,data=json.dumps({'model':model,'input':texts},ensure_ascii=False).encode(),headers=headers,method='POST')
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request,timeout=120) as response:body=json.load(response)
            data=body.get('data',[])
            vectors=[item.get('embedding') if isinstance(item,dict) else item for item in data]
            if len(vectors)!=len(texts) or not all(valid_vector(v) for v in vectors):
                raise ValueError('Local endpoint returned invalid embeddings')
            return vectors
        except urllib.error.HTTPError as exc:
            if exc.code not in (429,500,502,503,504) or attempt==2:
                raise RuntimeError(f'Local embedding HTTP {exc.code}; no credentials or response body logged') from None
            time.sleep(2**attempt)
        except urllib.error.URLError as exc:
            if attempt==2:raise RuntimeError(f'Local embedding endpoint unreachable: {endpoint}') from None
            time.sleep(2**attempt)

def embed(texts,provider,endpoint,model,api_key=''):
    return embed_cloudflare(texts) if provider=='cloudflare' else embed_local(texts,endpoint,model,api_key)

def validate(bundle,ready=False):
    assert bundle['embedding_dimensions']==DIM
    provider=bundle.get('embedding_provider','cloudflare')
    model=bundle.get('embedding_model','')
    assert provider in ('cloudflare','local')
    assert model
    if provider=='cloudflare':assert model==CLOUDFLARE_MODEL
    changes=bundle['changes'];keys=set()
    for item in changes:
        a=item['after'];key=(a['chunk_id'],a['manual_version'])
        assert key not in keys;keys.add(key)
        assert item['action'] in ('insert','update')
        assert bool(item['expected_state_md5'])==(item['action']=='update')
        assert a['language']=='it' and a['manual_version']=='09072026'
        assert a['text'].strip() and a['char_count']==len(a['text'])
        assert a['embedding_text']==f"{a['chapter']} — {a['section']}\n\n{a['text']}"
        assert a['source_file'] and 1<=item['category_sort_order']<=24
        if ready:assert valid_vector(item['embedding'])
    if ready:
        audit=bundle.get('embedding_audit',{})
        assert audit.get('provider')==provider
        assert audit.get('model')==model
        assert audit.get('quantization')==bundle.get('embedding_quantization')
        assert audit.get('preprocessing')==bundle.get('embedding_preprocessing')
        assert len(audit.get('reference_cosines',[]))==3
        assert min(audit['reference_cosines'])>=0.98
        assert audit['inputs_sha256']==inputs_hash(bundle)

def inputs_hash(bundle):
    return hashlib.sha256(json.dumps([i['after']['embedding_text'] for i in bundle['changes']],ensure_ascii=False,separators=(',',':')).encode()).hexdigest()

def sql_literal(value):
    return "'"+str(value).replace("'","''")+"'"

def render(bundle):
    validate(bundle,ready=bundle['status']=='ready')
    payload=json.dumps(bundle,ensure_ascii=False,separators=(',',':'))
    assert '$ep_payload$' not in payload
    provider=bundle.get('embedding_provider','cloudflare')
    model=bundle['embedding_model']
    quantization=bundle.get('embedding_quantization','n/a')
    preprocessing=bundle.get('embedding_preprocessing','raw')
    assignments=',\n        '.join(f'{k}=desired.{k}' for k in MUTABLE if k not in ('chunk_id','manual_version'))
    columns=', '.join(MUTABLE)
    values=', '.join('desired.'+k for k in MUTABLE)
    return f'''-- Corpus only: 13 existing rows updated, 14 rows inserted. No schema/RPC/cache changes.
-- Generated by supabase/data/rag-corpus-20261031/prepare.py.
-- Embedding provenance: {provider}; model: {model}; quantization: {quantization}.
-- Preprocessing: {preprocessing}.
-- A draft deliberately raises before writing. Never replace missing vectors by zeros.
DO $ep_refresh$
DECLARE
  bundle jsonb := $ep_payload${payload}$ep_payload$::jsonb;
  item jsonb;
  desired public.manual_chunks%ROWTYPE;
  current_row public.manual_chunks%ROWTYPE;
  category uuid;
  seen integer := 0;
BEGIN
  IF bundle->>'status' IS DISTINCT FROM 'ready' THEN
    RAISE EXCEPTION 'RAG corpus draft: embeddings have not been generated; no rows changed';
  END IF;
  IF bundle->>'embedding_provider' IS DISTINCT FROM {sql_literal(provider)}
     OR bundle->>'embedding_model' IS DISTINCT FROM {sql_literal(model)}
     OR (bundle->>'embedding_dimensions')::integer IS DISTINCT FROM 768
     OR bundle->>'embedding_quantization' IS DISTINCT FROM {sql_literal(quantization)}
     OR bundle->>'embedding_preprocessing' IS DISTINCT FROM {sql_literal(preprocessing)}
     OR bundle->'embedding_audit'->>'provider' IS DISTINCT FROM {sql_literal(provider)}
     OR bundle->'embedding_audit'->>'model' IS DISTINCT FROM {sql_literal(model)}
     OR bundle->'embedding_audit'->>'quantization' IS DISTINCT FROM {sql_literal(quantization)}
     OR bundle->'embedding_audit'->>'preprocessing' IS DISTINCT FROM {sql_literal(preprocessing)}
     OR jsonb_array_length(bundle->'embedding_audit'->'reference_cosines') IS DISTINCT FROM 3
     OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(bundle->'embedding_audit'->'reference_cosines') s WHERE s::numeric < 0.98)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(bundle->'changes') c WHERE c->'embedding' IS NULL OR c->'embedding' = 'null'::jsonb OR jsonb_array_length(c->'embedding') <> 768)
  THEN RAISE EXCEPTION 'Invalid embedding provenance or dimensions'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('easyPatente:rag-corpus:20261031'));
  -- Lock and validate every existing row before the first write. Abort on drift.
  FOR item IN SELECT value FROM jsonb_array_elements(bundle->'changes') LOOP
    SELECT id INTO STRICT category FROM public.categories
      WHERE sort_order=(item->>'category_sort_order')::integer AND NOT is_hard;
    SELECT * INTO desired FROM jsonb_populate_record(NULL::public.manual_chunks,
      item->'after' || jsonb_build_object('category_id',category,'embedding',(item->'embedding')::text));
    IF desired.embedding IS NULL
       OR public.vector_dims(desired.embedding) <> 768
       OR public.vector_norm(desired.embedding) IS NULL
       OR public.vector_norm(desired.embedding) = 0
       OR desired.embedding::text ~ '(NaN|Infinity)'
    THEN RAISE EXCEPTION 'Invalid embedding for %',desired.chunk_id; END IF;
    SELECT * INTO current_row FROM public.manual_chunks
      WHERE chunk_id=desired.chunk_id AND manual_version=desired.manual_version FOR UPDATE;
    IF FOUND THEN
      IF (to_jsonb(current_row)-'id'-'created_at'-'updated_at') = (to_jsonb(desired)-'id'-'created_at'-'updated_at') THEN
        CONTINUE; -- already applied, including the embedding
      END IF;
      IF item->>'action' <> 'update' OR
         md5((to_jsonb(current_row)-'id'-'created_at'-'updated_at')::text) IS DISTINCT FROM item->>'expected_state_md5'
      THEN RAISE EXCEPTION 'Corpus drift for %; refresh snapshot before applying',desired.chunk_id; END IF;
    ELSIF item->>'action' <> 'insert' THEN
      RAISE EXCEPTION 'Expected chunk % is missing',desired.chunk_id;
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(bundle->'changes') LOOP
    SELECT id INTO STRICT category FROM public.categories
      WHERE sort_order=(item->>'category_sort_order')::integer AND NOT is_hard;
    SELECT * INTO desired FROM jsonb_populate_record(NULL::public.manual_chunks,
      item->'after' || jsonb_build_object('category_id',category,'embedding',(item->'embedding')::text));
    SELECT * INTO current_row FROM public.manual_chunks
      WHERE chunk_id=desired.chunk_id AND manual_version=desired.manual_version;
    IF FOUND THEN
      IF (to_jsonb(current_row)-'id'-'created_at'-'updated_at') <> (to_jsonb(desired)-'id'-'created_at'-'updated_at') THEN
        UPDATE public.manual_chunks SET
        {assignments},
        updated_at=now()
        WHERE chunk_id=desired.chunk_id AND manual_version=desired.manual_version;
      END IF;
    ELSE
      INSERT INTO public.manual_chunks ({columns}) VALUES ({values});
    END IF;
    SELECT * INTO STRICT current_row FROM public.manual_chunks
      WHERE chunk_id=desired.chunk_id AND manual_version=desired.manual_version;
    IF (to_jsonb(current_row)-'id'-'created_at'-'updated_at') <> (to_jsonb(desired)-'id'-'created_at'-'updated_at') THEN
      RAISE EXCEPTION 'Postcondition failed for %',desired.chunk_id;
    END IF;
    seen:=seen+1;
  END LOOP;
  IF seen <> 27 THEN RAISE EXCEPTION 'Expected 27 reviewed changes, got %',seen; END IF;
END
$ep_refresh$;
'''

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--embed',action='store_true')
    parser.add_argument('--render',action='store_true')
    parser.add_argument('--migration',type=Path,required=True)
    parser.add_argument('--provider',choices=('cloudflare','local'),default=os.environ.get('EMBEDDING_PROVIDER','cloudflare'))
    parser.add_argument('--endpoint',default=os.environ.get('LOCAL_EMBEDDING_ENDPOINT','http://127.0.0.1:8888/v1'))
    parser.add_argument('--model',default=None)
    parser.add_argument('--quantization',default=os.environ.get('LOCAL_EMBEDDING_QUANTIZATION','BF16'))
    parser.add_argument('--preprocessing',default=os.environ.get('LOCAL_EMBEDDING_PREPROCESSING',LOCAL_PREPROCESSING))
    args=parser.parse_args()
    path=HERE/'patch.json';bundle=json.loads(path.read_text());validate(bundle)
    if args.embed:
        provider=args.provider
        if provider=='cloudflare':
            model=CLOUDFLARE_MODEL;quantization='n/a';preprocessing='raw'
        else:
            model=args.model or LOCAL_MODEL;quantization=args.quantization;preprocessing=args.preprocessing
        api_key=os.environ.get('LOCAL_EMBEDDING_API_KEY','')
        refs=json.loads((HERE/'embedding_references.json').read_text())
        actual=embed([r['embedding_text'] for r in refs],provider,args.endpoint,model,api_key)
        similarities=[cosine(a,r['embedding']) for a,r in zip(actual,refs)]
        if min(similarities)<0.98:
            raise ValueError(f'Existing corpus is not compatible with provider={provider}, model={model}, preprocessing={preprocessing}: reference cosines {similarities}. Nothing generated/applied.')
        all_vectors=[]
        for start in range(0,len(bundle['changes']),8):
            batch=bundle['changes'][start:start+8]
            all_vectors.extend(embed([c['after']['embedding_text'] for c in batch],provider,args.endpoint,model,api_key))
            print(f'Embedding generated: {len(all_vectors)}/{len(bundle["changes"])}',flush=True)
        for item,vector in zip(bundle['changes'],all_vectors):item['embedding']=vector
        bundle['embedding_provider']=provider
        bundle['embedding_model']=model
        bundle['embedding_quantization']=quantization
        bundle['embedding_preprocessing']=preprocessing
        bundle['status']='ready'
        bundle['embedding_audit']={'provider':provider,'model':model,'quantization':quantization,'preprocessing':preprocessing,'reference_cosines':similarities,'inputs_sha256':inputs_hash(bundle),'generated_at':dt.datetime.now(dt.timezone.utc).isoformat()}
        validate(bundle,ready=True)
        temp=path.with_suffix('.tmp');temp.write_text(json.dumps(bundle,ensure_ascii=False,indent=2)+'\n');temp.replace(path)
    if args.embed or args.render:
        sql=render(bundle)
        temp=args.migration.with_suffix('.tmp');temp.write_text(sql);temp.replace(args.migration)
        print(f'Migration rendered: {args.migration.name}; status={bundle["status"]}')

if __name__=='__main__':main()
