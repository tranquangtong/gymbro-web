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
  if(!String(text).trim()||text.length>10000)throw Error('Nhập món ăn, tối đa 10.000 ký tự.');
  // Decimal commas belong to quantities; other commas separate foods.
  const lines=text.replace(/(\d),(\d)/g,'$1.$2').split(/[\n;,]+/).map(s=>s.trim()).filter(Boolean);
  let selectedMeal=meal;
  const result=lines.map(raw=>{
    let line=raw.replace(/^(?:foodlog|log ăn|log an)\s*/i,'');
    const prefix=line.match(/^(?:bữa\s+|bua\s+)?(sáng|sang|trưa|trua|tối|toi|chiều|chieu|phụ|phu|snack|breakfast|lunch|dinner)(?:\s+nay)?\s*[:\-]?\s+/i);
    if(prefix){selectedMeal=({sang:'breakfast',trua:'lunch',toi:'dinner',chieu:'snack',phu:'snack',snack:'snack',breakfast:'breakfast',lunch:'lunch',dinner:'dinner'})[norm(prefix[1])];line=line.slice(prefix[0].length).trim();}
    const r={...base(date),meal:selectedMeal,food:line,portion:'',kcal:'',protein:'',carbs:'',fat:'',nutrition_source:'',skipped:false,photo_ids:[]};
    if(['nhin','bo bua','khong an','skip','none'].includes(norm(line))){r.skipped=true;r.food='';return r;}
    const amount=line.match(/^(\d+(?:\.\d+)?)\s*(kg|gram|gam|g|quả|qua|trái|trai|hộp|hop|cái|cai|thanh|muỗng|muong|scoop|khẩu phần|khau phan|phần|phan)?\s*/i);
    let quantity=amount?number(amount[1]):1,unit=norm(amount?.[2]),name=amount?line.slice(amount[0].length).trim():line;
    // Also accept "chuối 2 quả" and "whey Nuta 1 scoop".
    if(!amount){const suffix=line.match(/\s+(\d+(?:\.\d+)?)\s*(kg|gram|gam|g|quả|qua|trái|trai|hộp|hop|cái|cai|thanh|muỗng|muong|scoop|phần|phan)?$/i);if(suffix){quantity=number(suffix[1]);unit=norm(suffix[2]);name=line.slice(0,suffix.index).trim();}}
    const match=foods.find(f=>[f.name,...f.aliases].some(alias=>norm(alias)===norm(name)));
    if(match){
      if(quantity<=0||quantity>100000)throw Error('Khẩu phần phải lớn hơn 0.');
      let factor=quantity;
      if(['g','gam','gram','kg'].includes(unit)){if(!match.serving_g)throw Error(match.name+': chưa có gram/khẩu phần. Hãy dùng số khẩu phần hoặc sửa thư viện.');factor=quantity*(unit==='kg'?1000:1)/match.serving_g;r.portion=quantity+' '+(unit==='kg'?'kg':'g');}
      else r.portion=quantity+' × '+match.serving_label;
      Object.assign(r,{food:match.name,nutrition_source:match.source,food_id:match.id,nutrition_notes:match.source_note});
      for(const k of ['kcal','protein','carbs','fat'])r[k]=match[k]===null?'':round(match[k]*factor);
    }else{
      const kcal=line.match(/(\d+(?:\.\d+)?)\s*(?:kcal|calo)\b/i);if(kcal){r.kcal=number(kcal[1]);r.nutrition_source='manual';}
    }
    validateRecord('WebMeals',r);return r;
  });
  if(!result.length||result.length>50)throw Error('Mỗi lần ghi từ 1 đến 50 món.');
  return result;
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
export function ensureWorkoutDay(existing,planned){
  for(const day of new Set(planned.map(r=>r.date))){const same=[...existing.filter(r=>r.date===day&&!r.deleted),...planned.filter(r=>r.date===day)];if(same.some(r=>r.kind==='rest')&&same.length>1)throw Error('Ngày này có mục nghỉ. Xóa mục nghỉ trước khi thêm bài tập (hoặc chọn ngày khác).');}
}
// Non-secret fingerprint detects edits made after generating the prompt, including another device.
export function fingerprint(r){const copy={...r};delete copy._revision;delete copy._originalUpdatedAt;const canonical=o=>Array.isArray(o)?o.map(canonical):o&&typeof o==='object'?Object.fromEntries(Object.keys(o).sort().map(k=>[k,canonical(o[k])])):o;return JSON.stringify(canonical(copy));}
export function makeRequest(kind,date,rows,{scope,weight=null,sessionMinutes=null}={}){
  if(!['meals','workouts'].includes(kind)||!rows.length)throw Error('Chưa có nhật ký để tạo prompt.');
  if(rows.length>100)throw Error('Tối đa 100 mục mỗi lần ước tính.');
  return {app:'GymBro',version:1,request_id:uid(),kind,date,scope,weight,sessionMinutes,items:rows.map(r=>({id:r.id,snapshot:fingerprint(r),record:structuredClone(r)}))};
}
export function requestPrompt(q){
  const meals=q.kind==='meals';
  const items=q.items.map(({record:r})=>meals?{id:r.id,meal:r.meal,food:r.food,portion:r.portion,notes:r.notes,photos:r.photo_ids||[],known:{kcal:r.kcal,protein_g:r.protein,carbs_g:r.carbs,fat_g:r.fat},source:r.nutrition_source}:{id:r.id,exercise:r.exercise,kind:r.kind,sets:setsOf(r),duration_min:r.duration_min,notes:r.notes});
  const shape=meals?{id:'GIỮ NGUYÊN ID',kcal:null,protein_g:null,carbs_g:null,fat_g:null,notes:'Giả định/độ không chắc chắn'}:{id:'GIỮ NGUYÊN ID',kcal_burned:null,notes:'Cách tính, thời lượng và độ không chắc chắn'};
  return `Bạn hỗ trợ ước tính ${meals?'dinh dưỡng từ mô tả và ảnh bữa ăn đính kèm':'kcal tiêu hao cho từng bài tập'}. Đây là ước tính, không phải đo lường.\n${meals?'Ảnh được gắn tên bằng ID món. Không gộp các ID hoặc tính cùng một phần ăn hai lần. Giữ số liệu nhãn đã biết; chỉ ước tính phần chưa biết. Nếu có nhiều thành phần trong cùng ID, trả tổng đúng cho ID đó. Không tự suy ra món không thấy. Thiếu căn cứ thì dùng null, không dùng 0 để thay cho chưa biết.':'Dùng cân nặng và thời lượng nếu có. Không suy ra thời gian tập chỉ từ set/reps. Nếu thiếu thời gian, trả null và nêu cần bổ sung. Kcal là gross (bao gồm nền trong thời gian tập), không phải net; không cộng EPOC. Phân bổ thời gian nghỉ hợp lý, không gán toàn bộ buổi cho từng bài. Tổng các ID không được tính trùng. Bài trợ lực: kg máy là mức hỗ trợ, không phải tạ nâng.'}\nCân nặng: ${q.weight??'chưa biết'} kg. ${!meals?'Tổng thời lượng buổi tập (kể cả nghỉ): '+(q.sessionMinutes??'chưa biết')+' phút.':''}\nNgày cố định: ${q.date}. Dữ liệu:\n${JSON.stringify(items,null,2)}\n\nChỉ trả MỘT JSON hợp lệ, không markdown, không lời dẫn. Giữ nguyên request_id, date, kind và đủ các ID chính xác. Số là JSON number không âm hoặc null, đơn vị kcal và gram, làm tròn 1 chữ số. Không thêm tổng thành một item. Format:\n${JSON.stringify({app:'GymBro',version:1,request_id:q.request_id,date:q.date,kind:q.kind,items:[shape]},null,2)}`;
}
export function parseEstimate(text,q,currentRows,scope){
  if(!q||q.scope!==scope)throw Error('Tạo prompt trong tài khoản hiện tại trước.');
  if(String(text).length>200000)throw Error('Kết quả quá dài.');
  let output;try{output=JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw Error('Không đọc được JSON. Copy toàn bộ JSON ChatGPT trả về.');}
  if(output.app!=='GymBro'||output.version!==1||output.request_id!==q.request_id||output.date!==q.date||output.kind!==q.kind||!Array.isArray(output.items)||output.items.length!==q.items.length)throw Error('Kết quả không khớp prompt/ngày. Dùng đúng JSON của prompt vừa tạo.');
  const seen=new Set();
  return output.items.map(item=>{
    const target=q.items.find(x=>x.id===item.id),current=currentRows.find(x=>x.id===item.id);
    if(!target||seen.has(item.id))throw Error('ID bị trùng hoặc không thuộc prompt.');seen.add(item.id);
    if(!current||current.deleted||fingerprint(current)!==target.snapshot)throw Error('Nhật ký đã thay đổi sau khi tạo prompt. Tạo prompt mới để tránh ghi đè.');
    const keys=q.kind==='meals'?['kcal','protein_g','carbs_g','fat_g']:['kcal_burned'];
    for(const k of keys)if(item[k]!==null&&(typeof item[k]!=='number'||!Number.isFinite(item[k])||item[k]<0||item[k]>(k==='kcal_burned'?15000:100000)))throw Error('Macro/kcal phải là số không âm hoặc null.');
    if(typeof item.notes!=='string'||item.notes.length>2000)throw Error('Thiếu ghi chú hoặc ghi chú quá dài.');
    const r={...current,updated_at:new Date().toISOString(),_originalUpdatedAt:current.updated_at};
    if(q.kind==='meals'){
      for(const [from,to] of [['kcal','kcal'],['protein_g','protein'],['carbs_g','carbs'],['fat_g','fat']]){const known=num(current[to]);if(current.nutrition_source!=='label'||known===null)r[to]=item[from]===null?(current[to]??''):round(item[from]);}
      r.nutrition_source=current.nutrition_source==='label'?'label':'estimate';r.nutrition_notes='ChatGPT: '+item.notes;
    }else{r.kcal_burned_est=item.kcal_burned===null?'':round(item.kcal_burned);r.kcal_estimation_notes='ChatGPT · gross kcal: '+item.notes;}
    validateRecord(q.kind==='meals'?'WebMeals':'WebWorkouts',r);return r;
  });
}
