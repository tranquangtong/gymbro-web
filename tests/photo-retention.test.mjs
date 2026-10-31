import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {PHOTO_RETENTION_MS,photoExpired,photoExpiresAt,forgetExpiredPhotos} from '../photo-retention.js';
import {photoCleanupWrites,cleanupPhotos} from '../scripts/photo-cleanup.mjs';
import {FirebaseRepository} from '../firebase.js';
const now=Date.parse('2026-10-31T07:00:00Z'),old=new Date(now-PHOTO_RETENTION_MS).toISOString(),fresh=new Date(now-PHOTO_RETENTION_MS+1).toISOString();
const root='projects/gymbro-web/databases/(default)/documents';
const photo={name:root+'/users/u/MealPhotos/p',updateTime:'v1',fields:{created_at:{stringValue:old},meal_id:{stringValue:'m'}}};
const meal={name:root+'/users/u/WebMeals/m',updateTime:'v2',fields:{photo_ids:{arrayValue:{values:[{stringValue:'p'},{stringValue:'keep'}]}},kcal:{integerValue:'400'},food:{stringValue:'Food'}}};
test('Photo expiry uses exactly 120 hours from image creation, including old photos, with a fail-closed invalid-date guard',()=>{
 assert.equal(photoExpired({created_at:old},now),true);assert.equal(photoExpired({created_at:fresh},now),false);assert.equal(photoExpiresAt({created_at:old}),now);assert.equal(photoExpired({created_at:'invalid'},now),false);
 assert.deepEqual(forgetExpiredPhotos([{id:'old',created_at:old},{id:'new',created_at:fresh}],now).map(r=>r.id),['new']);
});
test('Cloud cleanup deletes only expired MealPhotos and updates only photo references, preserving macros/log data',()=>{
 const writes=photoCleanupWrites(photo,meal,now);assert.equal(writes.length,2);assert.equal(writes[1].delete,photo.name);assert.equal(writes[1].currentDocument.updateTime,'v1');assert.equal(writes[0].currentDocument.updateTime,'v2');assert.deepEqual(writes[0].updateMask.fieldPaths,['photo_ids','updated_at']);assert.deepEqual(writes[0].update.fields.photo_ids.arrayValue.values,[{stringValue:'keep'}]);assert.equal(writes[0].update.fields.kcal,undefined);assert.equal(meal.fields.kcal.integerValue,'400');
 assert.equal(photoCleanupWrites(photo,null,now).length,1,'orphan photo is still deleted');
 assert.equal(photoCleanupWrites({...photo,fields:{...photo.fields,created_at:{stringValue:fresh}}},meal,now).length,0);
 assert.equal(photoCleanupWrites({...photo,name:root+'/users/u/WebMeals/p'},meal,now).length,0);
 assert.equal(photoCleanupWrites({...photo,name:photo.name.replace('gymbro-web','other')},meal,now).length,0);
 assert.equal(photoCleanupWrites(photo,{...meal,name:meal.name.replace('/u/','/other/')},now).length,0);
});
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const account={project_id:'gymbro-web',client_email:'test@example.test',private_key:privateKey};
const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
function api({conflict=false}={}){
 const commits=[],queries=[];return {commits,queries,fetcher:async(url,options={})=>{
  if(url.includes('oauth2.googleapis.com'))return response({access_token:'test-token'});
  if(url.includes('/users?')){assert.match(url,/showMissing=true/);return response({documents:[{name:root+'/users/u'}]});}
  if(url.endsWith(':runQuery')){const q=JSON.parse(options.body).structuredQuery;queries.push(q);assert.equal(q.from[0].allDescendants,false);assert.deepEqual(q.select.fields,[{fieldPath:'created_at'},{fieldPath:'meal_id'}]);return response([{document:photo}]);}
  if(url.includes('/WebMeals/m?'))return response(meal);
  if(url.endsWith(':commit')){commits.push(JSON.parse(options.body));return conflict?response({error:{status:'FAILED_PRECONDITION'}},400):response({writeResults:[]});}
  throw Error('unexpected endpoint');
 }};
}
test('Scheduled cleaner dry-run makes no writes; apply uses one atomic guarded commit per expired image',async()=>{
 const dry=api(),preview=await cleanupPhotos({account,fetcher:dry.fetcher,now});assert.equal(preview.wouldDelete,1);assert.equal(dry.commits.length,0);
 const live=api(),result=await cleanupPhotos({account,fetcher:live.fetcher,now,dryRun:false});assert.equal(result.deleted,1);assert.equal(live.commits.length,1);assert.equal(live.commits[0].writes.length,2);
 const race=api({conflict:true}),retry=await cleanupPhotos({account,fetcher:race.fetcher,now,dryRun:false});assert.equal(retry.deleted,0);assert.equal(retry.conflicts,1);
 await assert.rejects(()=>cleanupPhotos({account:{...account,project_id:'other'},fetcher:()=>{throw Error('must not call');},now}));
});
test('Photo reads and uploads reject expired images, even before the server job removes them',async()=>{
 const image={id:'p',meal_id:'m',created_at:new Date(Date.now()-PHOTO_RETENTION_MS-1).toISOString(),data_url:'data:image/jpeg;base64,YQ=='};
 const service={sessionExpiresAt:Number.MAX_SAFE_INTEGER,auth:{currentUser:{uid:'u'}},db:{},dbSDK:{doc:(_, ...path)=>path.join('/'),getDocFromServer:async()=>({exists:()=>true,data:()=>image}),setDoc:()=>{throw Error('must not upload expired image');}}};
 const repo=new FirebaseRepository(service);await assert.rejects(()=>repo.getPhoto('p'),e=>e.code==='photo/expired');await assert.rejects(()=>repo.savePhoto(image),e=>e.code==='photo/expired');
});

test('Local cache cleanup physically deletes only expired image bytes and closes IndexedDB',async()=>{
 const {purgeLocalPhotoCache}=await import('../local-extras.js');
 const original=globalThis.indexedDB,removed=[];let closed=false;
 const records=[{key:'owner-a/old',value:{created_at:old}},{key:'owner-b/new',value:{created_at:fresh}}];
 globalThis.indexedDB={open:()=>{const opening={};queueMicrotask(()=>{opening.result={close:()=>{closed=true;},transaction:()=>{
  const tx={objectStore:()=>({openCursor:()=>{const request={};let index=0;const next=()=>queueMicrotask(()=>{const item=records[index];request.result=item?{value:item.value,delete:()=>removed.push(item.key),continue:()=>{index++;next();}}:null;request.onsuccess();if(!item)queueMicrotask(()=>tx.oncomplete());});next();return request;}})};return tx;
 }};opening.onsuccess();});return opening;}};
 try{assert.equal(await purgeLocalPhotoCache(now),1);assert.deepEqual(removed,['owner-a/old']);assert.equal(closed,true);}finally{if(original===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=original;}
});
