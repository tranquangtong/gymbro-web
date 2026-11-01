import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuickUI} from '../quick-ui.js';

// Exercise the real composer without a browser or a live database.
function composer(t,saved={}){
 const events={},dialogEvents={},values=new Map(),storage=new Map(Object.entries(saved));
 const dialog={innerHTML:'',open:false,classList:{toggle(){}},setAttribute(){},addEventListener:(name,fn)=>dialogEvents[name]=fn,showModal(){this.open=true;},querySelector(){return null;},querySelectorAll(){return [];}};
 t.mock.method(globalThis,'setInterval',()=>0);
 const setGlobal=(key,value)=>{const old=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});t.after(()=>old?Object.defineProperty(globalThis,key,old):delete globalThis[key]);};
 setGlobal('document',{createElement:tag=>tag==='canvas'?{getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,AAAA'}:dialog,body:{append(){}},querySelector:s=>values.get(s)||null,addEventListener:(name,fn)=>events[name]=fn});
 setGlobal('sessionStorage',{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)});
 const state={mode:'firebase',date:'2026-11-01',data:{WebProfile:[]},repo:{ownerUid:'test',uid:'test',loadFoods:async()=>[{id:'banana',name:'Chuối'}]}};
 const ui=createQuickUI({getState:()=>state,writable:()=>true,esc:v=>String(v??''),fmt:v=>String(v??''),icon:()=>'',toast:()=>{},reload:async()=>{},render(){},saveMessage:()=>''});
 return {ui,dialog,values,state,dialogEvents,click:(action,extra={})=>events.click({target:{closest:()=>({dataset:{quick:action,...extra}})},preventDefault(){}})};
}

test('New meal and workout composers default to compact entry, retaining selected date and draft values',async t=>{
 for(const type of ['meals','workouts'])await t.test(type,async t=>{
  const c=composer(t,{['gymbro.quick.firebase:test.'+type]:JSON.stringify({method:'text',text:'',food:'Chuối',amount:2,exercise:'Lat pulldown',kg:40})});
  await c.ui.open(type);
  assert.doesNotMatch(c.dialog.innerHTML,/method-form|method-text|input-tabs/);
  assert.match(c.dialog.innerHTML,/id="quick-date" type="date" value="2026-11-01"/);
  assert.doesNotMatch(c.dialog.innerHTML,/id="quick-text"/);
  assert.match(c.dialog.innerHTML,type==='meals'?/id="compact-food"[^>]*value="Chuối"/:/id="compact-exercise"[^>]*value="Lat pulldown"/);
 });
});

test('Unfinished text and explicit text shortcuts remain usable after changing the default',async t=>{
 const c=composer(t,{'gymbro.quick.firebase:test.workouts':JSON.stringify({method:'text',text:'Lat pulldown 40kg 3x12'})});
 await c.ui.open('workouts');
 assert.match(c.dialog.innerHTML,/id="compact-exercise"[^>]*value="Lat pulldown"/);assert.match(c.dialog.innerHTML,/id="compact-kg"[^>]*value="40"/);
 await c.ui.open('meals',{text:'Chuối'});
 assert.match(c.dialog.innerHTML,/id="compact-food"[^>]*value="Chuối"/);assert.doesNotMatch(c.dialog.innerHTML,/id="quick-text"/);
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


test('Exercise chip fills the compact form with the correct kind and date without saving a log',async t=>{
 const c=composer(t);
 c.state.data.WebWorkouts=[{exercise:'Assisted chin up',kind:'assisted',date:'2026-10-31'}];
 await c.ui.open('workouts');
 assert.match(c.dialog.innerHTML,/Bài tập quen/);
 c.values.set('#compact-kg',{value:'80'});
 c.click('insert-exercise',{exercise:'assisted chin up|assisted'});
 assert.match(c.dialog.innerHTML,/id="compact-exercise"[^>]*value="Assisted chin up"/);
 assert.match(c.dialog.innerHTML,/value="assisted" selected/);
 assert.match(c.dialog.innerHTML,/id="compact-kg"[^>]*value=""/);
 assert.match(c.dialog.innerHTML,/id="quick-date"[^>]*value="2026-11-01"/);
 assert.equal(c.state.data.WebWorkouts.length,1);
});


test('An existing meal retains a failed camera upload and can retry without taking the photo again',async t=>{
 const c=composer(t),row={id:'m1',food:'Soda chanh',date:'2026-11-01',photo_ids:[],updated_at:'original'};
 c.state.data.WebMeals=[row];let fail=true,uploads=[],saved=[];
 const oldImage=Object.getOwnPropertyDescriptor(globalThis,'Image');
 Object.defineProperty(globalThis,'Image',{configurable:true,writable:true,value:class{naturalWidth=100;naturalHeight=100;async decode(){}}});
 t.after(()=>oldImage?Object.defineProperty(globalThis,'Image',oldImage):delete globalThis.Image);
 c.state.repo.savePhoto=async p=>{uploads.push(p);if(fail)throw Object.assign(Error('Offline'),{code:'unavailable'});};
 c.state.repo.saveMany=async(table,rows)=>{saved.push(...rows);};
 await c.ui.showPhotos('m1');
 c.dialogEvents.change({target:{id:'existing-camera',files:[new File(['jpeg'],'camera.jpg',{type:'image/jpeg'})],value:'camera.jpg'}});
 await new Promise(setImmediate);
 assert.equal(uploads.length,1);assert.equal(saved.length,0);
 assert.match(c.dialog.innerHTML,/Ảnh chờ tải lên/);assert.match(c.dialog.innerHTML,/Thử lại tải ảnh/);
 await c.ui.showPhotos('m1'); // Queue also survives closing/reopening within the tab.
 assert.match(c.dialog.innerHTML,/Thử lại tải ảnh/);
 fail=false;c.click('retry-photos');await new Promise(setImmediate);
 assert.equal(uploads.length,2);assert.equal(uploads[0].id,uploads[1].id);
 assert.equal(saved.length,1);assert.deepEqual(saved[0].photo_ids,[uploads[0].id]);
 assert.doesNotMatch(c.dialog.innerHTML,/Thử lại tải ảnh/);
});


test('Steep walking composer exposes minutes, incline and speed without any input mode tabs',async t=>{
 const c=composer(t);
 await c.ui.open('workouts',{exercise:'steep walking',kind:'cardio',duration:15,incline:8,speed:5});
 for(const id of ['duration','incline','speed'])assert.match(c.dialog.innerHTML,new RegExp('id="compact-'+id+'"'));
 assert.doesNotMatch(c.dialog.innerHTML,/input-tabs|method-text|quick-text/);
});
