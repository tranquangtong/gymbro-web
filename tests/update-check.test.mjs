import test from 'node:test';
import assert from 'node:assert/strict';
import {watchForUpdates} from '../src/ui/update-check.js';

function simulatePage(t,{active={},controller=active}={}){
  const banners=[],worker=new EventTarget(),registration=new EventTarget();
  let idle,checks=0,navigations=0;
  Object.assign(registration,{active,installing:worker,update:async()=>{checks++;}});
  const serviceWorker={controller,getRegistration:async()=>registration};
  const define=(key,value)=>{
    const original=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{value,configurable:true});
    t.after(()=>{if(original)Object.defineProperty(globalThis,key,original);else delete globalThis[key];});
  };
  const element=()=>({children:[],setAttribute(){},append(child){this.children.push(child);}});
  define('navigator',{serviceWorker});
  define('location',{protocol:'https:',reload:()=>{navigations++;}});
  define('document',{
    visibilityState:'visible',addEventListener(){},createElement:element,
    body:{append:bar=>banners.push(bar)},
  });
  define('requestIdleCallback',callback=>{idle=callback;});
  t.mock.method(globalThis,'setInterval',()=>{});
  return {worker,registration,banners,checks:()=>checks,navigations:()=>navigations,runIdle:async()=>{
    idle();
    await new Promise(resolve=>setImmediate(resolve));
  }};
}

test('the release probe runs at idle and waits for existing pages to close before updating',async t=>{
  const page=simulatePage(t);
  watchForUpdates();
  assert.equal(page.checks(),0);
  await page.runIdle();
  assert.equal(page.checks(),1);
  assert.equal(page.banners.length,0);
  page.registration.waiting=page.worker;
  page.worker.dispatchEvent(new Event('statechange'));
  assert.match(page.banners[0].textContent,/Đóng tất cả cửa sổ và tab/);
  page.worker.dispatchEvent(new Event('statechange'));
  assert.equal(page.banners.length,1);
  assert.equal(page.navigations(),0);
});

test('a first-time service worker install does not show an update banner',async t=>{
  const page=simulatePage(t,{active:null});
  watchForUpdates();
  await page.runIdle();
  page.registration.active=page.worker;
  page.worker.state='activated';
  page.worker.dispatchEvent(new Event('statechange'));
  assert.equal(page.banners.length,0);
});

test('an uncontrolled page can offer a reload once a replacement is active',async t=>{
  const page=simulatePage(t,{controller:null});
  watchForUpdates();
  await page.runIdle();
  page.registration.active=page.worker;
  page.worker.state='activated';
  page.worker.dispatchEvent(new Event('statechange'));
  assert.equal(page.banners[0].children[0].textContent,'Tải lại');
  page.banners[0].children[0].onclick();
  assert.equal(page.navigations(),1);
});
