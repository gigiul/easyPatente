-- Additive learning ledger. Apply locally first; no remote action is required by this file.
begin;
create schema if not exists learning_private;
revoke all on schema learning_private from public, anon;
-- API wrappers are invokers; only these authenticated entry points have execute grants.
grant usage on schema learning_private to authenticated;
alter table public.profiles add column exam_date date;
alter table public.profiles add column daily_question_goal integer check (daily_question_goal between 1 and 1000);
alter table public.profiles add column timezone text not null default 'Europe/Rome';
alter table public.user_quiz_progress add column learning_revision integer not null default 0;

create table learning_private.attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 batch_id uuid references public.quiz_batches(id) on delete set null,
 mode text not null check (mode in ('practice','exam','review')),
 status text not null default 'in_progress' check (status in ('in_progress','completed','abandoned')),
 provenance text not null default 'legacy' check (provenance in ('native','legacy')),
 started_at timestamptz not null default now(), submitted_at timestamptz, deadline_at timestamptz,
 primary_language text, secondary_language text,
 question_count integer not null default 0, correct_count integer not null default 0,
 wrong_count integer not null default 0, unanswered_count integer not null default 0,
 scoring_version integer not null default 1
);
create unique index learning_one_open on learning_private.attempts(user_id,batch_id) where status='in_progress';
create index learning_history on learning_private.attempts(user_id,submitted_at desc);
create table learning_private.attempt_questions (
 attempt_id uuid not null references learning_private.attempts(id) on delete cascade,
 -- Snapshot identifiers intentionally have no catalog FK: deleting catalog entries preserves history.
 question_id uuid not null, category_id uuid not null, position integer not null,
 answer_key boolean not null, first_answer boolean, final_answer boolean,
 first_answered_at timestamptz, final_answered_at timestamptz,
 primary key(attempt_id,question_id)
);
create table learning_private.current_attempt (
 progress_id uuid primary key references public.user_quiz_progress(id) on delete cascade deferrable initially deferred,
 attempt_id uuid not null references learning_private.attempts(id) on delete cascade
);
create index learning_question_lookup on learning_private.attempt_questions(question_id,attempt_id);
alter table learning_private.attempts enable row level security;
alter table learning_private.attempt_questions enable row level security;
alter table learning_private.current_attempt enable row level security;
revoke all on all tables in schema learning_private from public,anon,authenticated;

-- Trigger covers old clients too. New RPC saves opt in to native metadata in this transaction.
create function learning_private.capture_progress() returns trigger language plpgsql security definer set search_path='' as $$
declare a learning_private.attempts; v_mode text; v_native boolean; v_reset boolean := false;
begin
 if auth.uid() is not null and new.user_id <> auth.uid() then raise exception 'not_owner' using errcode='42501'; end if;
 if tg_op='INSERT' then new.learning_revision:=0; else new.learning_revision:=old.learning_revision; end if;
 if tg_op='INSERT' and exists(select 1 from public.user_quiz_progress p where p.user_id=new.user_id and p.batch_id=new.batch_id) then return new; end if;
 if auth.uid() is not null then
   if tg_op='INSERT' then new.started_at:=now(); else new.started_at:=old.started_at; end if;
   if new.completed then new.completed_at:=case when tg_op='UPDATE' and old.completed then old.completed_at else now() end;
   else new.completed_at:=null; end if;
 end if;
 v_native := coalesce(current_setting('learning.native',true),'')='yes';
 if jsonb_typeof(new.answers)<>'object' then raise exception 'invalid_answers'; end if;
 if exists(select 1 from jsonb_each(new.answers) e where jsonb_typeof(e.value)<>'boolean' or not exists (
   select 1 from public.quiz_batch_questions b where b.batch_id=new.batch_id and b.question_id::text=e.key
 )) then raise exception 'invalid_question_or_answer'; end if;
 select x.* into a from learning_private.attempts x join learning_private.current_attempt c on c.attempt_id=x.id where c.progress_id=new.id for update of x;
 if tg_op='UPDATE' then
   v_reset := (old.answers<>'{}'::jsonb or old.completed) and new.answers='{}'::jsonb and not new.completed;
   if a.id is not null and a.status='completed' and not v_reset then
     if new.answers<>old.answers or new.completed<>old.completed then raise exception 'attempt_closed'; end if;
     return new;
   end if;
   if v_reset and a.id is not null then
     update learning_private.attempts set status=case when status='in_progress' then 'abandoned' else status end where id=a.id;
     a.id := null;
     new.started_at:=now();
   end if;
   new.learning_revision:=old.learning_revision+1;
 end if;
 if a.id is null then
   select case when batch_type='review' or title='exam.reviewTitle' then 'review' when batch_type='exam' then 'exam' else 'practice' end
     into v_mode from public.quiz_batches where id=new.batch_id;
   -- Access check for new snapshots (old service imports run with auth.uid() NULL).
   if auth.uid() is not null and exists(select 1 from public.quiz_batch_questions b join public.questions q on q.id=b.question_id
     where b.batch_id=new.batch_id and not q.is_free and not coalesce((select is_premium from public.profiles where id=new.user_id),false)) then
     raise exception 'content_not_accessible' using errcode='42501';
   end if;
   insert into learning_private.attempts(user_id,batch_id,mode,started_at,deadline_at,provenance)
   values(new.user_id,new.batch_id,v_mode,new.started_at,case when v_mode in ('exam','review') then new.started_at+interval '20 minutes' end,
     case when v_native then 'native' else 'legacy' end) returning * into a;
   insert into learning_private.attempt_questions(attempt_id,question_id,category_id,position,answer_key)
     select a.id,q.id,q.category_id,b.position,q.is_correct from public.quiz_batch_questions b join public.questions q on q.id=b.question_id where b.batch_id=new.batch_id;
   insert into learning_private.current_attempt values(new.id,a.id) on conflict(progress_id) do update set attempt_id=excluded.attempt_id;
 end if;
 if v_native and new.answers='{}'::jsonb then
   update learning_private.attempts set provenance='native',primary_language=nullif(current_setting('learning.primary_language',true),''),
     secondary_language=nullif(current_setting('learning.secondary_language',true),'') where id=a.id;
 end if;
 -- No edits after the deadline. Finalization can still use the last saved answers.
 if a.deadline_at<now() and tg_op='UPDATE' and new.answers<>old.answers and not v_reset then raise exception 'attempt_expired'; end if;
 update learning_private.attempt_questions q set
   first_answer=case when v_native then coalesce(q.first_answer,(new.answers->>q.question_id::text)::boolean) else q.first_answer end,
   first_answered_at=case when v_native and q.first_answer is null and new.answers ? q.question_id::text then now() else q.first_answered_at end,
   final_answer=(new.answers->>q.question_id::text)::boolean,
   final_answered_at=case when new.answers ? q.question_id::text and q.final_answer is distinct from (new.answers->>q.question_id::text)::boolean then now() else q.final_answered_at end
 where q.attempt_id=a.id;
 update learning_private.attempts set question_count=s.total, correct_count=s.correct,wrong_count=s.wrong,unanswered_count=s.missing,
   status=case when new.completed then 'completed' else 'in_progress' end,
   submitted_at=case when new.completed then coalesce(new.completed_at,now()) end
 from (select count(*) total,count(*) filter(where final_answer=answer_key) correct,
   count(*) filter(where final_answer<>answer_key) wrong,count(*) filter(where final_answer is null) missing
   from learning_private.attempt_questions where attempt_id=a.id) s where id=a.id;
 if new.completed then
   new.completed_at:=coalesce(new.completed_at,now());
   -- Native finalization is the only source of mistake counters; legacy RPC becomes a no-op below.
   insert into public.user_mistakes(user_id,question_id,incorrect_count,last_incorrect_at)
   select new.user_id,q.question_id,1,now() from learning_private.attempt_questions q join public.questions live on live.id=q.question_id
     where q.attempt_id=a.id and (q.final_answer<>q.answer_key or (a.mode<>'practice' and q.final_answer is null))
   on conflict(user_id,question_id) do update set incorrect_count=public.user_mistakes.incorrect_count+1,last_incorrect_at=now();
   delete from public.user_mistakes m using learning_private.attempt_questions q
     where m.user_id=new.user_id and m.question_id=q.question_id and q.attempt_id=a.id and q.final_answer=q.answer_key;
 end if;
 return new;
end $$;

-- Backfill only what is actually known; do not replay mistake side effects.
-- Capture legacy rows before enabling automatic future capture, temporarily preserve existing mistakes.
create temporary table learning_saved_mistakes as table public.user_mistakes;
create trigger capture_learning before insert or update on public.user_quiz_progress for each row execute function learning_private.capture_progress();
update public.user_quiz_progress set answers=answers;
delete from public.user_mistakes;
insert into public.user_mistakes select * from learning_saved_mistakes;
drop table learning_saved_mistakes;

create function learning_private.open_attempt(p_batch_id uuid,p_primary text,p_secondary text) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare p public.user_quiz_progress; a learning_private.attempts;
begin
 if auth.uid() is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 -- Serialize initial creation and concurrent initializations for the same user/batch.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_batch_id::text,0));
 if not exists(select 1 from public.quiz_batches b where b.id=p_batch_id and
   (b.batch_type='module' or exists(select 1 from public.user_quiz_progress x where x.batch_id=b.id and x.user_id=auth.uid()))) then
   raise exception 'batch_not_accessible' using errcode='42501'; end if;
 perform set_config('learning.native','yes',true);
 perform set_config('learning.primary_language',coalesce(p_primary,''),true);
 perform set_config('learning.secondary_language',coalesce(p_secondary,''),true);
 insert into public.user_quiz_progress(user_id,batch_id) values(auth.uid(),p_batch_id) on conflict(user_id,batch_id) do nothing;
 select * into p from public.user_quiz_progress where user_id=auth.uid() and batch_id=p_batch_id for update;
 if p.answers='{}'::jsonb and not p.completed then
   update public.user_quiz_progress set answers=answers where id=p.id returning * into p;
 end if;
 select x.* into a from learning_private.attempts x join learning_private.current_attempt c on c.attempt_id=x.id where c.progress_id=p.id;
 -- Mixed-language attempts must never qualify as a full Italian exam.
 if a.status='in_progress' and p.answers<>'{}'::jsonb and
   (a.primary_language is distinct from p_primary or a.secondary_language is distinct from p_secondary) then
   update learning_private.attempts set primary_language=null,secondary_language=null where id=a.id;
 end if;
 return jsonb_build_object('attempt_id',a.id,'revision',p.learning_revision,'deadline_at',a.deadline_at,'answers',p.answers,'completed',p.completed,'score',a.correct_count,'incorrect_count',a.wrong_count+a.unanswered_count);
end $$;
create function public.open_learning_attempt(p_batch_id uuid,p_primary text default null,p_secondary text default null) returns jsonb
 language sql security invoker set search_path='' as $$select learning_private.open_attempt(p_batch_id,p_primary,p_secondary)$$;

create function learning_private.save_progress(p_batch_id uuid,p_attempt_id uuid,p_revision integer,p_answers jsonb,p_current integer,p_completed boolean,p_primary text,p_secondary text) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare p public.user_quiz_progress; a learning_private.attempts;
begin
 if auth.uid() is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 select * into p from public.user_quiz_progress where user_id=auth.uid() and batch_id=p_batch_id for update;
 select x.* into a from learning_private.attempts x join learning_private.current_attempt c on c.attempt_id=x.id where c.progress_id=p.id;
 if p.id is null or a.id is distinct from p_attempt_id then raise exception 'attempt_conflict'; end if;
 if p_completed and a.deadline_at<now() then p_answers:=p.answers; end if;
 -- Identical retry after a lost response is safe, even when its revision is stale.
 if p.answers=p_answers and p.completed=p_completed and p.current_question=p_current then
   return jsonb_build_object('revision',p.learning_revision,'attempt_id',a.id,'answers',p.answers,'completed',p.completed,'score',a.correct_count,'incorrect_count',a.wrong_count+a.unanswered_count);
 end if;
 if p.learning_revision<>p_revision then raise exception 'attempt_conflict'; end if;
 if p_current<1 or p_current>greatest(a.question_count,1)+1 then raise exception 'invalid_position'; end if;
 perform set_config('learning.native','yes',true);
 perform set_config('learning.primary_language',coalesce(p_primary,''),true);
 perform set_config('learning.secondary_language',coalesce(p_secondary,''),true);
 update public.user_quiz_progress set answers=p_answers,current_question=p_current,completed=p_completed,
   completed_at=case when p_completed then now() end where id=p.id returning * into p;
 select x.* into a from learning_private.attempts x join learning_private.current_attempt c on c.attempt_id=x.id where c.progress_id=p.id;
 return jsonb_build_object('revision',p.learning_revision,'attempt_id',a.id,'answers',p.answers,'completed',p.completed,'score',a.correct_count,'incorrect_count',a.wrong_count+a.unanswered_count);
end $$;
create function public.save_learning_progress(p_batch_id uuid,p_attempt_id uuid,p_revision integer,p_answers jsonb,p_current integer,p_completed boolean,p_primary text default null,p_secondary text default null) returns jsonb
 language sql security invoker set search_path='' as $$select learning_private.save_progress(p_batch_id,p_attempt_id,p_revision,p_answers,p_current,p_completed,p_primary,p_secondary)$$;

-- Updated generators enforce ownership and distinguish review from exam.
create function learning_private.generate_exam_batch(p_user_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare b uuid;
begin
 if auth.uid() is null or p_user_id<>auth.uid() then raise exception 'not_owner' using errcode='42501'; end if;
 insert into public.quiz_batches(title,is_random,batch_type) values('exam.title',true,'exam') returning id into b;
 insert into public.quiz_batch_questions(batch_id,question_id,position)
 select b,q.id,row_number() over() from (select id from public.questions where is_free or coalesce((select is_premium from public.profiles where id=auth.uid()),false) order by random() limit 30) q;
 if (select count(*) from public.quiz_batch_questions where batch_id=b)<>30 then raise exception 'insufficient_questions'; end if;
 insert into public.user_quiz_progress(user_id,batch_id) values(auth.uid(),b);
 return b;
end $$;
create or replace function public.generate_exam_batch(p_user_id uuid) returns uuid language sql security invoker set search_path='' as $$select learning_private.generate_exam_batch(p_user_id)$$;
-- Preserve the existing zero-argument RPC; add a distinctly named filtered variant (no overload ambiguity).
create function learning_private.generate_category_mistakes_review(p_category_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare b uuid;
begin
 if auth.uid() is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 insert into public.quiz_batches(title,batch_type) values('exam.reviewTitle','review') returning id into b;
 insert into public.quiz_batch_questions(batch_id,question_id,position)
 select b,q.question_id,row_number() over() from (select m.question_id from public.user_mistakes m join public.questions q on q.id=m.question_id
 where m.user_id=auth.uid() and (p_category_id is null or q.category_id=p_category_id)
 and (q.is_free or coalesce((select is_premium from public.profiles where id=auth.uid()),false)) order by m.last_incorrect_at desc limit 30) q;
 if not exists(select 1 from public.quiz_batch_questions where batch_id=b) then raise exception 'no_mistakes'; end if;
 insert into public.user_quiz_progress(user_id,batch_id) values(auth.uid(),b);
 return b;
end $$;
create function public.generate_category_mistakes_review(p_category_id uuid default null) returns uuid language sql security invoker set search_path='' as $$select learning_private.generate_category_mistakes_review(p_category_id)$$;
create or replace function public.generate_mistakes_review_batch() returns uuid language sql security invoker set search_path='' as $$select public.generate_category_mistakes_review(null)$$;
-- The progress trigger has already recorded the result atomically. Old clients may still call this RPC.
create or replace function public.record_exam_mistakes(p_batch_id uuid) returns void language plpgsql security invoker set search_path='' as $$
begin if auth.uid() is null then raise exception 'not_authenticated' using errcode='42501'; end if; end $$;

create or replace function public.get_user_exam_history(p_user_id uuid)
returns table(batch_id uuid,title text,started_at timestamptz,completed_at timestamptz,completed boolean,score bigint,incorrect_count bigint,total bigint)
language sql security invoker set search_path='' as $$
 select p.batch_id,b.title,p.started_at,p.completed_at,p.completed,
 (select count(*) from public.quiz_batch_questions qb join public.questions q on q.id=qb.question_id where qb.batch_id=p.batch_id and (p.answers->>q.id::text)::boolean=q.is_correct),
 (select count(*) from public.quiz_batch_questions qb join public.questions q on q.id=qb.question_id where qb.batch_id=p.batch_id and ((p.answers->>q.id::text) is null or (p.answers->>q.id::text)::boolean<>q.is_correct)),
 (select count(*) from public.quiz_batch_questions qb where qb.batch_id=p.batch_id)
 from public.user_quiz_progress p join public.quiz_batches b on b.id=p.batch_id
 where p.user_id=auth.uid() and p_user_id=auth.uid() and b.batch_type='exam' and b.title<>'exam.reviewTitle' order by p.started_at desc
$$;

create function learning_private.validate_timezone() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from pg_timezone_names where name=new.timezone) then raise exception 'invalid_timezone'; end if;
 return new;
end $$;
create trigger validate_learning_timezone before insert or update of timezone on public.profiles for each row execute function learning_private.validate_timezone();

create function learning_private.set_preferences(p_date date,p_goal integer,p_timezone text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'invalid_timezone'; end if;
 update public.profiles set exam_date=p_date,daily_question_goal=p_goal,timezone=p_timezone where id=auth.uid();
end $$;
create function public.set_learning_preferences(p_date date,p_goal integer,p_timezone text) returns void language sql security invoker set search_path='' as $$select learning_private.set_preferences(p_date,p_goal,p_timezone)$$;

create function learning_private.stats(p_days integer,p_offset integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; tz text;
begin
 if auth.uid() is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 if p_days not in (7,30,0) or p_offset<0 or p_offset>100000 then raise exception 'invalid_filter'; end if;
 select timezone into tz from public.profiles where id=auth.uid();
 tz:=coalesce(tz,'Europe/Rome');
 with
 mine as materialized (select * from learning_private.attempts where user_id=auth.uid()),
 observations as materialized (
 select q.*,a.mode,a.provenance,a.status,a.submitted_at,
   case when a.mode='exam' then q.final_answer=q.answer_key else q.first_answer=q.answer_key end as correct,
   case when a.mode='exam' then a.submitted_at else q.first_answered_at end as observed_at
 from mine a join learning_private.attempt_questions q on q.attempt_id=a.id
 where (a.mode='exam' and a.status='completed' and q.final_answer is not null) or (a.mode<>'exam' and q.first_answer is not null)
 ),
 catalog as materialized(select q.id,q.category_id,q.is_free from public.questions q join public.categories c on c.id=q.category_id where c.is_active),
 daily as (select distinct on(o.question_id,(o.observed_at at time zone tz)::date) o.*
   from observations o where o.provenance='native' and o.observed_at>=now()-interval '60 days'
   order by o.question_id,(o.observed_at at time zone tz)::date,o.observed_at,o.attempt_id),
 ranked as (select d.*,row_number() over(partition by question_id order by observed_at desc) rn from daily d),
 per_question as (select question_id,(1+sum(power(2.0,-extract(epoch from (now()-observed_at))/86400/30)*correct::integer)) /
   (2+sum(power(2.0,-extract(epoch from (now()-observed_at))/86400/30))) q from ranked where rn<=3 group by question_id),
 covered as (select distinct q.question_id from mine a join learning_private.attempt_questions q on q.attempt_id=a.id where q.final_answer is not null),
 category_stats as (select c.id,
   coalesce((select title from public.category_translations ct where ct.category_id=c.id and ct.lang_code=(select lang_primary from public.profiles where id=auth.uid())),
   (select title from public.category_translations ct where ct.category_id=c.id and ct.lang_code='it'),c.id::text) title,
   count(cat.id)::integer total,count(distinct cv.question_id)::integer seen,count(pq.question_id)::integer recent_unique,
   coalesce(round(100*avg(pq.q)*least(1.0,count(pq.question_id)/10.0),1),0) mastery,
   (select round(100.0*avg(o.correct::integer),1) from observations o where o.category_id=c.id and o.observed_at>=now()-interval '30 days') accuracy,
   (select count(*) from observations o where o.category_id=c.id and o.observed_at>=now()-interval '30 days') samples,
   (select max(observed_at) from observations o where o.category_id=c.id) last_at,
   count(cat.id) filter(where cat.is_free or coalesce((select is_premium from public.profiles where id=auth.uid()),false))::integer accessible
 from public.categories c join catalog cat on cat.category_id=c.id left join covered cv on cv.question_id=cat.id left join per_question pq on pq.question_id=cat.id
 group by c.id),
 qualifying as (select * from mine where mode='exam' and status='completed' and provenance='native' and question_count=30
   and primary_language='it' and secondary_language is null and submitted_at>=now()-interval '30 days' order by submitted_at desc limit 20),
 last10 as(select * from qualifying order by submitted_at desc limit 10),
 components as (select (select count(*) from qualifying) exams,
   (select count(*) from last10 where wrong_count+unanswered_count<=3) passed10,
   (select avg(wrong_count+unanswered_count) from last10) mean10,
   (select 100*(0.8*avg((wrong_count+unanswered_count<=3)::integer)+0.2*greatest(0,1-avg(wrong_count+unanswered_count)/6.0)) from qualifying) e,
   coalesce((select avg(mastery) from category_stats),0) m,
   coalesce((select 100*least(1.0,sum(seen)/nullif(0.5*sum(total),0)) from category_stats),0) c,
   coalesce((select sum(seen) from category_stats),0) covered,
   coalesce((select sum(total) from category_stats),0) total,
   coalesce((select sum(recent_unique) from category_stats),0) recent_unique,
   (select count(*) from category_stats where recent_unique>0) recent_categories,
   (select count(*) from category_stats) categories,
   coalesce((select bool_and(recent_unique>=least(10,total)) from category_stats),false) breadth),
 readiness as (select *,exams>=5 and recent_unique>=100 and recent_categories>=least(5,categories) and total>0 enough,
   exams>=10 and passed10>=8 and mean10<=3 and covered>=0.5*total and breadth gates,
   round(0.50*coalesce(e,0)+0.35*m+0.15*c) raw_score from components),
 error_ordered as (select o.*,row_number() over(partition by question_id order by observed_at desc,attempt_id) seq,
   count(*) filter(where not correct and observed_at>=now()-interval '30 days') over(partition by question_id) recent_errors,
   max(observed_at) filter(where not correct) over(partition by question_id) last_error,
   lag(correct) over(partition by question_id order by observed_at,attempt_id) previous_correct,
   lag(observed_at) over(partition by question_id order by observed_at,attempt_id) previous_at
 from observations o where provenance='native'),
 error_stats as (select count(*) filter(where recent_errors>=2) recurring,
   count(*) filter(where correct and last_error is not null) recovered,
   count(*) filter(where correct and previous_correct and observed_at-previous_at>=interval '24 hours' and last_error<previous_at) consolidated,
   count(*) filter(where not correct and previous_correct) relapsed from error_ordered where seq=1),
 filtered_exams as (select * from mine where mode='exam' and (p_days=0 or started_at>=now()-make_interval(days=>p_days))),
 history as (select * from filtered_exams order by started_at desc,id limit 20 offset p_offset)
 select jsonb_build_object(
 'version',1,'updated_at',now(),'readiness',(select jsonb_build_object('score',case when enough then raw_score end,
   'state',case when not enough then 'collecting' when raw_score>=80 and gates then 'ready' when raw_score>=70 then 'almost' when raw_score>=50 then 'growing' else 'building' end,
   'exam',e,'mastery',m,'breadth',c,'exam_count',exams,'recent_unique',recent_unique,'recent_categories',recent_categories,
   'total_categories',categories,'gates_met',gates,'enough',enough) from readiness),
 'coverage',(select jsonb_build_object('seen',covered,'total',total) from components),
 'categories',coalesce((select jsonb_agg(to_jsonb(cs) order by mastery,last_at nulls first,id) from category_stats cs),'[]'::jsonb),
 'exams',(select jsonb_build_object('completed',count(*) filter(where status='completed'),
   'passed',count(*) filter(where status='completed' and question_count=30 and wrong_count+unanswered_count<=3),
   'eligible',count(*) filter(where status='completed' and question_count=30),
   'mean_errors',avg(wrong_count+unanswered_count) filter(where status='completed' and question_count=30),
   'open',count(*) filter(where status='in_progress' and deadline_at>now()),
   'interrupted',count(*) filter(where status='abandoned' or (status='in_progress' and deadline_at<=now()))) from filtered_exams),
 'history',coalesce((select jsonb_agg(jsonb_build_object('id',id,'batch_id',batch_id,'started_at',started_at,'submitted_at',submitted_at,
   'status',case when status='in_progress' and deadline_at<=now() then 'expired' else status end,'errors',wrong_count+unanswered_count,
   'total',question_count,'legacy',provenance='legacy','italian',primary_language='it' and secondary_language is null) order by started_at desc,id) from history),'[]'::jsonb),
 'history_total',(select count(*) from filtered_exams),
 'trend',coalesce((select jsonb_agg(jsonb_build_object('at',submitted_at,'errors',wrong_count+unanswered_count,'legacy',provenance='legacy') order by submitted_at)
   from (select * from filtered_exams where status='completed' and question_count=30 order by submitted_at desc limit 30) t),'[]'::jsonb),
 'mistakes',(select to_jsonb(es) || jsonb_build_object('current',(select count(*) from public.user_mistakes where user_id=auth.uid())) from error_stats es),
 'preferences',(select jsonb_build_object('exam_date',exam_date,'daily_goal',daily_question_goal,'timezone',timezone) from public.profiles where id=auth.uid()),
 'today',(select count(*) from observations where provenance='native' and (observed_at at time zone tz)::date=(now() at time zone tz)::date),
 'legacy_count',(select count(*) from mine where provenance='legacy'),
 'resume',(select jsonb_build_object('batch_id',a.batch_id,'mode',a.mode,'force_italian',a.primary_language='it' and a.secondary_language is null) from mine a where status='in_progress' and batch_id is not null
   and (deadline_at is null or deadline_at>now()) and exists(select 1 from learning_private.attempt_questions q where q.attempt_id=a.id and final_answer is not null)
   order by started_at desc limit 1)
 ) into result;
 return result;
end $$;
create function public.get_my_learning_stats(p_days integer default 30,p_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$select learning_private.stats(p_days,p_offset)$$;

-- Resume/results use the ledger score, never a re-evaluation against a changed answer key.
create function learning_private.get_progress(p_batch_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('score',case when p.completed then a.correct_count end,
   'incorrect_count',case when p.completed then a.wrong_count+a.unanswered_count end)), '[]'::jsonb)
 into result from public.user_quiz_progress p left join learning_private.current_attempt c on c.progress_id=p.id
 left join learning_private.attempts a on a.id=c.attempt_id where p.user_id=auth.uid() and p.batch_id=p_batch_id;
 return result;
end $$;
create function public.get_my_quiz_progress(p_batch_id uuid) returns jsonb language sql security invoker set search_path='' as $$select learning_private.get_progress(p_batch_id)$$;
revoke execute on function public.get_my_quiz_progress(uuid) from public,anon;
grant execute on function public.get_my_quiz_progress(uuid) to authenticated;

revoke execute on all functions in schema learning_private from public,anon,authenticated;
grant execute on function learning_private.get_progress(uuid),learning_private.generate_exam_batch(uuid),learning_private.generate_category_mistakes_review(uuid),learning_private.open_attempt(uuid,text,text),learning_private.save_progress(uuid,uuid,integer,jsonb,integer,boolean,text,text),learning_private.stats(integer,integer),learning_private.set_preferences(date,integer,text) to authenticated;
revoke execute on function public.open_learning_attempt(uuid,text,text),public.save_learning_progress(uuid,uuid,integer,jsonb,integer,boolean,text,text),public.get_my_learning_stats(integer,integer),public.set_learning_preferences(date,integer,text),public.generate_exam_batch(uuid),public.generate_category_mistakes_review(uuid),public.generate_mistakes_review_batch(),public.record_exam_mistakes(uuid),public.get_user_exam_history(uuid) from public,anon;
grant execute on function public.open_learning_attempt(uuid,text,text),public.save_learning_progress(uuid,uuid,integer,jsonb,integer,boolean,text,text),public.get_my_learning_stats(integer,integer),public.set_learning_preferences(date,integer,text),public.generate_exam_batch(uuid),public.generate_category_mistakes_review(uuid),public.generate_mistakes_review_batch(),public.record_exam_mistakes(uuid),public.get_user_exam_history(uuid) to authenticated;
insert into public.feature_flags(name,description,is_active) values('learning_statistics','Learning statistics UI; does not gate access by account plan',true) on conflict(name) do nothing;
commit;
