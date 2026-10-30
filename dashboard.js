import {active,num,shiftDate,dateLabel,today,latestProfile,workoutSummary} from './core.js';
export const DASHBOARD_RANGES=[7,10,28];
const skipped=r=>String(r.skipped).toLowerCase()==='true';
const valid=v=>num(v)!==null&&num(v)>=0;
export function macroProgress(rows,profile={}){
  const meals=active(rows).filter(r=>!skipped(r)),goal=profile.goal&&typeof profile.goal==='object'?profile.goal:{};
  return [['kcal','Năng lượng','kcal',profile.kcal_target],['protein','Protein','g',profile.protein_target],['carbs','Carbs','g',goal.carbs_target],['fat','Fat','g',goal.fat_target]].map(([key,label,unit,rawTarget])=>{
    const known=meals.filter(r=>valid(r[key])),value=known.length?known.reduce((sum,r)=>sum+num(r[key]),0):null,target=num(rawTarget)>0?num(rawTarget):null;
    const percent=value!==null&&target!==null?value/target*100:null;
    return {key,label,unit,value,target,percent,fill:percent===null?0:Math.max(0,Math.min(percent,100)),over:percent!==null&&percent>100+1e-8,known:known.length,count:meals.length,incomplete:known.length<meals.length};
  });
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
  return {date,meals,workouts,profile:latestProfile(data.WebProfile||[],date),summary:workoutSummary(workouts),week:workoutSummary(active(data.WebWorkouts||[]).filter(r=>r.date>=shiftDate(date,-6)&&r.date<=date))};
}
export function energyScales(days){
  const intakeMax=Math.max(500,Math.ceil(Math.max(0,...days.map(d=>d.intake??0))/500)*500),burnMax=Math.max(100,Math.ceil(Math.max(0,...days.map(d=>d.burned??0))/100)*100);
  return {intakeMax,burnMax};
}
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format=(n,d=0)=>n===null?'—':Number(n).toLocaleString('vi-VN',{maximumFractionDigits:d});
export function renderMacroDials(items){
  return `<div class="macro-dials">${items.map(m=>{
    const status=m.target===null?'Chưa đặt mục tiêu':m.value===null?'Chưa có số liệu':m.over?`Vượt ${format(m.value-m.target,1)} ${m.unit}`:`Còn ${format(Math.max(0,m.target-m.value),1)} ${m.unit}`;
    const label=`${m.label}: ${m.value===null?'chưa có số liệu':format(m.value,1)+' '+m.unit}${m.target===null?', chưa đặt mục tiêu':', mục tiêu '+format(m.target,1)+' '+m.unit}. ${status}${m.incomplete?'. Tổng chưa đầy đủ.':''}`;
    return `<article class="macro-dial ${m.key}${m.over?' over':''}${m.target===null?' no-target':''}" aria-label="${escape(label)}"><h3>${m.label}</h3><div class="dial-circle"><svg viewBox="0 0 120 120" role="img" aria-label="${escape(label)}"><circle class="dial-track" cx="60" cy="60" r="51"/><circle class="dial-fill" cx="60" cy="60" r="51" stroke-dasharray="${(m.fill/100*320.44).toFixed(2)} 320.44"/></svg><div class="dial-value"><strong>${format(m.value,m.key==='kcal'?0:1)}</strong><small>${m.unit}</small></div></div><div class="dial-target">${m.target!==null?'/ '+format(m.target,1)+' '+m.unit:'Chưa đặt mục tiêu'}</div><p class="dial-status">${m.target!==null?status:'—'}${m.percent!==null?' · '+format(m.percent)+'%':''}</p>${m.incomplete?'<small class="dial-incomplete">Chưa đủ số liệu</small>':''}</article>`;
  }).join('')}</div>`;
}
export function renderEnergyChart(days){
  const hasData=days.some(d=>d.intake!==null||d.burned!==null);
  if(!hasData)return `<div class="chart-empty">Chưa có số liệu kcal trong ${days.length} ngày đã chọn.<br>Ghi kcal món ăn hoặc ước tính kcal tập luyện để xem biểu đồ.</div>`;
  const width=Math.max(900,days.length*62+140),height=320,left=66,right=width-66,top=42,bottom=244,step=(right-left)/days.length,bw=Math.min(38,step*.5),{intakeMax,burnMax}=energyScales(days);
  const x=i=>left+(i+.5)*step,yIntake=v=>bottom-v/intakeMax*(bottom-top),yBurn=v=>bottom-v/burnMax*(bottom-top);
  const describe=d=>`${dateLabel(d.date)} · Ăn vào: ${d.intake===null?'chưa có số liệu':format(d.intake)+' kcal'+(d.intakeIncomplete?' (chưa đầy đủ)':'')} · Tập luyện: ${d.burned===null?'chưa có ước tính':format(d.burned)+' kcal'+(d.rest?' (đã ghi nghỉ)':d.burnIncomplete?' (chưa đầy đủ)':'')}`;
  const segments=[];let segment=[];days.forEach((d,i)=>{if(d.burned===null){if(segment.length)segments.push(segment);segment=[];}else segment.push(`${x(i)},${yBurn(d.burned)}`);});if(segment.length)segments.push(segment);
  const svg=`<svg class="energy-chart" style="min-width:${days.length*54+120}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="Kcal theo ngày: cột ăn vào dùng trục trái, đường tập luyện dùng trục phải, có số liệu trên từng điểm"><text x="${left}" y="15" class="chart-axis-unit intake-axis">Ăn vào · kcal</text><text x="${right}" y="15" text-anchor="end" class="chart-axis-unit burn-axis">Tập luyện · kcal</text>${[0,.5,1].map(f=>`<line x1="${left}" x2="${right}" y1="${yIntake(f*intakeMax)}" y2="${yIntake(f*intakeMax)}" class="energy-grid"/><text class="intake-axis" x="${left-12}" y="${yIntake(f*intakeMax)+4}" text-anchor="end">${format(f*intakeMax)}</text><text class="burn-axis" x="${right+12}" y="${yBurn(f*burnMax)+4}" text-anchor="start">${format(f*burnMax)}</text>`).join('')}<line class="burn-axis-line" x1="${right}" x2="${right}" y1="${top}" y2="${bottom}"/>${days.map((d,i)=>d.intake!==null?`<rect class="intake-bar${d.intakeIncomplete?' partial':''}" x="${x(i)-bw/2}" y="${yIntake(d.intake)}" width="${bw}" height="${Math.max(d.intake===0?2:0,bottom-yIntake(d.intake))}" rx="4"><title>${escape(describe(d))}</title></rect>`:'').join('')}${segments.filter(s=>s.length>1).map(s=>`<polyline class="burn-line" points="${s.join(' ')}"/>`).join('')}${days.map((d,i)=>{
    const intakeLabelY=d.intake!==null?yIntake(d.intake)-10:null;let burnLabelY=d.burned!==null?yBurn(d.burned)-12:null;
    if(intakeLabelY!==null&&burnLabelY!==null&&Math.abs(burnLabelY-intakeLabelY)<20)burnLabelY=yBurn(d.burned)+19;
    return `${d.burned!==null?`<circle class="burn-point${d.burnIncomplete?' partial':''}" cx="${x(i)}" cy="${yBurn(d.burned)}" r="5"><title>${escape(describe(d))}</title></circle>`:''}${d.intake!==null?`<text class="intake-data-label" x="${x(i)}" y="${intakeLabelY}" text-anchor="middle">${format(d.intake)}${d.intakeIncomplete?'*':''}</text>`:''}${d.burned!==null?`<text class="burn-data-label" x="${x(i)}" y="${burnLabelY}" text-anchor="middle">${format(d.burned)}${d.burnIncomplete?'*':''}</text>`:''}${days.length<=10||i%4===0||i===days.length-1?`<text x="${x(i)}" y="286" text-anchor="middle">${dateLabel(d.date)}</text>`:''}`;
  }).join('')}</svg>`;
  return `<div class="energy-chart-scroll">${svg}</div><div class="energy-legend"><span><i class="intake-key"></i>Kcal ăn vào · trục trái</span><span><i class="burn-key"></i>Kcal tập luyện (ước tính) · trục phải</span></div><p class="form-note">Hai trục có thang đo riêng. Nhãn là kcal đã ghi; * là tổng chưa đầy đủ. Ngày thiếu dữ liệu để trống. Kcal tập luyện không phải tổng tiêu hao cả ngày và chưa được trừ khỏi kcal ăn vào.</p><details class="chart-data"><summary>Xem số liệu từng ngày</summary><div class="chart-table-scroll"><table><caption>Kcal từ ${dateLabel(days[0].date)} đến ${dateLabel(days.at(-1).date)}</caption><thead><tr><th scope="col">Ngày</th><th scope="col">Ăn vào</th><th scope="col">Tập luyện</th></tr></thead><tbody>${days.map(d=>`<tr><th scope="row">${dateLabel(d.date)}</th><td>${format(d.intake)}${d.intakeIncomplete?' *':''}</td><td>${format(d.burned)}${d.burnIncomplete?' *':''}${d.rest?' · Nghỉ':''}</td></tr>`).join('')}</tbody></table></div><p class="form-note">Đơn vị kcal. — là chưa biết; * là tổng chưa đầy đủ.</p></details>`;
}
