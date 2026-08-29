-- ============================================================
-- Baseline migration: Initial schema from DEV (2026-08-27)
-- Source of truth: remote DEV database mvkxafzywzuohnbqjqmo
-- This migration captures the full current DEV state so that
-- a fresh PROD can be created by applying it.
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp" with schema public;
create extension if not exists "pgcrypto" with schema public;
create extension if not exists "vector" with schema public;

-- ============================================================
-- Tables
-- ============================================================

-- languages (no dependencies, referenced by many tables)
create table public.languages (
  code text primary key,
  name text not null,
  native_name text,
  is_active boolean default true,
  is_default boolean default false,
  created_at timestamptz default now(),
  tts_locale text
);

-- categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  icon_url text,
  created_at timestamptz default now(),
  is_active boolean default false,
  is_premium boolean not null default false,
  color text,
  sort_order integer,
  is_hard boolean not null default false
);

-- allowed_email_domains
create table public.allowed_email_domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- feature_flags
create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- profiles (depends on languages, auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  lang_primary text default 'it' references public.languages(code),
  lang_secondary text references public.languages(code),
  is_premium boolean not null default false,
  created_at timestamptz default now(),
  has_ai boolean default false,
  request_count integer default 0,
  last_request_at timestamptz,
  chat_daily_limit numeric default 20,
  email text
);

-- questions (depends on categories, uses vector)
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  image_filename text,
  is_free boolean not null default true,
  category_id uuid not null references public.categories(id) on delete restrict,
  created_at timestamptz default now(),
  is_correct boolean not null default true,
  embedding vector(1024)
);

-- question_translations (depends on questions, languages)
create table public.question_translations (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  lang_code text not null references public.languages(code) on delete restrict,
  text text not null,
  explanation text,
  created_at timestamptz default now(),
  constraint uq_question_lang unique (question_id, lang_code)
);

-- category_translations (depends on categories, languages)
create table public.category_translations (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  lang_code text not null references public.languages(code) on delete cascade,
  title text not null,
  description text,
  created_at timestamptz default now(),
  constraint category_translations_category_id_lang_code_key unique (category_id, lang_code)
);

-- quiz_batches (depends on categories)
create table public.quiz_batches (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category_id uuid references public.categories(id) on delete set null,
  is_random boolean not null default false,
  created_at timestamptz default now(),
  batch_type text not null default 'module'
);

-- quiz_batch_questions (depends on quiz_batches, questions)
create table public.quiz_batch_questions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.quiz_batches(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  position integer not null,
  constraint uq_batch_position unique (batch_id, position),
  constraint uq_batch_question unique (batch_id, question_id)
);

-- user_quiz_progress (depends on auth.users, quiz_batches)
create table public.user_quiz_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null references public.quiz_batches(id) on delete cascade,
  current_question integer not null default 1,
  answers jsonb not null default '{}'::jsonb,
  completed boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint uq_user_batch unique (user_id, batch_id)
);

-- chat_messages (depends on auth.users)
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role = any (array['user'::text, 'assistant'::text])),
  content text not null,
  created_at timestamptz default now()
);

-- manual_chunks (depends on categories, uses vector)
create table public.manual_chunks (
  id uuid primary key default gen_random_uuid(),
  chunk_id text not null,
  manual_version text not null,
  language text not null default 'it'::text,
  chapter text,
  chapter_id text,
  section text,
  section_id text,
  subsection text,
  chunk_type text not null default 'rule'::text,
  category_id uuid references public.categories(id) on delete set null,
  page_start integer,
  page_end integer,
  chunk_index integer,
  prev_chunk_id text,
  next_chunk_id text,
  text text not null,
  embedding_text text not null,
  llm_context text not null,
  token_count integer,
  char_count integer,
  source_file text[],
  article_ref text[],
  keywords text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  embedding vector(768),
  constraint manual_chunks_chunk_id_version_key unique (chunk_id, manual_version)
);

-- user_devices (depends on auth.users)
create table public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  constraint user_devices_user_id_unique unique (user_id)
);

-- user_mistakes (depends on auth.users, questions)
create table public.user_mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  incorrect_count integer default 1,
  last_incorrect_at timestamptz default now(),
  constraint user_mistakes_user_id_question_id_key unique (user_id, question_id)
);

-- ============================================================
-- Indexes (non-PK, non-unique-constraint)
-- ============================================================
create index manual_chunks_category_id_idx on public.manual_chunks using btree (category_id);
create index manual_chunks_chapter_id_idx on public.manual_chunks using btree (chapter_id);
create index manual_chunks_language_idx on public.manual_chunks using btree (language);
create index manual_chunks_manual_version_idx on public.manual_chunks using btree (manual_version);
create index idx_user_devices_device_id on public.user_devices using btree (device_id);

-- ============================================================
-- Functions
-- ============================================================

-- is_premium() - used in RLS policies
create or replace function public.is_premium()
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  return coalesce(
    (select is_premium from public.profiles where id = auth.uid()),
    false
  );
end;
$function$;

-- handle_new_user() - trigger on auth.users insert
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $function$
begin
  insert into public.profiles (id, created_at, is_premium, email)
  values (new.id, now(), false, new.email);
  return new;
end;
$function$;

-- check_registration_email_domain() - trigger on auth.users insert
create or replace function public.check_registration_email_domain()
returns trigger
language plpgsql
security definer
as $function$
declare
  is_allowed_domain boolean;
begin
  select exists (
    select 1 from public.allowed_email_domains
    where domain = lower(split_part(new.email, '@', 2)) and is_active = true
  ) into is_allowed_domain;

  if not is_allowed_domain then
    raise exception 'Registration restricted to common email domains only (e.g. Gmail, Outlook, Yahoo).';
  end if;

  return new;
end;
$function$;

-- generate_exam_batch(p_user_id uuid)
create or replace function public.generate_exam_batch(p_user_id uuid)
returns uuid
language plpgsql
security definer
as $function$
declare
  v_batch_id uuid;
  v_is_premium boolean;
begin
  select is_premium into v_is_premium from public.profiles where id = p_user_id;
  if v_is_premium is null then
    v_is_premium := false;
  end if;

  insert into public.quiz_batches (title, is_random, batch_type)
  values ('exam.title', true, 'exam')
  returning id into v_batch_id;

  with random_questions as (
    select id
    from public.questions
    where is_free = true or v_is_premium = true
    order by random()
    limit 30
  )
  insert into public.quiz_batch_questions (batch_id, question_id, position)
  select v_batch_id, id, row_number() over ()
  from random_questions;

  insert into public.user_quiz_progress (user_id, batch_id, current_question, answers, completed)
  values (p_user_id, v_batch_id, 1, '{}'::jsonb, false);

  return v_batch_id;
end;
$function$;

-- get_user_exam_history(p_user_id uuid)
create or replace function public.get_user_exam_history(p_user_id uuid)
returns table(batch_id uuid, title text, started_at timestamp with time zone, completed_at timestamp with time zone, completed boolean, score bigint, incorrect_count bigint, total bigint)
language plpgsql
security definer
as $function$
begin
  return query
  select
    p.batch_id,
    b.title,
    p.started_at,
    p.completed_at,
    p.completed,
    (select count(*) from quiz_batch_questions qbq
     join questions q on q.id = qbq.question_id
     where qbq.batch_id = p.batch_id
     and (p.answers->>q.id::text)::boolean = q.is_correct) as score,
    (select count(*) from quiz_batch_questions qbq
     join questions q on q.id = qbq.question_id
     where qbq.batch_id = p.batch_id
     and ((p.answers->>q.id::text) is null or (p.answers->>q.id::text)::boolean != q.is_correct)) as incorrect_count,
    (select count(*) from quiz_batch_questions qbq where qbq.batch_id = p.batch_id) as total
  from user_quiz_progress p
  join quiz_batches b on b.id = p.batch_id
  where p.user_id = p_user_id
  and (b.batch_type = 'exam' or b.batch_type = 'review')
  order by p.started_at desc;
end;
$function$;

-- record_exam_mistakes(p_batch_id uuid)
create or replace function public.record_exam_mistakes(p_batch_id uuid)
returns void
language plpgsql
security definer
as $function$
declare
  v_user_id   uuid;
  v_answers   jsonb;
  v_question  record;
begin
  v_user_id := auth.uid();

  select answers
    into v_answers
    from public.user_quiz_progress
   where user_id = v_user_id
     and batch_id = p_batch_id
     and completed = true;

  if not found then
    return;
  end if;

  for v_question in
    select q.id, q.is_correct
      from public.quiz_batch_questions qbq
      join public.questions q on q.id = qbq.question_id
     where qbq.batch_id = p_batch_id
  loop
    declare
      v_user_answer boolean;
    begin
      if v_answers ? (v_question.id::text) then
        v_user_answer := (v_answers->>(v_question.id::text))::boolean;

        if v_user_answer is distinct from v_question.is_correct then
          insert into public.user_mistakes (user_id, question_id, incorrect_count, last_incorrect_at)
            values (v_user_id, v_question.id, 1, now())
            on conflict (user_id, question_id) do update
              set incorrect_count   = user_mistakes.incorrect_count + 1,
                  last_incorrect_at = now();
        else
          delete from public.user_mistakes
           where user_id = v_user_id and question_id = v_question.id;
        end if;
      else
        insert into public.user_mistakes (user_id, question_id, incorrect_count, last_incorrect_at)
          values (v_user_id, v_question.id, 1, now())
          on conflict (user_id, question_id) do update
            set last_incorrect_at = now();
      end if;
    end;
  end loop;
end;
$function$;

-- generate_mistakes_review_batch()
create or replace function public.generate_mistakes_review_batch()
returns uuid
language plpgsql
security definer
as $function$
declare
  v_user_id    uuid;
  v_batch_id   uuid;
  v_position   integer := 1;
  v_mistake    record;
  v_count      integer;
begin
  v_user_id := auth.uid();

  select count(*) into v_count
    from public.user_mistakes
   where user_id = v_user_id;

  if v_count = 0 then
    raise exception 'no_mistakes' using hint = 'No mistake questions available for review';
  end if;

  insert into public.quiz_batches (title, batch_type, created_at)
    values ('exam.reviewTitle', 'exam', now())
    returning id into v_batch_id;

  for v_mistake in
    select question_id
      from public.user_mistakes
     where user_id = v_user_id
     order by last_incorrect_at desc
     limit 30
  loop
    insert into public.quiz_batch_questions (batch_id, question_id, position)
      values (v_batch_id, v_mistake.question_id, v_position);
    v_position := v_position + 1;
  end loop;

  insert into public.user_quiz_progress (user_id, batch_id, current_question, answers, completed)
  values (v_user_id, v_batch_id, 1, '{}'::jsonb, false);

  return v_batch_id;
end;
$function$;

-- get_mistakes_count()
create or replace function public.get_mistakes_count()
returns integer
language sql
stable security definer
as $function$
  select count(*)::integer
    from public.user_mistakes
   where user_id = auth.uid();
$function$;

-- register_device(p_device_id text)
create or replace function public.register_device(p_device_id text)
returns void
language plpgsql
security definer
as $function$
begin
  insert into public.user_devices (user_id, device_id)
  values (auth.uid(), p_device_id)
  on conflict (user_id) do nothing;
end;
$function$;

-- validate_device(p_device_id text)
create or replace function public.validate_device(p_device_id text)
returns boolean
language plpgsql
stable security definer
as $function$
declare
  v_exists boolean;
begin
  select exists (
    select 1
    from public.user_devices
    where user_id = auth.uid()
      and device_id = p_device_id
  ) into v_exists;

  if not v_exists then
    return not exists (
      select 1 from public.user_devices where user_id = auth.uid()
    );
  end if;

  return v_exists;
end;
$function$;

-- reset_device_association(p_user_id uuid)
create or replace function public.reset_device_association(p_user_id uuid)
returns void
language plpgsql
security definer
as $function$
begin
  delete from public.user_devices
  where user_id = p_user_id;
end;
$function$;

-- unlink_device()
create or replace function public.unlink_device()
returns void
language plpgsql
security definer
as $function$
begin
  delete from public.user_devices
  where user_id = auth.uid();
end;
$function$;

-- ============================================================
-- Triggers on auth.users
-- ============================================================
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists tr_check_email_domain on auth.users;
create trigger tr_check_email_domain
  before insert on auth.users
  for each row execute function public.check_registration_email_domain();

-- ============================================================
-- RLS: Enable on all public tables
-- ============================================================
alter table public.allowed_email_domains enable row level security;
alter table public.categories enable row level security;
alter table public.category_translations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.feature_flags enable row level security;
alter table public.languages enable row level security;
alter table public.manual_chunks enable row level security;
alter table public.profiles enable row level security;
alter table public.question_translations enable row level security;
alter table public.questions enable row level security;
alter table public.quiz_batch_questions enable row level security;
alter table public.quiz_batches enable row level security;
alter table public.user_devices enable row level security;
alter table public.user_mistakes enable row level security;
alter table public.user_quiz_progress enable row level security;

-- ============================================================
-- RLS Policies
-- ============================================================

-- allowed_email_domains
create policy "Public Read Access for Email Domains" on public.allowed_email_domains
  for select to public using (is_active = true);

-- categories
create policy "Enable read access for all users" on public.categories
  for select to authenticated using (true);

-- category_translations
create policy "Allow public read access to category_translations" on public.category_translations
  for select to public using (true);

-- chat_messages
create policy "Service role insert" on public.chat_messages
  for insert to public with check (auth.role() = 'service_role');
create policy "Users read own messages" on public.chat_messages
  for select to public using (auth.uid() = user_id);
create policy "chat_messages_select_policy" on public.chat_messages
  for select to authenticated using (user_id = auth.uid());
create policy "chat_messages_delete_policy" on public.chat_messages
  for delete to authenticated using (user_id = auth.uid());

-- feature_flags
create policy "Authenticated read" on public.feature_flags
  for select to public using (auth.role() = 'authenticated');
create policy "Service role full access" on public.feature_flags
  for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- languages
create policy "Enable read access for all users" on public.languages
  for select to anon, authenticated using (true);

-- manual_chunks
create policy "manual_chunks_read_policy" on public.manual_chunks
  for select to authenticated using (true);

-- profiles
create policy "Enable read access for all users" on public.profiles
  for select to public using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "Users can update own profile securely" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (
    (auth.uid() = id)
    and (is_premium = (select p.is_premium from public.profiles p where p.id = auth.uid()))
    and ((lang_primary is null) or (lang_primary in (select languages.code from public.languages where languages.is_active = true)))
    and ((lang_secondary is null) or (lang_secondary in (select languages.code from public.languages where languages.is_active = true)))
  );
create policy "Users can view own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);

-- question_translations
create policy "Authenticated users can view translations of accessible questio" on public.question_translations
  for select to authenticated using (exists (select 1 from public.questions q where q.id = question_translations.question_id));

-- questions
create policy "Authenticated users can view free questions or any if premium" on public.questions
  for select to authenticated using ((is_free = true) or is_premium());

-- quiz_batch_questions
create policy "Authenticated users can view accessible batch questions" on public.quiz_batch_questions
  for select to authenticated using (exists (select 1 from public.quiz_batches b where b.id = quiz_batch_questions.batch_id));

-- quiz_batches
create policy "Authenticated users can view exam batches" on public.quiz_batches
  for select to authenticated using (batch_type = any (array['exam'::text, 'review'::text]));
create policy "Authenticated users can view non-premium batches or any if prem" on public.quiz_batches
  for select to authenticated using (
    (category_id in (select categories.id from public.categories where categories.is_premium = false)) or is_premium()
  );

-- user_devices
create policy "Users can delete own device" on public.user_devices
  for delete to public using (auth.uid() = user_id);
create policy "Users can insert own device" on public.user_devices
  for insert to public with check (auth.uid() = user_id);
create policy "Users can read own device" on public.user_devices
  for select to public using (auth.uid() = user_id);
create policy "Users can update own device" on public.user_devices
  for update to public using (auth.uid() = user_id);

-- user_mistakes
create policy "Users can manage their own mistakes" on public.user_mistakes
  for all to public using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- user_quiz_progress
create policy "Users can delete own progress" on public.user_quiz_progress
  for delete to authenticated using (auth.uid() = user_id);
create policy "Users can insert own progress" on public.user_quiz_progress
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own progress" on public.user_quiz_progress
  for update to authenticated using (auth.uid() = user_id);
create policy "Users can view own progress" on public.user_quiz_progress
  for select to authenticated using (auth.uid() = user_id);

-- ============================================================
-- Seed Data
-- ============================================================

-- languages
insert into public.languages (code, name, native_name, is_active, is_default, tts_locale) values
  ('ar', 'Arabo', 'العربية', false, false, 'ar-SA'),
  ('bn', 'Bengalese', 'বাংলা', true, false, 'bn-BD'),
  ('de', 'Tedesco', 'Deutsch', false, false, 'de-DE'),
  ('en', 'Inglese', 'English', false, false, 'en-US'),
  ('es', 'Spagnolo', 'Español', true, true, 'es-MX'),
  ('fr', 'Francese', 'Français', false, false, 'fr-FR'),
  ('it', 'Italiano', 'Italiano', true, false, 'it-IT'),
  ('ja', 'Giapponese', '日本語', false, false, 'ja-JP'),
  ('ko', 'Coreano', '한국어', false, false, 'ko-KR'),
  ('pt', 'Portoghese', 'Português', false, false, 'pt-PT'),
  ('ru', 'Russo', 'Русский', false, false, 'ru-RU'),
  ('si', 'Singalese', 'සිංහල', false, false, 'si-LK'),
  ('zh', 'Cinese', '中文', false, false, 'zh-CN')
on conflict (code) do nothing;

-- categories (id, icon_url, is_active, is_premium, color, sort_order, is_hard)
insert into public.categories (id, icon_url, is_active, is_premium, color, sort_order, is_hard) values
  ('41d2be33-3ca3-41f5-809f-ce2329ae9628', 'car', true, false, '#FF6B6B', 1, false),
  ('d1a1b1c1-1111-4a1a-8a1a-111111111125', 'car', true, true, null, 1, true),
  ('1c72e436-7a7f-4547-8f0e-b40f6fea7294', 'warning', true, true, '#FF8B94', 2, false),
  ('d2b2c2d2-2222-4b2b-8b2b-222222222126', 'warning', true, true, null, 2, true),
  ('1a693ebd-3e77-49da-a5cb-aefd34af0d8e', 'shield-checkmark', true, true, '#95E1D3', 3, false),
  ('d3c3d3e3-3333-4c3c-8c3c-333333333127', 'git-merge', true, true, null, 3, true),
  ('1055628b-9e4a-4544-92fd-60167704c315', 'ban', true, true, '#4ECDC4', 4, false),
  ('d4d4e4f4-4444-4d4d-8d4d-444444444128', 'ban', true, true, null, 4, true),
  ('cfecfe52-5925-443e-a798-5adff605c489', 'arrow-forward-circle', true, true, '#6C5CE7', 5, false),
  ('d5e5f5a5-5555-4e5e-8e5e-555555555129', 'checkmark-circle', true, true, null, 5, true),
  ('d1000001-aaaa-4a1a-8a1a-000000000001', 'map', true, true, null, 6, true),
  ('fd787783-6b5b-4e0a-a0b4-2173aad17c37', 'information-circle', true, true, '#FFD93D', 6, false),
  ('4caf0f96-d5a9-49e7-b345-bae6277295b7', 'construct', true, true, null, 7, false),
  ('d1000002-bbbb-4b2b-8b2b-000000000002', 'construct', true, true, null, 7, true),
  ('cf7cd590-6fdc-4c7c-8b64-6dbade75c49d', 'list', true, true, null, 8, false),
  ('d1000003-cccc-4c3c-8c3c-000000000003', 'albums', true, true, null, 8, true),
  ('9ae4ea7e-03e8-4f62-963a-ebea4fbb42e8', 'bulb', true, true, null, 9, false),
  ('d1000004-dddd-4d4d-8d4d-000000000004', 'flash', true, true, null, 9, true),
  ('add74848-59a1-4150-ba8b-1a01678ee745', 'git-commit', true, true, null, 10, false),
  ('d1000005-eeee-4e5e-8e5e-000000000005', 'remove-circle', true, true, null, 10, true),
  ('d1000006-ffff-4f6f-8f6f-000000000006', 'car-sport', true, true, null, 11, true),
  ('f1a2b3c4-9d8e-4a7b-8c1d-1e2f3a4b5001', 'car-sport', true, true, null, 11, false),
  ('a2b3c4d5-8e7f-4b6c-9d1e-2f3a4b5c6002', 'speedometer', true, true, null, 12, false),
  ('d1000007-1111-4111-8111-000000000007', 'speedometer', true, true, null, 12, true),
  ('b3c4d5e6-7f8a-4c5d-9e1f-3a4b5c6d7003', 'shuffle', true, true, null, 13, false),
  ('d1000008-2222-4222-8222-000000000008', 'git-branch', true, true, null, 13, true),
  ('2ee255f6-5157-4af3-a6e1-2baa80df62dd', 'git-merge', true, true, null, 14, false),
  ('d1000009-3333-4333-8333-000000000009', 'shuffle', true, true, null, 14, true),
  ('a1111111-1111-4a1a-8a1a-111111111115', 'swap-horizontal', true, true, null, 15, false),
  ('d1000010-4444-4444-8444-000000000010', 'swap-horizontal', true, true, null, 15, true),
  ('a2222222-2222-4b2b-8b2b-222222222216', 'pause-circle', true, true, null, 16, false),
  ('d1000011-5555-4555-8555-000000000011', 'hand-left', true, true, null, 16, true),
  ('a3333333-3333-4c3c-8c3c-333333333317', 'bus', true, true, null, 17, false),
  ('d1000012-6666-4666-8666-000000000012', 'bus', true, true, null, 17, true),
  ('a4444444-4444-4d4d-8d4d-444444444418', 'shield-checkmark', true, true, null, 18, false),
  ('d1000013-7777-4777-8777-000000000013', 'walk', true, true, null, 18, true),
  ('a5555555-5555-4e5e-8e5e-555555555519', 'medkit', true, true, null, 19, false),
  ('d1000014-8888-4888-8888-000000000014', 'warning', true, true, null, 19, true),
  ('c1111111-1111-4a1a-8a1a-111111111120', 'document-text', true, true, null, 20, false),
  ('d1000015-9999-4999-8999-000000000015', 'document-text', true, true, null, 20, true),
  ('c2222222-2222-4b2b-8b2b-222222222121', 'construct', true, true, null, 21, false),
  ('d1000016-abcd-4abc-8abc-000000000016', 'build', true, true, null, 21, true),
  ('c3333333-3333-4c3c-8c3c-333333333122', 'leaf', true, true, null, 22, false),
  ('d1000017-bcde-4bcd-8bcd-000000000017', 'leaf', true, true, null, 22, true),
  ('c4444444-4444-4d4d-8d4d-444444444123', 'bicycle', true, true, null, 23, false),
  ('d1000018-cdef-4cde-8cde-000000000018', 'bicycle', true, true, null, 23, true),
  ('c5555555-5555-4e5e-8e5e-555555555124', 'car-sport', true, true, null, 24, false),
  ('d1000019-def0-4def-8def-000000000019', 'car', true, true, null, 24, true)
on conflict (id) do nothing;

-- allowed_email_domains
insert into public.allowed_email_domains (id, domain, is_active) values
  ('c4c4a3ca-1a77-4cd6-ba01-16621a8e43b8', 'gmail.com', true),
  ('8b3dcaa0-a2d6-458e-9afe-6303bfb729af', 'hotmail.com', true),
  ('611004d1-d638-4c2f-bc15-fba529f5cbf7', 'hotmail.it', true),
  ('df2df75c-c889-4236-abc0-4e96eb80c86b', 'icloud.com', true),
  ('45e8f09d-c0d9-47e5-b56f-a498b22cef1b', 'libero.it', true),
  ('9df6e5d4-f2b6-47f7-9897-007287c6e88a', 'live.com', true),
  ('7deef20c-bbf5-4891-a9ca-af116cb64642', 'live.it', true),
  ('d6e736bf-37cc-4bc5-9db7-efa67ee76880', 'me.com', true),
  ('c568ee8c-fac6-4747-b8de-b0840bec5eae', 'outlook.com', true),
  ('c1600149-cde0-406f-8011-6ac7a91d5042', 'proton.me', true),
  ('25ee7aaf-9bbe-4855-901e-905ba3b2307b', 'protonmail.com', true),
  ('fac1ae46-a996-4631-8b25-9607bebbf89c', 'tiscali.it', true),
  ('fce9d658-8ada-4c27-8181-a0a09f4a3cc9', 'virgilio.it', true),
  ('45609d72-7724-44af-9e3d-94ae47d96d69', 'yahoo.com', true),
  ('339eac87-2d91-4bf6-af7b-70a668045861', 'yahoo.it', true)
on conflict (domain) do nothing;

-- feature_flags (current DEV state, not the outdated local migration)
insert into public.feature_flags (id, name, description, is_active) values
  ('220dbf73-76b4-4360-8782-27414cb1aaa9', 'chat', 'Abilita la chat AI con l''assistente', true),
  ('bcdb920c-1d9e-4def-a7f1-4ee435023eec', 'chat_explanation', 'Mostra il bottone per richiedere la spiegazione di una specifica domanda direttamente in chat', true),
  ('73b6b760-3ad2-4953-87cb-44fcf9178364', 'explanation', 'Mostra la sezione spiegazioni AI nelle domande del quiz', false)
on conflict (name) do nothing;

-- Note: category_translations, questions, question_translations, manual_chunks,
-- quiz_batches, quiz_batch_questions, user_quiz_progress, chat_messages,
-- user_mistakes, user_devices, profiles contain application/seed data that
-- should be loaded via app or separate seed; schema is sufficient for PROD
-- recreation. Feature-critical seed above covers infrastructure.

