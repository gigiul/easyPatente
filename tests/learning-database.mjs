// Offline integration test. PGLITE_MODULE may point to an isolated installation.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
process.on('uncaughtException', error => { console.error(error.message, error.where ?? '', error.detail ?? ''); process.exit(1); });
const db = new PGlite();
const baseline = readFileSync(new URL('../supabase/migrations/20260301000000_initial_schema.sql', import.meta.url), 'utf8');
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,public to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;`);
for (const match of baseline.matchAll(/create table public\.\w+\s*\([\s\S]*?\n\);/g)) {
 const sql=match[0].replace(/,?\n\s*embedding vector\(\d+\)/g,'');
 await db.exec(sql);
}
await db.exec(`grant select,insert,update,delete on all tables in schema public to authenticated;
 alter table public.user_quiz_progress enable row level security;
 create policy own_progress on public.user_quiz_progress to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 alter table public.profiles enable row level security;
 create policy own_profile on public.profiles to authenticated using(id=auth.uid()) with check(id=auth.uid());`);
const uid = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
await db.exec(`insert into auth.users values('${uid}'),('${other}'); insert into public.languages(code,name) values('it','Italiano');
insert into public.profiles(id) values('${uid}'),('${other}');`);
// Seed a legacy completed row to exercise backfill and preserved mistakes.
const [{id:cat}] = (await db.query(`insert into public.categories(is_active) values(true) returning id`)).rows;
const [{id:batch}] = (await db.query(`insert into public.quiz_batches(title,category_id) values('module',$1) returning id`,[cat])).rows;
const questions = (await db.query(`insert into public.questions(code,category_id,is_correct) select 'q'||i,$1,i%2=0 from generate_series(1,30) i returning id,is_correct`,[cat])).rows;
for(let i=0;i<questions.length;i++) await db.query(`insert into public.quiz_batch_questions(batch_id,question_id,position) values($1,$2,$3)`,[batch,questions[i].id,i+1]);
await db.query(`insert into public.user_quiz_progress(user_id,batch_id,answers,completed,completed_at) values($1,$2,$3,true,now())`,[uid,batch,JSON.stringify({[questions[0].id]:true})]);
await db.query(`insert into public.user_mistakes(user_id,question_id,incorrect_count) values($1,$2,4)`,[uid,questions[0].id]);
const migration=readFileSync(new URL('../supabase/migrations/20261031161918_learning_statistics.sql', import.meta.url),'utf8');
await db.exec(migration);
assert.equal((await db.query('select incorrect_count from public.user_mistakes')).rows[0].incorrect_count,4);
const auth=async id=>{ await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id]); await db.exec('set role authenticated'); };
const rpc=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.result;
await auth(uid);
let stats=await rpc('select public.get_my_learning_stats() result');
assert.equal(stats.readiness.score,null); assert.equal(stats.legacy_count,1); assert.equal(stats.coverage.seen,1);
// Reset legacy and start a genuinely new native attempt.
let current=await rpc('select public.open_learning_attempt($1,\'it\',null) result',[batch]);
let saved=await rpc('select public.save_learning_progress($1,$2,$3,$4,1,false,\'it\',null) result',[batch,current.attempt_id,current.revision,'{}']);
assert.notEqual(current.attempt_id,saved.attempt_id);
current={...current,...saved};
const answers={[questions[0].id]:false,[questions[1].id]:true};
saved=await rpc('select public.save_learning_progress($1,$2,$3,$4,3,false,\'it\',null) result',[batch,current.attempt_id,current.revision,JSON.stringify(answers)]);
current={...current,...saved};
const firstRevision=current.revision;
saved=await rpc('select public.save_learning_progress($1,$2,$3,$4,3,false,\'it\',null) result',[batch,current.attempt_id,current.revision-1,JSON.stringify(answers)]);
assert.equal(saved.revision,firstRevision,'identical lost response retry');
await assert.rejects(()=>rpc('select public.save_learning_progress($1,$2,$3,$4,4,false) result',[batch,current.attempt_id,current.revision-1,JSON.stringify(answers)]),/attempt_conflict/);
await assert.rejects(()=>rpc('select public.save_learning_progress($1,$2,$3,$4,3,false) result',[batch,current.attempt_id,current.revision,JSON.stringify({bad:true})]),/invalid_question_or_answer/);
const finalArgs=[batch,current.attempt_id,current.revision,JSON.stringify(answers)];
saved=await rpc('select public.save_learning_progress($1,$2,$3,$4,30,true) result',finalArgs);
const firstFinal=saved;
const retry=await rpc('select public.save_learning_progress($1,$2,$3,$4,30,true) result',finalArgs);
assert.equal(firstFinal.revision,retry.revision);
// Old-client upsert must not create a phantom attempt or reset the revision.
await db.query(`insert into public.user_quiz_progress(user_id,batch_id,answers,current_question,completed) values($1,$2,$3,30,true)
 on conflict(user_id,batch_id) do update set answers=excluded.answers,current_question=excluded.current_question,completed=excluded.completed`,[uid,batch,JSON.stringify(answers)]);
assert.equal((await rpc('select public.get_my_quiz_progress($1) result',[batch]))[0].learning_revision,firstFinal.revision);

stats=await rpc('select public.get_my_learning_stats() result');
assert.equal(stats.exams.completed,0,'practice is not an exam'); assert.equal(stats.coverage.seen,2); assert.equal(stats.today,2);
await auth(other);
await assert.rejects(()=>rpc('select public.save_learning_progress($1,$2,$3,$4,30,true) result',finalArgs),/attempt_conflict/);
await assert.rejects(()=>rpc('select public.generate_exam_batch($1) result',[uid]),/not_owner/);
await assert.rejects(()=>db.query('select * from learning_private.attempt_questions'),/permission denied/);
assert.equal((await rpc('select public.get_my_learning_stats() result')).coverage.seen,0);
await auth(uid);
// Reset retains native attempt and does not double-count coverage.
current=await rpc('select public.open_learning_attempt($1,\'it\',null) result',[batch]);
saved=await rpc('select public.save_learning_progress($1,$2,$3,\'{}\',1,false,\'it\',null) result',[batch,current.attempt_id,current.revision]);
await db.exec('reset role');
assert.equal((await db.query('select count(*)::int n from learning_private.attempts where user_id=$1',[uid])).rows[0].n,3);
await auth(uid);
// Simulations are separate from review; deadline enforced by server.
const examId=await rpc('select public.generate_exam_batch($1) result',[uid]);
current=await rpc('select public.open_learning_attempt($1,\'it\',null) result',[examId]);
const allCorrect=Object.fromEntries(questions.map(q=>[q.id,q.is_correct]));
saved=await rpc('select public.save_learning_progress($1,$2,$3,$4,30,true,\'it\',null) result',[examId,current.attempt_id,current.revision,JSON.stringify(allCorrect)]);
stats=await rpc('select public.get_my_learning_stats() result');
assert.equal(stats.exams.completed,1); assert.equal(stats.exams.passed,1); assert.equal(stats.readiness.exam_count,1);
await db.exec('reset role');
await db.query('update public.questions set is_correct=not is_correct where id=$1',[questions[0].id]);
await auth(uid);
assert.equal((await rpc('select public.get_my_quiz_progress($1) result',[examId]))[0].score,30,'historical score uses snapshot');
await db.exec('reset role');
await db.query('update public.questions set is_correct=not is_correct where id=$1',[questions[0].id]);
await auth(uid);

// Induce a mistake, then review it.
const exam2=await rpc('select public.generate_exam_batch($1) result',[uid]);
current=await rpc('select public.open_learning_attempt($1,\'it\',null) result',[exam2]);
await rpc('select public.save_learning_progress($1,$2,$3,$4,30,true,\'it\',null) result',[exam2,current.attempt_id,current.revision,JSON.stringify({[questions[0].id]:true})]);
const review=await rpc('select public.generate_mistakes_review_batch() result');
current=await rpc('select public.open_learning_attempt($1,\'it\',null) result',[review]);
await rpc('select public.save_learning_progress($1,$2,$3,$4,1,true,\'it\',null) result',[review,current.attempt_id,current.revision,JSON.stringify({[questions[0].id]:false})]);
stats=await rpc('select public.get_my_learning_stats() result');
assert.equal(stats.exams.completed,2,'review excluded');
const deadlineExam=await rpc('select public.generate_exam_batch($1) result',[uid]);
current=await rpc('select public.open_learning_attempt($1,\'it\',null) result',[deadlineExam]);
await db.exec('reset role');
await db.query(`update learning_private.attempts set deadline_at=now()-interval '1 minute' where id=$1`,[current.attempt_id]);
await auth(uid);
await assert.rejects(()=>rpc('select public.save_learning_progress($1,$2,$3,$4,1,false) result',[deadlineExam,current.attempt_id,current.revision,JSON.stringify(answers)]),/attempt_expired/);
saved=await rpc('select public.save_learning_progress($1,$2,$3,$4,1,true) result',[deadlineExam,current.attempt_id,current.revision,JSON.stringify(answers)]);
assert.deepEqual(saved.answers,{},'late answers discarded on timeout');
await assert.rejects(()=>rpc('select public.set_learning_preferences(null,10,\'Not/AZone\') result'),/invalid_timezone/);
await rpc('select public.set_learning_preferences(\'2026-12-12\',30,\'Europe/Rome\') result');
assert.equal((await rpc('select public.get_my_learning_stats() result')).preferences.daily_goal,30);
// Deterministic algorithm fixture: 150 unique questions, five categories, twenty Italian exams.
await db.exec('reset role');
for (let c=0;c<4;c++) {
 const id=(await db.query('insert into public.categories(is_active) values(true) returning id')).rows[0].id;
 await db.query("insert into public.questions(code,category_id,is_correct) select 'c'||$2||'-'||i,$1,true from generate_series(1,30) i",[id,c]);
}
const catalog=(await db.query('select id,category_id,is_correct from public.questions order by code')).rows;
for(let i=0;i<20;i++) {
 const a=(await db.query("insert into learning_private.attempts(user_id,mode,status,provenance,primary_language,started_at,submitted_at,question_count,correct_count) values($1,'exam','completed','native','it',now()+make_interval(secs=>$2),now()+make_interval(secs=>$2),30,30) returning id",[uid,i])).rows[0].id;
 for(let j=0;j<30;j++) {
  const q=catalog[(i*30+j)%catalog.length];
  await db.query('insert into learning_private.attempt_questions(attempt_id,question_id,category_id,position,answer_key,final_answer) values($1,$2,$3,$4,$5,$5)',[a,q.id,q.category_id,j+1,q.is_correct]);
 }
}
await auth(uid);
stats=await rpc('select public.get_my_learning_stats() result');
assert.equal(stats.readiness.state,'ready'); assert.equal(stats.readiness.exam_count,20);
assert.equal(stats.coverage.seen,150); assert.equal(stats.readiness.recent_unique,150);
assert.equal(stats.readiness.gates_met,true);
assert.equal(stats.readiness.score,Math.round(0.5*stats.readiness.exam+0.35*stats.readiness.mastery+0.15*stats.readiness.breadth));
const score=stats.readiness.score;
await rpc("select public.set_learning_preferences('2026-11-01',999,'Europe/Rome') result");
assert.equal((await rpc('select public.get_my_learning_stats(7) result')).readiness.score,score,'date, goal and display filter never change readiness');
await db.exec('reset role');
await db.query("update learning_private.attempts set submitted_at=now()-interval '61 days' where user_id=$1",[uid]);
await auth(uid);
stats=await rpc('select public.get_my_learning_stats() result');
assert.equal(stats.readiness.score,null,'stale exams cannot claim current readiness');
await db.exec('reset role');
if (process.env.LEARNING_BENCHMARK === '1') {
 await db.query(`with a as (
   insert into learning_private.attempts(user_id,mode,status,provenance,primary_language,started_at,submitted_at,question_count,correct_count)
   select $1,'exam','completed','native','it',now(),now(),30,30 from generate_series(1,3334) returning id)
 insert into learning_private.attempt_questions(attempt_id,question_id,category_id,position,answer_key,final_answer)
 select a.id,q.id,q.category_id,q.position,q.is_correct,q.is_correct from a cross join
   (select id,category_id,is_correct,row_number() over()::int position from public.questions limit 30) q`,[uid]);
 await auth(uid);
 const times=[];
 for(let i=0;i<5;i++) { const start=performance.now(); const output=await rpc('select public.get_my_learning_stats() result'); times.push(performance.now()-start); if(i===4) console.log('Payload bytes:',Buffer.byteLength(JSON.stringify(output))); }
 console.log('PGlite/WASM 100k answers, stats milliseconds:',times.map(t=>Math.round(t)));
 await db.exec('reset role');
}
await db.query('delete from auth.users where id=$1',[uid]);
assert.equal((await db.query('select count(*)::int n from learning_private.attempts where user_id=$1',[uid])).rows[0].n,0);
await db.close();
console.log('PASS: ledger/backfill, false/missing, reset, replay, revision conflict, ownership, private snapshots, exam/review, deadline, preferences, account deletion');
