import test from 'node:test';
import assert from 'node:assert/strict';
import {monthDates,shiftMonth,validMonth,monthLabel,kcalStatus,calendarMonth,monthStats,monthInsights,renderCalendar,renderDayHeadline} from '../calendar.js';

const meal=(date,kcal,protein,extra={})=>({id:`m-${date}-${kcal}`,date,meal:'lunch',food:'x',kcal,protein,created_at:date,updated_at:date,deleted:false,...extra});
const lift=(date,kcal,extra={})=>({id:`w-${date}`,date,kind:'strength',exercise:'Squat',sets_json:JSON.stringify([{weight_kg:60,reps:8},{weight_kg:60,reps:8}]),kcal_burned_est:kcal,created_at:date,updated_at:date,deleted:false,...extra});
const T={kcalTarget:2000,proteinTarget:100};

test('Month helpers handle lengths, year boundaries and invalid input',()=>{
  assert.equal(monthDates('2026-02').length,28);assert.equal(monthDates('2028-02').length,29);assert.equal(monthDates('2026-11').at(-1),'2026-11-30');
  assert.equal(shiftMonth('2026-01',-1),'2025-12');assert.equal(shiftMonth('2026-12',1),'2027-01');
  assert.equal(validMonth('2026-11'),true);assert.equal(validMonth('2026-13'),false);assert.equal(validMonth('x'),false);
  assert.equal(monthLabel('2026-11'),'Tháng 11, 2026');
});

test('Kcal status uses a ±10% band and treats missing intake as none',()=>{
  assert.equal(kcalStatus(null,2000),'none');assert.equal(kcalStatus(1700,2000),'under');assert.equal(kcalStatus(1800,2000),'on');
  assert.equal(kcalStatus(2200,2000),'on');assert.equal(kcalStatus(2201,2000),'over');assert.equal(kcalStatus(1500,null),'logged');
});

test('Calendar days carry intake, protein %, workout kcal and future/today flags',()=>{
  const data={WebMeals:[meal('2026-11-02',1500,80),meal('2026-11-02',400,30),meal('2026-11-03',900,null),meal('2026-11-03',300,null,{skipped:true})],WebWorkouts:[lift('2026-11-02',350),{id:'r',date:'2026-11-04',kind:'rest',created_at:'',updated_at:'',deleted:false}]};
  const days=calendarMonth(data,'2026-11',{current:'2026-11-05',...T});
  assert.equal(days.length,30);assert.equal(days[0].weekday,6,'1 Nov 2026 is a Sunday');
  const d2=days[1];assert.equal(d2.intake,1900);assert.equal(d2.status,'on');assert.equal(d2.protein,110);assert.equal(d2.proteinHit,true);assert.equal(Math.round(d2.proteinPct),110);assert.equal(d2.burned,350);assert.equal(d2.session,true);assert.equal(d2.sets,2);
  const d3=days[2];assert.equal(d3.intake,900,'skipped meals excluded');assert.equal(d3.status,'under');assert.equal(d3.protein,null);assert.equal(d3.proteinHit,null);
  assert.equal(days[3].rest,true);assert.equal(days[3].session,false);
  assert.equal(days[4].today,true);assert.equal(days[5].future,true);
});

test('Month stats leave today out, count hits and streaks, and compare training vs rest days',()=>{
  const meals=[],workouts=[];
  // 1–8 Nov: protein hit on 3–8 (6-day streak), miss on 1–2; training on even days eats +400.
  for(let d=1;d<=8;d++){const date=`2026-11-0${d}`;meals.push(meal(date,d%2?1800:2200,d<=2?60:120));if(d%2===0)workouts.push(lift(date,300));}
  meals.push(meal('2026-11-09',500,20)); // today, unfinished
  const days=calendarMonth({WebMeals:meals,WebWorkouts:workouts},'2026-11',{current:'2026-11-09',...T}),s=monthStats(days);
  assert.equal(s.closedDays,8);assert.equal(s.loggedDays,8);assert.equal(s.missingDays,0);
  assert.equal(s.avgIntake,2000);assert.equal(s.on,8);assert.equal(s.under,0,'today (500 kcal) not counted as under');
  assert.equal(s.proteinHits,6);assert.equal(s.proteinDays,8);assert.equal(s.proteinStreak,6,'today not hit yet does not break the streak');assert.equal(s.proteinBest,6);
  assert.equal(s.sessions,4);assert.equal(s.burnTotal,1200);assert.equal(s.trainIntake,2200);assert.equal(s.restIntake,1800);
  const notes=monthInsights(s,null,T),text=notes.map(n=>n.lead+' '+n.text).join('\n');
  assert.match(text,/Kcal đúng mục tiêu 8\/8 ngày/);assert.match(text,/Protein đạt 6\/8 ngày/);assert.match(text,/chuỗi 6 ngày/);
  assert.match(text,/Ngày tập ăn nhiều hơn ngày không tập 2\.200 so với 1\.800 kcal \(\+400\)/);
  assert.doesNotMatch(text,/So với/,'no previous month data');
});

test('Insights compare with the previous month only when both have enough days, and flag unlogged days',()=>{
  const s={closedDays:10,loggedDays:8,missingDays:2,avgIntake:2100,avgIntakePct:105,under:1,on:6,over:1,withTarget:8,proteinDays:8,proteinHits:6,avgProtein:110,avgProteinPct:110,proteinStreak:0,proteinBest:3,sessions:5,trainDays:0,restDays:0,weekendDays:0,weekdayDays:0};
  const prev={...s,loggedDays:20,avgIntake:1900,proteinDays:20,proteinHits:10,sessions:9};
  const text=monthInsights(s,prev,{...T,prevLabel:'tháng 10 2026'}).map(n=>n.lead+' '+n.text).join('\n');
  assert.match(text,/So với tháng 10 2026 kcal TB \+200, đạt protein 50% → 75% số ngày, 9 → 5 buổi tập\./);
  assert.match(text,/2 ngày chưa ghi ăn uống/);
  assert.equal(monthInsights({...s,withTarget:2,proteinDays:2,missingDays:0},{...prev,loggedDays:3},T).length,0);
});

test('Calendar markup: Monday-first padding, disabled future days, status classes, and no next month past the current one',()=>{
  const days=calendarMonth({WebMeals:[meal('2026-11-02',2500,120)],WebWorkouts:[]},'2026-11',{current:'2026-11-05',...T}),stats=monthStats(days);
  const html=renderCalendar({month:'2026-11',days,stats,insights:[],selected:'2026-11-02',current:'2026-11-05',...T});
  assert.equal((html.match(/class="cal-pad"/g)||[]).length,6,'Sunday 1 Nov sits in the 7th column');
  assert.match(html,/class="cal-day k-over selected p-hit" data-action="cal-day" data-date="2026-11-02"/);
  assert.match(html,/data-date="2026-11-06" disabled/);assert.match(html,/data-action="cal-next" aria-label="Tháng sau" disabled/);
  assert.match(html,/<b class="full">2\.500<\/b><b class="short">2,5k<\/b>/);
  assert.match(renderCalendar({month:'2026-10',days:calendarMonth({},'2026-10',{current:'2026-11-05'}),stats:monthStats([]),insights:[],current:'2026-11-05'}),/Tháng này/);
  assert.match(renderDayHeadline(days[1],T),/2\.500<\/strong><span>\/ 2\.000 kcal · 125% · vượt/);
});
