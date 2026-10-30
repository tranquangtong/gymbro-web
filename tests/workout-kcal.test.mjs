import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateWorkoutBatch,workoutWeight} from '../workout-kcal.js';
import {parseWorkouts,makeRequest,requestPrompt,parseEstimate} from '../quick.js';
const date='2026-10-29',rows=text=>parseWorkouts(text,{date});
test('Legacy single-set logs and grouped sets have the same total, without requiring minutes',()=>{
 const one=rows('Incline chest press machine 50kg 1x13')[0],three=rows('Incline chest press machine 50kg 3x13')[0];
 const a=estimateWorkoutBatch([one],{weight:85})[0],b=estimateWorkoutBatch([three],{weight:85})[0];
 // GAS: met=4.8*f, minutes=2.7*f, with reps/load/volume clamps.
 const f=(.82+13/45)*(.95+50/85*.25)*( .96+50*13/85*.018 );
 const expected=Math.round(4.8*f*3.5*85/200*2.7*f*10)/10;
 assert.equal(a.kcal_burned_est,expected);assert.ok(Math.abs(b.kcal_burned_est-3*expected)<=.2);assert.match(a.kcal_estimation_notes,/giả định/);assert.equal(a.duration_min,'');
});
test('Assistance kg cannot increase kcal as if it were lifted weight; changed reps/sets still count',()=>{
 const a=estimateWorkoutBatch(rows('Chin-up trợ lực 27.2kg 3x12'),{weight:85})[0],b=estimateWorkoutBatch(rows('Chin-up trợ lực 50kg 3x12'),{weight:85})[0];
 assert.equal(a.kcal_burned_est,b.kcal_burned_est);assert.match(a.kcal_estimation_notes,/trợ lực/);assert.ok(a.kcal_burned_est>0);
});
test('Session minutes are allocated once, subtracting recorded cardio before resistance allocation',()=>{
 const r=rows('Lat pulldown 40kg 3x12\nChest press 50kg 3x12\nĐi bộ 20 phút');
 const out=estimateWorkoutBatch(r,{weight:85,sessionMinutes:50});
 const times=out.slice(0,2).map(r=>Number(r.kcal_estimation_notes.match(/phân bổ ([\d.]+) phút/)[1]));assert.ok(Math.abs(times[0]+times[1]-30)<.11);assert.equal(out[2].kcal_burned_est,113.1);assert.throws(()=>estimateWorkoutBatch(r,{weight:85,sessionMinutes:15}));
});
test('Existing estimates and their revisions survive automatic saves; explicit recalc can replace estimates',()=>{
 const r={...rows('Lat pulldown 40kg 3x12')[0],kcal_burned_est:123,kcal_estimation_notes:'known',_originalUpdatedAt:'rev'};
 assert.deepEqual(estimateWorkoutBatch([r],{weight:85})[0],r);assert.notEqual(estimateWorkoutBatch([r],{weight:85,overwrite:true})[0].kcal_burned_est,123);assert.equal(estimateWorkoutBatch([r],{weight:85,overwrite:true})[0]._originalUpdatedAt,'rev');
 assert.throws(()=>estimateWorkoutBatch([r],{weight:null}));assert.equal(estimateWorkoutBatch(rows('nghỉ'),{weight:85})[0].kcal_burned_est,0);
});
test('Newer cardio presets retain watts and incline formula; unknown duration stays unknown',()=>{
 const walking={...rows('Đi bộ 18 phút')[0],exercise:'Incline walking 5 kph 10%'};
 const result=estimateWorkoutBatch([walking],{weight:85})[0];assert.equal(result.kcal_burned_est,205.3);
 const bike={...rows('Đạp xe 20 phút')[0],exercise:'Recumbent bike 75W'};assert.equal(estimateWorkoutBatch([bike],{weight:85})[0].kcal_burned_est,172.6);
 assert.equal(estimateWorkoutBatch([{...bike,duration_min:''}],{weight:85})[0].kcal_burned_est,'');
});
test('Prompt permits labeled duration assumptions and local results use the same safe JSON import',()=>{
 const r=rows('Lat pulldown 40kg 3x12'),q=makeRequest('workouts',date,r,{scope:'firebase:owner',weight:85,method:'local'}),prompt=requestPrompt(q);
 assert.doesNotMatch(prompt,/Không suy ra thời gian tập chỉ từ set\/reps/);assert.match(prompt,/baseline_kcal/);assert.match(prompt,/không trả null chỉ vì thiếu thời gian/);
 const calculated=estimateWorkoutBatch(r,{weight:85}),output={app:'GymBro',version:1,request_id:q.request_id,date,kind:'workouts',items:calculated.map(x=>({id:x.id,kcal_burned:x.kcal_burned_est,notes:x.kcal_estimation_notes}))};
 const applied=parseEstimate(JSON.stringify(output),q,r,q.scope);assert.equal(applied[0].kcal_burned_est,calculated[0].kcal_burned_est);assert.match(applied[0].kcal_estimation_notes,/^GymBro/);assert.throws(()=>parseEstimate(JSON.stringify(output),q,[{...r[0],exercise:'Edited'}],q.scope));
 assert.equal(workoutWeight([{date:'2026-10-30',weight_kg:85}],date),85);
});
