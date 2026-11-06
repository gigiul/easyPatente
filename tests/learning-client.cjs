// Isolated React tests: no credentials and no calls to Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const base=process.env.LEARNING_TEST_MODULES;
const React=require(base ? path.join(base,'react') : 'react');
const {create,act}=require(base ? path.join(base,'react-test-renderer') : 'react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const plain=value=>JSON.parse(JSON.stringify(value));
const disk=new Map();
let storageFails=false, offline=false, lostResponse=false;
let opens=0, networkSubmissions=0, serverWrites=0;
const payloads=[];
const sessions=new Map();
const listeners=new Set();
const storage={getItem:async key=>disk.get(key)??null,setItem:async(key,value)=>{if(storageFails)throw Error('storage_full');disk.set(key,value);},getAllKeys:async()=>[...disk.keys()],multiRemove:async keys=>keys.forEach(key=>disk.delete(key))};
const native={AppState:{addEventListener:(_event,fn)=>{listeners.add(fn);return {remove:()=>listeners.delete(fn)};}}};
const sessionFor=(batch)=>({attempt_id:batch+'-attempt',submission_id:batch+'-receipt',revision:0,answers:{},completed:false,
 server_time:new Date().toISOString(),started_at:new Date(Date.now()-2000).toISOString(),deadline_at:null,current_question:1,mode:'practice',first_answers:{},first_answered_at:{},answered_at:{}});
const learning={
 beginLearningAttempt:async(batch,primary,secondary,restart)=>{
  opens++;if(offline)throw Error('network');
  let s=sessions.get(batch)??sessionFor(batch);
  if(restart===s.attempt_id)s={...sessionFor(batch),attempt_id:s.attempt_id+'-next',submission_id:s.submission_id+'-next'};
  sessions.set(batch,s);
  return {id:batch+'-progress',answers:s.answers,current_question:s.current_question,completed:s.completed,learning_session:plain({...s,server_time:new Date().toISOString()})};
 },
 finalizeLearningAttempt:async draft=>{
  networkSubmissions++;payloads.push(plain(draft));if(offline)throw Error('network');
  const s=sessions.get(draft.batch_id);
  if(!s || s.attempt_id!==draft.session.attempt_id)throw Error('attempt_conflict');
  if(!s.completed){
   assert.equal(s.revision,draft.session.revision);
   const done={...s,answers:plain(draft.answers),first_answers:plain(draft.first_answers),first_answered_at:plain(draft.first_answered_at),answered_at:plain(draft.answered_at),current_question:draft.current_question,revision:s.revision+1,completed:true,score:1,incorrect_count:1};
   sessions.set(draft.batch_id,done);serverWrites++;
  }
  if(lostResponse){lostResponse=false;throw Error('response_lost');}
  return plain(sessions.get(draft.batch_id));
 },
};
const t=x=>x;
const modules={};
function load(file){
 if(modules[file])return modules[file].exports;
 const mod={exports:{}};modules[file]=mod;
 const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const req=id=>{
  if(id==='react')return React;
  if(id==='react-native')return native;
  if(id==='react-i18next')return {useTranslation:()=>({t})};
  if(id==='@react-native-async-storage/async-storage')return storage;
  if(id==='@/queries/learning')return learning;
  if(id==='@/lib/supabase')return {supabaseUrl:'https://local.example',supabase:{}};
  if(id==='@/lib/alert')return {AppAlert:{alert:(_title,_msg,buttons)=>buttons?.at(-1)?.onPress?.()}};
  if(id.startsWith('@/'))return load(id.slice(2)+'.ts');
  return require(id);
 };
 vm.runInNewContext(`(function(require,module,exports){${source}\n})`,{console,Date,setTimeout,clearTimeout,setInterval,clearInterval})(req,mod,mod.exports);
 return mod.exports;
}
(async()=>{
 const progression=load('queries/quizProgression.ts');
 const drafts=load('lib/quizDraft.ts');
 const {useQuizPersistence}=load('hooks/useQuizPersistence.ts');
 let current,tree;
 let progress=(await progression.fetchQuizProgression('u','b'))[0];
 function Harness(){current=useQuizPersistence({userId:'u',batchId:'b',progress});return null;}
 await act(async()=>{tree=create(React.createElement(Harness));});
 for(let i=0;i<30;i++)await act(async()=>{await current.persist({answers:Object.fromEntries(Array.from({length:i+1},(_,j)=>['q'+j,j%2===0])),current_question:i+1,completed:false});});
 const beforeCorrection=await drafts.readQuizDraft('u','b');
 await act(async()=>{await current.persist({answers:{...beforeCorrection.answers,q0:false},current_question:1,completed:false});});
 assert.equal(opens,1);assert.equal(networkSubmissions,0,'answers/navigation never call a remote save');
 const local=await drafts.readQuizDraft('u','b');
 assert.equal(local.answers.q0,false);assert.equal(local.first_answers.q0,true,'first answer survives a correction');
 assert.equal(local.current_question,1);
 await act(async()=>{tree.unmount();});
 // A reload restores the same device draft; a network failure can still resume it.
 offline=true;
 progress=(await progression.fetchQuizProgression('u','b'))[0];
 assert.equal(progress.answers.q0,false);assert.equal(progress.current_question,1);
 await assert.rejects(()=>progression.fetchQuizProgression('other-user','b'),/network/);
 offline=false;
 progress=(await progression.fetchQuizProgression('u','b'))[0];
 await act(async()=>{tree=create(React.createElement(Harness));});
 const beforeWrites=serverWrites;
 lostResponse=true;
 await act(async()=>{assert.equal(await current.persist({answers:progress.answers,current_question:30,completed:true}),false);});
 assert.equal(serverWrites,beforeWrites+1);
 assert.equal((await drafts.readQuizDraft('u','b')).pending_submission,true);
 const sealed=plain(payloads.at(-1));
 // A pending receipt cannot be replaced by a new answer or restarted.
 await act(async()=>{assert.equal(await current.persist({answers:{q0:true},current_question:1,completed:false}),false);});
 await act(async()=>{assert.equal(await current.restart(),false);});
 await act(async()=>{assert.equal(await current.retry(),true);});
 assert.equal(serverWrites,beforeWrites+1,'lost HTTP response retries do not double finalize');
 assert.deepEqual(plain(payloads.at(-1)),sealed,'retry uploads the exact same immutable receipt');
 assert.equal(current.finalizedSession.completed,true);
 assert.equal((await drafts.readQuizDraft('u','b')).pending_submission,false);
 await act(async()=>{assert.equal(await current.restart(),true);});
 assert.deepEqual(plain((await drafts.readQuizDraft('u','b')).answers),{});
 await act(async()=>{tree.unmount();});
 // Storage failure blocks a final upload before there is a durable receipt.
 progress=(await progression.fetchQuizProgression('u','b'))[0];
 await act(async()=>{tree=create(React.createElement(Harness));});
 const beforeFailure=networkSubmissions;storageFails=true;
 await act(async()=>{assert.equal(await current.persist({answers:{r:true},current_question:1,completed:true}),false);});
 assert.equal(networkSubmissions,beforeFailure);
 storageFails=false;await act(async()=>{assert.equal(await current.retry(),true);});
 await act(async()=>{tree.unmount();});
 // Pending submissions survive an app restart and retry when the app becomes active.
 progress=(await progression.fetchQuizProgression('u','b'))[0];
 await act(async()=>{tree=create(React.createElement(Harness));});
 await act(async()=>{assert.equal(await current.restart(),true);});
 await act(async()=>{await current.persist({answers:{offline:true},current_question:1,completed:false});});
 offline=true;
 await act(async()=>{assert.equal(await current.persist({answers:{offline:true},current_question:1,completed:true}),false);});
 await act(async()=>{tree.unmount();});
 progress=(await progression.fetchQuizProgression('u','b'))[0];
 assert.equal(progress.learning_draft.pending_submission,true);
 await act(async()=>{tree=create(React.createElement(Harness));});
 offline=false;
 await act(async()=>{for(const listener of listeners)listener('active');});
 assert.equal(current.finalizedSession.completed,true);
 assert.equal((await drafts.readQuizDraft('u','b')).pending_submission,false);
 await act(async()=>{tree.unmount();});
 // A different remote state is never overwritten silently on resume.
 let conflict=(await progression.fetchQuizProgression('u','conflict'))[0];
 conflict.learning_draft=drafts.checkpointQuizDraft(conflict.learning_draft,{q:false},2,'it',null);
 await drafts.writeQuizDraft(conflict.learning_draft);
 sessions.set('conflict',{...sessions.get('conflict'),answers:{q:true},revision:1});
 await assert.rejects(()=>progression.fetchQuizProgression('u','conflict'),/attempt_conflict/);
 assert.equal((await drafts.readQuizDraft('u','conflict')).answers.q,false);
 // Exercise the actual practice hook and its JSX previous-button wiring.
 const {useQuizSession}=load('hooks/useQuizSession.ts');
 const qprogress=(await progression.fetchQuizProgression('u','quiz'))[0];
 const options={userId:'u',batchId:'quiz',questions:[{id:'q',is_correct:true},{id:'r',is_correct:true}],progress:[qprogress],progressLoading:false,loadedBatchId:'quiz',refreshProgression:()=>{}};
 function QuizHarness(){current=useQuizSession(options);return null;}
 const callsBeforeQuiz=networkSubmissions;
 await act(async()=>{tree=create(React.createElement(QuizHarness));});
 await act(async()=>{current.answer(false);});
 await act(async()=>{current.next();});
 await act(async()=>{current.answer(true);});
 await act(async()=>{current.previous();});
 assert.equal(current.currentQuestionIndex,0);
 const beforeFirstPrevious=networkSubmissions;
 await act(async()=>{current.previous();});
 assert.equal(current.currentQuestionIndex,0);assert.equal(networkSubmissions,beforeFirstPrevious);
 await act(async()=>{current.next();});
 assert.equal(networkSubmissions,callsBeforeQuiz);
 await act(async()=>{current.next();});
 assert.equal(current.quizCompleted,true);assert.equal(networkSubmissions,callsBeforeQuiz+1);
 await act(async()=>{tree.unmount();});
 const screen=ts.createSourceFile('quiz.tsx',fs.readFileSync(path.join(__dirname,'../app/quiz.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let disabledExpression;
 function visit(node){
  if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(screen)==='QuizBottomNav')disabledExpression=node.attributes.properties.find(p=>p.name?.getText(screen)==='previousDisabled')?.initializer?.expression?.getText(screen);
  ts.forEachChild(node,visit);
 }
 visit(screen);
 for(const [index,expected] of [[0,true],[1,false],[29,false]])assert.equal(vm.runInNewContext(disabledExpression,{quiz:{currentQuestionIndex:index}}),expected);
 // Exam answers auto-advance locally; only final submission reaches the database.
 const examProgress=(await progression.fetchQuizProgression('u','exam'))[0];
 examProgress.learning_draft.session.mode='exam';examProgress.learning_draft.session.deadline_at=new Date(Date.now()+120000).toISOString();
 const {useExamSession}=load('hooks/useExamSession.ts');
 function ExamHarness(){current=useExamSession({...options,batchId:'exam',loadedBatchId:'exam',progress:[examProgress]});return null;}
 const callsBeforeExam=networkSubmissions;
 await act(async()=>{tree=create(React.createElement(ExamHarness));});
 await act(async()=>{current.answer(false);});await act(async()=>{current.answer(true);});
 assert.equal(networkSubmissions,callsBeforeExam);
 await act(async()=>{current.attemptSubmit();});
 assert.equal(current.quizCompleted,true);assert.equal(networkSubmissions,callsBeforeExam+1);
 await act(async()=>{tree.unmount();});
 // A deadline reached while closed submits the locally saved answers on reopen.
 const expiredProgress=(await progression.fetchQuizProgression('u','expired-exam'))[0];
 expiredProgress.learning_draft.session.mode='exam';
 expiredProgress.learning_draft.session.deadline_at=new Date(Date.now()-2000).toISOString();
 expiredProgress.learning_draft.answers={q:false};
 expiredProgress.learning_draft.first_answers={q:false};
 const oldStamp=new Date(Date.now()-5000).toISOString();
 expiredProgress.learning_draft.first_answered_at={q:oldStamp};expiredProgress.learning_draft.answered_at={q:oldStamp};
 expiredProgress.answers={q:false};
 function ExpiredHarness(){current=useExamSession({...options,batchId:'expired-exam',loadedBatchId:'expired-exam',progress:[expiredProgress]});return null;}
 const frozen=drafts.checkpointQuizDraft(expiredProgress.learning_draft,{q:true,r:true},2,'it',null);
 assert.equal(frozen.answers.q,false);assert.equal(frozen.answers.r,undefined,'late answers never replace the last valid local snapshot');
 const beforeExpiry=networkSubmissions;
 await act(async()=>{tree=create(React.createElement(ExpiredHarness));});
 assert.equal(networkSubmissions,beforeExpiry+1);assert.equal(current.quizCompleted,true);
 assert.equal(payloads.at(-1).answers.q,false);
 await act(async()=>{tree.unmount();});
 const {validExamDate,learningSuggestion,formatLearningGrade}=load('lib/learning.ts');
 assert.equal(formatLearningGrade(83,'it'),'8,3/10');assert.equal(formatLearningGrade(0,'it'),'1/10');assert.equal(formatLearningGrade(null,'it'),'—');
 const {QuizSaveStatus}=load('components/quiz/QuizSaveStatus.tsx');
 for(const state of ['saved','pending','error'])assert.equal(QuizSaveStatus({state,onRetry:()=>{}}),null);
 assert.equal(validExamDate('2026-02-30'),false);assert.equal(validExamDate('2028-02-29'),true);
 assert.equal(learningSuggestion({resume:{batch_id:'b',mode:'exam'},categories:[],readiness:{enough:false}}).kind,'resume');
 await drafts.clearQuizDrafts('u');
 assert.equal((await storage.getAllKeys()).filter(key=>key.includes(':u:')).length,0);
 console.log('PASS: no per-answer RPC, local first/final answers, offline resume, account isolation, lost-response retry, immutable receipt, restart, storage failure, remote conflict, practice/exam final-only submission, previous navigation, hidden banner, 1–10 grade');
})().catch(error=>{console.error(error);process.exitCode=1;});
