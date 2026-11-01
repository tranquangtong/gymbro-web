import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuickUI} from '../quick-ui.js';

// Exercise the real composer without a browser or a live database.
function composer(t,saved={}){
 const events={},values=new Map(),storage=new Map(Object.entries(saved));
 const dialog={innerHTML:'',open:false,classList:{toggle(){}},setAttribute(){},addEventListener(){},showModal(){this.open=true;},querySelector(){return null;}};
 t.mock.method(globalThis,'setInterval',()=>0);
 const setGlobal=(key,value)=>{const old=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});t.after(()=>old?Object.defineProperty(globalThis,key,old):delete globalThis[key]);};
 setGlobal('document',{createElement:()=>dialog,body:{append(){}},querySelector:s=>values.get(s)||null,addEventListener:(name,fn)=>events[name]=fn});
 setGlobal('sessionStorage',{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)});
 const state={mode:'firebase',date:'2026-11-01',data:{WebProfile:[]},repo:{ownerUid:'test',uid:'test',loadFoods:async()=>[{id:'banana',name:'Chuối'}]}};
 const ui=createQuickUI({getState:()=>state,writable:()=>true,esc:v=>String(v??''),fmt:v=>String(v??''),icon:()=>'',toast:()=>{},reload:async()=>{},render(){},saveMessage:()=>''});
 return {ui,dialog,values,click:action=>events.click({target:{closest:()=>({dataset:{quick:action}})},preventDefault(){}})};
}

test('New meal and workout composers default to compact entry, retaining selected date and draft values',async t=>{
 for(const type of ['meals','workouts'])await t.test(type,async t=>{
  const c=composer(t,{['gymbro.quick.firebase:test.'+type]:JSON.stringify({method:'text',text:'',food:'Chuối',amount:2,exercise:'Lat pulldown',kg:40})});
  await c.ui.open(type);
  assert.match(c.dialog.innerHTML,/class="button selected" data-quick="method-form"/);
  assert.match(c.dialog.innerHTML,/id="quick-date" type="date" value="2026-11-01"/);
  assert.doesNotMatch(c.dialog.innerHTML,/id="quick-text"/);
  assert.match(c.dialog.innerHTML,type==='meals'?/id="compact-food"[^>]*value="Chuối"/:/id="compact-exercise"[^>]*value="Lat pulldown"/);
 });
});

test('Unfinished text and explicit text shortcuts remain usable after changing the default',async t=>{
 const c=composer(t,{'gymbro.quick.firebase:test.workouts':JSON.stringify({method:'text',text:'Lat pulldown 40kg 3x12'})});
 await c.ui.open('workouts');
 assert.match(c.dialog.innerHTML,/id="quick-text"[^>]*>Lat pulldown 40kg 3x12/);
 await c.ui.open('meals',{text:'Chuối'});
 assert.match(c.dialog.innerHTML,/id="quick-text"[^>]*>Chuối/);
});

test('Compact workout kind controls preserve cardio, bodyweight and assistance entry',async t=>{
 const c=composer(t);
 for(const kind of ['cardio','bodyweight','assisted']){
  await c.ui.open('workouts',{method:'form',kind});
  assert.match(c.dialog.innerHTML,new RegExp('value="'+kind+'" selected'));
  if(kind==='cardio'){
   assert.match(c.dialog.innerHTML,/id="compact-duration"/);
   assert.doesNotMatch(c.dialog.innerHTML,/id="compact-(count|reps|kg)"/);
  }else{
   assert.match(c.dialog.innerHTML,/id="compact-count"/);
   assert.match(c.dialog.innerHTML,/id="compact-reps"/);
   if(kind==='bodyweight')assert.doesNotMatch(c.dialog.innerHTML,/id="compact-kg"/);
   else assert.match(c.dialog.innerHTML,/Kg trợ lực<input id="compact-kg"/);
  }
 }
});
