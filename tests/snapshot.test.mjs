import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppEnv} from './app-env.mjs';
import {writeSnapshot,readSnapshot,clearSnapshot,SNAPSHOT_KEY,SNAPSHOT_MAX_BYTES} from '../src/data/snapshot.js';
import {accessStage} from '../src/data/access.js';
import {loadCurrentData,localMissingCount} from '../src/data/sync.js';

const memory=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),m};};
const now=1_800_000_000_000,later=now+3600_000;
const data={WebMeals:[{id:'m1',date:'2026-11-05',kcal:500}],WebWorkouts:[],WebProfile:[{id:'p',date:'2026-11-01'}]};

test('Snapshot round-trips for a valid session and fills missing tables',()=>{
  const s=memory();
  assert.equal(writeSnapshot(s,{uid:'u1',sessionExpiresAt:later,data},now),true);
  assert.equal(Object.hasOwn(JSON.parse(s.getItem(SNAPSHOT_KEY)).data,'Archive'),false);
  const snap=readSnapshot(s,now+1000);
  assert.equal(snap.uid,'u1');assert.deepEqual(snap.data.WebMeals,data.WebMeals);assert.deepEqual(snap.data.Archive,[]);
});

test('Snapshot can read legacy Archive rows for the cached archive page',()=>{
  const s=memory(),Archive=[{id:'a1',date:'2026-11-05',type:'report',title:'Báo cáo',payload:{notes:'Tập luyện'}}];
  s.setItem(SNAPSHOT_KEY,JSON.stringify({v:1,uid:'u1',sessionExpiresAt:later,data:{...data,Archive}}));
  assert.deepEqual(readSnapshot(s,now).data.Archive,Archive);
  assert.equal(writeSnapshot(s,{uid:'u1',sessionExpiresAt:later,data:{...data,Archive}},now),true);
  assert.deepEqual(readSnapshot(s,now).data.Archive,Archive);
});

test('Archive route shows cached rows while loading and swaps to the live rows on arrival',async()=>{
  const cached={id:'cached',date:'2026-11-05',type:'report',title:'Cached report',payload:{}};
  const live={...cached,id:'live',title:'Live report'};
  let requests=0,release;
  const repo={uid:'u1',ownerUid:'u1',s:{auth:{currentUser:{uid:'u1'}}},ensureArchive:()=>{requests++;return new Promise(resolve=>{release=resolve;});}};
  const {ctx,state,events,nodes}=createAppEnv({isAdmin:()=>false,setTimeout:()=>1,clearTimeout(){}});
  Object.assign(state,{connected:true,initialized:true,repo,data:{...data,Archive:[cached]}});
  ctx.location.hash='#settings';
  await ctx.showRouteArchive();
  assert.equal(requests,0);
  ctx.location.hash='#archive';
  const opened=events.hashchange();
  assert.match(nodes['#main'].innerHTML,/Cached report/);
  assert.equal(requests,1);
  release([live]);
  await opened;
  assert.match(nodes['#main'].innerHTML,/Live report/);
  assert.doesNotMatch(nodes['#main'].innerHTML,/Cached report/);
});

test('an admin sees an empty Archive only after its owner-specific request succeeds',async()=>{
  const {ctx,state,events,nodes}=createAppEnv({isAdmin:()=>true,setTimeout:()=>1,clearTimeout(){}});
  const repo={uid:'admin',ownerUid:'other',s:{auth:{currentUser:{uid:'admin'}}},archiveStatus:'unloaded'};
  let fail;
  repo.ensureArchive=()=>new Promise((_,reject)=>{fail=()=>{repo.archiveStatus='error';reject(Error('offline'));};});
  nodes['#toast']={};
  Object.assign(state,{connected:true,initialized:true,repo,data:{...data,Archive:[]}});
  ctx.location.hash='#archive';
  const opened=events.hashchange();
  assert.match(nodes['#main'].innerHTML,/Đang tải tư liệu/);
  assert.doesNotMatch(nodes['#main'].innerHTML,/Chưa có dữ liệu|0 mục/);
  fail();await opened;
  assert.match(nodes['#main'].innerHTML,/Chưa tải được tư liệu.*Thử lại/);
  assert.doesNotMatch(nodes['#main'].innerHTML,/Chưa có dữ liệu/);
  repo.ensureArchive=async()=>{repo.archiveStatus='ready';return [];};
  await ctx.showRouteArchive();
  assert.match(nodes['#main'].innerHTML,/Chưa có dữ liệu/);
});

test('a delayed Archive read cannot populate another owner after an admin switches',async()=>{
  const {ctx,state}=createAppEnv({isAdmin:()=>true});
  let finish;
  const admin={uid:'admin'},repo={ownerUid:'A',s:{auth:{currentUser:admin}},ensureArchive:()=>new Promise(resolve=>{finish=resolve;})};
  Object.assign(state,{connected:true,initialized:true,repo,data:{Archive:[]}});
  const editing=ctx.archiveForEdit();
  state.repo={...repo,ownerUid:'B'};
  finish([{id:'private-A'}]);
  assert.equal(await editing,false);
  assert.deepEqual(state.data.Archive,[]);
});

test('pending local Archive rows are compared to the server only when the device has any',async()=>{
  let reads=0;const device={Archive:[]};
  const {ctx,state}=createAppEnv({localStorage:memory(),LocalRepository:class{async load(){return device;}},localMissingCount,setTimeout:()=>1,clearTimeout(){}});
  const repo={uid:'u',ownerUid:'u',s:{auth:{currentUser:{uid:'u'}}},ensureArchive:async()=>{reads++;return [{id:'on-server'}];}};
  Object.assign(state,{connected:true,initialized:true,repo,data:{Archive:[]}});
  await ctx.updateLocalPending();assert.equal(reads,0);
  device.Archive=[{id:'on-server'},{id:'only-on-device'}];
  await ctx.updateLocalPending();assert.equal(reads,1);assert.equal(state.localPending,1);
});

test('App renders leave the snapshot timer alone while data loads debounce a write',async()=>{
  const s=memory(),timers=[];
  const repo={uid:'u1',ownerUid:'u1',s:{sessionExpiresAt:later,auth:{currentUser:{uid:'u1',displayName:'GymBro'}}},load:async()=>data,ensureRange:async()=>null};
  const {ctx,state}=createAppEnv({localStorage:s,loadCurrentData,accessStage:()=>'profile',
    writeSnapshot:(storage,value)=>writeSnapshot(storage,value,now),clearSnapshot,
    setTimeout:(run,delay)=>{const timer={run,delay};timers.push(timer);return timer;},clearTimeout:t=>{if(t)t.cancelled=true;}});
  Object.assign(state,{connected:true,initialized:true,authRestoring:false,repo});
  ctx.render();ctx.render();await ctx.ensureRange('2026-11-01');assert.equal(timers.length,0);
  await ctx.load();assert.equal(timers.length,1);assert.equal(timers[0].delay,1500);
  ctx.render();assert.equal(timers.length,1);assert.equal(timers[0].cancelled,undefined);
  const expanded={...data,WebMeals:[...data.WebMeals,{id:'old',date:'2026-10-05'}]};
  repo.ensureRange=async()=>expanded;await ctx.ensureRange('2026-10-01');
  assert.equal(timers.length,2);assert.equal(timers[0].cancelled,true);
  timers[1].run();assert.deepEqual(readSnapshot(s,now).data.WebMeals,expanded.WebMeals);assert.equal(readSnapshot(s,now).user.name,'GymBro');
  await ctx.load();ctx.dropCache();assert.equal(timers[2].cancelled,true);assert.equal(s.getItem(SNAPSHOT_KEY),null);
  await ctx.load();repo.s.auth.currentUser={uid:'u2'};timers[3].run();assert.equal(s.getItem(SNAPSHOT_KEY),null);
});

test('Expired, corrupt or oversized snapshots are never used and are removed',()=>{
  const s=memory();
  writeSnapshot(s,{uid:'u1',sessionExpiresAt:later,data},now);
  assert.equal(readSnapshot(s,later+1),null);assert.equal(s.m.has(SNAPSHOT_KEY),false,'expired copy removed');
  s.setItem(SNAPSHOT_KEY,'{not json');assert.equal(readSnapshot(s,now),null);assert.equal(s.m.has(SNAPSHOT_KEY),false);
  s.setItem(SNAPSHOT_KEY,JSON.stringify({v:1,uid:'u1',sessionExpiresAt:later,data:{WebMeals:'x'}}));assert.equal(readSnapshot(s,now),null);
  assert.equal(writeSnapshot(s,{uid:'u1',sessionExpiresAt:now-1,data},now),false,'no write for an expired session');
  const big={WebMeals:[{id:'x',note:'a'.repeat(SNAPSHOT_MAX_BYTES)}]};
  writeSnapshot(s,{uid:'u1',sessionExpiresAt:later,data},now);
  assert.equal(writeSnapshot(s,{uid:'u1',sessionExpiresAt:later,data:big},now),false);assert.equal(s.m.has(SNAPSHOT_KEY),false,'stale copy not left behind');
  const full={...memory(),setItem(){throw Error('QuotaExceededError');}};assert.equal(writeSnapshot(full,{uid:'u1',sessionExpiresAt:later,data},now),false);
  clearSnapshot(null);assert.equal(readSnapshot(null,now),null);
});

test('Saved data shows as a view-only "cached" stage until the server load finishes',()=>{
  const cached={uid:'u1',sessionExpiresAt:later};
  assert.equal(accessStage({mode:'firebase',authRestoring:true,cached},now),'cached');
  assert.equal(accessStage({mode:'firebase',connected:true,initialized:false,cached,repo:{s:{sessionExpiresAt:later}}},now),'cached');
  assert.equal(accessStage({mode:'firebase',authRestoring:true,cached},later+1),'restoring','expired copy is ignored');
  assert.equal(accessStage({mode:'firebase',authRestoring:true,cached:null},now),'restoring');
  assert.equal(accessStage({mode:'firebase',connected:true,initialized:true,cached,repo:{s:{sessionExpiresAt:later}},accountProfile:{}},now),'profile','once loaded, the live state wins');
});

test('Snapshot keeps the account face for an instant avatar, with only https photos',()=>{
  const s=memory();
  writeSnapshot(s,{uid:'u1',sessionExpiresAt:later,data,user:{name:'Trần Tống',email:'a@b.c',photo:'https://lh3.googleusercontent.com/x'}},now);
  assert.deepEqual(readSnapshot(s,now).user,{name:'Trần Tống',email:'a@b.c',photo:'https://lh3.googleusercontent.com/x'});
  writeSnapshot(s,{uid:'u1',sessionExpiresAt:later,data,user:{name:'X',photo:'javascript:alert(1)'}},now);
  assert.equal(readSnapshot(s,now).user.photo,'');
  writeSnapshot(s,{uid:'u1',sessionExpiresAt:later,data},now);assert.equal(readSnapshot(s,now).user,null);
});
