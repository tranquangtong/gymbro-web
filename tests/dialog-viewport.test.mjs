import test from 'node:test';
import assert from 'node:assert/strict';
import {viewportBounds,fieldScrollDelta,installDialogViewport} from '../dialog-viewport.js';
test('iOS keyboard tracks both visible height and Safari pan without treating pinch zoom as keyboard',()=>{
 const win={innerHeight:800,visualViewport:{height:340,offsetTop:96,scale:1}};
 assert.deepEqual(viewportBounds(win),{height:340,top:96,keyboard:true});
 win.visualViewport.scale=2;assert.equal(viewportBounds(win).keyboard,false);
 assert.deepEqual(viewportBounds({innerHeight:700}),{height:700,top:0,keyboard:false});
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
 const doc={activeElement:field,documentElement:{style:{setProperty:(k,v)=>properties[k]=v},classList:{toggle:(k,v)=>classes[k]=v}},addEventListener:(k,v)=>listeners['doc:'+k]=v};
 const win={innerHeight:800,visualViewport:{height:360,offsetTop:70,scale:1,addEventListener:(k,v)=>listeners['view:'+k]=v},addEventListener:(k,v)=>listeners[k]=v,requestAnimationFrame:f=>queue.push(f)};
 installDialogViewport(win,doc);
 assert.equal(properties['--dialog-viewport-top'],'70px');assert.equal(classes['keyboard-open'],true);assert.equal(container.scrollTop,46);
 for(const event of ['view:resize','view:scroll','resize','doc:focusin','doc:input'])assert.equal(typeof listeners[event],'function');
 listeners['view:scroll']();listeners['doc:input']();assert.equal(queue.length,1);
 doc.activeElement=null;win.visualViewport.height=800;win.visualViewport.offsetTop=0;queue.shift()();
 assert.equal(classes['keyboard-open'],false);assert.equal(container.scrollTop,46);
});
