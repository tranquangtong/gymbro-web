import {norm,num} from './core.js';
export const isWalking=name=>/walk|di bo|treadmill/.test(norm(name));
export function walkingSettings(row={}){
 const note=String(row.notes||''),managed=note.split('\n').find(x=>x.startsWith('Máy đi bộ:'));
 const raw=managed??(String(row.exercise||'')+' '+note);
 return {incline:raw.match(/(\d+(?:[.,]\d+)?)\s*%/)?.[1]?.replace(',','.')??'',speed:raw.match(/(\d+(?:[.,]\d+)?)\s*(?:kph|km\/h|kmh)\b/i)?.[1]?.replace(',','.')??''};
}
export function applyWalkingSettings(row,fields){
 if(row.kind!=='cardio'||!isWalking(row.exercise))return row;
 const incline=String(fields.incline??'').trim(),speed=String(fields.speed??'').trim();
 if(incline!==''&&(num(incline)===null||num(incline)<0||num(incline)>40))throw Error('Độ dốc từ 0 đến 40%.');
 if(speed!==''&&(num(speed)===null||num(speed)<=0||num(speed)>25))throw Error('Tốc độ lớn hơn 0 và tối đa 25 kph.');
 const notes=String(row.notes||'').split('\n').filter(x=>!x.startsWith('Máy đi bộ:')).join('\n').trim();
 const line=[incline!==''?Number(incline)+'%':'',speed!==''?Number(speed)+' kph':''].filter(Boolean).join(' · ');
 return {...row,notes:[notes,line?'Máy đi bộ: '+line:''].filter(Boolean).join('\n')};
}
