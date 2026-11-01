import {active,EXERCISES,KINDS,norm} from './core.js';

// Reuse the loaded diary: opening the picker never needs another database read.
export function exerciseChoices(rows=[],date='9999-12-31'){
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
    const kind=name==='Kneeling easy chin-up'?'assisted':['Steep walking','Đi bộ','Đạp xe'].includes(name)?'cardio':'strength';
    const key=norm(name)+'|'+kind;choices.set(key,{key,name,kind,recent:false});
  }
  return [...choices.values()];
}

export function exerciseForm(choice){
  // A previous exercise's load/minutes must never carry over to another movement.
  return {exercise:choice.name,kind:choice.kind,kg:'',duration:'',count:3,reps:12};
}
