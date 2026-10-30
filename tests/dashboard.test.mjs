import test from 'node:test';
import assert from 'node:assert/strict';
import {macroProgress,energyDays,renderMacroDials,renderEnergyChart,chooseDashboardDate,dashboardDay,energyScales} from '../dashboard.js';
import {validatePersonalProfile} from '../access.js';
import {cleanRecord} from '../migration.js';
const day='2026-10-30';
const meal=(fields={})=>({id:'meal',date:day,kcal:500,protein:30,carbs:70,fat:10,deleted:false,skipped:false,...fields});
const workout=(fields={})=>({id:'gym',date:day,kind:'strength',kcal_burned_est:100,deleted:false,...fields});
test('Dashboard defaults to live Today and rejects impossible or future dates',()=>{
 assert.equal(chooseDashboardDate(day,day),null);
 assert.equal(chooseDashboardDate('2026-10-29',day),'2026-10-29');
 for(const value of ['',null,'30/10/2026','2026-02-30','2026-13-01','2026-10-31'])assert.throws(()=>chooseDashboardDate(value,day));
});
test('Historical Dashboard selects meals, workouts, profile and week ending on the selected day',()=>{
 const data={WebMeals:[meal(),meal({id:'old',date:'2026-10-29',kcal:300}),meal({id:'deleted',date:'2026-10-29',deleted:true})],WebWorkouts:[workout(),workout({id:'old',date:'2026-10-29'}),workout({id:'week-start',date:'2026-10-23'}),workout({id:'outside',date:'2026-10-22'})],WebProfile:[{id:'p1',date:'2026-10-01',kcal_target:2000},{id:'p2',date:day,kcal_target:2200}]};
 const selected=dashboardDay(data,'2026-10-29');
 assert.deepEqual(selected.meals.map(r=>r.id),['old']);assert.deepEqual(selected.workouts.map(r=>r.id),['old']);assert.equal(selected.profile.id,'p1');assert.equal(selected.summary.sessions,1);assert.equal(selected.week.sessions,2);
 assert.equal(energyDays(data,selected.date).at(-1).intake,300);assert.equal(dashboardDay(data,day).profile.id,'p2');
});
test('Burn line uses independent right-axis coordinates and labels known, zero and partial totals',()=>{
 const days=[{date:'2026-10-28',intake:4000,burned:100,intakeIncomplete:true},{date:'2026-10-29',intake:0,burned:200,burnIncomplete:true},{date:day,intake:null,burned:null}];
 assert.deepEqual(energyScales(days),{intakeMax:4000,burnMax:200});
 const html=renderEnergyChart(days);
 assert.match(html,/class="burn-point" cx="194" cy="143"/);assert.match(html,/class="burn-point partial" cx="450" cy="42"/);
 assert.equal((html.match(/class="intake-data-label"/g)||[]).length,2);assert.equal((html.match(/class="burn-data-label"/g)||[]).length,2);
 assert.match(html,/text-anchor="middle">4\.000\*<\/text>/);assert.match(html,/text-anchor="middle">200\*<\/text>/);assert.match(html,/text-anchor="middle">0<\/text>/);assert.match(html,/trục phải/);
 assert.deepEqual(energyScales([{intake:0,burned:0}]),{intakeMax:500,burnMax:100});
});
test('Macro dials compare actual intake with explicit targets, cap fill, and announce over-target values in text',()=>{
 const values=macroProgress([meal({kcal:2200,protein:130,carbs:180,fat:55})],{kcal_target:2000,protein_target:120,goal:{carbs_target:250,fat_target:60}});
 assert.ok(Math.abs(values[0].percent-110)<1e-8);assert.equal(values[0].fill,100);assert.equal(values[0].over,true);assert.equal(values[2].over,false);assert.equal(values[2].fill,72);
 const html=renderMacroDials(values);assert.match(html,/macro-dial kcal over/);assert.match(html,/Vượt 200 kcal/);assert.match(html,/Còn 70 g/);assert.match(html,/mục tiêu 2.000 kcal/);
});
test('Unknown macros stay unknown, genuine zero is shown, and TDEE is never silently used as an intake target',()=>{
 const values=macroProgress([meal({kcal:'',protein:'',carbs:0,fat:''}),meal({id:'unknown',kcal:'',protein:'',carbs:'',fat:''}),meal({skipped:'true'}),meal({deleted:true})],{TDEE:2500});
 assert.equal(values[0].value,null);assert.equal(values[0].target,null);assert.equal(values[0].over,false);assert.equal(values[2].value,0);assert.equal(values[2].known,1);assert.equal(values[2].count,2);assert.equal(values[2].incomplete,true);
 assert.match(renderMacroDials(values),/Chưa đặt mục tiêu/);assert.match(renderMacroDials(values),/Chưa đủ số liệu/);
});
test('Energy chart defaults to exactly 10 consecutive dates, includes today, and supports the retained date filters',()=>{
 const data={WebMeals:[meal()],WebWorkouts:[workout()]};const days=energyDays(data,day);
 assert.equal(days.length,10);assert.equal(days[0].date,'2026-10-21');assert.equal(days.at(-1).date,day);assert.equal(days.at(-1).intake,500);assert.equal(days.at(-1).burned,100);
 assert.equal(energyDays(data,day,7).length,7);assert.equal(energyDays(data,day,28).length,28);assert.throws(()=>energyDays(data,day,100));
 assert.equal(energyDays(data,'2027-01-03')[0].date,'2026-12-25');
});
test('Day totals exclude skipped/deleted/rest activity estimates and distinguish missing, partial, and known zero',()=>{
 const days=energyDays({WebMeals:[meal(),meal({id:'unknown',kcal:''}),meal({id:'skip',skipped:true,kcal:900}),meal({id:'deleted',deleted:true,kcal:900})],WebWorkouts:[workout(),workout({id:'unknown',kcal_burned_est:''}),workout({id:'deleted',deleted:true,kcal_burned_est:900}),workout({id:'rest',date:'2026-10-29',kind:'rest',kcal_burned_est:900})]},day);
 assert.equal(days.at(-1).intake,500);assert.equal(days.at(-1).intakeIncomplete,true);assert.equal(days.at(-1).burned,100);assert.equal(days.at(-1).burnIncomplete,true);assert.equal(days.at(-2).burned,0);assert.equal(days.at(-2).intake,null);assert.equal(days[0].burned,null);
 const zero=energyDays({WebMeals:[meal({kcal:0})],WebWorkouts:[workout({kcal_burned_est:0})]},day).at(-1);assert.equal(zero.intake,0);assert.equal(zero.burned,0);
});
test('The rendered chart exposes both series and a readable daily table, with gaps in burned estimates',()=>{
 const days=energyDays({WebMeals:[meal()],WebWorkouts:[workout({date:'2026-10-28'}),workout()]},day),html=renderEnergyChart(days);
 assert.match(html,/Kcal ăn vào/);assert.match(html,/Kcal tập luyện \(ước tính\)/);assert.match(html,/Xem số liệu từng ngày/);assert.match(html,/không phải tổng tiêu hao cả ngày/);
 assert.equal((html.match(/class="burn-point/g)||[]).length,2);assert.equal((html.match(/class="burn-line"/g)||[]).length,0,'must not connect across an unknown day');assert.equal((html.match(/<tr>/g)||[]).length,11);
 assert.match(renderEnergyChart(energyDays({WebMeals:[],WebWorkouts:[]},day)),/Chưa có số liệu kcal trong 10 ngày/);
});
test('Optional carb/fat targets persist with profile goals and do not become onboarding requirements',()=>{
 const p={id:'p',weight_kg:85,height_cm:175,TDEE:2500,goal:{bmr_kcal:1800,target_weight_kg:78,training_goal:'Tăng sức mạnh'}};
 assert.doesNotThrow(()=>validatePersonalProfile(p));const updated={...p,goal:{...p.goal,carbs_target:220,fat_target:65}};assert.doesNotThrow(()=>validatePersonalProfile(updated));assert.equal(cleanRecord('WebProfile',updated).goal.carbs_target,220);
 assert.throws(()=>validatePersonalProfile({...p,goal:{...p.goal,fat_target:-1}}));
});
