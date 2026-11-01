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
    const proteinKnown=food.filter(r=>valid(r.protein));
    return {date,protein:proteinKnown.length?proteinKnown.reduce((n,r)=>n+num(r.protein),0):null,proteinIncomplete:proteinKnown.length<food.length,proteinKnown:proteinKnown.length,intake:foodKnown.length?foodKnown.reduce((n,r)=>n+num(r.kcal),0):null,burned:trainingKnown.length?trainingKnown.reduce((n,r)=>n+num(r.kcal_burned_est),0):rest?0:null,intakeIncomplete:foodKnown.length<food.length,burnIncomplete:trainingKnown.length<training.length,intakeKnown:foodKnown.length,intakeCount:food.length,burnKnown:trainingKnown.length,burnCount:training.length,rest};
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
  const caption='Đã ăn '+day,big=h.total;
  const status=h.target===null?'none':h.over?'over':h.remaining===0?'reached':'under';
  const sub={none:'Chưa đặt mục tiêu kcal.',under:`Còn ${format(h.remaining)} kcal nữa là chạm mục tiêu ${format(h.target)}.`,reached:`Vừa chạm mục tiêu ${format(h.target)} kcal.`,over:`Đã vượt mục tiêu ${format(h.target)} thêm ${format(-h.remaining)} kcal.`}[status];
  const empty=h.target!==null&&h.remaining>0?h.remaining:0;
  const describe=`${caption}: ${format(big)} kcal. `+(h.plates.length?h.plates.map(p=>`${p.label} ${format(p.kcal)}`).join(', ')+' kcal.':'Chưa có món nào có kcal.')+(h.target!==null?` Mục tiêu ${format(h.target)} kcal.`:'');
  const bar=max>0?`<div class="barbell" role="img" aria-label="${escape(describe)}"><span class="barbell-bar"></span><span class="barbell-collar start"></span><div class="barbell-plates">${h.plates.map(p=>`<div class="plate" style="--kcal:${p.kcal}"></div>`).join('')}${empty?`<div class="plate empty" style="--kcal:${empty}"></div>`:''}</div>${h.target!==null?`<span class="barbell-collar target" style="--target:${(h.target/max).toFixed(4)}"></span>`:''}</div><div class="plate-labels" aria-hidden="true">${h.plates.map(p=>`<div style="--kcal:${p.kcal}"><strong>${format(p.kcal)}</strong>${p.label}</div>`).join('')}${empty?`<div style="--kcal:${empty}"><strong>${format(empty)}</strong>còn trống</div>`:''}</div>`:'';
  const note=h.unknown?`<p class="form-note">${h.unknown} món chưa có kcal, chưa tính vào thanh.</p>`:!h.count?`<p class="form-note">Chưa ghi món nào ${day}.</p>`:'';
  return `<section class="energy-hero" aria-label="Năng lượng ${day}"><p class="energy-caption">${caption}</p><p class="energy-big"><strong>${format(big)}</strong><span>kcal</span></p><p class="energy-sub ${status}">${sub}${h.target===null?' <button class="text-button" data-action="new-profile" data-targets="true">Đặt mục tiêu</button>':''}</p>${bar}${note}</section>`;
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
export function renderEnergyChart(days,{currentDate=today(),target=null,proteinTarget=null}={}){
  const hasProtein=days.some(d=>num(d.protein)!==null)||num(proteinTarget)>0,hasBurn=days.some(d=>num(d.burned)!==null);
  if(!days.some(d=>num(d.intake)!==null||num(d.burned)!==null||num(d.protein)!==null))return `<div class="chart-empty">Chưa có số liệu dinh dưỡng hoặc tập luyện trong ${days.length} ngày đã chọn.</div>`;
  const goal=num(target)>0?num(target):null,proteinGoal=num(proteinTarget)>0?num(proteinTarget):null;
  const width=Math.max(900,days.length*84+132),height=320,left=66,right=width-66,top=42,bottom=244,step=(right-left)/days.length,bw=Math.min(28,step*.3);
  const maxKcal=Math.max(500,Math.ceil(Math.max(goal?goal*1.1:0,...days.flatMap(d=>[num(d.intake)??0,num(d.burned)??0]))/500)*500);
  const maxProtein=Math.max(50,Math.ceil(Math.max(proteinGoal?proteinGoal*1.1:0,...days.map(d=>num(d.protein)??0))/50)*50);
  const x=i=>left+(i+.5)*step,yKcal=v=>bottom-v/maxKcal*(bottom-top),yProtein=v=>bottom-v/maxProtein*(bottom-top);
  const intakeX=i=>x(i)-(hasProtein?bw+3:bw/2),proteinX=i=>x(i)+3;
  const focusDate=energyFocusDate(days,currentDate),focusIndex=days.findIndex(d=>d.date===focusDate);
  const describe=d=>`${dateLabel(d.date)} · Ăn vào: ${format(num(d.intake))} kcal${d.intakeIncomplete?' (chưa đầy đủ)':''} · Tập luyện: ${format(num(d.burned))} kcal${d.rest?' (nghỉ)':d.burnIncomplete?' (chưa đầy đủ)':''} · Protein: ${format(num(d.protein),1)} g${d.proteinIncomplete?' (chưa đầy đủ)':''}`;
  const segments=[];let segment=[];days.forEach((d,i)=>{if(num(d.burned)===null){if(segment.length)segments.push(segment);segment=[];}else segment.push(`${x(i)},${yKcal(d.burned)}`);});if(segment.length)segments.push(segment);
  const bars=days.map((d,i)=>`${num(d.intake)!==null?`<rect class="intake-bar${d.date===currentDate?' today':''}${d.intakeIncomplete?' partial':''}" x="${intakeX(i)}" y="${yKcal(d.intake)}" width="${bw}" height="${Math.max(d.intake===0?2:0,bottom-yKcal(d.intake))}" rx="4"><title>${escape(describe(d))}</title></rect>`:''}${num(d.protein)!==null?`<rect class="protein-bar${d.proteinIncomplete?' partial':''}" x="${proteinX(i)}" y="${yProtein(d.protein)}" width="${bw}" height="${Math.max(d.protein===0?2:0,bottom-yProtein(d.protein))}" rx="4"><title>${escape(describe(d))}</title></rect>`:''}`).join('');
  const marks=days.map((d,i)=>{
    const labels=[];
    if(num(d.intake)!==null)labels.push({key:'intake',x:intakeX(i)+bw/2,y:yKcal(d.intake),text:format(d.intake)+(d.intakeIncomplete?'*':'')});
    if(num(d.protein)!==null)labels.push({key:'protein',x:proteinX(i)+bw/2,y:yProtein(d.protein),text:format(d.protein,1)+(d.proteinIncomplete?'*':'')});
    if(num(d.burned)!==null)labels.push({key:'burn',x:x(i),y:yKcal(d.burned),text:format(d.burned)+(d.burnIncomplete?'*':'')});
    // Labels stay within the day's slot, shifting vertically when series meet.
    const placed=[];for(const label of labels){
      const half=Math.max(12,label.text.length*4.4);
      const positions=[-10,-29,17,35,-48].map(offset=>Math.max(20,Math.min(bottom-6,label.y+offset)));
      label.labelY=positions.find(y=>placed.every(p=>Math.abs(y-p.labelY)>=18||Math.abs(label.x-p.x)>=half+p.half+3))??positions[0];label.half=half;placed.push(label);
    }
    return `${num(d.burned)!==null?`<circle class="burn-point${d.burnIncomplete?' partial':''}${d.date===currentDate?' today':''}" cx="${x(i)}" cy="${yKcal(d.burned)}" r="5"><title>${escape(describe(d))}</title></circle>`:''}${placed.map(l=>`<text class="${l.key}-data-label" x="${l.x}" y="${l.labelY}" text-anchor="middle">${l.text}</text>`).join('')}${days.length<=10||i%4===0||i===days.length-1||d.date===currentDate?`<text class="chart-date${d.date===currentDate?' today':''}" x="${x(i)}" y="286" text-anchor="middle">${dateLabel(d.date)}</text>${d.date===currentDate?`<text class="chart-today-label" x="${x(i)}" y="307" text-anchor="middle">Hôm nay</text>`:''}`:''}`;
  }).join('');
  const svg=`<svg class="energy-chart combined-chart" style="min-width:${width}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ kết hợp: kcal ăn vào và tập luyện dùng trục trái; protein dùng trục gram bên phải.${days.some(d=>d.date===currentDate)?' Ngày hôm nay được tô nền.':''}"><text x="${left}" y="15" class="chart-axis-unit intake-axis">Năng lượng · kcal</text>${hasProtein?`<text x="${right}" y="15" text-anchor="end" class="chart-axis-unit protein-axis">Protein · g</text>`:''}${days.map((d,i)=>d.date===currentDate?`<rect class="today-highlight" data-date="${d.date}" x="${x(i)-step/2+3}" y="${top-12}" width="${step-6}" height="${bottom-top+80}" rx="10"/>`:'').join('')}${[0,.5,1].map(f=>`<line class="energy-grid" x1="${left}" x2="${right}" y1="${yKcal(f*maxKcal)}" y2="${yKcal(f*maxKcal)}"/><text class="intake-axis" x="${left-12}" y="${yKcal(f*maxKcal)+4}" text-anchor="end">${format(f*maxKcal)}</text>${hasProtein?`<text class="protein-axis" x="${right+12}" y="${yProtein(f*maxProtein)+4}">${format(f*maxProtein)}</text>`:''}`).join('')}${bars}${goal?`<line class="energy-target" x1="${left}" x2="${right}" y1="${yKcal(goal)}" y2="${yKcal(goal)}"/>`:''}${proteinGoal?`<line class="protein-target" x1="${left}" x2="${right}" y1="${yProtein(proteinGoal)}" y2="${yProtein(proteinGoal)}"><title>Mục tiêu protein ${format(proteinGoal,1)} g</title></line>`:''}${segments.filter(s=>s.length>1).map(s=>`<polyline class="burn-line" points="${s.join(' ')}"/>`).join('')}${marks}</svg>`;
  return `<div class="energy-chart-scroll" tabindex="0" role="region" aria-label="Biểu đồ kcal và protein, có thể cuộn ngang" data-chart-key="${days[0].date}:${days.at(-1).date}:${currentDate}" data-chart-width="${width}" data-focus-date="${focusDate}" data-focus-x="${x(focusIndex)}">${svg}</div><div class="energy-legend"><span><i class="intake-key"></i>Kcal ăn vào · trái</span>${hasBurn?'<span><i class="burn-key"></i>Kcal tập luyện (ước tính) · trái</span>':''}${hasProtein?'<span><i class="protein-key"></i>Protein · g · phải</span>':''}${goal?'<span><i class="target-key"></i>Mục tiêu kcal</span>':''}${proteinGoal?'<span><i class="protein-target-key"></i>Mục tiêu protein</span>':''}</div><p class="form-note">Kcal dùng trục trái; gram protein dùng trục phải. * là tổng chưa đầy đủ; ngày thiếu dữ liệu để trống.${hasBurn?'':' Chưa có ước tính kcal tập luyện trong khoảng này.'} Kcal tập luyện không phải tổng tiêu hao cả ngày và chưa được trừ khỏi kcal ăn vào.</p><details class="chart-data"><summary>Xem số liệu từng ngày</summary><div class="chart-table-scroll"><table><caption>Kcal và protein từ ${dateLabel(days[0].date)} đến ${dateLabel(days.at(-1).date)}</caption><thead><tr><th scope="col">Ngày</th><th scope="col">Ăn vào (kcal)</th><th scope="col">Tập luyện (kcal)</th><th scope="col">Protein (g)</th></tr></thead><tbody>${days.map(d=>`<tr><th scope="row">${dateLabel(d.date)}</th><td>${format(num(d.intake))}${d.intakeIncomplete?' *':''}</td><td>${format(num(d.burned))}${d.burnIncomplete?' *':''}${d.rest?' · Nghỉ':''}</td><td>${format(num(d.protein),1)}${d.proteinIncomplete?' *':''}</td></tr>`).join('')}</tbody></table></div></details>`;
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
