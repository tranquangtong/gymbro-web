import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLazyLoader,debounce} from '../src/ui/lazy.js';
import {firebaseSettings} from '../src/ui/firebase-ui.js';
import {exerciseChoices} from '../src/ui/exercise-library.js';

test('createLazyLoader deduplicates concurrent loads, exposes peek(), and recovers after transient failure',async()=>{
  let calls=0,fail=true;
  const loader=createLazyLoader(async()=>{
    calls++;
    if(fail)throw Error('offline');
    return {ready:true};
  });
  assert.equal(loader.peek(),null);
  await assert.rejects(()=>loader.load(),/offline/);
  assert.equal(calls,1);
  assert.equal(loader.peek(),null);

  fail=false;
  const [a,b]=await Promise.all([loader.load(),loader.load()]);
  assert.equal(calls,2,'concurrent load() calls share one in-flight import');
  assert.strictEqual(a,b);
  assert.deepEqual(loader.peek(),{ready:true});
  loader.preload();
  assert.equal(calls,2,'preload() is a no-op once loaded');
});

test('debounce coalesces rapid calls and supports flush() and cancel()',()=>{
  let nextId=1;const timers=new Map(),seen=[];
  const setTimer=(fn,ms)=>{const id=nextId++;timers.set(id,{fn,ms});return id;};
  const clearTimer=id=>{timers.delete(id);};
  const fn=debounce(v=>seen.push(v),150,{setTimer,clearTimer});
  fn('a');fn('ab');fn('abc');
  assert.equal(timers.size,1);
  assert.equal([...timers.values()][0].ms,150);
  assert.equal(fn.pending(),true);
  assert.deepEqual(seen,[]);
  fn.flush();
  assert.equal(fn.pending(),false);
  assert.deepEqual(seen,['abc']);
  fn('ignored');
  fn.cancel();
  assert.equal(fn.pending(),false);
  assert.equal(timers.size,0);
  assert.deepEqual(seen,['abc']);
});

test('firebaseSettings shows the current origin/hostname dynamically instead of hardcoding GitHub Pages',t=>{
  const oldLoc=Object.getOwnPropertyDescriptor(globalThis,'location');
  Object.defineProperty(globalThis,'location',{configurable:true,writable:true,value:{hostname:'gymbro.example.workers.dev',origin:'https://gymbro.example.workers.dev'}});
  t.after(()=>oldLoc?Object.defineProperty(globalThis,'location',oldLoc):delete globalThis.location);
  const html=firebaseSettings({
    state:{connected:false,accountProfile:{},localPending:0},
    profile:{},
    fmt:v=>String(v??'—'),
    esc:v=>String(v??''),
    card:(title,sub,body)=>`<section><h2>${title}</h2>${body}</section>`,
    button:label=>`<button>${label}</button>`,
    heading:(_,title)=>`<h1>${title}</h1>`
  });
  assert.match(html,/gymbro\.example\.workers\.dev/);
  assert.doesNotMatch(html,/tranquangtong\.github\.io/);
});

test('exerciseChoices memoizes per array reference and invalidates when rows change',()=>{
  const rows=[{exercise:'Bench press',kind:'strength',date:'2026-11-01'}];
  const first=exerciseChoices(rows,'2026-11-01');
  const second=exerciseChoices(rows,'2026-11-01');
  assert.strictEqual(first,second);
  rows.push({exercise:'Squat',kind:'strength',date:'2026-11-02'});
  const third=exerciseChoices(rows,'2026-11-02');
  assert.notStrictEqual(third,first);
  assert.equal(third[0].name,'Squat');
});

test('app.js lazy-loads heavy UI modules via relative dynamic import() and index.html uses non-blocking fonts + hints',()=>{
  const appSrc=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  for(const mod of ['./ui/quick-ui.js','./ui/calendar.js','./ui/firebase-ui.js','./data/migrate-cloudflare.js']){
    const escaped=mod.replace(/[./]/g,'\\$&');
    assert.doesNotMatch(appSrc,new RegExp(`^import\\s+[^\\n]*['"]${escaped}['"]`,'m'),`${mod} must not be statically imported`);
    assert.match(appSrc,new RegExp(`import\\(['"]${escaped}['"]\\)`),`${mod} must use relative dynamic import()`);
  }
  assert.match(appSrc,/auth\/unauthorized-domain/);
  assert.doesNotMatch(appSrc,/tranquangtong\.github\.io/);

  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/rel="preload"\s+as="style"\s+href="https:\/\/fonts\.googleapis\.com\/css2\?family=Barlow\+Condensed:wght@600;700/);
  assert.doesNotMatch(html,/Barlow\+Condensed:wght@[^"]*500/);
  assert.match(html,/rel="preconnect"\s+href="https:\/\/www\.gstatic\.com"\s+crossorigin/);
  assert.match(html,/rel="preconnect"\s+href="https:\/\/gymbro-api\.tongquangtran\.workers\.dev"\s+crossorigin/);
  assert.match(html,/rel="modulepreload"\s+href="\.\/src\/app\.js"/);
  assert.match(html,/rel="modulepreload"\s+href="\.\/src\/ui\/dashboard\.js"/);
});
