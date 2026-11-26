import {active,EXERCISES,KINDS,norm} from '../core/core.js';

const choicesCache=new WeakMap();

// Reuse the loaded diary: opening the picker never needs another database read.
// Memoized per WebWorkouts array reference + date so typing suggestions stays O(1).
export function exerciseChoices(rows=[],date='9999-12-31'){
  const cacheable=Array.isArray(rows);
  if(cacheable){
    const byDate=choicesCache.get(rows),cached=byDate?.get(date);
    if(cached&&cached.len===rows.length&&cached.last===rows[rows.length-1])return cached.result;
  }
  const choices=new Map(),seenNames=new Set();
  const history=active(rows).filter(r=>r.date<=date&&r.kind!=='rest'&&KINDS[r.kind]&&norm(r.exercise))
    .sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||'')));
  for(const row of history){
    const name=String(row.exercise).trim(),key=norm(name)+'|'+row.kind;
    if(!choices.has(key))choices.set(key,{key,name,kind:row.kind,recent:true});
    seenNames.add(norm(name));
  }
  for(const name of EXERCISES){
    if(seenNames.has(norm(name)))continue;
    const kind=name==='Kneeling easy chin-up'?'assisted':/^Roman chair/.test(name)?'bodyweight':['Steep walking','Đi bộ','Đạp xe','Bắn cung'].includes(name)?'cardio':'strength';
    const key=norm(name)+'|'+kind;choices.set(key,{key,name,kind,recent:false});
  }
  const result=[...choices.values()];
  if(cacheable){
    let byDate=choicesCache.get(rows);
    if(!byDate){byDate=new Map();choicesCache.set(rows,byDate);}
    if(byDate.size>8)byDate.clear();
    byDate.set(date,{len:rows.length,last:rows[rows.length-1],result});
  }
  return result;
}

export function exerciseForm(choice){
  // A previous exercise's load/minutes must never carry over to another movement.
  return {exercise:choice.name,kind:choice.kind,kg:'',duration:'',count:3,reps:12};
}
