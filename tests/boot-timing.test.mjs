import test from 'node:test';
import assert from 'node:assert/strict';
import {createBootTiming,describeBootTiming} from '../src/ui/boot-timing.js';

test('Boot milestones keep their first time and read in start-up order',()=>{
  let t=0;const b=createBootTiming(()=>t);
  t=412.4;b.mark('cached');t=1200;b.mark('firebase');t=1530;b.mark('token');t=2600;b.mark('data');t=2650;b.mark('ready');t=9000;b.mark('ready');
  assert.deepEqual(b.marks,{cached:412,firebase:1200,token:1530,data:2600,ready:2650});
  assert.equal(describeBootTiming(b.marks),'Lần mở này (tính từ lúc mở app): dữ liệu đã lưu 0,4 s · thư viện đăng nhập 1,2 s · kiểm tra phiên 1,5 s · tải dữ liệu máy chủ 2,6 s · sẵn sàng 2,7 s.');
  assert.equal(describeBootTiming({}),'');assert.equal(describeBootTiming({ready:300}),'Lần mở này (tính từ lúc mở app): sẵn sàng 0,3 s.');
});
