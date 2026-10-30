import {estimateWorkoutBatch} from './workout-kcal.js';
import {norm,num,uid,validateRecord,setsOf} from './core.js';

// Generic foods are approximations per edible portion, not product-label claims.
// Nuta: manufacturer confirms 27 g protein / 43 g. Other macros are unverified.
export const DEFAULT_FOODS=[
  {id:'banana',name:'Chuối',aliases:['chuối','banana'],serving_label:'quả vừa',serving_g:118,kcal:105,protein:1.3,carbs:27,fat:.4,source:'estimate',source_note:'Chuối tươi, phần ăn được khoảng 118 g. Giá trị tham khảo USDA; cân thực tế nếu cần chính xác.',source_url:'https://fdc.nal.usda.gov/food-details/173944/nutrients'},
  {id:'nuta',name:'Nuta Ultimate Plant Protein',aliases:['whey nuta','nuta','nuta protein','ultimate plant protein','nuta ultimate plant protein','nuta plant protein'],serving_label:'khẩu phần 43 g',serving_g:43,kcal:null,protein:27,carbs:null,fat:null,source:'label',source_note:'Nhà sản xuất công bố 27 g protein / 43 g (tra ngày 30/10/2026). Chưa tìm thấy kcal/carbs/fat trên trang chính hãng, giữ trống. GAS cũ dùng 160 kcal, C3/F1.5 nhưng carbs/fat là baseline chưa xác minh; không dùng như nhãn.',source_url:'https://nutafood.vn/bot-protein-thuc-vat-ultilmate-plant-protein-2'},
  {id:'plain-yogurt',name:'Sữa chua không đường',aliases:['sữa chua không đường','sữa chua ko đường','yogurt không đường'],serving_label:'hộp 100 g',serving_g:100,kcal:61,protein:3.5,carbs:4.7,fat:3.3,source:'estimate',source_note:'Sữa chua nguyên chất thông thường, không phải Greek yogurt. Thay bằng nhãn đúng sản phẩm của bạn.',source_url:'https://fdc.nal.usda.gov/'},
  {id:'boiled-egg',name:'Trứng luộc',aliases:['trứng luộc','trứng gà luộc','boiled egg'],serving_label:'quả 50 g',serving_g:50,kcal:77.5,protein:6.3,carbs:.6,fat:5.3,source:'estimate',source_note:'Trứng gà luộc nguyên quả, phần ăn được 50 g; tham khảo USDA.',source_url:'https://fdc.nal.usda.gov/food-details/173424/nutrients'},
  {id:'egg-white',name:'Lòng trắng trứng luộc',aliases:['lòng trắng trứng luộc','lòng trắng trứng','trứng luộc không lòng đỏ','trứng luộc ko lòng đỏ'],serving_label:'lòng trắng',serving_g:33,kcal:17,protein:3.6,carbs:.2,fat:.1,source:'estimate',source_note:'Một lòng trắng trứng gà lớn khoảng 33 g. Giá trị tham khảo, kích thước trứng thay đổi.',source_url:'https://fdc.nal.usda.gov/'},
  {id:'surimi',name:'Thanh cua',aliases:['thanh cua','surimi'],serving_label:'thanh 20 g',serving_g:20,kcal:19,protein:1.5,carbs:3,fat:.1,source:'estimate',source_note:'Surimi thường chứa cá; giá trị trung bình, cần thay bằng nhãn đúng hãng.',source_url:'https://fdc.nal.usda.gov/'},
  {id:'tofu',name:'Đậu hũ',aliases:['đậu hũ','đậu phụ','tàu hủ','tofu'],serving_label:'phần 100 g',serving_g:100,kcal:76,protein:8,carbs:1.9,fat:4.8,source:'estimate',source_note:'Đậu hũ thường chưa chiên. Không áp dụng cho món chiên, kho hoặc có dầu/sốt.',source_url:'https://fdc.nal.usda.gov/'}
];
export const round=v=>Math.round(v*10)/10;
export function validateFood(f){
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(f.id)||!String(f.name||'').trim()||f.name.length>150||!Array.isArray(f.aliases)||f.aliases.length>25||f.aliases.some(a=>typeof a!=='string'||!a.trim()||a.length>150)||!String(f.serving_label||'').trim()||f.serving_label.length>100||!['estimate','label','manual'].includes(f.source))throw Error('Món trong thư viện chưa hợp lệ.');
  for(const k of ['kcal','protein','carbs','fat','serving_g'])if(f[k]!==null&&(typeof f[k]!=='number'||!Number.isFinite(f[k])||f[k]<0||f[k]>100000))throw Error('Số liệu thư viện phải là số không âm hoặc để trống.');
  if(f.serving_g===0)throw Error('Khối lượng khẩu phần phải lớn hơn 0.');
  if(String(f.source_note||'').length>1500||String(f.source_url||'').length>500)throw Error('Ghi chú nguồn quá dài.');
  return f;
}
export function cleanFood(f){return Object.fromEntries(['id','name','aliases','serving_label','serving_g','kcal','protein','carbs','fat','source','source_note','source_url','updated_at'].map(k=>[k,f[k]??(['serving_g','kcal','protein','carbs','fat'].includes(k)?null:'')]));}
const number=s=>Number(String(s).replace(',','.'));
const base=date=>({id:uid(),date,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),deleted:false,notes:''});
export function parseMeals(text,{date,meal='lunch',foods=DEFAULT_FOODS}={}){
  const raw=String(text??'').trim();
  if(!raw||raw.length>10000)throw Error('Nhập món ăn, tối đa 10.000 ký tự.');
  // One submission is one diary entry. Punctuation and line breaks are food text,
  // never record delimiters; normalize decimal separators only while reading numbers.
  let line=raw.replace(/^(?:foodlog|log ăn|log an)\s*/i,'');
  const prefix=line.match(/^(?:bữa\s+|bua\s+)?(sáng|sang|trưa|trua|tối|toi|chiều|chieu|phụ|phu|snack|breakfast|lunch|dinner)(?:\s+nay)?\s*[:\-]?\s+/i);
  if(prefix){meal=({sang:'breakfast',trua:'lunch',toi:'dinner',chieu:'snack',phu:'snack',snack:'snack',breakfast:'breakfast',lunch:'lunch',dinner:'dinner'})[norm(prefix[1])];line=line.slice(prefix[0].length).trim();}
  const r={...base(date),meal,food:line,portion:'',kcal:'',protein:'',carbs:'',fat:'',nutrition_source:'',skipped:false,photo_ids:[]};
  if(['nhin','bo bua','khong an','skip','none'].includes(norm(line))){r.skipped=true;r.food='';return [validateRecord('WebMeals',r)];}
  const amount=line.match(/^(\d+(?:[.,]\d+)?)\s*(kg|gram|gam|g|quả|qua|trái|trai|hộp|hop|cái|cai|thanh|muỗng|muong|scoop|khẩu phần|khau phan|phần|phan)?\s*/i);
  let quantity=amount?number(amount[1]):1,unit=norm(amount?.[2]),name=amount?line.slice(amount[0].length).trim():line;
  if(!amount){const suffix=line.match(/\s+(\d+(?:[.,]\d+)?)\s*(kg|gram|gam|g|quả|qua|trái|trai|hộp|hop|cái|cai|thanh|muỗng|muong|scoop|phần|phan)?$/i);if(suffix){quantity=number(suffix[1]);unit=norm(suffix[2]);name=line.slice(0,suffix.index).trim();}}
  const match=foods.find(f=>[f.name,...f.aliases].some(alias=>norm(alias)===norm(name)));
  if(match){
    if(quantity<=0||quantity>100000)throw Error('Khẩu phần phải lớn hơn 0.');
    let factor=quantity;
    if(['g','gam','gram','kg'].includes(unit)){if(!match.serving_g)throw Error(match.name+': chưa có gram/khẩu phần. Hãy dùng số khẩu phần hoặc sửa thư viện.');factor=quantity*(unit==='kg'?1000:1)/match.serving_g;r.portion=quantity+' '+(unit==='kg'?'kg':'g');}
    else r.portion=quantity+' × '+match.serving_label;
    Object.assign(r,{nutrition_source:match.source,food_id:match.id,nutrition_notes:match.source_note});
    for(const k of ['kcal','protein','carbs','fat'])r[k]=match[k]===null?'':round(match[k]*factor);
  }else{
    const calories=[...line.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:kcal|calo)\b/gi)];
    // Multiple calorie annotations may describe components; don't mistake the first
    // component for the total of the whole submitted meal.
    if(calories.length===1){r.kcal=number(calories[0][1]);r.nutrition_source='manual';}
  }
  return [validateRecord('WebMeals',r)];
}
export function parseWorkouts(text,{date}={}){
  const lines=String(text).split(/[\n;]+/).map(s=>s.trim()).filter(Boolean);
  if(!lines.length||lines.length>30||text.length>10000)throw Error('Nhập từ 1 đến 30 bài, mỗi bài một dòng.');
  return lines.map(raw=>{
    let line=raw.replace(/^(?:gymkcal|gymbro|log)\s+/i,'').replace(/(\d),(\d)/g,'$1.$2').replace(/×/g,'x');const leading=line.match(/^(\d+)\s*(?:sets?|hiệp|hiep)\s*(?:bài|bai)?\s*/i);if(leading)line=line.slice(leading[0].length);const n=norm(line);
    const r={...base(date),exercise:'',kind:'strength',sets_json:'[]',duration_min:'',kcal_burned_est:'',notes:raw};
    if(/^(off|nghi|ngay nghi|rest)$/.test(n)){r.exercise='Ngày nghỉ';r.kind='rest';return r;}
    const duration=line.match(/(\d+(?:\.\d+)?)\s*(phút|phut|minutes?|mins?)\b/i);
    if(/di bo|walking|chay bo|running|dap xe|cycling|bike|treadmill|cardio|boi|swim/.test(n)&&duration){r.kind='cardio';r.exercise=line.slice(0,duration.index).replace(/[,:\s]+$/,'')||'Cardio';r.duration_min=number(duration[1]);validateRecord('WebWorkouts',r);return r;}
    const kg=line.match(/(\d+(?:\.\d+)?)\s*kg\b/i),body=/bodyweight|\bbw\b|push up|hit dat|chong day/.test(n);
    r.kind=/tro luc|counterweight|assisted|kneeling|easy chin/.test(n)?'assisted':body?'bodyweight':'strength';
    if(!kg&&r.kind!=='bodyweight')throw Error('Chưa đọc được kg: '+raw+'. Ví dụ: chin-up trợ lực 27.2kg 3x12.');
    let count,reps,exerciseEnd;
    const multi=line.match(/(\d+)\s*(?:sets?|hiệp|hiep)?\s*x\s*(\d+)\s*(?:reps?)?\b/i);
    const words=line.match(/(\d+)\s*(?:sets?|hiệp|hiep)\s*(?:mỗi set|moi set)?\s*(\d+)\s*(?:reps?)?/i);
    // GAS-compatible "exercise, 20kg x 12": one set, not 20 sets.
    const afterKg=kg?line.slice(kg.index+kg[0].length):line;
    const dumbbell=afterKg.match(/^\s*(?:x|\*)\s*(\d+(?:\.\d+)?)\s*(?:,|x|\*)\s*(\d+)\s*(?:reps?)?\s*$/i);
    const eachReps=afterKg.match(/^\s*(?:each|per hand|per dumbbell|mỗi bên|moi ben|mỗi tay|moi tay)\s*[,x*]?\s*(\d+)\s*(?:reps?)?\s*$/i);
    const naturalReps=line.match(/(?:mỗi set|moi set|mỗi hiệp|moi hiep)\s*(\d+)\s*(?:reps?)/i);
    const kgReps=afterKg.match(/^\s*[,x*]?\s*(\d+)\s*(?:reps?)?\s*$/i);
    if(dumbbell){count=1;reps=Number(dumbbell[2]);exerciseEnd=kg.index;}
    else if(eachReps){count=1;reps=Number(eachReps[1]);exerciseEnd=kg.index;}
    else if(leading&&naturalReps){count=Number(leading[1]);reps=Number(naturalReps[1]);exerciseEnd=kg?.index??naturalReps.index;}
    else if(multi&&!(kg&&multi.index<kg.index+kg[0].length)){count=Number(multi[1]);reps=Number(multi[2]);exerciseEnd=multi.index;}
    else if(words){count=Number(words[1]);reps=Number(words[2]);exerciseEnd=words.index;}
    else if(kgReps){count=1;reps=Number(kgReps[1]);exerciseEnd=kg?.index??line.indexOf('bw');}
    else throw Error('Chưa đọc được set/reps: '+raw+'. Dùng 3x12 hoặc 3 set 12 reps.');
    const end=Math.min(exerciseEnd,kg?.index??Infinity);r.exercise=line.slice(0,end).replace(/(?:counterweight|trợ lực|tro luc)\s*$/i,'').replace(/[,:\s]+$/,'').replace(/\s*(bodyweight|bw)\s*$/i,'').trim();
    if(!r.exercise)throw Error('Hãy thêm tên bài tập.');
    if(count<1||count>50)throw Error('Mỗi bài từ 1 đến 50 set.');
    r.sets_json=JSON.stringify(Array.from({length:count},()=>({weight_kg:r.kind==='bodyweight'?'':round(number(kg[1])*(dumbbell?number(dumbbell[1]):eachReps?2:1)),reps})));
    validateRecord('WebWorkouts',r);return r;
  });
}
export function compactWorkout(fields,{date}={}){
  const kind=fields.kind||'strength',r={...base(date),exercise:kind==='rest'?'Ngày nghỉ':String(fields.exercise||'').trim(),kind,sets_json:'[]',duration_min:kind==='cardio'?Number(fields.duration):'',kcal_burned_est:''};
  if(['strength','assisted','bodyweight'].includes(kind)){
    const count=Number(fields.count);if(!Number.isInteger(count)||count<1||count>50)throw Error('Set phải là số nguyên từ 1 đến 50.');
    if(kind!=='bodyweight'&&String(fields.kg??'').trim()==='')throw Error('Nhập kg cho bài tập.');
    r.sets_json=JSON.stringify(Array.from({length:count},()=>({weight_kg:kind==='bodyweight'?'':Number(fields.kg),reps:Number(fields.reps)})));
  }
  return validateRecord('WebWorkouts',r);
}
export function ensureWorkoutDay(existing,planned){
  for(const day of new Set(planned.map(r=>r.date))){const same=[...existing.filter(r=>r.date===day&&!r.deleted),...planned.filter(r=>r.date===day)];if(same.some(r=>r.kind==='rest')&&same.length>1)throw Error('Ngày này có mục nghỉ. Xóa mục nghỉ trước khi thêm bài tập (hoặc chọn ngày khác).');}
}
// Non-secret fingerprint detects edits made after generating the prompt, including another device.
export function fingerprint(r){const copy={...r};delete copy._revision;delete copy._originalUpdatedAt;const canonical=o=>Array.isArray(o)?o.map(canonical):o&&typeof o==='object'?Object.fromEntries(Object.keys(o).sort().map(k=>[k,canonical(o[k])])):o;return JSON.stringify(canonical(copy));}
export function makeRequest(kind,date,rows,{scope,weight=null,sessionMinutes=null,method='chatgpt'}={}){
  if(!['meals','workouts'].includes(kind)||!rows.length)throw Error('Chưa có nhật ký để tạo prompt.');
  if(rows.length>100)throw Error('Tối đa 100 mục mỗi lần ước tính.');
  return {app:'GymBro',version:1,request_id:uid(),kind,date,scope,weight,sessionMinutes,method,items:rows.map(r=>({id:r.id,snapshot:fingerprint(r),record:structuredClone(r)}))};
}
export const estimateToken=q=>String(q.token||q.request_id.replace(/-/g,'').slice(0,12));
export function requestPrompt(q){
  const meals=q.kind==='meals';
  if(meals){
    const items=q.items.map(({record:r},i)=>({i:i+1,mon:r.food,...(r.portion?{luong:r.portion}:{}),...(r.notes?{ghi_chu:r.notes}:{}),...(r.photo_ids?.length?{anh:r.photo_ids.map((_,j)=>`mon${i+1}_anh${j+1}.jpg`)}:{}),...(r.nutrition_source==='label'?{nhan:[r.kcal,r.protein,r.carbs,r.fat].map(num)}:{})}));
    return `Ước tính tổng kcal/protein/carbs/fat cho từng món từ mô tả và ảnh. Đây là ước tính. Đơn vị kcal,g; số hoặc null nếu chưa biết, không thay chưa biết bằng 0. Mỗi i là một món/khẩu phần, không tính trùng. Ảnh monN_anhM thuộc món N. Giữ giá trị nhãn đã biết (nhan theo thứ tự kcal,P,C,F); chỉ ước tính phần thiếu.\nNgày ${q.date}. Món:\n${JSON.stringify(items)}\nChỉ trả một JSON gọn, không markdown, không giải thích. Giữ r và đủ mỗi i đúng một lần. Mỗi dòng m=[i,kcal,protein_g,carbs_g,fat_g]. Ví dụ cấu trúc (thay null bằng kết quả):\n${JSON.stringify({r:estimateToken(q),m:q.items.map((_,i)=>[i+1,null,null,null,null])})}`;
  }
  let baseline=[];if(!meals)try{baseline=estimateWorkoutBatch(q.items.map(x=>x.record),{weight:q.weight,sessionMinutes:q.sessionMinutes,overwrite:true});}catch{}
  const items=q.items.map(({record:r})=>meals?{id:r.id,meal:r.meal,food:r.food,portion:r.portion,notes:r.notes,photos:r.photo_ids||[],known:{kcal:r.kcal,protein_g:r.protein,carbs_g:r.carbs,fat_g:r.fat},source:r.nutrition_source}:{id:r.id,exercise:r.exercise,kind:r.kind,sets:setsOf(r),duration_min:r.duration_min,notes:r.notes,baseline_kcal:baseline.find(x=>x.id===r.id)?.kcal_burned_est??null,baseline_assumptions:baseline.find(x=>x.id===r.id)?.kcal_estimation_notes||''});
  const shape=meals?{id:'GIỮ NGUYÊN ID',kcal:null,protein_g:null,carbs_g:null,fat_g:null,notes:'Giả định/độ không chắc chắn'}:{id:'GIỮ NGUYÊN ID',kcal_burned:null,notes:'Cách tính, thời lượng và độ không chắc chắn'};
  return `Bạn hỗ trợ ước tính ${meals?'dinh dưỡng từ mô tả và ảnh bữa ăn đính kèm':'kcal tiêu hao cho từng bài tập'}. Đây là ước tính, không phải đo lường.\n${meals?'Ảnh được gắn tên bằng ID món. Không gộp các ID hoặc tính cùng một phần ăn hai lần. Giữ số liệu nhãn đã biết; chỉ ước tính phần chưa biết. Nếu có nhiều thành phần trong cùng ID, trả tổng đúng cho ID đó. Không tự suy ra món không thấy. Thiếu căn cứ thì dùng null, không dùng 0 để thay cho chưa biết.':'Dùng cân nặng và thời lượng thực tế nếu có. Nếu thiếu thời gian bài tạ nhưng có sets/reps, dùng baseline_kcal và baseline_assumptions của app (cách GAS legacy), hoặc tinh chỉnh bằng giả định rõ ràng; không trả null chỉ vì thiếu thời gian. Baseline là ước tính theo preset, không phải số đo hoặc số MET riêng cho từng bài được xác nhận khoa học. Ước tính chỉ đúng số set của từng ID; một ID legacy có 1 set thì chỉ tính 1 set. Cardio dùng phút đã ghi; chỉ trả null khi thật sự thiếu cân nặng hoặc thiếu cả sets/reps và thời lượng. Nếu có tổng phút buổi, phân bổ một lần sau khi trừ cardio, không gán cả buổi cho từng ID. Kcal là gross (bao gồm nền trong thời gian tập), không phải net; không cộng EPOC. Phân bổ thời gian nghỉ hợp lý, không gán toàn bộ buổi cho từng bài. Tổng các ID không được tính trùng. Bài trợ lực: kg máy là mức hỗ trợ, không phải tạ nâng.'}\nCân nặng: ${q.weight??'chưa biết'} kg. ${!meals?'Tổng thời lượng buổi tập (kể cả nghỉ): '+(q.sessionMinutes??'chưa biết')+' phút.':''}\nNgày cố định: ${q.date}. Dữ liệu:\n${JSON.stringify(items,null,2)}\n\nChỉ trả MỘT JSON hợp lệ, không markdown, không lời dẫn. Giữ nguyên request_id, date, kind và đủ các ID chính xác. Số là JSON number không âm hoặc null, đơn vị kcal và gram, làm tròn 1 chữ số. Không thêm tổng thành một item. Format:\n${JSON.stringify({app:'GymBro',version:1,request_id:q.request_id,date:q.date,kind:q.kind,items:[shape]},null,2)}`;
}
// Tolerate clipboard wrappers without inventing missing values or completing cut JSON.
export function readEstimateJSON(text){
  const raw=String(text??'').replace(/[\uFEFF\u200B-\u200D\u2060]/g,'').trim();
  if(!raw)throw Error('Chưa có kết quả. Dán JSON ChatGPT trả về.');
  if(raw.length>200000)throw Error('Kết quả quá dài. Dùng prompt gọn mới.');
  const unfenced=raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const tidy=input=>{
    const v=input.replace(/[“”]/g,'"').replace(/\u00a0/g,' ');let result='',quoted=false,escaped=false;
    for(let i=0;i<v.length;i++){const c=v[i];if(quoted){result+=c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else{if(c==='"')quoted=true;if(c===','&&/^[\s]*[}\]]/.test(v.slice(i+1)))continue;result+=c;}}
    return result;
  };
  for(const candidate of [raw,unfenced,tidy(unfenced)])try{return JSON.parse(candidate);}catch{}
  // Extract complete top-level JSON blocks from prose/fences. Multiple blocks are ambiguous.
  const input=tidy(raw),blocks=[];let begin=-1,stack=[],quoted=false,escaped=false,broken=false;
  for(let i=0;i<input.length;i++){
    const c=input[i];if(begin<0){if(c!=='{'&&c!=='[')continue;begin=i;stack=[c];quoted=false;escaped=false;continue;}
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"'){quoted=true;continue;}if(c==='{'||c==='[')stack.push(c);
    else if(c==='}'||c===']'){if(stack.pop()!==(c==='}'?'{':'[')){broken=true;break;}if(!stack.length){blocks.push(input.slice(begin,i+1));begin=-1;}}
  }
  if(!broken&&begin<0&&blocks.length===1)try{return JSON.parse(blocks[0]);}catch{}
  if(blocks.length>1)throw Error('Có nhiều khối JSON. Chỉ dán một kết quả đầy đủ.');
  if(begin>=0&&!broken)throw Error('JSON có vẻ bị cắt: thiếu dấu đóng ngoặc hoặc chuỗi chưa kết thúc. Copy lại khối kết quả; prompt mới dùng dạng gọn.');
  throw Error('JSON sai cú pháp. Dùng nút Copy của khối kết quả ChatGPT; không cần chọn kèm phần giải thích.');
}
export function parseEstimate(text,q,currentRows,scope){
  if(!q||q.scope!==scope)throw Error('Tạo prompt trong tài khoản hiện tại trước.');
  const output=readEstimateJSON(text);let items;
  if(output&&typeof output==='object'&&!Array.isArray(output)&&('r' in output||'m' in output)){
    if(q.kind!=='meals'||output.r!==estimateToken(q))throw Error('Mã kết quả không khớp prompt đang mở. Dùng kết quả của prompt này hoặc tạo lại prompt.');
    if(!Array.isArray(output.m))throw Error('Thiếu danh sách macro m.');
    items=output.m.map(row=>{
      if(!Array.isArray(row)||row.length!==5||!Number.isInteger(row[0])||row[0]<1||row[0]>q.items.length)throw Error('Mỗi món cần đủ [số thứ tự,kcal,protein,carbs,fat].');
      return {id:q.items[row[0]-1].id,kcal:row[1],protein_g:row[2],carbs_g:row[3],fat_g:row[4],notes:'Ước tính từ mô tả/ảnh · định dạng gọn'};
    });
  }else if(Array.isArray(output))items=output;
  else if(output&&typeof output==='object'&&'id' in output&&!('items' in output))items=[output];
  else{
    if(!output||output.app!=='GymBro'||output.version!==1||output.request_id!==q.request_id||output.date!==q.date||output.kind!==q.kind||!Array.isArray(output.items))throw Error('Kết quả không khớp prompt/ngày. Dùng đúng JSON của prompt vừa tạo.');
    items=output.items;
  }
  if(items.length!==q.items.length)throw Error(`Kết quả có ${items.length}/${q.items.length} món/bài. Cần đủ tất cả mục trong prompt; chưa áp dụng dữ liệu.`);
  const seen=new Set();
  return items.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw Error('Mỗi mục kết quả phải có ID và đủ số liệu.');
    const target=q.items.find(x=>x.id===item.id),current=currentRows.find(x=>x.id===item.id);
    if(!target||seen.has(item.id))throw Error('ID bị trùng hoặc không thuộc prompt.');seen.add(item.id);
    if(!current||current.deleted||fingerprint(current)!==target.snapshot)throw Error('Nhật ký đã thay đổi sau khi tạo prompt. Tạo prompt mới để tránh ghi đè.');
    const keys=q.kind==='meals'?['kcal','protein_g','carbs_g','fat_g']:['kcal_burned'];
    for(const k of keys)if(item[k]!==null&&(typeof item[k]!=='number'||!Number.isFinite(item[k])||item[k]<0||item[k]>(k==='kcal_burned'?15000:100000)))throw Error('Macro/kcal phải là số không âm hoặc null.');
    if(item.notes!==undefined&&(typeof item.notes!=='string'||item.notes.length>2000))throw Error('Ghi chú không hợp lệ hoặc quá dài.');
    const notes=item.notes??'Ước tính từ mô tả/ảnh';
    const r={...current,updated_at:new Date().toISOString(),_originalUpdatedAt:current.updated_at};
    if(q.kind==='meals'){
      for(const [from,to] of [['kcal','kcal'],['protein_g','protein'],['carbs_g','carbs'],['fat_g','fat']]){const known=num(current[to]);if(current.nutrition_source!=='label'||known===null)r[to]=item[from]===null?(current[to]??''):round(item[from]);}
      r.nutrition_source=current.nutrition_source==='label'?'label':'estimate';r.nutrition_notes='ChatGPT: '+notes;
    }else{r.kcal_burned_est=item.kcal_burned===null?'':round(item.kcal_burned);r.kcal_estimation_notes=(q.method==='local'?'GymBro · gross kcal: ':'ChatGPT · gross kcal: ')+notes;}
    validateRecord(q.kind==='meals'?'WebMeals':'WebWorkouts',r);return r;
  });
}
