import {currentNutritionTargets} from './access.js';
import {active,num,shiftDate,dateLabel,today,workoutSummary,norm,setsOf} from './core.js';
export const DASHBOARD_RANGES=[7,10,28];
const skipped=r=>String(r.skipped).toLowerCase()==='true';
const valid=v=>num(v)!==null&&num(v)>=0;
export function macroProgress(rows,profile={}){
  const meals=active(rows).filter(r=>!skipped(r)),goal=profile.goal&&typeof profile.goal==='object'?profile.goal:{};
  const items=[['kcal','Năng lượng','kcal',profile.kcal_target],['protein','Protein','g',profile.protein_target],['carbs','Carbs','g',goal.carbs_target],['fat','Chất béo','g',goal.fat_target]].map(([key,label,unit,rawTarget])=>{
    const known=meals.filter(r=>valid(r[key])),value=known.length?known.reduce((sum,r)=>sum+num(r[key]),0):null,target=num(rawTarget)>0?num(rawTarget):null;
    const percent=value!==null&&target!==null?value/target*100:null;
    const name=r=>String(r.food||'').trim()||'Món không tên',groups=new Map();
    for(const r of known){const v=num(r[key]);if(!(v>0))continue;const k=norm(name(r));const g=groups.get(k)||{food:name(r),meals:new Set(),value:0,entries:0};g.value+=v;g.entries++;if(r.meal)g.meals.add(r.meal);groups.set(k,g);}
    const top=[...groups.values()].sort((a,b)=>b.value-a.value).slice(0,3).map(g=>({food:g.food,meals:[...g.meals],entries:g.entries,value:g.value,share:value>0?g.value/value*100:0}));
    const missing=meals.filter(r=>!valid(r[key])).map(name);
    return {key,label,unit,value,target,percent,fill:percent===null?0:Math.max(0,Math.min(percent,100)),over:percent!==null&&percent>100+1e-8,known:known.length,count:meals.length,incomplete:known.length<meals.length,top,missing,energyShare:null};
  });
  // Share of logged energy from each macro (4/4/9 kcal per gram); only meaningful when kcal is known.
  const kcal=items[0].value,factor={protein:4,carbs:4,fat:9};
  for(const m of items)if(factor[m.key]&&kcal>0&&m.value!==null)m.energyShare=m.value*factor[m.key]/kcal*100;
  return items;
}
export function energyDays(data,end,range=10){
  if(!DASHBOARD_RANGES.includes(range))throw Error('Khoảng biểu đồ không hợp lệ.');
  const meals=active(data.WebMeals||[]).filter(r=>!skipped(r)),workouts=active(data.WebWorkouts||[]);
  return Array.from({length:range},(_,i)=>{
    const date=shiftDate(end,i-range+1),food=meals.filter(r=>r.date===date),foodKnown=food.filter(r=>valid(r.kcal)),training=workouts.filter(r=>r.date===date&&r.kind!=='rest'),trainingKnown=training.filter(r=>valid(r.kcal_burned_est));
    const rest=workouts.some(r=>r.date===date&&r.kind==='rest')&&training.length===0;
    return {date,intake:foodKnown.length?foodKnown.reduce((n,r)=>n+num(r.kcal),0):null,burned:trainingKnown.length?trainingKnown.reduce((n,r)=>n+num(r.kcal_burned_est),0):rest?0:null,intakeIncomplete:foodKnown.length<food.length,burnIncomplete:trainingKnown.length<training.length,intakeKnown:foodKnown.length,intakeCount:food.length,burnKnown:trainingKnown.length,burnCount:training.length,rest};
  });
}
export function chooseDashboardDate(value,current=today()){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Ngày Dashboard không hợp lệ.');
  const time=Date.parse(value+'T12:00:00Z');if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value||value>current)throw Error('Chọn ngày hợp lệ, không sau hôm nay.');
  return value===current?null:value;
}
export function dashboardDay(data,date=today()){
  const meals=active(data.WebMeals||[]).filter(r=>r.date===date),workouts=active(data.WebWorkouts||[]).filter(r=>r.date===date);
  return {date,meals,workouts,profile:currentNutritionTargets(data.WebProfile||[]),summary:workoutSummary(workouts),week:workoutSummary(active(data.WebWorkouts||[]).filter(r=>r.date>=shiftDate(date,-6)&&r.date<=date))};
}
export function energyScales(days){
  const intakeMax=Math.max(500,Math.ceil(Math.max(0,...days.map(d=>d.intake??0))/500)*500),burnMax=Math.max(100,Math.ceil(Math.max(0,...days.map(d=>d.burned??0))/100)*100);
  return {intakeMax,burnMax};
}
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format=(n,d=0)=>n===null?'—':Number(n).toLocaleString('vi-VN',{maximumFractionDigits:d});
const MEAL_NAMES={breakfast:'sáng',lunch:'trưa',dinner:'tối',snack:'phụ'};
function renderDialPopover(m){
  const d=m.key==='kcal'?0:1,lower=m.label.toLowerCase();
  const share=m.energyShare!==null?`<p class="dial-pop-share"><strong>${format(m.energyShare)}%</strong> năng lượng đã ghi đến từ ${lower} (1 g = ${m.key==='fat'?9:4} kcal).</p>`:'';
  const top=m.top.length?`<p class="dial-pop-label">Món đóng góp nhiều nhất</p><ol class="dial-pop-list">${m.top.map(t=>`<li><span class="dial-pop-food">${escape(t.food)}${t.entries>1?` <span class="dial-pop-count">×${t.entries}</span>`:''}${t.meals.length?`<small>Bữa ${t.meals.map(k=>MEAL_NAMES[k]||k).join(', ')}</small>`:''}</span><span class="dial-pop-value">${format(t.value,d)} ${m.unit}<small>${format(t.share)}%</small></span><span class="dial-pop-bar" aria-hidden="true"><span style="width:${Math.min(100,t.share).toFixed(1)}%"></span></span></li>`).join('')}</ol>`:`<p class="dial-pop-empty">Chưa có món nào có số liệu ${lower}.</p>`;
  const missing=m.missing.length?`<p class="dial-pop-missing">Chưa có số liệu: ${m.missing.slice(0,3).map(escape).join(', ')}${m.missing.length>3?` và ${m.missing.length-3} món khác`:''}. Tổng thực tế có thể cao hơn.</p>`:'';
  return `<div class="dial-pop" id="dial-pop-${m.key}" role="region" aria-label="Chi tiết ${escape(lower)}"><p class="dial-pop-title">${m.label}: ${format(m.value,d)} ${m.unit}</p>${share}${top}${missing}</div>`;
}
export function renderMacroDials(items){
  return `<div class="macro-dials">${items.map(m=>{
    const status=m.target===null?'Chưa đặt mục tiêu':m.value===null?'Chưa có số liệu':m.over?`Vượt ${format(m.value-m.target,1)} ${m.unit}`:`Còn ${format(Math.max(0,m.target-m.value),1)} ${m.unit}`;
    const label=`${m.label}: ${m.value===null?'chưa có số liệu':format(m.value,1)+' '+m.unit}${m.target===null?', chưa đặt mục tiêu':', mục tiêu '+format(m.target,1)+' '+m.unit}. ${status}${m.incomplete?'. Tổng chưa đầy đủ.':''}`;
    return `<article class="macro-dial ${m.key}${m.over?' over':''}${m.target===null?' no-target':''}" aria-label="${escape(label)}"><h3>${m.label}</h3><button type="button" class="dial-trigger" aria-expanded="false" aria-controls="dial-pop-${m.key}" aria-label="Xem chi tiết ${escape(m.label.toLowerCase())}"><div class="dial-circle"><svg viewBox="0 0 120 120" role="img" aria-label="${escape(label)}"><circle class="dial-track" cx="60" cy="60" r="51"/><circle class="dial-fill" cx="60" cy="60" r="51" pathLength="100" stroke-dasharray="${m.fill.toFixed(2)} 100" stroke-dashoffset="0"/></svg><div class="dial-value"><strong>${format(m.value,m.key==='kcal'?0:1)}</strong><small>${m.unit}</small></div></div></button>${renderDialPopover(m)}<div class="dial-target">${m.target!==null?'/ '+format(m.target,1)+' '+m.unit:'Chưa đặt mục tiêu'}</div><p class="dial-status">${m.target!==null?status:'Đặt mục tiêu để xem %'}${m.percent!==null?' · '+format(m.percent)+'%':''}</p>${m.incomplete?'<small class="dial-incomplete">Chưa đủ số liệu</small>':''}</article>`;
  }).join('')}</div>`;
}
export const MEAL_SHORT={breakfast:'Sáng',lunch:'Trưa',dinner:'Tối',snack:'Phụ'};
// One plate per meal, sized by known kcal; unknown kcal is reported, never counted as 0.
export function energyHero(rows,profile={}){
  const meals=active(rows).filter(r=>!skipped(r)),target=num(profile.kcal_target)>0?num(profile.kcal_target):null;
  const groups=[...Object.entries(MEAL_SHORT),['other','Khác']].map(([key,label])=>{
    const known=meals.filter(r=>(key==='other'?!MEAL_SHORT[r.meal]:r.meal===key)&&valid(r.kcal));
    return known.length?{key,label,kcal:known.reduce((n,r)=>n+num(r.kcal),0)}:null;
  }).filter(Boolean);
  const total=groups.reduce((n,g)=>n+g.kcal,0),remaining=target===null?null:target-total;
  return {plates:groups,total,target,remaining,over:remaining!==null&&remaining<0,unknown:meals.filter(r=>!valid(r.kcal)).length,count:meals.length};
}
export function renderEnergyHero(h,{isToday=true}={}){
  const day=isToday?'hôm nay':'trong ngày',max=Math.max(h.total,h.target??0);
  const caption=h.target===null?'Đã ăn '+day:h.over?'Vượt mục tiêu '+day:'Còn lại '+day;
  const big=h.target===null?h.total:Math.abs(h.remaining);
  const sub=h.target===null?'Chưa đặt mục tiêu kcal.':`Đã ăn ${format(h.total)} trên mục tiêu ${format(h.target)}`;
  const empty=h.target!==null&&h.remaining>0?h.remaining:0;
  const describe=`${caption}: ${format(big)} kcal. `+(h.plates.length?h.plates.map(p=>`${p.label} ${format(p.kcal)}`).join(', ')+' kcal.':'Chưa có món nào có kcal.')+(h.target!==null?` Mục tiêu ${format(h.target)} kcal.`:'');
  const bar=max>0?`<div class="barbell" role="img" aria-label="${escape(describe)}"><span class="barbell-bar"></span><span class="barbell-collar start"></span><div class="barbell-plates">${h.plates.map(p=>`<div class="plate" style="--kcal:${p.kcal}"></div>`).join('')}${empty?`<div class="plate empty" style="--kcal:${empty}"></div>`:''}</div>${h.target!==null?`<span class="barbell-collar target" style="--target:${(h.target/max).toFixed(4)}"></span>`:''}</div><div class="plate-labels" aria-hidden="true">${h.plates.map(p=>`<div style="--kcal:${p.kcal}"><strong>${format(p.kcal)}</strong>${p.label}</div>`).join('')}${empty?`<div style="--kcal:${empty}"><strong>${format(empty)}</strong>còn trống</div>`:''}</div>`:'';
  const note=h.unknown?`<p class="form-note">${h.unknown} món chưa có kcal, chưa tính vào thanh.</p>`:!h.count?`<p class="form-note">Chưa ghi món nào ${day}.</p>`:'';
  return `<section class="energy-hero" aria-label="Năng lượng ${day}"><p class="energy-caption">${caption}</p><p class="energy-big${h.over?' over':''}"><strong>${format(big)}</strong><span>kcal</span></p><p class="energy-sub">${sub}${h.target===null?' <button class="text-button" data-action="new-profile" data-targets="true">Đặt mục tiêu</button>':''}</p>${bar}${note}</section>`;
}
export function energyFocusDate(days,current=today()){
  return days.some(d=>d.date===current)?current:days.at(-1)?.date||'';
}
export function focusEnergyChart(root,previous=null){
  const element=root.querySelector('.energy-chart-scroll');if(!element)return;
  if(previous?.key===element.dataset.chartKey){element.scrollLeft=previous.left;return;}
  const width=num(element.dataset.chartWidth),x=num(element.dataset.focusX);
  if(!(width>0)||x===null)return;
  const max=Math.max(0,element.scrollWidth-element.clientWidth);
  element.scrollLeft=Math.max(0,Math.min(max,x/width*element.scrollWidth-element.clientWidth/2));
}
export function renderEnergyChart(days,{currentDate=today(),target=null}={}){
  const hasData=days.some(d=>d.intake!==null||d.burned!==null);
  if(!hasData)return `<div class="chart-empty">Chưa có số liệu kcal trong ${days.length} ngày đã chọn.<br>Ghi kcal món ăn hoặc ước tính kcal tập luyện để xem biểu đồ.</div>`;
  const width=Math.max(900,days.length*62+140),height=320,left=66,right=width-66,top=42,bottom=244,step=(right-left)/days.length,bw=Math.min(38,step*.5),scales=energyScales(days),goal=num(target)>0?num(target):null,intakeMax=goal?Math.max(scales.intakeMax,Math.ceil(goal*1.1/500)*500):scales.intakeMax,burnMax=scales.burnMax;
  const hasBurn=days.some(d=>d.burned!==null),x=i=>left+(i+.5)*step,yIntake=v=>bottom-v/intakeMax*(bottom-top),yBurn=v=>bottom-v/burnMax*(bottom-top);
  const focusDate=energyFocusDate(days,currentDate),focusIndex=days.findIndex(d=>d.date===focusDate);
  const describe=d=>`${dateLabel(d.date)} · Ăn vào: ${d.intake===null?'chưa có số liệu':format(d.intake)+' kcal'+(d.intakeIncomplete?' (chưa đầy đủ)':'')} · Tập luyện: ${d.burned===null?'chưa có ước tính':format(d.burned)+' kcal'+(d.rest?' (đã ghi nghỉ)':d.burnIncomplete?' (chưa đầy đủ)':'')}`;
  const segments=[];let segment=[];days.forEach((d,i)=>{if(d.burned===null){if(segment.length)segments.push(segment);segment=[];}else segment.push(`${x(i)},${yBurn(d.burned)}`);});if(segment.length)segments.push(segment);
  const svg=`<svg class="energy-chart" style="min-width:${width}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="Kcal theo ngày: ${hasBurn?'cột ăn vào dùng trục trái, đường tập luyện dùng trục phải.':'cột kcal ăn vào; chưa có ước tính kcal tập luyện.'}${days.some(d=>d.date===currentDate)?' Ngày hôm nay có nền sáng và nhãn Hôm nay':''}"><text x="${left}" y="15" class="chart-axis-unit intake-axis">Ăn vào · kcal</text>${hasBurn?`<text x="${right}" y="15" text-anchor="end" class="chart-axis-unit burn-axis">Tập luyện · kcal</text>`:''}${days.map((d,i)=>d.date===currentDate?`<rect class="today-highlight" data-date="${d.date}" x="${x(i)-step/2+3}" y="${top-12}" width="${step-6}" height="${bottom-top+80}" rx="10"/>`:'').join('')}${[0,.5,1].map(f=>`<line x1="${left}" x2="${right}" y1="${yIntake(f*intakeMax)}" y2="${yIntake(f*intakeMax)}" class="energy-grid"/><text class="intake-axis" x="${left-12}" y="${yIntake(f*intakeMax)+4}" text-anchor="end">${format(f*intakeMax)}</text>${hasBurn?`<text class="burn-axis" x="${right+12}" y="${yBurn(f*burnMax)+4}" text-anchor="start">${format(f*burnMax)}</text>`:''}`).join('')}${goal?`<line class="energy-target" x1="${left}" x2="${right}" y1="${yIntake(goal)}" y2="${yIntake(goal)}"/><text class="energy-target-label" x="${left+6}" y="${yIntake(goal)-7}">Mục tiêu ${format(goal)}</text>`:''}${hasBurn?`<line class="burn-axis-line" x1="${right}" x2="${right}" y1="${top}" y2="${bottom}"/>`:''}${days.map((d,i)=>d.intake!==null?`<rect class="intake-bar${d.date===currentDate?' today':''}${d.intakeIncomplete?' partial':''}" x="${x(i)-bw/2}" y="${yIntake(d.intake)}" width="${bw}" height="${Math.max(d.intake===0?2:0,bottom-yIntake(d.intake))}" rx="4"><title>${escape(describe(d))}</title></rect>`:'').join('')}${segments.filter(s=>s.length>1).map(s=>`<polyline class="burn-line" points="${s.join(' ')}"/>`).join('')}${days.map((d,i)=>{
    const intakeLabelY=d.intake!==null?yIntake(d.intake)-10:null;let burnLabelY=d.burned!==null?yBurn(d.burned)-12:null;
    if(intakeLabelY!==null&&burnLabelY!==null&&Math.abs(burnLabelY-intakeLabelY)<20)burnLabelY=yBurn(d.burned)+19;
    return `${d.burned!==null?`<circle class="burn-point${d.burnIncomplete?' partial':''}${d.date===currentDate?' today':''}" cx="${x(i)}" cy="${yBurn(d.burned)}" r="5"><title>${escape(describe(d))}</title></circle>`:''}${d.intake!==null?`<text class="intake-data-label" x="${x(i)}" y="${intakeLabelY}" text-anchor="middle">${format(d.intake)}${d.intakeIncomplete?'*':''}</text>`:''}${d.burned!==null?`<text class="burn-data-label" x="${x(i)}" y="${burnLabelY}" text-anchor="middle">${format(d.burned)}${d.burnIncomplete?'*':''}</text>`:''}${days.length<=10||i%4===0||i===days.length-1||d.date===currentDate?`<text class="chart-date${d.date===currentDate?' today':''}" x="${x(i)}" y="286" text-anchor="middle">${dateLabel(d.date)}</text>${d.date===currentDate?`<text class="chart-today-label" x="${x(i)}" y="307" text-anchor="middle">Hôm nay</text>`:''}`:''}`;
  }).join('')}</svg>`;
  return `<div class="energy-chart-scroll" tabindex="0" role="region" aria-label="Biểu đồ kcal, có thể cuộn ngang" data-chart-key="${days[0].date}:${days.at(-1).date}:${currentDate}" data-chart-width="${width}" data-focus-date="${focusDate}" data-focus-x="${x(focusIndex)}">${svg}</div>${hasBurn?`<div class="energy-legend"><span><i class="intake-key"></i>Kcal ăn vào · trục trái</span><span><i class="burn-key"></i>Kcal tập luyện (ước tính) · trục phải</span>${goal?'<span><i class="target-key"></i>Mục tiêu kcal</span>':''}</div><p class="form-note">Hai trục có thang đo riêng. Nhãn là kcal đã ghi; * là tổng chưa đầy đủ. Ngày thiếu dữ liệu để trống. Kcal tập luyện không phải tổng tiêu hao cả ngày và chưa được trừ khỏi kcal ăn vào.</p>`:`<div class="energy-legend"><span><i class="intake-key"></i>Kcal ăn vào</span>${goal?'<span><i class="target-key"></i>Mục tiêu kcal</span>':''}</div><p class="form-note">Nhãn là kcal đã ghi; * là tổng chưa đầy đủ. Ngày thiếu dữ liệu để trống. Chưa có ước tính kcal tập luyện trong khoảng này.</p>`}<details class="chart-data"><summary>Xem số liệu từng ngày</summary><div class="chart-table-scroll"><table><caption>Kcal từ ${dateLabel(days[0].date)} đến ${dateLabel(days.at(-1).date)}</caption><thead><tr><th scope="col">Ngày</th><th scope="col">Ăn vào</th><th scope="col">Tập luyện</th></tr></thead><tbody>${days.map(d=>`<tr><th scope="row">${dateLabel(d.date)}</th><td>${format(d.intake)}${d.intakeIncomplete?' *':''}</td><td>${format(d.burned)}${d.burnIncomplete?' *':''}${d.rest?' · Nghỉ':''}</td></tr>`).join('')}</tbody></table></div><p class="form-note">Đơn vị kcal. — là chưa biết; * là tổng chưa đầy đủ.</p></details>`;
}

// Name-based hints only; unknown exercises remain explicit and do not imply a body split.
export function classifyExercise(row){
 const t=norm(row.exercise);
 if(row.kind==='rest')return {area:'rest',muscles:[]};
 if(row.kind==='cardio')return {area:'cardio',muscles:['Tim mạch']};
 const rules=[
  [/face pull|reverse fly|rear delt|vai sau/,'support',['Vai sau','Lưng trên']],
  [/crunch|cable rotation|wood ?chop|russian twist|pallof|plank|sit up|leg raise|gap bung|xoay bung/,'support',['Core']],
  [/lateral raise|nang vai ngang/,'support',['Vai giữa']],
  [/bicep|hammer curl|cuon tay/,'support',['Tay trước']],
  [/tricep|pushdown|skull crusher|duoi tay/,'support',['Tay sau']],
  [/chin up|chinup|pull up|pullup|pulldown|pull down|row|keo xa|keo lung/,'upper',['Lưng','Tay trước']],
  [/bench press|chest|push up|pushup|pec fly|chest fly|cable fly|dips|dip|hit dat|nguc/,'upper',['Ngực','Tay sau']],
  [/shoulder press|overhead press|military press|day vai/,'upper',['Vai','Tay sau']],
  [/squat|leg press|lunge|split squat|step up|leg extension|dui truoc/,'lower',['Đùi trước','Mông']],
  [/deadlift|leg curl|hamstring|hip thrust|glute|dui sau/,'lower',['Đùi sau','Mông']],
  [/calf|bap chan/,'lower',['Bắp chân']]
 ];
 for(const [pattern,area,muscles] of rules)if(pattern.test(t))return {area,muscles};
 return {area:'unknown',muscles:[]};
}
export function workoutInsight(rows){
 const all=active(rows),entries=all.filter(r=>r.kind!=='rest').map(row=>({row,...classifyExercise(row)}));
 const areas=new Set(entries.map(e=>e.area)),upper=areas.has('upper'),lower=areas.has('lower');
 const label=upper&&lower?'Full body':upper?'Upper body':lower?'Lower body':areas.has('support')?'Bổ trợ · Accessory':areas.has('cardio')?'Cardio':entries.length?'Chưa xác định nhóm cơ':all.length?'Ngày nghỉ':'Chưa có buổi tập';
 const extras=[];if((upper||lower)&&areas.has('support'))extras.push('Bổ trợ');if((upper||lower||areas.has('support'))&&areas.has('cardio'))extras.push('Cardio');
 return {label,extras,entries,muscles:[...new Set(entries.flatMap(e=>e.muscles))],unknown:entries.filter(e=>e.area==='unknown').length};
}
export function compactExercise(row){
 if(row.kind==='cardio')return `${format(num(row.duration_min),1)} phút`;
 const sets=setsOf(row);if(!sets.length)return 'Chưa ghi sets/reps';
 const groups=[];for(const s of sets){const load=row.kind==='bodyweight'?'Bodyweight':num(s.weight_kg)===null?'? kg':`${format(num(s.weight_kg),1)} kg${row.kind==='assisted'?' trợ lực':''}`,key=load+' × '+format(num(s.reps));const last=groups.at(-1);if(last?.key===key)last.count++;else groups.push({key,count:1});}
 return groups.map(g=>`${g.count} set · ${g.key} reps`).join(' / ');
}
export function renderWorkoutInsight(rows){
 const insight=workoutInsight(rows),summary=workoutSummary(rows);
 const exerciseCount=new Set(insight.entries.map(e=>e.row.kind+':'+norm(e.row.exercise))).size;
 return `<div class="workout-session-title">${escape(insight.label)}</div>${insight.extras.length?`<p class="card-sub">+ ${escape(insight.extras.join(' · '))}</p>`:''}${insight.muscles.length?`<p class="workout-muscles">${escape(insight.muscles.join(' · '))}</p>`:''}${exerciseCount?`<p class="workout-day-totals">${exerciseCount} bài · ${summary.sets} set${summary.minutes>0?' · '+format(summary.minutes,1)+' phút đã ghi':''}</p>`:''}${insight.unknown?'<p class="form-note">Có bài chưa nhận diện nhóm cơ.</p>':''}`;
}
