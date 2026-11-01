// Run with LEARNING_TEST_MODULES pointing to an isolated React/test-renderer installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const base=process.env.LEARNING_TEST_MODULES;
const React=require(base ? path.join(base,'react') : 'react');
const {create,act}=require(base ? path.join(base,'react-test-renderer') : 'react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const writes=[];
let fail=false;
let server={attempt_id:'one',revision:0,answers:{},completed:false,deadline_at:null};
const learning={
 openLearningAttempt:async()=>({...server}),
 saveLearningProgress:async(batch,session,answers,current,completed)=>{
   if(fail) throw Error('network');
   assert.equal(session.revision,server.revision);
   server={...server,revision:server.revision+1,answers,completed};
   writes.push({answers,current,completed}); return {...server};
 },
};
const t=x=>x;
const modules={};
function load(file){
 if(modules[file])return modules[file].exports;
 const mod={exports:{}};modules[file]=mod;
 const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const req=id=>{
  if(id==='react')return React;
  if(id==='react-i18next')return {useTranslation:()=>({t})};
  if(id==='@/queries/learning')return learning;
  if(id==='@/lib/alert')return {AppAlert:{alert:(title,msg,buttons)=>buttons?.at(-1)?.onPress?.()}};
  if(id.startsWith('@/'))return load(id.slice(2)+'.ts');
  return require(id);
 };
 vm.runInNewContext(`(function(require,module,exports){${source}\n})`,{console,setTimeout,clearTimeout,setInterval,clearInterval})(req,mod,mod.exports);
 return mod.exports;
}
(async()=>{
 const {useQuizPersistence}=load('hooks/useQuizPersistence.ts');
 let current;function Harness(){current=useQuizPersistence({userId:'u',batchId:'b'});return null;}
 let tree;await act(async()=>{tree=create(React.createElement(Harness));});
 await act(async()=>{current.setPersistedKey({answers:{},current_question:1,completed:false});});
 // Concurrent UI actions must serialize against the revision returned by the preceding write.
 await act(async()=>{await Promise.all([
  current.persist({answers:{q:false},current_question:1,completed:false}),
  current.persist({answers:{q:false,r:true},current_question:2,completed:false}),
 ]);});
 assert.equal(writes.length,2);assert.equal(server.revision,2);assert.equal(current.saveState,'saved');
 fail=true;
 await act(async()=>{await current.persist({answers:{q:false,r:true,s:false},current_question:3,completed:false});});
 assert.equal(current.saveState,'error');
 await act(async()=>{await current.persist({answers:{q:false,r:true,s:false,t:true},current_question:4,completed:false});});
 assert.equal(writes.length,2,'later states cannot overtake failed first answers');
 fail=false;await act(async()=>{assert.equal(await current.retry(),true);});
 assert.equal(writes.length,4);assert.equal(server.answers.t,true);assert.equal(current.saveState,'saved');
 await act(async()=>{tree.unmount();});
 // Hydrating existing answers must not schedule a stale empty reset.
 server={attempt_id:'two',revision:0,answers:{q:false},completed:false,deadline_at:null};writes.length=0;
 const {useQuizSession}=load('hooks/useQuizSession.ts');
 const options={userId:'u',batchId:'b2',questions:[{id:'q',is_correct:true},{id:'r',is_correct:true}],progress:[{answers:{q:false},current_question:2,completed:false}],progressLoading:false,loadedBatchId:'b2',refreshProgression:()=>{}};
 function QuizHarness(){current=useQuizSession(options);return null;}
 await act(async()=>{tree=create(React.createElement(QuizHarness));});
 assert.equal(writes.length,0);assert.equal(current.currentQuestionIndex,1);assert.equal(current.answers.q,false);
 await act(async()=>{current.answer(true);});
 assert.equal(writes.length,1);assert.equal(server.answers.r,true);
 await act(async()=>{current.previous();});
 assert.equal(current.currentQuestionIndex,0,'previous returns to the preceding question');
 const writesAtFirst=writes.length;
 await act(async()=>{current.previous();});
 assert.equal(current.currentQuestionIndex,0,'previous never moves before the first question');
 assert.equal(writes.length,writesAtFirst,'first-question previous does not write');
 await act(async()=>{current.next();});
 assert.equal(current.currentQuestionIndex,1);
 // Exercise the actual screen prop as well as the hook: the regression was in JSX wiring.
 const screen=ts.createSourceFile('quiz.tsx',fs.readFileSync(path.join(__dirname,'../app/quiz.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let disabledExpression;
 function visit(node){
  if(ts.isJsxSelfClosingElement(node) && node.tagName.getText(screen)==='QuizBottomNav') {
   const prop=node.attributes.properties.find(p=>p.name?.getText(screen)==='previousDisabled');
   disabledExpression=prop?.initializer?.expression?.getText(screen);
  }
  ts.forEachChild(node,visit);
 }
 visit(screen);
 assert.ok(disabledExpression,'active quiz navigation must declare its disabled condition');
 for(const [index,expected] of [[0,true],[1,false],[29,false]]) {
  assert.equal(vm.runInNewContext(disabledExpression,{quiz:{currentQuestionIndex:index}}),expected,`actual navigation prop at question index ${index}`);
 }

 await act(async()=>{current.next();});
 assert.equal(current.quizCompleted,true);assert.equal(server.completed,true);
 await act(async()=>{tree.unmount();});
 const {validExamDate,learningSuggestion,formatLearningGrade}=load('lib/learning.ts');
 assert.equal(formatLearningGrade(83,'it'),'8,3/10');
 assert.equal(formatLearningGrade(83,'es'),'8,3/10');
 assert.equal(formatLearningGrade(100,'it'),'10/10');
 assert.equal(formatLearningGrade(0,'it'),'1/10');
 assert.equal(formatLearningGrade(5,'it'),'1/10');
 assert.equal(formatLearningGrade(null,'it'),'—');
 const {QuizSaveStatus}=load('components/quiz/QuizSaveStatus.tsx');
 for(const state of ['saved','pending','error']) assert.equal(QuizSaveStatus({state,onRetry:()=>{throw Error('unexpected retry');}}),null);
 assert.equal(validExamDate('2026-02-30'),false);assert.equal(validExamDate('2028-02-29'),true);
 assert.equal(learningSuggestion({resume:{batch_id:'b',mode:'exam'},categories:[],readiness:{enough:false}}).kind,'resume');
 console.log('PASS: serialized saves, failure/retry ordering, hydration without reset, first answer, previous navigation and JSX disabled state, finalization, date validation, resume priority, hidden save banner, 1–10 localized grade');
})().catch(error=>{console.error(error);process.exitCode=1;});
