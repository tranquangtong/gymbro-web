import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMeals,makeRequest,requestPrompt,parseEstimate,estimateToken,readEstimateJSON,needsMealEstimate} from '../quick.js';
const date='2026-10-30',scope='firebase:owner';
function setup(n=2){const rows=['Bún trứng rau','Kem bơ','Cơm đậu hũ','Yến mạch sữa'].slice(0,n).flatMap(s=>parseMeals(s,{date}));const q=makeRequest('meals',date,rows,{scope});const out={r:estimateToken(q),m:rows.map((_,i)=>[i+1,510+i,24,45,26])};return {rows,q,out};}
test('Compact results map reordered short meal numbers back to exact IDs, without exposing IDs in prompt',()=>{
 const {rows,q,out}=setup();out.m.reverse();const parsed=parseEstimate(JSON.stringify(out),q,rows,scope);
 assert.equal(parsed[0].id,rows[1].id);assert.equal(parsed[0].kcal,511);assert.equal(parsed[1].id,rows[0].id);assert.equal(parsed[1].protein,24);
 const prompt=requestPrompt(q);for(const r of rows)assert.equal(prompt.includes(r.id),false);assert.match(prompt,/protein, carbs và fat/);assert.match(prompt,/4×protein \+ 4×carbs \+ 9×fat/);assert.ok(prompt.length<2600,'prompt length '+prompt.length);assert.ok(JSON.stringify(out).length<110);
});
test('Mobile paste accepts fences, prose, smart quotes, BOM, zero-width characters, and safe trailing commas',()=>{
 const {rows,q,out}=setup(),raw=JSON.stringify(out);
 for(const text of [raw,'```json\n'+raw+'\n```','Kết quả:\n```json\n'+raw+'\n```\nƯớc tính tham khảo.',raw.replaceAll('"','“'),'\uFEFF\u200B'+raw,raw.replace(']]}','],],}')]){
  const result=parseEstimate(text,q,rows,scope);assert.equal(result.length,2);assert.equal(result[0].kcal,510);
 }
});
test('Complete legacy wrappers, full-ID arrays and a single full-ID object remain supported',()=>{
 const {rows,q}=setup(1),item={id:rows[0].id,kcal:510,protein_g:24,carbs_g:45,fat_g:26};
 for(const out of [item,[item],{app:'GymBro',version:1,request_id:q.request_id,date,kind:'meals',items:[{...item,notes:'ước tính'}]}])assert.equal(parseEstimate(JSON.stringify(out),q,rows,scope)[0].kcal,510);
});
test('Compact input still rejects wrong request/account, changed records, duplicate IDs and incomplete batches',()=>{
 const {rows,q,out}=setup();
 assert.throws(()=>parseEstimate(JSON.stringify({...out,r:'wrong'}),q,rows,scope),/Mã kết quả/);
 assert.throws(()=>parseEstimate(JSON.stringify(out),q,rows,'firebase:other'));
 assert.throws(()=>parseEstimate(JSON.stringify(out),q,[{...rows[0],food:'Changed'},rows[1]],scope),/đã thay đổi/);
 assert.throws(()=>parseEstimate(JSON.stringify({...out,m:[out.m[0],out.m[0]]}),q,rows,scope),/trùng/);
 assert.throws(()=>parseEstimate(JSON.stringify({...out,m:[out.m[0]]}),q,rows,scope),/1\/2/);
 assert.throws(()=>parseEstimate(JSON.stringify({...out,m:[[3,510,24,45,26],out.m[1]]}),q,rows,scope));
});
test('Never repairs truncated data, accepts partial blocks, or invents missing macro fields',()=>{
 const {rows,q,out}=setup(),raw=JSON.stringify(out);
 assert.throws(()=>parseEstimate(raw.slice(0,-1),q,rows,scope),/bị cắt/);
 assert.throws(()=>parseEstimate(raw+'\n'+raw,q,rows,scope),/nhiều khối/);
 for(const value of ['510',-1,{},true])assert.throws(()=>parseEstimate(JSON.stringify({...out,m:[[1,value,24,45,26],out.m[1]]}),q,rows,scope));
 assert.throws(()=>parseEstimate(JSON.stringify({...out,m:[[1,510,24,45],out.m[1]]}),q,rows,scope));
 assert.throws(()=>readEstimateJSON(''),/Chưa có/);assert.throws(()=>readEstimateJSON('x'.repeat(200001)),/quá dài/);
});
test('Compact label data and null results retain verified known numbers and genuine zero',()=>{
 const rows=parseMeals('1 whey Nuta',{date}),q=makeRequest('meals',date,rows,{scope});const out={r:estimateToken(q),m:[[1,null,99,0,null]]};
 const result=parseEstimate(JSON.stringify(out),q,rows,scope)[0];assert.equal(result.protein,27);assert.equal(result.kcal,'');assert.equal(result.carbs,0);assert.equal(result.fat,'');assert.match(requestPrompt(q),/đã biết \(giữ nguyên\): protein 27(?!,)/);
});
test('Valid JSON string content is preserved; only syntax-level wrappers are normalized',()=>{
 const v={notes:'Ớt “chuông”,] nguyên quả; có dấu { và } trong chữ'};assert.deepEqual(readEstimateJSON(JSON.stringify(v)),v);
 assert.deepEqual(readEstimateJSON('{"notes":"dấu phẩy ,] và } vẫn giữ",}'),{notes:'dấu phẩy ,] và } vẫn giữ'});
});
test('Meal photo names are short, unique and match the numbered meal without long photo IDs',()=>{
 const {rows,q}=setup();q.items[0].record.photo_ids=['uuid-photo-a','uuid-photo-b'];q.items[1].record.photo_ids=['uuid-photo-c'];
 const p=requestPrompt(q);assert.match(p,/Món 1: .*có 2 ảnh nhãn "Món 1"/);assert.match(p,/Món 2: .*có 1 ảnh nhãn "Món 2"/);assert.doesNotMatch(p,/uuid-photo/);
});

test('Missing-only meal requests skip complete meals, count zero as known, and exclude skipped/deleted rows',()=>{
 const {rows}=setup(2),complete={...rows[0],kcal:114,protein:9,carbs:18,fat:.6},partial={...rows[1],kcal:200,protein:10,carbs:'',fat:null};
 assert.equal(needsMealEstimate(complete),false);assert.equal(needsMealEstimate({...complete,kcal:0,protein:0,carbs:0,fat:0}),false);
 for(const field of ['kcal','protein','carbs','fat'])assert.equal(needsMealEstimate({...complete,[field]:''}),true);
 assert.equal(needsMealEstimate({...partial,skipped:'true'}),false);assert.equal(needsMealEstimate({...partial,deleted:true}),false);
 const q=makeRequest('meals',date,[complete,partial],{scope,missingOnly:true});assert.equal(q.items.length,1);assert.equal(q.items[0].id,partial.id);assert.equal(q.missingOnly,true);
 const prompt=requestPrompt(q);assert.doesNotMatch(prompt,new RegExp(complete.food));assert.match(prompt,/đã biết \(giữ nguyên\): kcal 200, protein 10(?!,)/);
 const result=parseEstimate(JSON.stringify({r:estimateToken(q),m:[[1,999,99,30,5]]}),q,[complete,partial],scope);
 assert.equal(result.length,1);assert.equal(result[0].id,partial.id);assert.equal(result[0].kcal,200);assert.equal(result[0].protein,10);assert.equal(result[0].carbs,30);assert.equal(result[0].fat,5);
 assert.throws(()=>makeRequest('meals',date,[complete],{scope,missingOnly:true}));
});

test('Compact rows may carry a short assumption note, and kcal that disagrees with 4/4/9 macros is flagged',()=>{
 const date='2026-10-30',scope='firebase:test',rows=[{id:'a',date,meal:'lunch',food:'Cơm tấm',portion:'1 đĩa',kcal:'',protein:'',carbs:'',fat:'',created_at:'c',updated_at:'u',deleted:false}];
 const q=makeRequest('meals',date,rows,{scope,missingOnly:true});
 const ok=parseEstimate(JSON.stringify({r:estimateToken(q),m:[[1,650,30,80,22,'250 g cơm, 120 g sườn, 10 g mỡ hành']]}),q,rows,scope)[0];
 assert.equal(ok.nutrition_notes,'ChatGPT: 250 g cơm, 120 g sườn, 10 g mỡ hành');assert.equal(ok._warnings,undefined);
 const off=parseEstimate(JSON.stringify({r:estimateToken(q),m:[[1,300,30,80,22,'giả định']]}),q,rows,scope)[0];
 assert.match(off._warnings[0],/lệch với macro/);assert.equal(off.nutrition_notes,'ChatGPT: Ước tính từ mô tả/ảnh');
 assert.match(requestPrompt(q),/Món 1: Cơm tấm — lượng: 1 đĩa — không có ảnh/);
});

test('Reasoning text with brackets before the final JSON still reads the result block',()=>{
 const text='Món 1 [cơm tấm]: ~250 g cơm [ước lượng], 120 g sườn.\n{"r":"abc","m":[[1,650,30,80,22,"giả định"]]}';
 assert.deepEqual(readEstimateJSON(text),{r:'abc',m:[[1,650,30,80,22,'giả định']]});
 assert.throws(()=>readEstimateJSON('[1] {"a":1} {"b":2}'),/nhiều khối JSON/);
});
