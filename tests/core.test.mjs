import test from 'node:test';
import assert from 'node:assert/strict';
import {nutrition,workoutSummary,shiftDate,latestProfile,validateRecord,LocalRepository,emptyData,serialize,SCHEMAS} from '../core.js';
import {SheetsRepository,spreadsheetId} from '../sheets.js';

const base={id:'test-log',date:'2026-10-29',created_at:'2026-10-29T08:00:00Z',updated_at:'2026-10-29T08:00:00Z',deleted:false};
const meal={...base,meal:'lunch',food:'Đậu hũ & rau',kcal:'',protein:'',carbs:'',fat:'',nutrition_source:'',skipped:false};
const workout={...base,exercise:'Chin-up',kind:'assisted',sets_json:JSON.stringify([{weight_kg:27.2,reps:12},{weight_kg:27.2,reps:12},{weight_kg:27.2,reps:12}])};

test('Unknown nutrition is incomplete; known zero is valid; skipped/deleted entries do not count',()=>{
  const rows=[meal,{...meal,id:'zero',kcal:0,protein:0},{...meal,id:'known',kcal:400,protein:20},{...meal,id:'skip',skipped:true,kcal:300},{...meal,id:'gone',deleted:'TRUE',kcal:900}];
  assert.deepEqual(nutrition(rows),{kcal:400,protein:20,carbs:0,fat:0,count:3,knownKcal:2,knownProtein:2});
});
test('Assistance, bodyweight, cardio and rest are excluded from external load volume',()=>{
  const summary=workoutSummary([workout,{...workout,id:'weights',kind:'strength',sets_json:'[{"weight_kg":40,"reps":10}]'},{...base,id:'body',kind:'bodyweight',sets_json:'[{"reps":10}]'},{...base,id:'cardio',kind:'cardio',duration_min:30},{...base,id:'rest',date:'2026-10-28',kind:'rest'},{...workout,id:'deleted',deleted:true}]);
  assert.deepEqual(summary,{sessions:1,sets:5,minutes:30,externalVolume:400});
});
test('Date arithmetic crosses month and year boundaries without host timezone assumptions',()=>{
  assert.equal(shiftDate('2026-01-01',-1),'2025-12-31');assert.equal(shiftDate('2024-03-01',-1),'2024-02-29');
});
test('Profile lookup ignores deleted and future records',()=>{
  const rows=[{...base,date:'2026-10-27',weight_kg:84},{...base,date:'2026-10-28',weight_kg:83,deleted:true},{...base,date:'2026-10-30',weight_kg:82}];
  assert.equal(latestProfile(rows,'2026-10-29').weight_kg,84);
});
test('Validation rejects impossible dates, absent loads, negative nutrition and fractional reps',()=>{
  assert.throws(()=>validateRecord('WebMeals',{...meal,date:'2026-02-30'}));
  assert.throws(()=>validateRecord('WebMeals',{...meal,kcal:-1,nutrition_source:'manual'}));
  assert.throws(()=>validateRecord('WebMeals',{...meal,kcal:400}));
  assert.throws(()=>validateRecord('WebWorkouts',{...workout,sets_json:'[{"weight_kg":"","reps":12}]'}));
  assert.throws(()=>validateRecord('WebWorkouts',{...workout,sets_json:'[{"weight_kg":27.2,"reps":1.5}]'}));
  assert.doesNotThrow(()=>validateRecord('WebWorkouts',{...workout,sets_json:'[{"weight_kg":0,"reps":12}]'}));
});
test('Local save is stable by ID; sample storage and personal storage stay separate',async()=>{
  const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
  const local=new LocalRepository(storage),demo=new LocalRepository(storage,'demo');
  await local.save('WebMeals',meal);await local.save('WebMeals',{...meal,food:'Trứng'});
  assert.equal((await local.load()).WebMeals.length,1);assert.equal((await local.load()).WebMeals[0].food,'Trứng');assert.deepEqual(await demo.load(),emptyData());
});
test('Spreadsheet accepts a URL or an ID and rejects arbitrary URLs',()=>{
  assert.equal(spreadsheetId('https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuv/edit'),'abcdefghijklmnopqrstuv');assert.throws(()=>spreadsheetId('https://example.com'));
});

const token=()=>({value:'test-only',expiresAt:Date.now()+3600000});
const response=data=>({ok:true,json:async()=>data});
test('Sheets refuses mismatched headers without attempting writes',async()=>{
  const calls=[],original=globalThis.fetch;globalThis.fetch=async(url,options)=>{calls.push({url,options});return response({values:[['wrong_header']]});};
  try{await assert.rejects(()=>new SheetsRepository('abcdefghijklmnopqrstuv',token()).save('WebMeals',meal),/Header/);assert.equal(calls.length,1);assert.equal(calls[0].options.method,undefined);}finally{globalThis.fetch=original;}
});
test('Sheets reconciles a lost append response by ID and does not append twice',async()=>{
  const original=globalThis.fetch;let writes=0,stored=false;
  globalThis.fetch=async(url,options)=>{if(options.method==='POST'){writes++;stored=true;throw Error('Connection lost');}return response({values:[SCHEMAS.WebMeals,...(stored?[serialize('WebMeals',meal)]:[])]});};
  try{const repo=new SheetsRepository('abcdefghijklmnopqrstuv',token());await repo.save('WebMeals',meal);await repo.save('WebMeals',meal);assert.equal(writes,1);}finally{globalThis.fetch=original;}
});
test('Sheets edit detects a changed revision and does not overwrite a concurrent edit',async()=>{
  const original=globalThis.fetch;let writes=0;
  globalThis.fetch=async(url,options)=>{if(options.method)writes++;return response({values:[SCHEMAS.WebMeals,serialize('WebMeals',{...meal,food:'Other edit',updated_at:'newer'})]});};
  try{const repo=new SheetsRepository('abcdefghijklmnopqrstuv',token());await assert.rejects(()=>repo.save('WebMeals',{...meal,_row:2,_originalUpdatedAt:base.updated_at,food:'My edit'}),/thay đổi/);assert.equal(writes,0);}finally{globalThis.fetch=original;}
});
test('Expired Google token cannot cause a network write',async()=>{
  const repo=new SheetsRepository('abcdefghijklmnopqrstuv',{value:'expired',expiresAt:0});await assert.rejects(()=>repo.save('WebMeals',meal),/hết hạn/);
});
