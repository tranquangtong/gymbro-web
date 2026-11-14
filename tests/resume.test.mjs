import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createResumeRetry} from '../src/data/resume-retry.js';

// Exercise the app's resume controller without booting its DOM/Firebase imports.
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const controller=app.slice(app.indexOf('let resumeInFlight='),app.indexOf("window.addEventListener('online',resumeFirebase)"));
function setup(){
  const calls=[],dialogs={open:false,addEventListener:(event,run)=>{dialogs.onclose=run;}},repo={ownerUid:'owner',uid:'owner',s:{sessionExpiresAt:Date.now()+3600000},load:async options=>{calls.push(options);return {WebProfile:[]};}};
  const state={mode:'firebase',connected:true,initialized:true,repo};
  const timers=[];let context;const resumeRetry=createResumeRetry({run:()=>context.resume(),visible:()=>context.document.visibilityState!=='hidden',blocked:()=>dialogs.open||state.busy,setTimer:(run,ms)=>{const t={run,ms};timers.push(t);return t;},clearTimer:t=>{t.cancelled=true;}});
  context=vm.createContext({authVersion:0,resumeRetry,state,document:{visibilityState:'visible'},$:()=>dialogs,sessionValid:()=>true,expireSession:()=>assert.fail('valid session'),restoreFirebase:()=>assert.fail('already connected'),activateFirebase:()=>assert.fail('already initialized'),latestProfile:()=>({}),liveSync:{stop:()=>calls.push('stop'),start:r=>{assert.equal(r,repo);calls.push('start');}},updateLocalPending:async()=>{},render:()=>{}});
  vm.runInContext(controller+'\nglobalThis.resume=resumeFirebase;globalThis.hideAt=t=>{hiddenAt=t;};',context);
  return {context,calls,dialogs,state,repo,resumeRetry,timers};
}

test('long background resume forces fresh data and restarts live sync; short resume uses cache',async()=>{
  const {context,calls}=setup();
  context.hideAt(Date.now()-6*60000);await context.resume();
  assert.equal(calls[0],'stop');assert.equal(calls[1].force,true);assert.equal(calls[2],'start');
  calls.length=0;context.hideAt(Date.now()-60000);await context.resume();
  assert.equal(calls[0].force,false);assert.equal(calls[1],'start');
});

test('resume defers refresh while a dialog is open and retains the long sleep deadline',async()=>{
  const {context,calls,dialogs,resumeRetry}=setup();
  context.hideAt(Date.now()-6*60000);dialogs.open=true;await context.resume();assert.equal(calls.length,0);
  dialogs.open=false;dialogs.onclose();await context.resume();assert.equal(calls[1].force,true);
});

test('failed resume shows error and releases its guard for a later forced retry',async()=>{
  const {context,calls,state,repo}=setup();
  context.hideAt(Date.now()-6*60000);const load=repo.load;repo.load=async()=>{throw Error('Không kết nối được máy chủ.');};
  await context.resume();assert.match(state.connectionError,/Không kết nối/);
  repo.load=load;calls.length=0;await context.resume();
  assert.equal(calls[1].force,true);assert.equal(state.connectionError,'');assert.equal(calls[2],'start');
});

test('failed resumes back off while visible and cancel on success, hide or logout',async()=>{
 const {context,repo,resumeRetry,timers,state,calls}=setup(),load=repo.load;
 repo.load=async()=>{throw Error('offline');};
 await context.resume();for(const delay of [5000,15000,30000,60000,60000]){assert.equal(timers.at(-1).ms,delay);await timers.at(-1).run();}
 repo.load=load;await context.resume();assert.equal(timers.at(-1).cancelled,true);assert.equal(state.connectionError,'');assert.equal(calls.at(-1),'start');
 resumeRetry.failed();assert.equal(timers.at(-1).ms,5000);resumeRetry.pause();assert.equal(timers.at(-1).cancelled,true);
 context.document.visibilityState='hidden';const count=timers.length;resumeRetry.failed();assert.equal(timers.length,count);
 context.document.visibilityState='visible';resumeRetry.reset();resumeRetry.closed();assert.equal(timers.length,count);
});

test('cached initial load failures schedule retry and dialog close is wired for all dialogs',async()=>{
 const {context,state,timers}=setup();state.initialized=false;state.cached={};
 context.activateFirebase=async()=>{throw Error('offline');};await context.resume();assert.equal(timers[0].ms,5000);
 assert.match(app,/for\(const id of \['#editor','#confirm-dialog','#quick-dialog'\]\).*addEventListener\('close'/);
 assert.match(app,/if\(a==='retry-connect'\)\{toast\([^)]*\);return resumeFirebase\(\);\}/);
});

test('an in-flight load finishing in background does not restart live sync',async()=>{
 const {context,repo,calls}=setup();let finish;repo.load=()=>new Promise(resolve=>finish=resolve);
 const resumed=context.resume();context.document.visibilityState='hidden';finish({WebProfile:[]});await resumed;assert.equal(calls.includes('start'),false);
 context.document.visibilityState='visible';repo.load=async()=>({WebProfile:[]});await context.resume();assert.equal(calls.includes('start'),true);
});

test('network restore keeps the current user on a retry card, then restores without login popup',async()=>{
 const {SESSION_MS,accessStage,sessionValid}=await import('../src/data/access.js');
 const source=app.slice(app.indexOf('let restoreTask='),app.indexOf('async function selectImport'));
 let offline=true,activations=0,watches=0,retries=0;
 const service={auth:{currentUser:{uid:'owner',metadata:{lastSignInTime:new Date().toISOString()}}},authSDK:{onAuthStateChanged:()=>{watches++;return ()=>{};}}};
 const state={mode:'firebase',connected:false,initialized:false};
 const context=vm.createContext({authVersion:0,authWatch:null,state,SESSION_MS,sessionValid,firebaseService:async()=>service,boot:{mark:()=>{}},render:()=>{},verifySession:async()=>{if(offline)throw Object.assign(Error('offline'),{code:'auth/network-request-failed'});},firebaseError:e=>e.message,resumeRetry:{failed:()=>retries++,reset:()=>{}},activateFirebase:async s=>{assert.equal(s,service);activations++;state.repo={uid:'owner',s:{sessionExpiresAt:Date.now()+SESSION_MS}};state.connected=true;state.initialized=true;}});
 const helper=app.slice(app.indexOf('function keepForRetry('),app.indexOf('async function activateFirebase('));context.TRANSIENT=['unavailable','auth/network-request-failed'];
 vm.runInContext(helper+source+'\nglobalThis.restore=restoreFirebase;',context);
 await context.restore();assert.equal(accessStage(state),'error');assert.equal(state.retrySession.service,service);assert.equal(state.connected,false);assert.equal(retries,1);assert.equal(activations,0);
 offline=false;await context.restore();assert.equal(watches,1);assert.equal(activations,1);
});

test('login errors preserve the in-app browser instructions and escape the small note',()=>{
 const source=app.slice(app.indexOf('function loginPage()'),app.indexOf('function profileGate()'));
 const ctx=vm.createContext({state:{connectionError:'<popup closed>'},inAppBrowser:()=> 'Zalo',platformOf:()=> 'ios',esc:v=>v.replaceAll('<','&lt;').replaceAll('>','&gt;'),externalOpenUrl:()=>'',location:{href:''},icon:()=>'',appLink:()=>'',button:()=>''});
 vm.runInContext(source+'\nglobalThis.page=loginPage;',ctx);
 assert.match(ctx.page(),/inapp-card/);assert.match(ctx.page(),/Mở bằng Safari/);assert.match(ctx.page(),/form-note.*&lt;popup closed&gt;/);
});

test('restore: revoked tokens sign out without retry; signed-out network failures are not retried',async()=>{
 const {SESSION_MS,sessionValid}=await import('../src/data/access.js');
 const source=app.slice(app.indexOf('let restoreTask='),app.indexOf('async function selectImport'));
 const helper=app.slice(app.indexOf('function keepForRetry('),app.indexOf('async function activateFirebase('));
 for(const [name,user,verifyError,serviceError] of [
  ['revoked',{uid:'owner',metadata:{lastSignInTime:new Date().toISOString()}},{code:'auth/user-token-expired'},null],
  ['signed-out offline',null,null,{code:'unavailable'}]]){
  let retries=0,signedOut=0;
  const service={auth:{currentUser:user},authSDK:{onAuthStateChanged:()=>()=>{},signOut:async()=>{signedOut++;service.auth.currentUser=null;}}};
  const state={mode:'firebase',connected:false,initialized:false};
  const context=vm.createContext({authVersion:0,authWatch:null,state,SESSION_MS,sessionValid,TRANSIENT:['unavailable','auth/network-request-failed'],withTimeout:run=>run(),
   firebaseService:async()=>{if(serviceError)throw Object.assign(Error('offline'),serviceError);return service;},boot:{mark:()=>{}},render:()=>{},dropCache:()=>{},emptyData:()=>({}),
   verifySession:async()=>{if(verifyError)throw Object.assign(Error('revoked'),verifyError);},firebaseError:e=>e.message,resumeRetry:{failed:()=>retries++,reset:()=>{}},activateFirebase:async()=>assert.fail('must not activate')});
  vm.runInContext(helper+source+'\nglobalThis.restore=restoreFirebase;',context);
  await context.restore();
  assert.equal(retries,0,name);assert.equal(state.retrySession,undefined,name);
  if(name==='revoked')assert.equal(signedOut,1);
 }
});

test('a retry deferred while busy runs once the page is free again',async()=>{
 const {createResumeRetry}=await import('../src/data/resume-retry.js');
 let busy=true,runs=0;const timers=[];
 const retry=createResumeRetry({run:()=>runs++,visible:()=>true,blocked:()=>busy,setTimer:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimer:()=>{}});
 retry.defer();assert.equal(timers.length,1);assert.equal(timers[0].ms,5000);
 timers.shift().fn();assert.equal(runs,0);assert.equal(timers.length,1);// still busy: re-armed
 busy=false;timers.shift().fn();assert.equal(runs,1);assert.equal(timers.length,0);
});

test('connect keeps a retry card when the popup succeeds but token verification hits the network',()=>{
 assert.match(app,/async function connect\(.*catch\(e\)\{state\.connectionError=firebaseError\(e\);if\(keepForRetry\(await firebaseService\(\)\.catch\(\(\)=>null\),e\)\)resumeRetry\.failed\(\);/);
 const helper=app.slice(app.indexOf('function keepForRetry('),app.indexOf('async function activateFirebase('));
 return import('../src/data/access.js').then(({SESSION_MS,sessionValid})=>{
  const state={mode:'firebase',connected:false,repo:null};
  const ctx=vm.createContext({state,SESSION_MS,sessionValid,TRANSIENT:['unavailable','auth/network-request-failed']});
  vm.runInContext(helper+'\nglobalThis.keep=keepForRetry;',ctx);
  const service={auth:{currentUser:{uid:'owner',metadata:{lastSignInTime:new Date().toISOString()}}}};
  assert.equal(ctx.keep(service,{code:'unavailable'}),true);assert.equal(state.retrySession.service,service);
  state.retrySession=null;assert.equal(ctx.keep(service,{code:'auth/popup-closed-by-user'}),false);assert.equal(state.retrySession,null);
  assert.equal(ctx.keep(null,{code:'unavailable'}),false);
 });
});
