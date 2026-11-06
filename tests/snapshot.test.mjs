import test from 'node:test';
import assert from 'node:assert/strict';
import {writeSnapshot,readSnapshot,clearSnapshot,SNAPSHOT_KEY,SNAPSHOT_MAX_BYTES} from '../snapshot.js';
import {accessStage} from '../access.js';

const memory=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),m};};
const now=1_800_000_000_000,later=now+3600_000;
const data={WebMeals:[{id:'m1',date:'2026-11-05',kcal:500}],WebWorkouts:[],WebProfile:[{id:'p',date:'2026-11-01'}]};

test('Snapshot round-trips for a valid session and fills missing tables',()=>{
  const s=memory();
  assert.equal(writeSnapshot(s,{uid:'u1',sessionExpiresAt:later,data},now),true);
  const snap=readSnapshot(s,now+1000);
  assert.equal(snap.uid,'u1');assert.deepEqual(snap.data.WebMeals,data.WebMeals);assert.deepEqual(snap.data.Archive,[]);
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
