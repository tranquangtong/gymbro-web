import test from 'node:test';
import assert from 'node:assert/strict';
import {isTap,installNavTap} from '../nav-tap.js';

function fakeNav(){
  const handlers={},link={getAttribute:()=>'#gym',closest:()=>link};
  const nav={addEventListener:(type,fn,opts)=>{handlers[type]={fn,opts};},contains:el=>el===link};
  const touch=(type,x,y,count=1)=>{const e={target:link,touches:{length:type==='touchend'?0:count},changedTouches:[{clientX:x,clientY:y}],prevented:false,preventDefault(){this.prevented=true;}};handlers[type].fn(e);return e;};
  return {nav,handlers,touch};
}

test('A short, still touch is a tap; a drag or long press is not',()=>{
  const s={x:100,y:600,t:0};
  assert.equal(isTap(s,{x:106,y:595,t:200}),true);
  assert.equal(isTap(s,{x:100,y:640,t:200}),false);
  assert.equal(isTap(s,{x:100,y:600,t:900}),false);
  assert.equal(isTap(null,{x:0,y:0,t:0}),false);
});

test('Bottom bar navigates on touchend, so a tap during momentum scroll is not lost',()=>{
  let t=0;const seen=[];const {nav,handlers,touch}=fakeNav();
  installNavTap(nav,href=>seen.push(href),()=>t);
  assert.equal(handlers.touchend.opts.passive,false);
  touch('touchstart',100,600);t=120;
  const end=touch('touchend',102,601);
  assert.deepEqual(seen,['#gym']);
  assert.equal(end.prevented,true,'synthetic click suppressed so it does not navigate twice');
});

test('Dragging across the bar or multi-touch does not navigate',()=>{
  let t=0;const seen=[];const {nav,touch}=fakeNav();
  installNavTap(nav,href=>seen.push(href),()=>t);
  touch('touchstart',100,600);touch('touchmove',100,560);touch('touchend',100,560);
  touch('touchstart',100,600,2);touch('touchend',100,600);
  assert.deepEqual(seen,[]);
});
