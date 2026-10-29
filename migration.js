import {SCHEMAS,emptyData,num,norm,validateRecord} from './core.js';

export const EXTRAS={
  WebMeals:['fiber','kcal_known','kcal_estimated','kcal_buffer','confidence','nutrition_notes'],
  WebWorkouts:['kcal_burned_est','legacy_set_no','legacy_volume_kg','load_uncertain','legacy_activity'],
  WebProfile:['height_cm','age','gender','goal','BMI','TDEE']
};
const ARCHIVE_FIELDS={
  report:['weekday','kcal_intake','kcal_target','kcal_delta','protein_g','protein_target','carb_g','carb_target','fiber_g','fiber_target','fat_g','fat_target','macro_status','meals_logged','missing_meals','workout_sets','workout_volume_kg','kcal_burned','workout_summary','confidence','insight','action','generated_at','eatlog_rows','workoutlog_rows','report_version'],
  workout_plan:['weekday','muscle_group','exercise','target_sets','target_reps','target_weight','notes','status'],
  diet_plan:['meal','target_kcal','target_protein','target_carbs','target_fat','notes','status'],
  review:['exercise','weight_kg','reps','set_no','volume_kg','kcal_burned_est','notes','reason']
};
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o[k]!==undefined&&o[k]!==null).map(k=>[k,o[k]]));
export function cleanRecord(table,r){
  if(table==='Archive')return {...pick(r,['id','date','type','title','created_at','updated_at','deleted']),payload:pick(r.payload||{},ARCHIVE_FIELDS[r.type]||[])};
  if(!SCHEMAS[table])throw Error('Loại bản ghi không hỗ trợ.');
  return pick(r,[...SCHEMAS[table],...(EXTRAS[table]||[])]);
}
export function validateArchive(r){if(!r.id||!ARCHIVE_FIELDS[r.type]||typeof r.payload!=='object'||!r.date||!/^\d{4}-\d{2}-\d{2}$/.test(r.date))throw Error('Bản ghi tư liệu không hợp lệ.');return r;}
function dateKey(v){const x=String(v||'').trim();if(/^\d{4}-\d{2}-\d{2}/.test(x))return x.slice(0,10);const m=x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;throw Error('Không đọc được ngày: '+x);}
const value=v=>num(v)??'';
const truth=v=>String(v).toLowerCase()==='true';
function rows(source,tab){const data=source[tab]||[],headers=data[0]||[];return data.slice(1).flatMap((row,i)=>row?.some(v=>v!=null&&String(v).trim()!=='')?[{row:i+2,data:Object.fromEntries(headers.map((h,j)=>[h,row[j]??'']))}]:[]);}
function hash(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(16);}
export function convertSheets(source,{sourceId='gymbro',importDate=new Date().toISOString().slice(0,10)}={}){
  const data=emptyData(),issues=[],counts={};data.Archive=[];
  const base=(tab,row,date,created)=>({id:`legacy_${hash(sourceId)}_${tab.replace(/\W/g,'')}_${row}`,date,created_at:created||date+'T00:00:00+07:00',updated_at:created||date+'T00:00:00+07:00',deleted:false});
  for(const tab of ['EatLog','WorkoutLog','Profile','Daily Report','WorkoutPlan','DietPlan']){
    const list=rows(source,tab);counts[tab]=tab==='Daily Report'?list.filter(x=>x.data.date).length:list.length;
    for(const {row,data:r} of list){
      try{
        if(tab==='EatLog'){
          const date=dateKey(r.date),mealKey=norm(r.meal),meal={sang:'breakfast',trua:'lunch',toi:'dinner',chieu:'snack',phu:'snack',snack:'snack'}[mealKey]||'snack';
          const known=num(r.kcal_known),total=num(r.kcal_total),estimated=num(r.kcal_estimated),skipped=truth(r.skipped);
          const record={...base(tab,row,date,r.created_at),meal,food:r.food_text,portion:'',kcal:skipped?'':known??total??estimated??'',protein:skipped?'':value(r.protein_g_est),carbs:skipped?'':value(r.carb_g_est),fat:skipped?'':value(r.fat_g_est),fiber:skipped?'':value(r.fiber_g_est),nutrition_source:skipped?'':known!==null?'manual':total!==null||estimated!==null||[r.protein_g_est,r.carb_g_est,r.fat_g_est,r.fiber_g_est].some(v=>num(v)!==null)?'estimate':'',skipped,notes:mealKey&&!['sang','trua','toi','chieu','phu','snack'].includes(mealKey)?'Bữa gốc: '+r.meal:'',kcal_known:value(r.kcal_known),kcal_estimated:value(r.kcal_estimated),kcal_buffer:value(r.kcal_buffer),confidence:r.macro_confidence,nutrition_notes:r.macro_notes};
          validateRecord('WebMeals',record);data.WebMeals.push(cleanRecord('WebMeals',record));
        }else if(tab==='WorkoutLog'){
          const date=dateKey(r.date),text=norm(r.exercise),raw=norm(r.raw_text),rest=/^(off|rest|nghi|ngay nghi)$/.test(text),assisted=/chin up|pull up|hit xa/.test(text)&&/kneel|easy|assist|tro luc|counterweight/.test(text+' '+raw),cardio=/walking|di bo|treadmill|cycling|bike|dap xe|archery|ban cung|running|chay bo|elliptical/.test(text),body=/push up|plank|sit up|crunch/.test(text)&&num(r.weight_kg)===0;
          const duration=String(r.raw_text||'').match(/(\d+(?:[.,]\d+)?)\s*(?:phút|phut|minutes?|mins?)/i);
          // Unknown load conventions and cardio duration are kept for review, never invented.
          if((cardio&&!duration)||(!rest&&!cardio&&!body&&(num(r.weight_kg)===null||num(r.reps)===null))){const issue={tab,row,reason:cardio?'Chưa xác định thời lượng cardio':'Thiếu kg hoặc reps'};issues.push(issue);data.Archive.push(cleanRecord('Archive',{...base(tab,row,date,r.created_at),type:'review',title:r.exercise,payload:{...pick(r,ARCHIVE_FIELDS.review),notes:r.raw_text,reason:issue.reason}}));continue;}
          const kind=rest?'rest':cardio?'cardio':assisted?'assisted':body?'bodyweight':'strength';
          const record={...base(tab,row,date,r.created_at),exercise:r.exercise,kind,sets_json:JSON.stringify(['rest','cardio'].includes(kind)?[]:[{weight_kg:body?'':value(r.weight_kg),reps:value(r.reps)}]),duration_min:cardio?Number(duration[1].replace(',','.')):'',notes:r.raw_text||'',kcal_burned_est:value(r.kcal_burned_est),legacy_set_no:value(r.set_no),legacy_volume_kg:value(r.volume_kg),load_uncertain:!rest&&!cardio&&!body&&!assisted&&/chin up|pull up/.test(text),legacy_activity:''};
          validateRecord('WebWorkouts',record);data.WebWorkouts.push(cleanRecord('WebWorkouts',record));
        }else if(tab==='Profile'){
          const date=dateKey(r.updated_at);const record={...base(tab,row,date),weight_kg:value(r.weight_kg),kcal_target:'',protein_target:'',notes:r.notes,...pick(r,EXTRAS.WebProfile)};validateRecord('WebProfile',record);data.WebProfile.push(cleanRecord('WebProfile',record));
        }else{
          if(tab==='Daily Report'&&!r.date)continue;
          const type=tab==='Daily Report'?'report':tab==='WorkoutPlan'?'workout_plan':'diet_plan',date=type==='report'?dateKey(r.date):importDate;
          data.Archive.push(cleanRecord('Archive',{...base(tab,row,date),type,title:type==='report'?'Báo cáo '+date:tab==='WorkoutPlan'?r.weekday+' · '+r.exercise:r.meal,payload:pick(r,ARCHIVE_FIELDS[type])}));
        }
      }catch(error){issues.push({tab,row,reason:error.message});}
    }
  }
  return {app:'GymBro Web',version:2,kind:'sheets-migration',created_at:new Date().toISOString(),data,summary:{sourceRows:counts,destinationRows:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])),issues},};
}
export function validateBundle(bundle){if(bundle?.app!=='GymBro Web'||![1,2].includes(bundle.version)||!bundle.data||bundle.mode==='demo')throw Error('File không phải bản xuất GymBro thật.');const result={...bundle,data:emptyData()};result.data.Archive=[];let count=0;for(const table of [...Object.keys(SCHEMAS),'Archive']){const rows=bundle.data[table]||[];if(!Array.isArray(rows))throw Error('Cấu trúc file không hợp lệ.');const seen=new Set();result.data[table]=rows.map(r=>{const clean=cleanRecord(table,r);table==='Archive'?validateArchive(clean):validateRecord(table,clean);if(seen.has(clean.id))throw Error('File có ID trùng: '+clean.id);seen.add(clean.id);if(++count>20000)throw Error('File quá lớn; tối đa 20.000 bản ghi.');return clean;});}return result;}
