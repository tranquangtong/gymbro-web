import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateMacroTargets,suggestMacroGoal,profileDetails,currentNutritionTargets} from '../access.js';
import {macroProgress,renderMacroDials,classifyExercise,workoutInsight,compactExercise,renderWorkoutInsight} from '../dashboard.js';
import {cleanRecord} from '../migration.js';
const row=(exercise,extra={})=>({exercise,kind:'strength',sets_json:JSON.stringify([{weight_kg:40,reps:12},{weight_kg:40,reps:12},{weight_kg:50,reps:10}]),...extra});
const input={weight_kg:85,tdee_kcal:2600,bmr_kcal:1800,age:29};
test('Macro helper adjusts calories by explicit goal, uses current weight and balances 4/4/9',()=>{
 for(const [macro_goal,kcal,protein] of [['loss',2210,170],['gain',2860,153],['maintain',2600,153],['recomp',2600,170]]){
  const r=estimateMacroTargets({...input,macro_goal,target_weight_kg:60});assert.equal(r.kcal_target,kcal);assert.equal(r.protein_target,protein);assert.ok(Math.abs(4*r.protein_target+4*r.carbs_target+9*r.fat_target-kcal)<1);assert.ok(Math.abs(r.fat_target*9/kcal-.25)<.001);assert.match(r.note,/Không cộng thêm kcal tập luyện/);
 }
 for(const extra of [{age:''},{age:17},{weight_kg:0},{tdee_kcal:100},{bmr_kcal:3000},{macro_goal:''},{tdee_kcal:1900,bmr_kcal:1800}])assert.throws(()=>estimateMacroTargets({...input,macro_goal:'loss',...extra}));
});
test('Free-text goals only suggest a selectable preset and selected preset survives persistence',()=>{
 assert.equal(suggestMacroGoal('Giảm mỡ, tăng cơ'),'recomp');assert.equal(suggestMacroGoal('Giảm cân'),'loss');assert.equal(suggestMacroGoal('Tăng cơ'),'gain');assert.equal(suggestMacroGoal('Tăng sức mạnh hít xà'),'maintain');assert.equal(suggestMacroGoal('Chạy marathon'),'');
 const p=cleanRecord('WebProfile',{id:'p',goal:{macro_goal:'loss',carbs_target:200,fat_target:60}});assert.equal(profileDetails(p).macro_goal,'loss');
});
test('Ring geometry expresses real target ratio, caps above target and keeps unset target empty',()=>{
 const html=renderMacroDials(macroProgress([{kcal:1000,protein:150,carbs:0,fat:20}],{kcal_target:2000,protein_target:100,goal:{carbs_target:200}}));
 assert.match(html,/pathLength="100" stroke-dasharray="50.00 100"/);assert.match(html,/stroke-dasharray="100.00 100"/);assert.match(html,/stroke-dasharray="0.00 100"/);assert.match(html,/50%/);assert.match(html,/150%/);assert.match(html,/Đặt target để xem %/);
});
test('Session split identifies upper, lower, full body and accessory-only workouts',()=>{
 const upper=[row('Kneeling easy chin-up'),row('Reverse grip lat pulldown'),row('Incline bench press')],lower=[row('Leg press'),row('Leg curl')],support=[row('Shoulder cable face pull'),row('Ab crunch'),row('Cable rotation')];
 assert.equal(workoutInsight(upper).label,'Upper body');assert.equal(workoutInsight(lower).label,'Lower body');assert.equal(workoutInsight([...upper,...lower]).label,'Full body');assert.equal(workoutInsight(support).label,'Bổ trợ · Accessory');assert.equal(workoutInsight([...upper,...support]).label,'Upper body');assert.deepEqual(workoutInsight([...upper,...support]).extras,['Bổ trợ']);assert.ok(workoutInsight(upper).muscles.includes('Lưng'));
 assert.equal(classifyExercise(row('Shoulder cable face pull')).area,'support');assert.equal(classifyExercise(row('Leg curl')).area,'lower');assert.equal(classifyExercise(row('Dumbbell shoulder press')).area,'upper');
});
test('Unknown, deleted, rest and cardio entries do not invent a body split',()=>{
 assert.equal(workoutInsight([row('mystery')]).unknown,1);assert.equal(workoutInsight([row('mystery')]).label,'Chưa xác định nhóm cơ');assert.equal(workoutInsight([row('Squat',{deleted:true}),row('Chest press')]).label,'Upper body');assert.equal(workoutInsight([row('Nghỉ',{kind:'rest'})]).label,'Ngày nghỉ');assert.equal(workoutInsight([]).label,'Chưa có buổi tập');assert.equal(workoutInsight([row('Đi bộ',{kind:'cardio'})]).label,'Cardio');
});
test('Compact exercises preserve changed loads/reps, assistance semantics and escaped names',()=>{
 assert.equal(compactExercise(row('Pulldown')),'2 set · 40 kg × 12 reps / 1 set · 50 kg × 10 reps');assert.match(compactExercise(row('Chin-up',{kind:'assisted'})),/kg trợ lực/);assert.match(compactExercise(row('Push-up',{kind:'bodyweight'})),/Bodyweight/);assert.doesNotMatch(compactExercise(row('Push-up',{kind:'bodyweight'})),/kg/);assert.equal(compactExercise(row('Walk',{kind:'cardio',duration_min:20})),'20 phút');
 const html=renderWorkoutInsight([row('<img src=x onerror=alert(1)>')]);assert.doesNotMatch(html,/<img/);assert.doesNotMatch(html,/onerror/);assert.match(html,/chưa nhận diện nhóm cơ/);
});

test('Nutrition targets are shared across diary dates; newest explicit save wins even on an old profile date',()=>{
 const rows=[{id:'new-date',date:'2026-10-30',updated_at:'2026-10-30T08:00:00Z',kcal_target:2000,protein_target:120,goal:{carbs_target:250,fat_target:60}},{id:'old-date',date:'2026-10-28',updated_at:'2026-10-30T09:00:00Z',kcal_target:2200,protein_target:150,goal:{carbs_target:260,fat_target:65}}];
 assert.equal(currentNutritionTargets(rows).kcal_target,2200);
 const saved={id:'global',date:'2026-10-30',updated_at:'2026-10-30T10:00:00Z',kcal_target:2300,protein_target:160,goal:{global_targets:true,carbs_target:270,fat_target:65}};
 assert.equal(currentNutritionTargets([...rows,saved]).kcal_target,2300);
 const cleared={...saved,id:'clear',updated_at:'2026-10-30T11:00:00Z',kcal_target:'',protein_target:'',goal:{global_targets:true,carbs_target:'',fat_target:''}};
 assert.equal(currentNutritionTargets([...rows,saved,cleared]).kcal_target,'','cleared targets must not resurrect old targets');
 assert.equal(currentNutritionTargets([...rows,{...saved,deleted:true}]).kcal_target,2200);
 assert.equal(currentNutritionTargets([]).kcal_target,'');
 const cleaned=cleanRecord('WebProfile',saved);assert.equal(cleaned.goal.global_targets,true);
});

test('Dashboard workout summary counts distinct exercises and total sets without expanding legacy rows',()=>{
 const rows=[...Array.from({length:4},()=>row('incline chest press machine',{sets_json:'[{"weight_kg":50,"reps":13}]'})),...Array.from({length:4},()=>row('shoulder press machine',{sets_json:'[{"weight_kg":36,"reps":12}]'})),row('Đi bộ',{kind:'cardio',duration_min:18,sets_json:'[]'})];
 const html=renderWorkoutInsight(rows);assert.match(html,/Upper body/);assert.match(html,/Cardio/);assert.match(html,/3 bài · 8 set · 18 phút đã ghi/);assert.doesNotMatch(html,/<li>|workout-session-list|incline chest press machine|50 kg/);
 assert.doesNotMatch(renderWorkoutInsight([row('Nghỉ',{kind:'rest'})]),/0 bài|0 set/);
});
