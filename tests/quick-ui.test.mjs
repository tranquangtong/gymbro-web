import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuickUI,ESTIMATE_HELP_KEY,shouldAutoShowHelp,createDemoPlayer} from '../src/ui/quick-ui.js';

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
   if(kind==='bodyweight')assert.match(c.dialog.innerHTML,/Kg tạ thêm<input id="compact-kg"[^>]*placeholder="Không có"/);
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


test('Meal and exercise name suggestions stay inline with no native datalist popup',async t=>{
 const c=composer(t);
 await c.ui.open('meals');
 assert.doesNotMatch(c.dialog.innerHTML,/<datalist| list=/);
 const foodSuggestions={hidden:true,innerHTML:''};
 c.values.set('#food-suggestions',foodSuggestions);c.values.set('#compact-food',{value:'chu'});
 c.dialogEvents.input({target:{id:'compact-food'}});
 assert.equal(foodSuggestions.hidden,false);assert.match(foodSuggestions.innerHTML,/Chuối/);
 c.click('insert-food',{id:'banana'});
 assert.match(c.dialog.innerHTML,/id="compact-food"[^>]*value="Chuối"/);
 c.values.clear();c.state.data.WebWorkouts=[{exercise:'Assisted pull up',kind:'assisted',date:'2026-10-31'}];
 await c.ui.open('workouts');assert.doesNotMatch(c.dialog.innerHTML,/<datalist| list=/);
 const exercises={hidden:true,innerHTML:''};
 c.values.set('#exercise-suggestions',exercises);c.values.set('#compact-exercise',{value:'pull'});
 c.dialogEvents.input({target:{id:'compact-exercise'}});
 assert.equal(exercises.hidden,false);assert.match(exercises.innerHTML,/Assisted pull up/);
 c.click('insert-exercise',{exercise:'assisted pull up|assisted'});
 assert.match(c.dialog.innerHTML,/value="assisted" selected/);
 for(const id of ['count','reps','kg'])assert.match(c.dialog.innerHTML,new RegExp('id="compact-'+id+'"'));
});

test('shouldAutoShowHelp checks gymbro.estimateHelpSeen safely across storage states',()=>{
 assert.equal(shouldAutoShowHelp(null),false);
 assert.equal(shouldAutoShowHelp({}),false);
 assert.equal(shouldAutoShowHelp({getItem:()=>null}),true);
 assert.equal(shouldAutoShowHelp({getItem:()=>''}),true);
 assert.equal(shouldAutoShowHelp({getItem:()=>'1'}),false);
 assert.equal(shouldAutoShowHelp({getItem:()=>{throw Error('blocked');}}),false);
});

test('Estimate tutorial renders 4 steps without API or token wording and preserves estimate state on back',async t=>{
 const local=new Map();
 const oldLs=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,writable:true,value:{getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,v)}});
 t.after(()=>oldLs?Object.defineProperty(globalThis,'localStorage',oldLs):delete globalThis.localStorage);
 const c=composer(t);
 c.state.data.WebMeals=[{id:'m1',date:'2026-11-01',food:'Phở bò',meal:'lunch'}];
 c.state.repo.load=async()=>c.state.data;
 c.click('estimate-help');
 assert.match(c.dialog.innerHTML,/Cách dùng Ước tính bằng AI/);
 assert.match(c.dialog.innerHTML,/Bấm Tạo prompt/);
 assert.match(c.dialog.innerHTML,/Gửi sang app AI của bạn/);
 assert.match(c.dialog.innerHTML,/Copy câu trả lời của AI/);
 assert.match(c.dialog.innerHTML,/Dán &amp; đọc kết quả/);
 assert.match(c.dialog.innerHTML,/Áp dụng kết quả/);
 assert.match(c.dialog.innerHTML,/Chia sẻ ảnh \+ prompt/);
 assert.match(c.dialog.innerHTML,/Copy ảnh ghép/);
 assert.match(c.dialog.innerHTML,/data-quick="start-estimate"[^>]*>Bắt đầu ước tính/);
 assert.doesNotMatch(c.dialog.innerHTML,/api|token/i);
 c.click('start-estimate');
 await new Promise(setImmediate);
 assert.equal(local.get(ESTIMATE_HELP_KEY),'1');
 assert.match(c.dialog.innerHTML,/Ước tính bữa ăn/);
 assert.match(c.dialog.innerHTML,/data-quick="estimate-help"[^>]*>Xem hướng dẫn/);
 c.click('generate-prompt');
 await new Promise(setImmediate);
 assert.match(c.dialog.innerHTML,/Copy prompt/);
 c.values.set('#estimate-output',{value:'{"r":"keep"}'});
 c.click('estimate-help',{from:'estimate'});
 assert.match(c.dialog.innerHTML,/data-quick="estimate-back"[^>]*>Quay lại/);
 assert.doesNotMatch(c.dialog.innerHTML,/data-quick="start-estimate"/);
 c.click('estimate-back');
 assert.match(c.dialog.innerHTML,/Ước tính bữa ăn/);
 assert.match(c.dialog.innerHTML,/Copy prompt/);
 assert.match(c.dialog.innerHTML,/\{"r":"keep"\}/);
});

test('First estimate-meals open auto-shows tutorial once even if localStorage fails',async t=>{
 const local=new Map();
 const oldLs=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,writable:true,value:{getItem:k=>local.get(k)??null,setItem:()=>{throw Error('quota');}}});
 t.after(()=>oldLs?Object.defineProperty(globalThis,'localStorage',oldLs):delete globalThis.localStorage);
 const c=composer(t);
 c.state.data.WebMeals=[{id:'m1',date:'2026-11-01',food:'Bún chả',meal:'lunch'}];
 await c.ui.openEstimate('meals');
 assert.match(c.dialog.innerHTML,/Cách dùng Ước tính bằng AI/);
 assert.match(c.dialog.innerHTML,/Bắt đầu ước tính/);
 await c.ui.openEstimate('meals');
 assert.match(c.dialog.innerHTML,/Ước tính bữa ăn/);
});

test('A prompt finishing while the tutorial is open does not replace it; back shows the new prompt',async t=>{
 const local=new Map([[ESTIMATE_HELP_KEY,'1']]);
 const oldLs=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,writable:true,value:{getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,v)}});
 t.after(()=>oldLs?Object.defineProperty(globalThis,'localStorage',oldLs):delete globalThis.localStorage);
 const c=composer(t);
 c.state.data.WebMeals=[{id:'m1',date:'2026-11-01',food:'Cơm tấm',meal:'lunch'}];
 let release;c.state.repo.load=()=>new Promise(resolve=>{release=()=>resolve(c.state.data);});
 await c.ui.openEstimate('meals');
 c.click('generate-prompt');// pending: waits on repo.load
 c.click('estimate-help',{from:'estimate'});
 assert.match(c.dialog.innerHTML,/Cách dùng Ước tính bằng AI/);
 release();await new Promise(setImmediate);await new Promise(setImmediate);
 assert.match(c.dialog.innerHTML,/Cách dùng Ước tính bằng AI/);// tutorial still shown
 c.click('estimate-back');
 assert.match(c.dialog.innerHTML,/Ước tính bữa ăn/);assert.match(c.dialog.innerHTML,/Copy prompt/);
});

test('createDemoPlayer sequences scenes, supports pause/goTo/replay/stop, and respects reducedMotion',()=>{
 let nextId=1;const timers=new Map(),scenes=[];let completed=0;
 const setTimer=(fn,ms)=>{const id=nextId++;timers.set(id,{fn,ms});return id;};
 const clearTimer=id=>{timers.delete(id);};
 const fire=id=>{const t=timers.get(id);timers.delete(id);t?.fn();};
 const player=createDemoPlayer({durations:[100,200,300,400],setTimer,clearTimer,onScene:n=>scenes.push(n),onComplete:()=>{completed+=1;}});
 player.play();
 assert.deepEqual(scenes,[1]);assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,100);
 fire([...timers.keys()][0]);
 assert.deepEqual(scenes,[1,2]);assert.equal([...timers.values()][0].ms,200);
 player.pause();
 assert.equal(timers.size,0);assert.equal(player.state().playing,false);assert.equal(player.state().scene,2);
 player.play();
 assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,200);
 player.goTo(4);
 assert.deepEqual(scenes,[1,2,4]);assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,400);
 fire([...timers.keys()][0]);
 assert.equal(timers.size,0);assert.equal(completed,1);assert.equal(player.state().playing,false);assert.equal(player.state().completed,true);
 player.replay();
 assert.deepEqual(scenes,[1,2,4,1]);assert.equal(timers.size,1);assert.equal(player.state().completed,false);
 player.stop();
 assert.equal(timers.size,0);assert.equal(player.state().playing,false);

 const rmTimers=new Map(),rmScenes=[];
 const rm=createDemoPlayer({reducedMotion:true,setTimer:(fn)=>{rmTimers.set(1,fn);return 1;},clearTimer:id=>rmTimers.delete(id),onScene:n=>rmScenes.push(n)});
 rm.play();
 assert.equal(rmTimers.size,0);assert.equal(rm.state().playing,false);assert.deepEqual(rmScenes,[1]);
 rm.goTo(3);
 assert.equal(rmTimers.size,0);assert.deepEqual(rmScenes,[1,3]);
 rm.replay();
 assert.equal(rmTimers.size,0);assert.deepEqual(rmScenes,[1,3,1]);
});

test('Estimate tutorial renders animated demo stage, 4 dots, caption, CTA and collapsed text fallback',t=>{
 const c=composer(t);
 c.click('estimate-help');
 assert.match(c.dialog.innerHTML,/class="demo-stage" data-scene="1"/);
 assert.match(c.dialog.innerHTML,/Phở bò<\/strong><span> · chưa có kcal/);
 assert.match(c.dialog.innerHTML,/Prompt \+ 1 ảnh đã sẵn sàng/);
 assert.match(c.dialog.innerHTML,/Copy prompt/);
 assert.match(c.dialog.innerHTML,/Chia sẻ/);
 assert.match(c.dialog.innerHTML,/Đã copy/);
 assert.match(c.dialog.innerHTML,/App AI của bạn/);
 assert.match(c.dialog.innerHTML,/Ước tính kcal cho các món…/);
 assert.match(c.dialog.innerHTML,/\{"m":\[\[1,510,24,45,26\]\]\}/);
 assert.match(c.dialog.innerHTML,/Dán &amp; đọc kết quả/);
 assert.match(c.dialog.innerHTML,/510 kcal · P24 C45 F26/);
 assert.match(c.dialog.innerHTML,/Áp dụng/);
 assert.match(c.dialog.innerHTML,/Đã cập nhật/);
 assert.match(c.dialog.innerHTML,/class="demo-caption"[^>]*><strong>Bước 1\/4<\/strong>/);
 assert.equal((c.dialog.innerHTML.match(/data-quick="demo-step"/g)||[]).length,4);
 assert.match(c.dialog.innerHTML,/data-quick="demo-toggle"/);
 assert.match(c.dialog.innerHTML,/data-quick="demo-replay"[^>]*>.*Xem lại/);
 assert.match(c.dialog.innerHTML,/<details class="help-text-details"><summary>Xem hướng dẫn dạng chữ<\/summary>/);
 assert.doesNotMatch(c.dialog.innerHTML,/<details class="help-text-details" open/);
 assert.match(c.dialog.innerHTML,/class="form-actions".*data-quick="start-estimate"[^>]*>Bắt đầu ước tính/);
 assert.doesNotMatch(c.dialog.innerHTML,/api|token/i);
});

test('Tutorial demo player advances, highlights CTA, and stops timers on close, navigation, disconnect or reducedMotion',async t=>{
 let nextId=1;const timers=new Map();
 t.mock.method(globalThis,'setTimeout',(fn,ms)=>{const id=nextId++;timers.set(id,{fn,ms});return id;});
 t.mock.method(globalThis,'clearTimeout',id=>{timers.delete(id);});
 const fireNext=()=>{const [id,entry]=[...timers.entries()][0];timers.delete(id);entry.fn();};

 const c=composer(t);
 c.state.data.WebMeals=[{id:'m1',date:'2026-11-01',food:'Phở bò',meal:'lunch'}];
 let stage,caption,dots,toggle,cta;
 const resetDom=()=>{
  stage={dataset:{scene:'1'},isConnected:true,offsetWidth:0,attrs:{},setAttribute(k,v){this.attrs[k]=v;}};
  caption={innerHTML:''};
  dots=[1,2,3,4].map(step=>({dataset:{step:String(step)},attrs:{},classes:new Set(),classList:{toggle(k,on){if(on)this.s.add(k);else this.s.delete(k);},s:null},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}}));
  dots.forEach(d=>{d.classList.s=d.classes;});
  toggle={attrs:{},innerHTML:'',setAttribute(k,v){this.attrs[k]=v;}};
  cta={classes:new Set(),classList:{add(k){cta.classes.add(k);},remove(k){cta.classes.delete(k);}}};
 };
 c.dialog.close=()=>{c.dialog.open=false;c.dialogEvents.close?.();};
 c.dialog.querySelector=sel=>{
  if(!c.dialog.innerHTML.includes('demo-stage'))return null;
  if(sel==='.demo-stage')return stage;
  if(sel==='.demo-caption')return caption;
  if(sel==='.demo-toggle')return toggle;
  if(sel.includes('start-estimate'))return cta;
  return null;
 };
 c.dialog.querySelectorAll=sel=>c.dialog.innerHTML.includes('demo-stage')&&sel==='.demo-dot'?dots:[];

 resetDom();
 c.click('estimate-help');
 assert.equal(timers.size,1);assert.equal(stage.dataset.scene,'1');
 fireNext();assert.equal(stage.dataset.scene,'2');assert.match(caption.innerHTML,/Bước 2\/4/);
 fireNext();assert.equal(stage.dataset.scene,'3');
 fireNext();assert.equal(stage.dataset.scene,'4');assert.equal(dots[3].attrs['aria-current'],'step');
 fireNext();
 assert.equal(timers.size,0);
 assert.equal(cta.classes.has('demo-cta-highlight'),true);

 c.click('demo-replay');
 assert.equal(stage.dataset.scene,'1');assert.equal(cta.classes.has('demo-cta-highlight'),false);assert.equal(timers.size,1);
 c.click('demo-toggle');
 assert.equal(timers.size,0);assert.equal(toggle.attrs['aria-label'],'Phát tiếp');
 c.click('demo-toggle');
 assert.equal(timers.size,1);assert.equal(toggle.attrs['aria-label'],'Tạm dừng');
 c.click('close');
 assert.equal(timers.size,0);

 resetDom();
 c.click('estimate-help');
 assert.equal(timers.size,1);
 await c.ui.open('meals');
 assert.equal(timers.size,0);

 resetDom();
 c.click('estimate-help');
 assert.equal(timers.size,1);
 stage.isConnected=false;
 fireNext();
 assert.equal(timers.size,0);assert.equal(stage.dataset.scene,'1');

 const oldMM=Object.getOwnPropertyDescriptor(globalThis,'matchMedia');
 Object.defineProperty(globalThis,'matchMedia',{configurable:true,writable:true,value:q=>({matches:q==='(prefers-reduced-motion: reduce)'})});
 t.after(()=>oldMM?Object.defineProperty(globalThis,'matchMedia',oldMM):delete globalThis.matchMedia);
 resetDom();
 c.click('estimate-help');
 assert.equal(timers.size,0);assert.equal(stage.dataset.scene,'1');
 c.click('demo-step',{step:'3'});
 assert.equal(timers.size,0);assert.equal(stage.dataset.scene,'3');
});

test('Demo pause keeps the remaining scene time and a step jump plays from that step',()=>{
 let t=0;const timers=[];
 const player=createDemoPlayer({durations:[3000,3000,3000,3000],now:()=>t,setTimer:(fn,ms)=>{const x={fn,ms};timers.push(x);return x;},clearTimer:x=>{const i=timers.indexOf(x);if(i>=0)timers.splice(i,1);}});
 player.play();assert.equal(timers.at(-1).ms,3000);
 t=1000;player.pause();assert.equal(timers.length,0);
 t=9000;player.play();assert.equal(timers.at(-1).ms,2000);// resumes with what was left, not a full scene
 player.pause();player.goTo(3);
 assert.equal(player.state().scene,3);assert.equal(player.state().playing,true);assert.equal(timers.at(-1).ms,3000);
});
