import test from 'node:test';
import assert from 'node:assert/strict';
import {openPhotoDatabase,listLocalPhotos} from '../src/data/local-extras.js';
import {LocalRepository} from '../src/core/core.js';
test('photo database open times out, rejects blocked opens and closes late connections',async()=>{
 const prior=globalThis.indexedDB;let request,closed=0;
 globalThis.indexedDB={open:()=>request={result:{close:()=>closed++}}};
 try{
  await assert.rejects(openPhotoDatabase({timeoutMs:5}),/không cho lưu ảnh/);request.onsuccess();assert.equal(closed,1);
  const blocked=openPhotoDatabase();request.onblocked();await assert.rejects(blocked,/không cho lưu ảnh/);
 }finally{globalThis.indexedDB=prior;}
});
test('awaited photo read and upload listing reject on transaction abort/error without request errors',async()=>{
 const prior=globalThis.indexedDB;let tx,closed=0;
 globalThis.indexedDB={open:()=>{const request={result:{close:()=>closed++,transaction:()=>tx={objectStore:()=>({get:()=>({}),openCursor:()=>({})})}}};queueMicrotask(()=>request.onsuccess());return request;}};
 try{
  for(const run of [()=>new LocalRepository({}).getPhoto('p'),()=>listLocalPhotos('owner/')])for(const event of ['onabort','onerror']){
   const result=run();await new Promise(resolve=>setImmediate(resolve));tx[event]();await assert.rejects(result,/Không đọc được ảnh/);
  }
  assert.equal(closed,4);
 }finally{globalThis.indexedDB=prior;}
});

test('photo reads wait for transaction completion and reject an abort after request success',async()=>{
 const prior=globalThis.indexedDB;let tx,request;
 const photo={id:'p',meal_id:'m',data_url:'data:image/jpeg;base64,AA==',created_at:new Date().toISOString()};
 globalThis.indexedDB={open:()=>{const opened={result:{close:()=>{},transaction:()=>tx={objectStore:()=>({get:()=>request={result:photo},openCursor:()=>request={result:null}})}}};queueMicrotask(()=>opened.onsuccess());return opened;}};
 try{
  const read=new LocalRepository({}).getPhoto('p');await new Promise(resolve=>setImmediate(resolve));request.onsuccess();tx.onabort();await assert.rejects(read,/Không đọc được ảnh/);
  const completed=new LocalRepository({}).getPhoto('p');await new Promise(resolve=>setImmediate(resolve));request.onsuccess();tx.oncomplete();assert.deepEqual(await completed,photo);
  const listed=listLocalPhotos('owner/');await new Promise(resolve=>setImmediate(resolve));request.onsuccess();tx.oncomplete();assert.deepEqual(await listed,[]);
 }finally{globalThis.indexedDB=prior;}
});
