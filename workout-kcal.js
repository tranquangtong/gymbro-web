import {num,norm,setsOf,latestProfile} from './core.js';
const round=n=>Math.round((n+1e-9)*10)/10,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const workoutWeight=(profiles,date)=>num(latestProfile(profiles||[],date).weight_kg)??num(latestProfile(profiles||[]).weight_kg);
// Legacy GAS defaults: these per-exercise MET/minute values and load adjustments
// are app heuristics, not individually measured or verbatim Compendium values.
export function strengthPreset(row){
 const t=norm(row.exercise);
 for(const [pattern,group,met,minutes] of [
  [/deadlift/,'lower_compound_heavy',6,3.4],[/squat|leg press|lunge/,'lower_compound',5.8,3.2],
  [/bench|chest press/,'upper_compound',4.8,2.7],[/shoulder press|overhead press|military press/,'upper_press',4.4,2.5],
  [/row|pull down|pulldown|pull up|pullup|chin up|chinup/,'upper_pull',4.6,2.6],
  [/leg curl/,'lower_isolation',4.2,2.3],[/leg extension/,'lower_isolation',4.8,2.5],
  [/curl|extension|pushdown/,'upper_isolation',3.5,2],[/sit up|push up|pushup|plank|crunch|rotation|face pull/,'calisthenics',3.8,1.6],
  [/machine/,'machine_general',3.8,2.1]
 ])if(pattern.test(t))return {group,met,minutes};
 return {group:'strength_general',met:4.2,minutes:2.3};
}
function loadFactor(row,set,p,weight){
 const reps=num(set.reps)||0,repsFactor=reps?clamp(.82+reps/45,.88,1.25):1;
 // Machine counterweight is assistance, never external lifted load/volume.
 if(row.kind==='assisted'||row.kind==='bodyweight')return repsFactor;
 const kg=num(set.weight_kg)||0,relative=kg/weight,volume=kg*reps/weight;
 let load=1;if(p.group.startsWith('lower_compound'))load=clamp(.95+relative*.35,.95,1.25);
 else if(['upper_compound','upper_press','upper_pull'].includes(p.group))load=clamp(.95+relative*.25,.92,1.16);
 else if(p.group==='lower_isolation')load=clamp(.94+relative*.25,.92,1.18);
 else if(['upper_isolation','machine_general'].includes(p.group))load=clamp(.95+relative*.15,.9,1.1);
 return clamp(repsFactor*load*(volume>0?clamp(.96+volume*.018,.94,1.12):1),.85,1.35);
}
function cardioMet(row){
 const raw=String(row.exercise||'')+' '+String(row.notes||''),t=norm(raw),speed=Number(raw.match(/(\d+(?:[.,]\d+)?)\s*(?:kph|km\/h|kmh)\b/i)?.[1]?.replace(',','.'))||0;
 const grade=Number(raw.match(/(\d+(?:[.,]\d+)?)\s*%/)?.[1]?.replace(',','.'))||0;
 if(/walk|di bo|treadmill/.test(t))return speed>0&&grade>0?(0.1*speed*1000/60+1.8*speed*1000/60*grade/100+3.5)/3.5:speed>=6.4?5.5:speed>=5.6?4.8:speed>=4.5?3.8:speed>0?3:grade>0?4.5:3.8;
 if(/bike|cycling|bicycle|dap xe/.test(t)){
  const watts=Number(raw.match(/(\d+(?:[.,]\d+)?)\s*(?:watts?|w)\b/i)?.[1]?.replace(',','.'))||0;
  if(watts>0)return [[30,3.5],[50,4],[60,5],[80,5.8],[100,6],[125,6.8],[150,8],[199,10.3],[229,10.8],[250,12.5],[305,13.8],[Infinity,16.3]].find(([max])=>watts<=max)[1];
  return /very light|rat nhe/.test(t)?3.5:/light|nhe/.test(t)?4:/vigorous|hard|nang/.test(t)?8:5.8;
 }
 return /run|jog|chay/.test(t)?7:/elliptical/.test(t)?5:3.5;
}
export function estimateWorkoutBatch(rows,{weight,sessionMinutes=null,overwrite=false}={}){
 const w=num(weight);if(w===null||w<=0||w>500)throw Error('Cần cân nặng trong hồ sơ để tính kcal.');
 const session=num(sessionMinutes);if(session!==null&&(session<=0||session>1440))throw Error('Tổng thời lượng phải từ trên 0 đến 1440 phút.');
 const entries=rows.map(row=>{
  if(row.kind==='rest')return {row,minutes:0,met:0,assumed:false};
  if(row.kind==='cardio')return {row,minutes:num(row.duration_min),met:cardioMet(row),assumed:false};
  const p=strengthPreset(row),sets=setsOf(row);if(!sets.length||sets.some(s=>num(s.reps)===null||num(s.reps)<=0))return {row,minutes:null,met:p.met,assumed:true};
  const factors=sets.map(s=>loadFactor(row,s,p,w)),minutes=factors.reduce((n,f)=>n+p.minutes*f,0),met=factors.reduce((n,f)=>n+p.met*f*p.minutes*f,0)/minutes;
  return {row,minutes:num(row.duration_min)>0?num(row.duration_min):minutes,met,assumed:!(num(row.duration_min)>0),preset:p};
 });
 const fixed=entries.filter(e=>!e.assumed).reduce((n,e)=>n+(e.minutes||0),0),inferred=entries.filter(e=>e.assumed&&e.minutes>0),sum=inferred.reduce((n,e)=>n+e.minutes,0);
 if(session!==null&&fixed>session+1e-8)throw Error('Tổng phút buổi tập nhỏ hơn thời lượng đã ghi của các bài. Kiểm tra lại.');
 const remaining=session===null?null:session-fixed;
 return entries.map(e=>{
  const r=e.row;if(!overwrite&&num(r.kcal_burned_est)!==null)return {...r};
  if(e.minutes===null||e.minutes<=0&&r.kind!=='rest')return {...r,kcal_burned_est:'',kcal_estimation_notes:'Chưa đủ sets/reps hoặc phút cardio để ước tính.'};
  const minutes=e.assumed&&remaining!==null&&sum>0?remaining*e.minutes/sum:e.minutes;
  const kcal=round(e.met*3.5*w/200*minutes),basis=e.assumed?(session===null?`giả định ${round(minutes)} phút tập + nghỉ theo ${setsOf(r).length} set (preset GAS legacy)`:`phân bổ ${round(minutes)} phút từ tổng buổi ${session} phút, theo tỷ trọng các set`):`${round(minutes)} phút đã ghi`;
  return {...r,kcal_burned_est:kcal,kcal_estimation_notes:r.kind==='rest'?'GymBro · ngày nghỉ · 0 kcal':`GymBro · gross kcal ≈ ${round(e.met)} MET × 3,5 × ${w} kg / 200 × ${round(minutes)} phút; ${basis}. ${r.kind==='cardio'?'MET theo tốc độ/độ dốc/watts nếu có, còn lại giả định mức vừa.':'MET và hệ số tải là heuristic GAS legacy.'} Độ tin cậy thấp khi dùng giả định; không gồm EPOC.${r.kind==='assisted'?' Kg máy là trợ lực, không tính như tạ nâng.':''}`};
 });
}
