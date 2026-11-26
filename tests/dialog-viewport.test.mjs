import test from 'node:test';
import assert from 'node:assert/strict';
import {viewportBounds,fieldScrollDelta,installDialogViewport,focusLiftDelta} from '../src/ui/dialog-viewport.js';
test('iOS keyboard tracks both visible height and Safari pan without treating pinch zoom as keyboard',()=>{
 const win={innerHeight:800,visualViewport:{height:340,offsetTop:96,scale:1}};
 assert.deepEqual(viewportBounds(win),{height:340,top:96,keyboard:true});
 win.visualViewport.scale=2;assert.equal(viewportBounds(win).keyboard,false);
 assert.deepEqual(viewportBounds({innerHeight:700}),{height:700,top:0,keyboard:false});
 // Pinch zoom alone (no keyboard) is not a keyboard; a keyboard while Safari has zoomed in still is.
 assert.equal(viewportBounds({innerHeight:800,visualViewport:{height:400,offsetTop:0,scale:2}}).keyboard,false);
 assert.equal(viewportBounds({innerHeight:800,visualViewport:{height:(800-330)/1.1,offsetTop:120,scale:1.1}}).keyboard,true);
});
test('Focused field and first suggestion scroll above keyboard without moving the page',()=>{
 const view={top:100,height:340},container={top:170,bottom:380};
 assert.equal(fieldScrollDelta({top:350,bottom:394},container,view),26);
 assert.equal(fieldScrollDelta({top:250,bottom:294},container,view,410),0);
 assert.equal(fieldScrollDelta({top:310,bottom:354},container,view,410),42);
 assert.equal(fieldScrollDelta({top:150,bottom:194},container,view),-30);
 assert.equal(fieldScrollDelta({top:200,bottom:244},{top:450,bottom:500},view),0);
});
test('Resize, viewport pan and input all remeasure the current focused field after layout',()=>{
 const listeners={},properties={},classes={},queue=[];
 const container={scrollTop:0,getBoundingClientRect:()=>({top:160,bottom:340})};
 const field={matches:()=>true,closest:s=>s==='dialog[open]'?{}:s==='.quick-content,.editor-fields'?container:null,getBoundingClientRect:()=>({top:330,bottom:374})};
 const doc={activeElement:field,documentElement:{style:{setProperty:(k,v)=>properties[k]=v,removeProperty:k=>delete properties[k]},classList:{toggle:(k,v)=>classes[k]=v,remove:k=>classes[k]=false}},addEventListener:(k,v)=>listeners['doc:'+k]=v};
 const win={innerHeight:800,visualViewport:{height:360,offsetTop:70,scale:1,addEventListener:(k,v)=>listeners['view:'+k]=v},addEventListener:(k,v)=>listeners[k]=v,requestAnimationFrame:f=>queue.push(f)};
 installDialogViewport(win,doc);
 assert.equal(properties['--dialog-viewport-top'],'70px');assert.equal(classes['keyboard-open'],true);assert.equal(container.scrollTop,46);
 for(const event of ['view:resize','view:scroll','resize','doc:focusin','doc:input'])assert.equal(typeof listeners[event],'function');
 listeners['view:scroll']();listeners['doc:input']();assert.equal(queue.length,1);
 doc.activeElement=null;win.visualViewport.height=800;win.visualViewport.offsetTop=0;queue.shift()();
 assert.equal(classes['keyboard-open'],false);assert.equal(container.scrollTop,46);
});
test('A field low on the screen is lifted to the top of the sheet before the keyboard opens',()=>{
 const container={top:120,bottom:640};
 assert.equal(focusLiftDelta({top:180,bottom:224},container,664),0,'already in the upper part: no scroll');
 assert.equal(focusLiftDelta({top:500,bottom:640},container,664),368,'lifted to container top + 12');
 assert.equal(focusLiftDelta({top:110,bottom:400},{top:120,bottom:640},664),0,'never scrolls backwards');
});
test('No-op when no dialog is open, memoizes viewport writes, and clears keyboard-open on close',()=>{
 const listeners={},queue=[],properties={};let writes=0,openDialog=null,keyboard=null;
 const doc={
  activeElement:null,
  querySelector:s=>s==='dialog[open]'?openDialog:null,
  documentElement:{
   style:{setProperty:(k,v)=>{writes++;properties[k]=v;},removeProperty:k=>{writes++;delete properties[k];}},
   classList:{toggle:(k,v)=>{writes++;if(k==='keyboard-open')keyboard=v;},remove:k=>{writes++;if(k==='keyboard-open')keyboard=false;}}
  },
  addEventListener:(k,v)=>listeners['doc:'+k]=v
 };
 const win={innerHeight:800,visualViewport:{height:360,offsetTop:70,scale:1,addEventListener:(k,v)=>listeners['view:'+k]=v},addEventListener:(k,v)=>listeners[k]=v,requestAnimationFrame:f=>queue.push(f),setTimeout:f=>f()};
 installDialogViewport(win,doc);
 assert.equal(writes,0,'boot with no open dialog does not touch styles or classes');
 listeners['doc:input']();listeners['view:resize']();
 assert.equal(queue.length,0,'input/resize with no open dialog and no keyboard state skips scheduling');
 openDialog={};
 listeners['view:resize']();assert.equal(queue.length,1);queue.shift()();
 assert.equal(keyboard,true);const afterOpen=writes;
 listeners['doc:input']();assert.equal(queue.length,1);queue.shift()();
 assert.equal(writes,afterOpen,'unchanged {height,top,keyboard} skips style/class writes');
 win.visualViewport.height=350;listeners['view:resize']();queue.shift()();
 assert.equal(writes,afterOpen+1,'only the changed CSS var is written');
 openDialog=null;listeners['doc:close']();
 assert.equal(keyboard,false);assert.deepEqual(properties,{});assert.equal(writes,afterOpen+4);
 listeners['doc:input']();assert.equal(queue.length,0);assert.equal(writes,afterOpen+4);
 win.visualViewport.height=800;win.visualViewport.offsetTop=0;listeners['view:resize']();assert.equal(queue.length,0);
 openDialog={matches:()=>true};listeners['doc:toggle']({target:openDialog});queue.shift()();
 assert.deepEqual(properties,{'--dialog-viewport':'800px','--dialog-viewport-top':'0px'});assert.equal(keyboard,false);
});
test('focusin reads geometry before adding field-focus class and writing scrollTop',()=>{
 const listeners={},ops=[];let scrollTop=0,dialog={};
 const container={
  get scrollTop(){return scrollTop;},
  set scrollTop(v){ops.push('scrollTop');scrollTop=v;},
  getBoundingClientRect(){ops.push('read:container');return {top:120,bottom:640};}
 };
 const field={
  matches:()=>true,
  closest:s=>s==='dialog[open]'?{}:s==='.quick-content,.editor-fields'?container:null,
  getBoundingClientRect(){ops.push('read:field');return {top:500,bottom:640};}
 };
 const doc={
  activeElement:null,
  querySelector:s=>s==='dialog[open]'?dialog:null,
  documentElement:{
   style:{setProperty:()=>{},removeProperty:()=>{}},
   classList:{toggle:()=>{},add:c=>ops.push('class:'+c),remove:c=>ops.push('remove:'+c)}
  },
  addEventListener:(k,v)=>listeners['doc:'+k]=v
 };
 const win={innerHeight:664,visualViewport:{height:664,offsetTop:0,scale:1,addEventListener:()=>{}},addEventListener:()=>{},requestAnimationFrame:()=>{},setTimeout:()=>{}};
 installDialogViewport(win,doc);
 ops.length=0;
 listeners['doc:focusin']({target:field});
 assert.deepEqual(ops,['read:field','read:container','class:field-focus','scrollTop']);
 assert.equal(scrollTop,368);
 dialog=null;listeners['doc:close']();assert.equal(ops.at(-1),'remove:field-focus');
});
