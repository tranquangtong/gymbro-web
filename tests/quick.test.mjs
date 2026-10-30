import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_FOODS,parseMeals,parseWorkouts,compactWorkout,ensureWorkoutDay,makeRequest,parseEstimate,requestPrompt,validateFood} from '../quick.js';
import {validatePhoto} from '../media.js';
import {LocalRepository} from '../core.js';
import {FirebaseRepository} from '../firebase.js';
const date='2026-10-30';
test('Food quantities scale portions and grams, handle decimal commas, and keep unknown complex foods unknown',()=>{
 const rows=['sáng nay: 2 quả chuối','1 whey Nuta','3 trứng luộc không lòng đỏ','200g đậu hũ','1,5 hộp sữa chua không đường','Bún gạo lứt trứng xào rau'].flatMap(text=>parseMeals(text,{date}));
 assert.equal(rows.length,6);assert.equal(rows[0].kcal,210);assert.equal(rows[0].meal,'breakfast');assert.equal(rows[1].protein,27);assert.equal(rows[1].kcal,'');assert.equal(rows[1].portion,'1 × khẩu phần 43 g');assert.equal(rows[2].protein,10.8);assert.equal(rows[3].kcal,152);assert.equal(rows[4].kcal,91.5);assert.equal(rows[5].kcal,'');
 assert.equal(parseMeals('chuối 2 quả',{date})[0].kcal,210);assert.equal(parseMeals('0.1 kg chuối',{date})[0].kcal,89);assert.equal(parseMeals('Bún 400 kcal',{date})[0].kcal,400);
 assert.equal(parseMeals('trứng luộc chiên thêm dầu',{date})[0].kcal,'');assert.throws(()=>parseMeals('0 chuối',{date}));
 for(const f of DEFAULT_FOODS)assert.doesNotThrow(()=>validateFood(f));
});
test('Each submission stays one meal and preserves commas, periods, semicolons, newlines and decimal text',()=>{
 for(const text of ['Bún gạo lứt, trứng xào, rau sống.','Cơm; đậu hũ; canh.','2 chuối, 1 whey Nuta\n3 trứng luộc','Bún. Rau. Trứng.','1,5 hộp sữa chua không đường','0.1 kg chuối']){
  const rows=parseMeals(text,{date});assert.equal(rows.length,1);assert.equal(rows[0].food,text);assert.ok(rows[0].id);
 }
 assert.equal(parseMeals('1,5 hộp sữa chua không đường',{date})[0].kcal,91.5);
 assert.equal(parseMeals('Bún 400 kcal, canh 100 kcal',{date})[0].kcal,'');
 const [meal]=parseMeals('trưa nay: Bún, rau.\nTrứng xào.',{date});assert.equal(meal.food,'Bún, rau.\nTrứng xào.');assert.equal(meal.meal,'lunch');
 assert.throws(()=>parseMeals(' \n ',{date}));
});
test('Workout text supports multiple sets, GAS single sets, assistance, bodyweight and cardio',()=>{
 const rows=parseWorkouts('Chin-up trợ lực 27,2kg 3x12\nLat pulldown 40kg 3 set 10 reps\nDumbbell curl, 20kg x 12\nPush-up bw 3x15\nĐi bộ 30 phút',{date});
 assert.equal(compactWorkout({exercise:'Nhảy dây',kind:'cardio',duration:10},{date}).duration_min,10);assert.equal(compactWorkout({exercise:'Push-up',kind:'strength',count:3,reps:10,kg:5},{date}).kind,'strength');
 assert.equal(rows.length,5);assert.equal(rows[0].kind,'assisted');assert.equal(JSON.parse(rows[0].sets_json).length,3);assert.equal(JSON.parse(rows[0].sets_json)[0].weight_kg,27.2);assert.equal(rows[2].exercise,'Dumbbell curl');assert.equal(JSON.parse(rows[2].sets_json).length,1);assert.equal(rows[3].kind,'bodyweight');assert.equal(rows[4].duration_min,30);
 assert.equal(JSON.parse(parseWorkouts('Dumbbell curl, 10kg x2, 12',{date})[0].sets_json)[0].weight_kg,20);
 assert.equal(JSON.parse(parseWorkouts('3 set bài kneeling easy chin up, counterweight 27.2kg mỗi set 12 rep',{date})[0].sets_json).length,3);
 assert.throws(()=>parseWorkouts('Squat 40kg',{date}));assert.throws(()=>parseWorkouts('Squat 40kg 60x12',{date}));
 assert.throws(()=>ensureWorkoutDay([],[parseWorkouts('nghỉ',{date})[0],rows[0]]));
});
const request=(type='meals')=>{const rows=type==='meals'?['1 chuối','Bún trứng rau'].flatMap(text=>parseMeals(text,{date})):parseWorkouts('Lat pulldown 40kg 3x12',{date});const q=makeRequest(type,date,rows,{scope:'firebase:owner',weight:85,sessionMinutes:40});const output={app:'GymBro',version:1,request_id:q.request_id,date,kind:type,items:rows.map(r=>type==='meals'?{id:r.id,kcal:400,protein_g:20,carbs_g:50,fat_g:12,notes:'ước tính'}:{id:r.id,kcal_burned:180,notes:'ước tính 40 phút, không tính EPOC'})};return {rows,q,output};};
test('Estimate exchange validates request, date, IDs, numbers and stale entries before applying',()=>{
 const {rows,q,output}=request();assert.match(requestPrompt(q),/request_id/);assert.equal(parseEstimate(JSON.stringify(output),q,rows,q.scope)[1].kcal,400);
 const bad=change=>JSON.stringify({...output,...change});
 assert.throws(()=>parseEstimate(bad({date:'2026-10-29'}),q,rows,q.scope));assert.throws(()=>parseEstimate(bad({request_id:'other'}),q,rows,q.scope));assert.throws(()=>parseEstimate(bad({items:[output.items[0],output.items[0]]}),q,rows,q.scope));
 assert.throws(()=>parseEstimate(JSON.stringify(output),q,rows,'firebase:other'));
 assert.throws(()=>parseEstimate(JSON.stringify(output),q,[{...rows[0],food:'Changed'},rows[1]],q.scope));
 for(const value of [-5,'400',undefined]){const o=structuredClone(output);o.items[0].kcal=value;assert.throws(()=>parseEstimate(JSON.stringify(o),q,rows,q.scope));}
});
test('Known label amounts survive estimates; null stays unknown; workout estimates attach only to target ID',()=>{
 const r=parseMeals('1 whey Nuta',{date}),q=makeRequest('meals',date,r,{scope:'local'}),o={app:'GymBro',version:1,request_id:q.request_id,date,kind:'meals',items:[{id:r[0].id,kcal:null,protein_g:99,carbs_g:null,fat_g:null,notes:'thiếu nhãn'}]};
 const applied=parseEstimate(JSON.stringify(o),q,r,q.scope);assert.equal(applied[0].protein,27);assert.equal(applied[0].kcal,'');
 const {rows,q:wq,output}=request('workouts');assert.equal(parseEstimate(JSON.stringify(output),wq,rows,wq.scope)[0].kcal_burned_est,180);
});
test('Local batch is atomic, preserves media references, refuses stale revisions',async()=>{
 const m=new Map(),repo=new LocalRepository({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)});const rows=['1 chuối','1 trứng luộc'].flatMap(text=>parseMeals(text,{date}));await repo.saveMany('WebMeals',rows);
 await assert.rejects(()=>repo.saveMany('WebMeals',[{...rows[0],kcal:999},{...rows[1],date:'2026-02-31'}]));assert.equal((await repo.load()).WebMeals[0].kcal,105);
 await assert.rejects(()=>repo.saveMany('WebMeals',[{...rows[0],_originalUpdatedAt:'stale'}]));
});
test('Photos reject non-JPEG data, unbounded content and invalid meal IDs',()=>{
 const photo={id:'photo-id',meal_id:'meal-id',data_url:'data:image/jpeg;base64,YQ==',created_at:new Date().toISOString()};assert.doesNotThrow(()=>validatePhoto(photo));assert.throws(()=>validatePhoto({...photo,data_url:'data:text/html;base64,YQ=='}));assert.throws(()=>validatePhoto({...photo,data_url:'data:image/jpeg;base64,'+'a'.repeat(360000)}));
});
test('Firebase batch reads all revisions before writing any record',async()=>{
 const {rows}=request(),storage=new Map(rows.map(r=>['users/owner/WebMeals/'+r.id,r])),events=[];
 const s={sessionExpiresAt:Number.MAX_SAFE_INTEGER,auth:{currentUser:{uid:'owner'}},db:{},dbSDK:{doc:(_, ...p)=>p.join('/'),runTransaction:async(_,fn)=>fn({get:async ref=>{events.push('read');return {exists:()=>storage.has(ref),data:()=>storage.get(ref)};},set:(ref,r)=>{events.push('write');storage.set(ref,r);}})}};
 const repo=new FirebaseRepository(s);await repo.saveMany('WebMeals',rows.map(r=>({...r,kcal:222,nutrition_source:'estimate',_originalUpdatedAt:r.updated_at})));assert.deepEqual(events,['read','read','write','write']);
 events.length=0;await assert.rejects(()=>repo.saveMany('WebMeals',[{...rows[0],kcal:300,_originalUpdatedAt:'stale'},rows[1]]));assert.equal(events.includes('write'),false);
});
