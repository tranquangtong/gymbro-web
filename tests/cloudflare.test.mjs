import test from 'node:test';
import assert from 'node:assert/strict';
import { env, token, workerFetch, ADMIN } from './worker-env.mjs';
import { CloudflareRepository } from '../src/data/cloudflare.js';
import { diffRows } from '../src/data/migrate-cloudflare.js';
import { shiftDate, today } from '../src/core/core.js';

const meal = (id, date, extra = {}) => ({ id, date, meal: 'lunch', food: 'Phở', portion: '1 tô', kcal: 500, protein: 30, carbs: 60, fat: 15, nutrition_source: 'estimate', created_at: 'c', updated_at: 'u-' + id, deleted: false, ...extra });
async function service(claims = {}) {
  const tok = await token(claims);
  return { sessionExpiresAt: Date.now() + 3600e3, auth: { currentUser: { uid: claims.sub || 'user-a', email: claims.email || 'a@example.com', emailVerified: true, getIdToken: async () => tok } } };
}
const repoFor = async (e, claims, target = null, opts = {}) => new CloudflareRepository(await service(claims), target, { apiBase: 'https://api.test/', fetchImpl: workerFetch(e), ...opts });

test('loads a recent window, pages older dates on demand and never sends other owners data', async () => {
  const e = env(), repo = await repoFor(e, {}, null, { windowDays: 10 });
  const recent = shiftDate(today(), -2), old = shiftDate(today(), -40);
  await repo.saveMany('WebMeals', [meal('new', recent), meal('old', old)]);
  await repo.saveMany('WebProfile', [{ id: 'p1', date: old, weight_kg: 80, kcal_target: 2000, created_at: 'c', updated_at: 'u', deleted: false }]);
  const fresh = await repoFor(e, {}, null, { windowDays: 10 });
  const data = await fresh.load();
  assert.deepEqual(data.WebMeals.map(r => r.id), ['new'], 'window excludes old meals');
  assert.deepEqual(data.WebProfile.map(r => r.id), ['p1'], 'profile rows are always loaded');
  const wider = await fresh.ensureRange(shiftDate(today(), -60));
  assert.deepEqual(wider.WebMeals.map(r => r.id).sort(), ['new', 'old']);
  assert.equal(await fresh.ensureRange(shiftDate(today(), -50)), null, 'already covered → no request');
  const other = await repoFor(e, { sub: 'user-b', email: 'b@example.com' });
  assert.equal((await other.load()).WebMeals.length, 0);
});

test('save keeps optimistic revisions, polling picks up writes from another device', async () => {
  const e = env(), phone = await repoFor(e), laptop = await repoFor(e);
  const date = today();
  await phone.saveMany('WebMeals', [meal('m1', date)]);
  const seen = await laptop.load();
  const updates = [];
  const stop = laptop.subscribe((table, rows) => updates.push([table, rows.map(r => r.kcal)]), err => assert.fail(err));
  const row = (await phone.load()).WebMeals[0];
  assert.equal(await phone.save('WebMeals', { ...row, kcal: 650, updated_at: 'u2' }), true);
  await assert.rejects(() => laptop.save('WebMeals', { ...seen.WebMeals[0], kcal: 1, updated_at: 'u3' }), /thiết bị khác/);
  await laptop.poll().then(t => assert.deepEqual([...t], ['WebMeals']));
  assert.equal((await laptop.load()).WebMeals[0].kcal, 650);
  stop();
});

test('admin reads another owner; ordinary users cannot', async () => {
  const e = env(), a = await repoFor(e);
  await a.saveMany('WebMeals', [meal('m1', today())]);
  const admin = await repoFor(e, { sub: 'admin', email: ADMIN }, 'user-a');
  assert.deepEqual((await admin.load()).WebMeals.map(r => r.id), ['m1']);
  assert.throws(() => new CloudflareRepository({ sessionExpiresAt: Date.now() + 1e6, auth: { currentUser: { uid: 'user-b', email: 'b@x', emailVerified: true } } }, 'user-a', { apiBase: 'https://api.test' }), /Chỉ admin/);
});

test('food library seeds once and import is insert-only', async () => {
  const e = env(), repo = await repoFor(e);
  const seeded = await repo.seedFoods(); assert.ok(seeded.length >= 5);
  assert.equal((await repo.seedFoods()).length, seeded.length);
  const r = await repo.importBundle({ data: { WebMeals: [meal('i1', today()), meal('i1b', today())], WebWorkouts: [], WebProfile: [], Archive: [] } });
  assert.deepEqual(r, { inserted: 2, skipped: 0 });
  assert.deepEqual(await repo.importBundle({ data: { WebMeals: [meal('i1', today(), { kcal: 1 })], WebWorkouts: [], WebProfile: [], Archive: [] } }), { inserted: 0, skipped: 1 });
});

test('migration diff names missing, changed and extra IDs', () => {
  assert.deepEqual(diffRows([{ id: 'a', updated_at: '1' }, { id: 'b', updated_at: '2' }], [{ id: 'b', updated_at: '3' }, { id: 'c', updated_at: '1' }]), { missing: ['a'], changed: ['b'], extra: ['c'] });
});

test('a photo saved on one device opens on another through the API', async () => {
  const e = env(), phone = await repoFor(e), laptop = await repoFor(e);
  const photo = { id: 'ph1', meal_id: 'm1', data_url: 'data:image/jpeg;base64,AAAA', created_at: new Date().toISOString() };
  await phone.savePhoto(photo);
  assert.deepEqual(await laptop.getPhoto('ph1'), photo);
  await assert.rejects(() => laptop.getPhoto('missing'), e => e.code === 'photo/not-found');
});

test('photo upload retries a lost acknowledgement with the same ID, storing only one full-size photo',async()=>{
  const e=env(),s=await service(),photo={id:'retry-photo',meal_id:'m1',created_at:'2026-10-31T10:00:00Z',data_url:'data:image/jpeg;base64,'+'A'.repeat(320000)};
  const fetchWorker=workerFetch(e),sent=[];
  const repo=new CloudflareRepository(s,null,{apiBase:'https://api.test',fetchImpl:async(url,init)=>{
    const body=JSON.parse(init.body);sent.push(body.photo);
    const result=await fetchWorker(url,init);
    if(sent.length===1)throw new TypeError('Connection lost after upload');
    return result;
  }});
  await repo.savePhoto(photo);
  assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);
  assert.equal(e.DB.db.prepare('SELECT count(*) n FROM photos').get().n,1);
  const loaded=await fetchWorker('https://api.test/v1/photos/retry-photo',{headers:{authorization:'Bearer '+await s.auth.currentUser.getIdToken()}});
  assert.deepEqual(await loaded.json(),photo);
});

test('photo upload retries temporary service failures but never retries denied permissions',async()=>{
  const photo={id:'service-photo',meal_id:'m1',created_at:'2026-10-31T10:00:00Z',data_url:'data:image/jpeg;base64,AAAA'};
  for(const status of [503,403]){
    let attempts=0;
    const repo=new CloudflareRepository(await service(),null,{apiBase:'https://api.test',fetchImpl:async()=>{
      attempts++;return new Response(JSON.stringify({error:'Test service failure'}),{status:status===503&&attempts>1?200:status,headers:{'content-type':'application/json'}});
    }});
    if(status===503){await repo.savePhoto(photo);assert.equal(attempts,2);}
    else{await assert.rejects(()=>repo.savePhoto(photo),e=>e.status===403&&e.operation==='photo');assert.equal(attempts,1);}
  }
});

const never=()=>new Promise(()=>{});
const emptyPage=()=>new Response(JSON.stringify({rows:[],seq:0,next_cursor:''}));

test('API deadline bounds a stalled fetch and aborts it even if fetch ignores the signal',{timeout:1000},async()=>{
  let signal;
  const repo=await repoFor(env(),{},null,{timeoutMs:15,fetchImpl:(_url,init)=>{signal=init.signal;return never();}});
  await assert.rejects(()=>repo.api('/v1/records'),e=>e.code==='unavailable');
  assert.equal(signal.aborted,true);
});

test('API deadline includes token refresh; late tokens do not send a timed-out request',{timeout:1000},async()=>{
  let release,calls=0;
  const repo=await repoFor(env(),{},null,{timeoutMs:15,fetchImpl:async()=>{calls++;return emptyPage();}});
  repo.s.auth.currentUser.getIdToken=()=>new Promise(resolve=>{release=resolve;});
  await assert.rejects(()=>repo.api('/v1/records'),e=>e.code==='unavailable');
  release('late-token');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,0);
  repo.s.auth.currentUser.getIdToken=async()=> 'fresh-token';
  assert.deepEqual((await repo.load()).WebMeals,[]);
});

test('load releases its shared task after a stalled fetch or token refresh',{timeout:1000},async()=>{
  for(const stall of ['fetch','token']){
    const repo=await repoFor(env(),{},null,{timeoutMs:15,fetchImpl:stall==='fetch'?never:async()=>emptyPage()});
    if(stall==='token')repo.s.auth.currentUser.getIdToken=never;
    const first=repo.load(),second=repo.load();
    await Promise.all([first,second].map(task=>assert.rejects(task,e=>e.code==='unavailable')));
    assert.equal(repo._loadTask,null);
    repo.fetchImpl=async()=>emptyPage();repo.s.auth.currentUser.getIdToken=async()=> 'fresh-token';
    assert.deepEqual((await repo.load()).WebMeals,[]);
    assert.equal(repo._loadTask,null);
  }
});

test('API deadline covers response bodies, write defaults and explicit overrides',{timeout:1000},async()=>{
  const repo=await repoFor(env(),{},null,{timeoutMs:1000,writeTimeoutMs:15,fetchImpl:async()=>({ok:true,json:never})});
  await assert.rejects(()=>repo.api('/v1/records',{method:'POST',body:{}}),e=>e.code==='unavailable');
  await assert.rejects(()=>repo.api('/v1/records',{timeoutMs:15}),e=>e.code==='unavailable');
});

test('a hung poll reports timeout and a restarted subscription can poll again',{timeout:1000},async()=>{
  const repo=await repoFor(env(),{},null,{timeoutMs:15,pollMs:5,fetchImpl:async()=>emptyPage()});
  await repo.load();repo.fetchImpl=never;
  let stop;
  try{
    const error=await new Promise(resolve=>{stop=repo.subscribe(()=>assert.fail('stalled poll emitted rows'),resolve);});
    assert.equal(error.code,'unavailable');stop();
    repo.fetchImpl=async()=>new Response(JSON.stringify({changes:[{kind:'WebMeals',row:meal('after-sleep',today())}],seq:1,more:false}));
    const rows=await new Promise((resolve,reject)=>{stop=repo.subscribe((table,rows)=>resolve(rows),reject);});
    assert.equal(rows[0].id,'after-sleep');
  }finally{stop?.();}
});

test('token refresh network failures become the Vietnamese unavailable error',{timeout:1000},async()=>{
  const repo=await repoFor(env(),{},null,{timeoutMs:1000,fetchImpl:async()=>emptyPage()});
  repo.s.auth.currentUser.getIdToken=async()=>{throw Object.assign(Error('Firebase: Error (auth/network-request-failed).'),{code:'auth/network-request-failed'});};
  await assert.rejects(()=>repo.api('/v1/records'),e=>e.code==='unavailable'&&!/Firebase/.test(e.message));
});

test('a forced reload keeps months already paged in',async()=>{
  const froms=[];
  const repo=await repoFor(env(),{},null,{fetchImpl:async url=>{const f=new URL(url).searchParams.get('from');if(f)froms.push(f);return emptyPage();}});
  await repo.load();repo.loadedFrom='2020-01-01';froms.length=0;
  await repo.load({force:true});
  assert.ok(froms.length>0);assert.ok(froms.every(f=>f==='2020-01-01'));
});
