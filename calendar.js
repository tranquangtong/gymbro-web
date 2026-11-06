// Month calendar for the Nhật ký page: per-day intake vs kcal target, workout kcal and
// protein progress, plus month insights that compare patterns instead of listing numbers.
import {active,num,today,workoutSummary} from './core.js';
import {dayEnergy} from './dashboard.js';

export const KCAL_BAND=0.10; // within ±10% of the kcal target counts as on target
const WEEK=['T2','T3','T4','T5','T6','T7','CN'];
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format=(n,d=0)=>n===null||n===undefined||!Number.isFinite(Number(n))?'—':Number(n).toLocaleString('vi-VN',{maximumFractionDigits:d});
const short=n=>n>=1000?format(n/1000,1)+'k':format(n);
const signed=n=>(n>0?'+':n<0?'−':'±')+format(Math.abs(n));
const mean=list=>list.length?list.reduce((a,b)=>a+b,0)/list.length:null;
const skipped=r=>String(r.skipped).toLowerCase()==='true';

export function monthOf(date){return String(date).slice(0,7);}
export function validMonth(month){return typeof month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(month);}
export function shiftMonth(month,n){const [y,m]=month.split('-').map(Number),d=new Date(Date.UTC(y,m-1+n,1));return d.toISOString().slice(0,7);}
export function monthDates(month){const [y,m]=month.split('-').map(Number),n=new Date(Date.UTC(y,m,0)).getUTCDate();return Array.from({length:n},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`);}
export function monthLabel(month){const [y,m]=month.split('-');return `Tháng ${Number(m)}, ${y}`;}
const weekdayIndex=date=>(new Date(date+'T12:00:00Z').getUTCDay()+6)%7; // Monday = 0

export function kcalStatus(intake,target){
  if(intake===null||intake===undefined)return 'none';
  if(!(target>0))return 'logged';
  const r=intake/target;return r<1-KCAL_BAND?'under':r>1+KCAL_BAND?'over':'on';
}

// One entry per date of the month, with targets applied.
export function calendarMonth(data,month,{current=today(),kcalTarget=null,proteinTarget=null}={}){
  const meals=active(data.WebMeals||[]).filter(r=>!skipped(r)),workouts=active(data.WebWorkouts||[]);
  const kt=num(kcalTarget)>0?num(kcalTarget):null,pt=num(proteinTarget)>0?num(proteinTarget):null;
  return monthDates(month).map(date=>{
    const e=dayEnergy(meals,workouts,date),training=workouts.filter(r=>r.date===date&&r.kind!=='rest');
    return {...e,sets:workoutSummary(training).sets,session:training.length>0,future:date>current,today:date===current,weekday:weekdayIndex(date),
      status:kcalStatus(e.intake,kt),intakePct:kt&&e.intake!==null?e.intake/kt*100:null,proteinPct:pt&&e.protein!==null?e.protein/pt*100:null,proteinHit:pt&&e.protein!==null?e.protein>=pt:null};
  });
}

function longestRun(flags){let best=0,run=0;for(const f of flags){run=f?run+1:0;best=Math.max(best,run);}return best;}

// Month figures. Today is left out of averages and hit counts: the day is not over yet.
export function monthStats(days){
  const closed=days.filter(d=>!d.future&&!d.today),logged=closed.filter(d=>d.intake!==null);
  const withTarget=logged.filter(d=>d.status!=='logged'),proteinDays=closed.filter(d=>d.proteinHit!==null);
  const sessions=days.filter(d=>!d.future&&d.session),burnKnown=sessions.filter(d=>d.burned!==null&&d.burned>0);
  // Current streak counts back from yesterday; today extends it once its protein is reached.
  let streak=0;const past=days.filter(d=>!d.future);for(let i=past.length-1;i>=0;i--){const d=past[i];if(d.today&&!d.proteinHit)continue;if(d.proteinHit)streak++;else break;}
  return {
    closedDays:closed.length,loggedDays:logged.length,missingDays:closed.length-logged.length,
    avgIntake:mean(logged.map(d=>d.intake)),avgIntakePct:mean(withTarget.map(d=>d.intakePct)),
    under:withTarget.filter(d=>d.status==='under').length,on:withTarget.filter(d=>d.status==='on').length,over:withTarget.filter(d=>d.status==='over').length,withTarget:withTarget.length,
    proteinDays:proteinDays.length,proteinHits:proteinDays.filter(d=>d.proteinHit).length,avgProtein:mean(proteinDays.map(d=>d.protein)),avgProteinPct:mean(proteinDays.map(d=>d.proteinPct)),
    proteinStreak:streak,proteinBest:longestRun(days.filter(d=>!d.future).map(d=>!!d.proteinHit)),
    sessions:sessions.length,burnTotal:burnKnown.reduce((n,d)=>n+d.burned,0),burnKnown:burnKnown.length,
    trainIntake:mean(logged.filter(d=>d.session).map(d=>d.intake)),trainDays:logged.filter(d=>d.session).length,
    restIntake:mean(logged.filter(d=>!d.session).map(d=>d.intake)),restDays:logged.filter(d=>!d.session).length,
    weekendIntake:mean(logged.filter(d=>d.weekday>=5).map(d=>d.intake)),weekendDays:logged.filter(d=>d.weekday>=5).length,
    weekdayIntake:mean(logged.filter(d=>d.weekday<5).map(d=>d.intake)),weekdayDays:logged.filter(d=>d.weekday<5).length
  };
}

// Short, specific findings; each only when the data supports it.
export function monthInsights(stats,prev=null,{kcalTarget=null,proteinTarget=null,prevLabel=''}={}){
  const out=[],kt=num(kcalTarget)>0?num(kcalTarget):null,pt=num(proteinTarget)>0?num(proteinTarget):null;
  if(stats.withTarget>=3&&kt){
    const gap=stats.avgIntake-kt,worst=stats.under>=stats.over?['thiếu',stats.under]:['vượt',stats.over];
    out.push({tone:stats.on>=stats.withTarget/2?'ok':'warn',lead:`Kcal đúng mục tiêu ${stats.on}/${stats.withTarget} ngày`,text:`${worst[1]?`${worst[0]} ${worst[1]} ngày; `:''}trung bình ${format(stats.avgIntake)} kcal, ${gap<0?'thiếu':'dư'} ${format(Math.abs(gap))} kcal/ngày so với ${format(kt)}.`});
  }
  if(stats.proteinDays>=3&&pt){
    out.push({tone:stats.proteinHits>=stats.proteinDays*.7?'ok':'warn',lead:`Protein đạt ${stats.proteinHits}/${stats.proteinDays} ngày`,text:`trung bình ${format(stats.avgProtein)} g (${format(stats.avgProteinPct)}% của ${format(pt)} g). ${stats.proteinStreak>=2?`Đang có chuỗi ${stats.proteinStreak} ngày liên tiếp đạt`:'Chưa có chuỗi đạt liên tiếp'}${stats.proteinBest>stats.proteinStreak&&stats.proteinBest>=2?`; dài nhất tháng: ${stats.proteinBest} ngày`:''}.`});
  }
  if(stats.trainDays>=2&&stats.restDays>=2){
    const diff=stats.trainIntake-stats.restIntake;
    out.push({tone:'info',lead:`Ngày tập ăn ${Math.abs(diff)<100?'gần bằng':diff>0?'nhiều hơn':'ít hơn'} ngày không tập`,text:`${format(stats.trainIntake)} so với ${format(stats.restIntake)} kcal (${signed(Math.round(diff))}).`});
  }
  if(stats.weekendDays>=2&&stats.weekdayDays>=3){
    const diff=stats.weekendIntake-stats.weekdayIntake;
    if(Math.abs(diff)>=150)out.push({tone:'info',lead:`Cuối tuần ăn ${diff>0?'nhiều':'ít'} hơn ngày thường`,text:`${format(stats.weekendIntake)} so với ${format(stats.weekdayIntake)} kcal (${signed(Math.round(diff))}).`});
  }
  if(prev&&prev.loggedDays>=5&&stats.loggedDays>=5){
    const parts=[`kcal TB ${signed(Math.round(stats.avgIntake-prev.avgIntake))}`];
    if(pt&&prev.proteinDays&&stats.proteinDays)parts.push(`đạt protein ${format(prev.proteinHits/prev.proteinDays*100)}% → ${format(stats.proteinHits/stats.proteinDays*100)}% số ngày`);
    parts.push(`${prev.sessions} → ${stats.sessions} buổi tập`);
    out.push({tone:'info',lead:`So với ${prevLabel||'tháng trước'}`,text:parts.join(', ')+'.'});
  }
  if(stats.missingDays>0)out.push({tone:'muted',lead:`${stats.missingDays} ngày chưa ghi ăn uống`,text:'không tính vào trung bình.'});
  return out;
}

function cellLabel(d,{kcalTarget,proteinTarget}){
  const parts=[d.date];
  parts.push(d.intake===null?'chưa ghi ăn':`ăn ${format(d.intake)}${kcalTarget?' / '+format(kcalTarget):''} kcal${d.intakeIncomplete?' (chưa đủ)':''}`);
  if(d.protein!==null)parts.push(`protein ${format(d.protein,1)} g${d.proteinPct!==null?` (${format(d.proteinPct)}%)`:''}`);
  parts.push(d.session?(d.burned?`tập ${format(d.burned)} kcal`:'có tập'):d.rest?'ngày nghỉ':'không tập');
  return parts.join(', ');
}

export function renderCalendar({month,days,stats,insights,selected,current=today(),kcalTarget=null,proteinTarget=null}){
  const thisMonth=monthOf(current),canNext=month<thisMonth,lead=(days[0]?.weekday)||0;
  const nav=`<div class="cal-nav"><button class="icon-button" data-action="cal-prev" aria-label="Tháng trước">‹</button><label class="cal-month"><span>${monthLabel(month)}</span><input id="cal-month" type="month" value="${month}" max="${thisMonth}" aria-label="Chọn tháng"></label><button class="icon-button" data-action="cal-next" aria-label="Tháng sau" ${canNext?'':'disabled'}>›</button>${month!==thisMonth?'<button class="text-button" data-action="cal-today">Tháng này</button>':''}</div>`;
  const tile=(cls,label,value,sub)=>`<div class="chart-stat ${cls}"><small>${label}</small><strong>${value}</strong><span>${sub}</span></div>`;
  const tiles=`<div class="cal-stats">${tile('intake','Kcal TB / ngày',format(stats.avgIntake),stats.avgIntakePct!==null?`${format(stats.avgIntakePct)}% mục tiêu · đúng ${stats.on}/${stats.withTarget} ngày`:kcalTarget?'chưa đủ số liệu':'chưa đặt mục tiêu')}${tile('protein','Ngày đạt protein',proteinTarget?`${stats.proteinHits}<em>/${stats.proteinDays}</em>`:'—',proteinTarget?`TB ${format(stats.avgProtein)} g · ${format(stats.avgProteinPct)}%`:'chưa đặt mục tiêu')}${tile('burn','Buổi tập',String(stats.sessions),stats.burnKnown?`${format(stats.burnTotal)} kcal ước tính`:'chưa có kcal tập')}${tile('logged','Đã ghi',`${stats.loggedDays}<em>/${stats.closedDays}</em>`,`ngày${stats.closedDays<days.filter(d=>!d.future).length?' · chưa tính hôm nay':''}`)}</div>`;
  const notes=insights.length?`<ul class="cal-insights">${insights.map(i=>`<li class="${i.tone}"><strong>${escape(i.lead)}:</strong> ${escape(i.text)}</li>`).join('')}</ul>`:'<p class="card-sub">Ghi thêm vài ngày để có nhận xét cho tháng này.</p>';
  const cells=days.map(d=>{
    const missing=!d.future&&!d.today&&d.intake===null;
    const cls=['cal-day','k-'+d.status,d.today?'today':'',d.future?'future':'',missing?'missing':'',d.date===selected?'selected':'',d.proteinHit?'p-hit':''].filter(Boolean).join(' ');
    const p=d.proteinPct===null?'':`<span class="cal-protein" title="Protein ${format(d.proteinPct)}%"><i style="width:${Math.min(100,d.proteinPct).toFixed(0)}%"></i></span><span class="cal-protein-pct">P ${format(d.proteinPct)}%</span>`;
    const burn=d.session?`<span class="cal-burn">${d.burned?format(d.burned)+' tập':'Tập'}</span>`:d.rest?'<span class="cal-burn rest">Nghỉ</span>':'';
    const kcal=d.intake===null?(missing?'<span class="cal-missing">Chưa ghi</span>':''):`<span class="cal-kcal"><b class="full">${format(d.intake)}</b><b class="short">${short(d.intake)}</b>${d.intakeIncomplete?'*':''}</span>`;
    return `<button type="button" class="${cls}" data-action="cal-day" data-date="${d.date}" ${d.future?'disabled':''} aria-pressed="${d.date===selected}" aria-label="${escape(cellLabel(d,{kcalTarget,proteinTarget}))}"><span class="cal-num">${Number(d.date.slice(8))}</span>${kcal}${p}${burn}</button>`;
  }).join('');
  const legend=`<div class="cal-legend"><span><i class="k-under"></i>Thiếu kcal (&lt;90%)</span><span><i class="k-on"></i>Đúng mục tiêu (±10%)</span><span><i class="k-over"></i>Vượt (&gt;110%)</span><span><i class="p-key"></i>Protein so với mục tiêu</span><span><i class="b-key"></i>Kcal tập (ước tính)</span></div>`;
  return `${nav}${tiles}<section class="cal-notes"><h3>Nhận xét</h3>${notes}</section><div class="cal-grid" role="group" aria-label="${monthLabel(month)}">${WEEK.map(w=>`<span class="cal-weekday">${w}</span>`).join('')}${'<span class="cal-pad"></span>'.repeat(lead)}${cells}</div>${legend}`;
}

// Numbers for the selected day's panel.
export function renderDayHeadline(d,{kcalTarget=null,proteinTarget=null}={}){
  const kt=num(kcalTarget)>0?num(kcalTarget):null,pt=num(proteinTarget)>0?num(proteinTarget):null;
  const item=(cls,label,value,sub)=>`<div class="cal-figure ${cls}"><small>${label}</small><strong>${value}</strong>${sub?`<span>${sub}</span>`:''}</div>`;
  const statusText={under:'thiếu',on:'đúng mục tiêu',over:'vượt',logged:'',none:''}[d.status];
  return `<div class="cal-figures">${item('intake k-'+d.status,'Ăn vào',d.intake===null?'—':format(d.intake)+(d.intakeIncomplete?'*':''),kt&&d.intake!==null?`/ ${format(kt)} kcal · ${format(d.intakePct)}% · ${statusText}`:'kcal')}${item('protein'+(d.proteinHit?' p-hit':''),'Protein',d.protein===null?'—':format(d.protein,1)+(d.proteinIncomplete?'*':''),pt&&d.protein!==null?`/ ${format(pt)} g · ${format(d.proteinPct)}%${d.proteinHit?' · đạt':''}`:'g')}${item('burn','Tập luyện',d.session?(d.burned?format(d.burned):'—'):d.rest?'Nghỉ':'—',d.session?`kcal ước tính · ${d.sets} set`:d.rest?'ngày nghỉ':'không tập')}</div>`;
}
