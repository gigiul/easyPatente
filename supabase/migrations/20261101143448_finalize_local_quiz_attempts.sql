-- New clients checkpoint on the device and submit once. Keep legacy write RPCs compatible.
begin;
alter table learning_private.attempts add column submission_id uuid not null default gen_random_uuid();
alter table learning_private.attempts add column final_submission jsonb;

create or replace function learning_private.capture_progress() returns trigger language plpgsql security definer set search_path='' as $$
declare a learning_private.attempts; v_mode text; v_native boolean; v_reset boolean := false; v_final boolean; v_first jsonb; v_first_at jsonb; v_answered_at jsonb;
begin
 if auth.uid() is not null and new.user_id <> auth.uid() then raise exception 'not_owner' using errcode='42501'; end if;
 if tg_op='INSERT' then new.learning_revision:=0; else new.learning_revision:=old.learning_revision; end if;
 if tg_op='INSERT' and exists(select 1 from public.user_quiz_progress p where p.user_id=new.user_id and p.batch_id=new.batch_id) then return new; end if;
 if auth.uid() is not null then
   if tg_op='INSERT' then new.started_at:=now(); else new.started_at:=old.started_at; end if;
   if new.completed then new.completed_at:=case when tg_op='UPDATE' and old.completed then old.completed_at else now() end;
   else new.completed_at:=null; end if;
 end if;
 v_final := coalesce(current_setting('learning.final_submission',true),'')='yes';
 v_first := case when v_final then current_setting('learning.first_answers',true)::jsonb else '{}'::jsonb end;
 v_first_at := case when v_final then current_setting('learning.first_answered_at',true)::jsonb else '{}'::jsonb end;
 v_answered_at := case when v_final then current_setting('learning.answered_at',true)::jsonb else '{}'::jsonb end;
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
 if a.deadline_at<now() and tg_op='UPDATE' and new.answers<>old.answers and not v_reset and not v_final then raise exception 'attempt_expired'; end if;
 update learning_private.attempt_questions q set
   first_answer=case when v_final then coalesce(q.first_answer,(v_first->>q.question_id::text)::boolean) when v_native then coalesce(q.first_answer,(new.answers->>q.question_id::text)::boolean) else q.first_answer end,
   first_answered_at=case when v_final and q.first_answer is null and v_first ? q.question_id::text then (v_first_at->>q.question_id::text)::timestamptz when not v_final and v_native and q.first_answer is null and new.answers ? q.question_id::text then now() else q.first_answered_at end,
   final_answer=(new.answers->>q.question_id::text)::boolean,
   final_answered_at=case when v_final then (v_answered_at->>q.question_id::text)::timestamptz when new.answers ? q.question_id::text and q.final_answer is distinct from (new.answers->>q.question_id::text)::boolean then now() else q.final_answered_at end
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


create function learning_private.session_json(p_attempt_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('attempt_id',a.id,'submission_id',a.submission_id,'revision',p.learning_revision,
 'started_at',a.started_at,'deadline_at',a.deadline_at,'server_time',now(),'current_question',p.current_question,
 'mode',a.mode,'answers',p.answers,'completed',p.completed,'score',a.correct_count,'incorrect_count',a.wrong_count+a.unanswered_count,
 'first_answers',coalesce((select jsonb_object_agg(q.question_id::text,q.first_answer) from learning_private.attempt_questions q where q.attempt_id=a.id and q.first_answer is not null),'{}'::jsonb),
 'first_answered_at',coalesce((select jsonb_object_agg(q.question_id::text,q.first_answered_at) from learning_private.attempt_questions q where q.attempt_id=a.id and q.first_answer is not null),'{}'::jsonb),
 'answered_at',coalesce((select jsonb_object_agg(q.question_id::text,q.final_answered_at) from learning_private.attempt_questions q where q.attempt_id=a.id and q.final_answer is not null),'{}'::jsonb))
 from learning_private.attempts a join learning_private.current_attempt c on c.attempt_id=a.id
 join public.user_quiz_progress p on p.id=c.progress_id where a.id=p_attempt_id
$$;

create function learning_private.begin_local_attempt(p_batch_id uuid,p_primary text,p_secondary text,p_restart_from uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.user_quiz_progress; a learning_private.attempts;
begin
 if auth.uid() is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_batch_id::text,0));
 if not exists(select 1 from public.quiz_batches b where b.id=p_batch_id and
   (b.batch_type='module' or exists(select 1 from public.user_quiz_progress x where x.batch_id=b.id and x.user_id=auth.uid()))) then
   raise exception 'batch_not_accessible' using errcode='42501'; end if;
 perform set_config('learning.native','yes',true);
 perform set_config('learning.primary_language',coalesce(p_primary,''),true);
 perform set_config('learning.secondary_language',coalesce(p_secondary,''),true);
 insert into public.user_quiz_progress(user_id,batch_id) values(auth.uid(),p_batch_id) on conflict(user_id,batch_id) do nothing;
 select * into p from public.user_quiz_progress where user_id=auth.uid() and batch_id=p_batch_id for update;
 select x.* into a from learning_private.attempts x join learning_private.current_attempt c on c.attempt_id=x.id where c.progress_id=p.id for update of x;
 -- A repeated restart with a lost response returns the replacement, without resetting it again.
 if p_restart_from=a.id then
   if a.mode<>'practice' then raise exception 'exam_restart_not_allowed'; end if;
   update public.user_quiz_progress set answers='{}'::jsonb,current_question=1,completed=false,completed_at=null where id=p.id returning * into p;
   select x.* into a from learning_private.attempts x join learning_private.current_attempt c on c.attempt_id=x.id where c.progress_id=p.id;
 end if;
 -- Opening a blank attempt never increments the progress revision or touches its question rows.
 if not p.completed and p.answers='{}'::jsonb then
   update learning_private.attempts set provenance='native',primary_language=p_primary,secondary_language=p_secondary where id=a.id;
 elsif not p.completed and (a.primary_language is distinct from p_primary or a.secondary_language is distinct from p_secondary) then
   update learning_private.attempts set primary_language=null,secondary_language=null where id=a.id;
 end if;
 return to_jsonb(p)||jsonb_build_object('learning_session',learning_private.session_json(a.id));
end $$;

create function public.begin_learning_attempt(p_batch_id uuid,p_primary text default null,p_secondary text default null,p_restart_from uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select learning_private.begin_local_attempt(p_batch_id,p_primary,p_secondary,p_restart_from)$$;

create function learning_private.finalize_local_attempt(p_batch_id uuid,p_attempt_id uuid,p_revision integer,p_submission_id uuid,
 p_answers jsonb,p_first_answers jsonb,p_first_answered_at jsonb,p_answered_at jsonb,p_current integer,p_primary text,p_secondary text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.user_quiz_progress; a learning_private.attempts; payload jsonb; e record; answered_at timestamptz; first_at timestamptz;
begin
 if auth.uid() is null then raise exception 'not_authenticated' using errcode='42501'; end if;
 select * into p from public.user_quiz_progress where user_id=auth.uid() and batch_id=p_batch_id for update;
 select x.* into a from learning_private.attempts x join learning_private.current_attempt c on c.attempt_id=x.id where c.progress_id=p.id for update of x;
 if p.id is null or a.id is distinct from p_attempt_id or a.submission_id is distinct from p_submission_id then raise exception 'attempt_conflict'; end if;
 payload:=jsonb_build_object('answers',p_answers,'first_answers',p_first_answers,'first_answered_at',p_first_answered_at,
   'answered_at',p_answered_at,'current',p_current,'primary',p_primary,'secondary',p_secondary);
 if a.status='completed' then
   if a.final_submission is distinct from payload then raise exception 'submission_conflict'; end if;
   return learning_private.session_json(a.id);
 end if;
 if p.learning_revision is distinct from p_revision or a.status<>'in_progress' then raise exception 'attempt_conflict'; end if;
 if p_current is null or p_current<1 or p_current>greatest(a.question_count,1)+1 then raise exception 'invalid_position'; end if;
 if jsonb_typeof(p_answers) is distinct from 'object' or jsonb_typeof(p_first_answers) is distinct from 'object'
   or jsonb_typeof(p_first_answered_at) is distinct from 'object' or jsonb_typeof(p_answered_at) is distinct from 'object' then raise exception 'invalid_answers'; end if;
 if (select count(*) from jsonb_each(p_answers))>a.question_count then raise exception 'invalid_answers'; end if;
 for e in select * from jsonb_each(p_answers) loop
   if jsonb_typeof(e.value)<>'boolean' or not exists(select 1 from learning_private.attempt_questions q where q.attempt_id=a.id and q.question_id::text=e.key) then
     raise exception 'invalid_question_or_answer'; end if;
   if jsonb_typeof(p_answered_at->e.key) is distinct from 'string' then raise exception 'missing_answer_time'; end if;
   answered_at:=(p_answered_at->>e.key)::timestamptz;
   if not isfinite(answered_at) or answered_at<date_trunc('milliseconds',a.started_at) or answered_at>now()+interval '5 seconds' or (answered_at>a.deadline_at and not exists(select 1 from learning_private.attempt_questions q
       where q.attempt_id=a.id and q.question_id::text=e.key and q.final_answer=(e.value::text)::boolean and q.final_answered_at=answered_at)) then
     raise exception 'invalid_answer_time'; end if;
 end loop;
 for e in select * from jsonb_each(p_first_answers) loop
   if jsonb_typeof(e.value)<>'boolean' or not(p_answers ? e.key) or jsonb_typeof(p_first_answered_at->e.key) is distinct from 'string' then
     raise exception 'invalid_first_answer'; end if;
   first_at:=(p_first_answered_at->>e.key)::timestamptz;
   if not isfinite(first_at) or first_at<date_trunc('milliseconds',a.started_at) or first_at>(p_answered_at->>e.key)::timestamptz then raise exception 'invalid_first_answer_time'; end if;
 end loop;
 if exists(select 1 from jsonb_object_keys(p_first_answered_at) k where not(p_first_answers ? k))
   or exists(select 1 from jsonb_object_keys(p_answered_at) k where not(p_answers ? k)) then raise exception 'invalid_answer_time'; end if;
 -- Device timestamps preserve offline answers. They are training evidence, not secure exam proctoring.
 -- The server fixes the attempt/deadline, validates timestamps, owns grading and rejects late answers.
 perform set_config('learning.native','yes',true);
 perform set_config('learning.final_submission','yes',true);
 perform set_config('learning.first_answers',p_first_answers::text,true);
 perform set_config('learning.first_answered_at',p_first_answered_at::text,true);
 perform set_config('learning.answered_at',p_answered_at::text,true);
 perform set_config('learning.primary_language',coalesce(p_primary,''),true);
 perform set_config('learning.secondary_language',coalesce(p_secondary,''),true);
 if a.primary_language is distinct from p_primary or a.secondary_language is distinct from p_secondary then
   update learning_private.attempts set primary_language=null,secondary_language=null where id=a.id;
 end if;
 update public.user_quiz_progress set answers=p_answers,current_question=p_current,completed=true,completed_at=now() where id=p.id;
 update learning_private.attempts set final_submission=payload,
   submitted_at=least(now(),coalesce(a.deadline_at,now())) where id=a.id;
 return learning_private.session_json(a.id);
end $$;

create function public.finalize_learning_attempt(p_batch_id uuid,p_attempt_id uuid,p_revision integer,p_submission_id uuid,
 p_answers jsonb,p_first_answers jsonb,p_first_answered_at jsonb,p_answered_at jsonb,p_current integer,p_primary text default null,p_secondary text default null) returns jsonb
language sql security invoker set search_path='' as $$select learning_private.finalize_local_attempt(p_batch_id,p_attempt_id,p_revision,p_submission_id,p_answers,p_first_answers,p_first_answered_at,p_answered_at,p_current,p_primary,p_secondary)$$;

revoke execute on function learning_private.session_json(uuid),learning_private.begin_local_attempt(uuid,text,text,uuid),
 learning_private.finalize_local_attempt(uuid,uuid,integer,uuid,jsonb,jsonb,jsonb,jsonb,integer,text,text) from public,anon,authenticated;
grant execute on function learning_private.begin_local_attempt(uuid,text,text,uuid),
 learning_private.finalize_local_attempt(uuid,uuid,integer,uuid,jsonb,jsonb,jsonb,jsonb,integer,text,text) to authenticated;
revoke execute on function public.begin_learning_attempt(uuid,text,text,uuid),
 public.finalize_learning_attempt(uuid,uuid,integer,uuid,jsonb,jsonb,jsonb,jsonb,integer,text,text) from public,anon;
grant execute on function public.begin_learning_attempt(uuid,text,text,uuid),
 public.finalize_learning_attempt(uuid,uuid,integer,uuid,jsonb,jsonb,jsonb,jsonb,integer,text,text) to authenticated;
commit;
