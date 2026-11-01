import test from 'node:test';
import assert from 'node:assert/strict';
import {exerciseChoices,exerciseForm} from '../exercise-library.js';

test('Exercise shortcuts deduplicate repeated sets, prioritize recent history and exclude deleted, future and rest logs',()=>{
 const rows=[
  {exercise:'Lat pulldown',kind:'strength',date:'2026-10-29'},
  {exercise:'LAT PULLDOWN',kind:'strength',date:'2026-10-31'},
  {exercise:'Kneeling easy chin up',kind:'assisted',date:'2026-10-30'},
  {exercise:'Custom walk',kind:'cardio',date:'2026-11-01'},
  {exercise:'Future movement',kind:'strength',date:'2026-11-02'},
  {exercise:'Deleted movement',kind:'strength',date:'2026-11-01',deleted:true},
  {exercise:'Ngày nghỉ',kind:'rest',date:'2026-11-01'}
 ];
 const choices=exerciseChoices(rows,'2026-11-01');
 assert.deepEqual(choices.slice(0,3).map(x=>[x.name,x.kind]),[['Custom walk','cardio'],['LAT PULLDOWN','strength'],['Kneeling easy chin up','assisted']]);
 assert.equal(choices.filter(x=>x.key.startsWith('lat pulldown|')).length,1);
 assert.equal(choices.filter(x=>x.name.toLowerCase().includes('kneeling')).length,1);
 assert.ok(!choices.some(x=>/Future|Deleted|Ngày nghỉ/.test(x.name)));
 assert.ok(choices.some(x=>x.name==='Đi bộ'&&x.kind==='cardio'));
});

test('Same-name variants retain their exercise kind, while initial selection never reuses a previous load or duration',()=>{
 const choices=exerciseChoices([{exercise:'Chin up',kind:'assisted',date:'2026-10-31'},{exercise:'Chin up',kind:'bodyweight',date:'2026-10-30'}]);
 assert.equal(choices.filter(x=>x.name==='Chin up').length,2);
 for(const choice of choices.slice(0,2)){
  const form=exerciseForm(choice);
  assert.equal(form.kind,choice.kind);assert.equal(form.exercise,'Chin up');
  assert.equal(form.kg,'');assert.equal(form.duration,'');
 }
 assert.equal(exerciseChoices().find(x=>x.name==='Kneeling easy chin-up').kind,'assisted');
});
