import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanRecord,convertSheets,validateBundle} from '../migration.js';
import {FirebaseRepository,isAdmin} from '../firebase.js';

const meal={id:'meal1',date:'2026-10-29',meal:'lunch',food:'Đậu hũ',portion:'',kcal:200,protein:'',carbs:'',fat:'',nutrition_source:'manual',skipped:false,notes:'',created_at:'2026-10-29T01:00:00Z',updated_at:'v1',deleted:false};
test('Firebase writes use an allowlist and strip all messaging and unknown fields',()=>{
  const clean=cleanRecord('WebMeals',{...meal,messageId:42,messageDateTime:'date',source_message_id:8,chat_id:3,telegram_message:'private',is_sent:true,sent_at:'date',arbitrary:'secret'});
  assert.deepEqual(clean,meal);
  const archive=cleanRecord('Archive',{id:'r',date:meal.date,type:'report',title:'Báo cáo',payload:{insight:'Useful',telegram_message:'Duplicate',is_sent:true,sent_at:'date'}});
  assert.deepEqual(archive.payload,{insight:'Useful'});
});
test('Legacy migration preserves unknown nutrition, zero, assistance and drops messaging fields',()=>{
  const source={EatLog:[['date','meal','food_text','kcal_known','kcal_estimated','skipped','source_message_id','created_at'],['2026-10-29','trưa','Đậu hũ','','','FALSE','42','2026-10-29T01:00:00Z'],['2026-10-29','sáng','Nước',0,'','FALSE','43','2026-10-29T01:00:00Z']],WorkoutLog:[['date','exercise','weight_kg','reps','set_no','source_message_id'],['2026-10-29','kneeling easy chin up','27.2','12','1','44']],Profile:[['weight_kg','updated_at'],['85','04/05/2026']], 'Daily Report':[['date','insight','telegram_message','is_sent'],['2026-10-29','Ghi chú','Duplicate','TRUE']]};
  const a=convertSheets(source,{sourceId:'source',importDate:'2026-10-29'}),b=convertSheets(source,{sourceId:'source',importDate:'2026-10-29'});
  assert.equal(a.data.WebMeals[0].kcal,'');assert.equal(a.data.WebMeals[1].kcal,0);assert.equal(a.data.WebWorkouts[0].kind,'assisted');assert.equal(a.data.WebProfile[0].date,'2026-05-04');assert.equal(a.data.WebMeals[0].id,b.data.WebMeals[0].id);
  assert.equal(JSON.stringify(a).includes('source_message_id'),false);assert.equal(JSON.stringify(a).includes('telegram_message'),false);assert.equal(JSON.stringify(a).includes('is_sent'),false);
  assert.doesNotThrow(()=>validateBundle(a));
});
test('Cardio without duration is preserved as review instead of inventing minutes or sets',()=>{
  const r=convertSheets({WorkoutLog:[['date','exercise','kcal_burned_est'],['2026-10-29','walking','100']]});
  assert.equal(r.data.WebWorkouts.length,0);assert.equal(r.data.Archive[0].type,'review');assert.equal(r.data.Archive[0].payload.kcal_burned_est,'100');
});
test('Import rejects sample data, duplicate IDs and malformed records before writes',()=>{
  assert.throws(()=>validateBundle({app:'GymBro Web',version:2,mode:'demo',data:{}}));
  assert.throws(()=>validateBundle({app:'GymBro Web',version:2,data:{WebMeals:[meal,meal]}}),/trùng/);
});
function service(){const storage=new Map();const s={sessionExpiresAt:Number.MAX_SAFE_INTEGER,auth:{currentUser:{uid:'owner',email:'owner@example.test'}},db:{},dbSDK:{doc:(_, ...p)=>p.join('/'),collection:(_, ...p)=>p.join('/'),getDocsFromServer:async path=>({docs:[...storage].filter(([key])=>key.startsWith(path+'/')).map(([key,data])=>({id:key.split('/').at(-1),data:()=>data}))}),runTransaction:async(_,fn)=>fn({get:async ref=>({exists:()=>storage.has(ref),data:()=>storage.get(ref)}),set:(ref,r)=>storage.set(ref,r)})}};return {s,storage};}
test('Firebase uses the signed-in UID, rejects changed revisions and resumes import without duplicates',async()=>{
  const {s,storage}=service(),repo=new FirebaseRepository(s);
  await repo.save('WebMeals',meal);assert.ok(storage.has('users/owner/WebMeals/meal1'));
  await assert.rejects(()=>repo.save('WebMeals',{...meal,kcal:300,_revision:'old'}),/thiết bị khác/);
  const result=await repo.importBundle({data:{WebMeals:[meal,{...meal,id:'new'}]}});
  assert.deepEqual(result,{inserted:1,skipped:1});assert.equal(storage.size,2);
  s.auth.currentUser={uid:'other'};await assert.rejects(()=>repo.save('WebMeals',meal),/Tài khoản/);
});
test('Only the verified administrator can target another user namespace',async()=>{
  const {s,storage}=service();
  s.auth.currentUser={uid:'admin',email:'tongquangtran@gmail.com',emailVerified:false};
  assert.equal(isAdmin(s.auth.currentUser),false);
  assert.throws(()=>new FirebaseRepository(s,'other'),/admin/);
  s.auth.currentUser.emailVerified=true;
  const admin=new FirebaseRepository(s,'other');await admin.save('WebMeals',meal);
  assert.ok(storage.has('users/other/WebMeals/meal1'));
  assert.equal(storage.has('users/admin/WebMeals/meal1'),false);
  s.auth.currentUser.email='not-admin@example.test';
  await assert.rejects(()=>admin.save('WebMeals',meal),/admin/);
});
