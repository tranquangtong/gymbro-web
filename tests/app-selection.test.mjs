import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppEnv} from './app-env.mjs';

function setup(){
 const timers=new Set();
 const {ctx,state,events,nodes}=createAppEnv({setTimeout:fn=>{const handle={fn};timers.add(handle);return handle;},clearTimeout:handle=>timers.delete(handle)});
 const input=value=>events.input({target:{id:'history-search',value,closest:()=>null}});
 const click=(action,date)=>ctx.action({dataset:{action,date},closest:()=>null});
 const flush=()=>{assert.equal(timers.size,1);[...timers][0].fn();assert.equal(timers.size,0);};
 return {ctx,state,events,nodes,timers,input,click,flush};
}
const meal=(id,date,food,extra={})=>({id,date,food,meal:'lunch',kcal:265,...extra});

test('History search coalesces input, restores the calendar on clear and cancels pending work on render/navigation',()=>{
 const {ctx,state,events,nodes,timers,input,flush}=setup();
 state.data.WebMeals=[meal('a','2026-11-03','Phở gà'),meal('b','2026-11-02','Phở bò'),meal('c','2026-11-02','Phở',{deleted:'TRUE'})];
 ctx.render();const main=nodes['#main'].innerHTML,results=nodes['#history-results'],desc=nodes['#history-desc'];
 input('p');input('pho');assert.equal(results.innerHTML,undefined);flush();
 assert.match(results.innerHTML,/2 mục khớp/);assert.ok(results.innerHTML.indexOf('Phở gà')<results.innerHTML.indexOf('Phở bò'));
 assert.match(ctx.historyPage(),/id="history-desc">Tìm trong toàn bộ/);assert.match(desc.textContent,/Tìm trong toàn bộ/);
 input('<zzz>');flush();assert.match(results.innerHTML,/0 mục khớp “&lt;zzz&gt;”/);assert.match(results.innerHTML,/Không có mục phù hợp/);
 input('');flush();assert.match(desc.textContent,/Theo tháng/);assert.ok(main.includes(results.innerHTML));assert.equal(nodes['#main'].innerHTML,main);
 input('pho');ctx.render();assert.equal(timers.size,0);assert.match(nodes['#main'].innerHTML,/2 mục khớp/);
 input('new');ctx.location.hash='#gym';events.hashchange();assert.equal(timers.size,0);assert.match(nodes['#main'].innerHTML,/Buổi tập/);
 ctx.location.hash='#history';ctx.render();input('secret');ctx.accessStage=()=>'profile';flush();assert.match(nodes['#main'].innerHTML,/Hoàn tất hồ sơ/);
});

test('Calendar selection matches a full render and rebuilds after data changes, missing markup or midnight',async()=>{
 const {ctx,state,nodes,click}=setup(),selected='2026-11-02',oldDate=ctx.today();
 state.data.WebMeals=[meal('a',selected,'Cơm')];ctx.render();const initial=nodes['#main'].innerHTML;
 const cell=(date,html)=>{
  const tag=html.match(new RegExp('<button [^>]*data-action="cal-day" data-date="'+date+'"[^>]*>'))[0];
  return {classes:new Set(tag.match(/class="([^"]+)"/)[1].split(' ')),pressed:tag.match(/aria-pressed="([^"]+)"/)[1]};
 };
 const button=date=>{const b=cell(date,initial);return Object.assign(b,{classList:{add:k=>b.classes.add(k),remove:k=>b.classes.delete(k)},setAttribute:(k,v)=>{assert.equal(k,'aria-pressed');b.pressed=v;}});};
 const prev=button(oldDate),next=button(selected),panel=nodes['#cal-day-panel']={scrollIntoView(){}};
 nodes['.cal-grid']={querySelector:s=>s.includes(selected)?next:null,querySelectorAll:()=>[prev]};
 await click('cal-day',selected);assert.equal(nodes['#main'].innerHTML,initial);
 const full=ctx.historyPage();assert.ok(full.includes(panel.outerHTML));assert.match(panel.outerHTML,/Cơm/);
 for(const [date,b] of [[oldDate,prev],[selected,next]])assert.deepEqual({classes:b.classes,pressed:b.pressed},cell(date,full));
 state.data.WebMeals=[meal('b',selected,'Bún',{kcal:500})];ctx.dataChanged();await click('cal-day',selected);
 assert.match(nodes['#main'].innerHTML,/Bún/);assert.match(nodes['#main'].innerHTML,/<strong>500<\/strong>/);
 delete nodes['.cal-grid'];await click('cal-day','2026-11-04');assert.match(nodes['#main'].innerHTML,/data-date="2026-11-04"\s+aria-pressed="true"/);
 nodes['.cal-grid']={querySelector:()=>next,querySelectorAll:()=>[prev]};ctx.today=()=>'2026-11-06';await click('cal-day',selected);
 assert.match(nodes['#main'].innerHTML,/class="cal-day [^"]*today[^"]*" data-action="cal-day" data-date="2026-11-06"/);
});

test('Compact chart taps use cached days until data or date changes, then rebuild from current state',async()=>{
 const {ctx,state,nodes,click}=setup(),selected='2026-11-04';
 ctx.location.hash='#dashboard';state.data.WebMeals=[meal('a',selected,'Cơm')];ctx.render();
 const initial=nodes['#main'].innerHTML;let calls=0;
 ctx.selectCompactChartDay=(_root,days,options)=>{calls++;assert.equal(days.find(d=>d.date===selected).intake,265);assert.equal(options.selectedDate,selected);return true;};
 await click('chart-day',selected);assert.equal(calls,1);assert.equal(nodes['#main'].innerHTML,initial);
 state.data.WebMeals=[meal('b',selected,'Bún',{kcal:500})];ctx.dataChanged();await click('chart-day',selected);
 assert.match(nodes['#main'].innerHTML,/<strong>4-11<\/strong><span class="intake">Ăn 500/);
 ctx.today=()=>'2026-11-06';await click('chart-day',selected);assert.match(nodes['#main'].innerHTML,/class="chart-hit" data-action="chart-day" data-date="2026-11-06"/);
 ctx.accessStage=()=>'profile';await click('chart-day',selected);assert.match(nodes['#main'].innerHTML,/Hoàn tất hồ sơ/);assert.equal(calls,1);
});

test('Gym previous session excludes the same id, same day, other kinds and deleted lifts and resolves date ties stably',()=>{
 const {ctx,state}=setup(),date='2026-11-05',lift=(id,date,created_at,extra={})=>({id,date,created_at,exercise:'Squát',kind:'strength',...extra});
 const row=lift('current',date,'11'),latest=lift('current','2026-11-04','12'),prior=lift('prior','2026-11-04','11');
 state.data.WebWorkouts=[prior,lift('tie',prior.date,'11'),latest,lift('old','2026-11-03','20'),row,lift('same',date,'18'),
  lift('future','2026-11-06','20'),lift('cardio',latest.date,'19',{kind:'cardio'}),lift('gone',latest.date,'16',{deleted:'TRUE'})];
 const index=ctx.latestByExercise(date);
 for(const [current,expected] of [[row,prior],[{...row,id:'different',exercise:'SQUAT'},latest],[{...row,exercise:'Curl'},null]]){
  assert.equal(ctx.previousSession(current,index),expected);assert.equal(ctx.previousSession(current),expected);
 }
});
