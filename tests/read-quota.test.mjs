import test from 'node:test';
import assert from 'node:assert/strict';
import {FirebaseRepository,firebaseError} from '../firebase.js';
import {createLiveSync} from '../sync.js';
import {quotaMessage} from '../errors.js';
import {parseMeals} from '../quick.js';
function service(){
 const storage=new Map(),streams=new Map(),stats={queries:0,reads:0,writes:0,stops:0};
 const s={sessionExpiresAt:Number.MAX_SAFE_INTEGER,auth:{currentUser:{uid:'owner',email:'owner@example.test'}},db:{},dbSDK:{
  collection:(_, ...path)=>path.join('/'),doc:(_, ...path)=>path.join('/'),
  getDocsFromServer:async path=>{stats.queries++;return {docs:[...storage].filter(([key])=>key.slice(0,key.lastIndexOf('/'))===path).map(([key,row])=>({id:key.split('/').at(-1),data:()=>row}))};},
  onSnapshot:(path,options,next,error)=>{streams.set(path,{next,error});return ()=>stats.stops++;},
  runTransaction:async(_,callback)=>callback({get:async path=>{stats.reads++;return {exists:()=>storage.has(path),data:()=>storage.get(path)};},set:(path,row)=>{stats.writes++;storage.set(path,row);}})
 }};return {s,storage,streams,stats};
}
test('Repeated loads and confirmed saves reuse memory without refetching every collection',async()=>{
 const {s,storage,stats}=service(),repo=new FirebaseRepository(s),meal=parseMeals('1 chuối',{date:'2026-10-31'})[0];
 await Promise.all([repo.load(),repo.load()]);assert.equal(stats.queries,4,'simultaneous initial loads share one fetch');
 await repo.saveMany('WebMeals',[meal]);assert.equal(stats.reads,1);assert.equal(stats.writes,1);
 const a=await repo.load();assert.equal(a.WebMeals[0].id,meal.id);a.WebMeals[0].food='MUTATED';
 assert.equal((await repo.load()).WebMeals[0].food,meal.food);assert.equal(stats.queries,4);
 await repo.save('WebMeals',{...meal,notes:'changed',updated_at:'2026-10-31T10:00:00Z',_originalUpdatedAt:meal.updated_at});assert.equal((await repo.load()).WebMeals[0].notes,'changed');assert.equal(stats.queries,4);
 await repo.load({force:true});assert.equal(stats.queries,8,'only explicit refresh refetches history');
 const other=new FirebaseRepository({...s,auth:{currentUser:{uid:'other'}}});assert.equal((await other.load()).WebMeals.length,0,'cache must never cross accounts');
});
test('Confirmed realtime data updates cached reads; stopped listeners cannot replace cached data',async()=>{
 const {s,streams,stats}=service(),repo=new FirebaseRepository(s);await repo.load();const stop=repo.subscribe(()=>{},()=>{});
 const stream=streams.get('users/owner/WebMeals'),meal=parseMeals('1 trứng luộc',{date:'2026-10-31'})[0];
 stream.next({metadata:{fromCache:false},docs:[{id:meal.id,data:()=>meal}]});assert.equal((await repo.load()).WebMeals[0].id,meal.id);assert.equal(stats.queries,4);
 stream.next({metadata:{fromCache:false,hasPendingWrites:true},docs:[]});assert.equal((await repo.load()).WebMeals.length,1,'unconfirmed local snapshots are ignored');
 stop();stream.next({metadata:{fromCache:false},docs:[]});assert.equal((await repo.load()).WebMeals.length,1);
});
test('Returning to the same active repository does not restart/bill a new listener lease',()=>{
 let starts=0,stops=0,fail;const repo={subscribe:(next,error)=>{starts++;fail=error;return ()=>stops++;}};
 const sync=createLiveSync({isCurrent:r=>r===repo,onRows:()=>{},onError:()=>{}});
 sync.start(repo);sync.start(repo);sync.start(repo);assert.equal(starts,1);assert.equal(stops,0);
 fail(Error('network'));assert.equal(stops,1);sync.start(repo);assert.equal(starts,2,'failed stream can reconnect');sync.stop();sync.start(repo);assert.equal(starts,3,'pagehide stop can reconnect');
});
test('Remote quota errors preserve their code and are distinct from browser storage quota',async()=>{
 const remote={code:'resource-exhausted',name:'FirebaseError',message:'Quota exceeded.'};
 assert.match(firebaseError(remote),/Firestore/);assert.match(firebaseError(remote),/không đồng nghĩa/);
 assert.match(quotaMessage({name:'QuotaExceededError',message:'Quota exceeded.'}),/trình duyệt/);assert.match(quotaMessage({message:'Quota exceeded.'}),/Chưa xác định/);
 const {s}=service();s.dbSDK.getDocsFromServer=async()=>{throw remote;};const repo=new FirebaseRepository(s);
 await assert.rejects(()=>repo.load(),e=>e.code==='resource-exhausted'&&/Firestore/.test(e.message));
});
