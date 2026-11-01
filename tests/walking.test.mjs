import test from 'node:test';
import assert from 'node:assert/strict';
import {applyWalkingSettings,walkingSettings} from '../walking.js';
import {compactWorkout} from '../quick.js';
import {cleanRecord} from '../migration.js';
import {estimateWorkoutBatch} from '../workout-kcal.js';

test('Walking settings survive compact save and edit through the existing notes schema',()=>{
 const r=compactWorkout({exercise:'steep walking',kind:'cardio',duration:15,incline:8,speed:5},{date:'2026-11-01'});
 const clean=cleanRecord('WebWorkouts',r);assert.deepEqual(walkingSettings(clean),{incline:'8',speed:'5'});
 const edited=applyWalkingSettings({...clean,notes:clean.notes+'\nKeep this note'},{incline:0,speed:4.5});
 assert.deepEqual(walkingSettings(edited),{incline:'0',speed:'4.5'});assert.match(edited.notes,/Keep this note/);
 assert.equal(edited.notes.split('Máy đi bộ:').length,2);
 assert.throws(()=>applyWalkingSettings(r,{incline:41,speed:5}),/Độ dốc/);
 assert.throws(()=>applyWalkingSettings(r,{incline:8,speed:0}),/Tốc độ/);
});

test('Walking calorie estimation uses supplied grade and speed, including explicit zero grade',()=>{
 const rows=[0,8].map(incline=>compactWorkout({exercise:'steep walking',kind:'cardio',duration:15,incline,speed:5},{date:'2026-11-01'}));
 const estimated=rows.map(r=>estimateWorkoutBatch([r],{weight:85})[0]);
 assert.ok(estimated[1].kcal_burned_est>estimated[0].kcal_burned_est);
 const old={exercise:'steep walking 5 kph 10%',kind:'cardio',notes:''};
 assert.deepEqual(walkingSettings(old),{incline:'10',speed:'5'});
});
