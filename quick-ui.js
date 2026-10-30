import {estimateWorkoutBatch,workoutWeight} from './workout-kcal.js';
import {today,dateLabel,uid,active,latestProfile,num,MEALS,KINDS,setsOf} from './core.js';
import {DEFAULT_FOODS,parseMeals,parseWorkouts,compactWorkout,ensureWorkoutDay,validateFood,makeRequest,requestPrompt,parseEstimate} from './quick.js';
import {compressPhoto,copyText,photoFile,downloadFile} from './media.js';

export function createQuickUI(env){
  const {getState,esc,fmt,icon,toast,writable,reload,render,saveMessage}=env,$=s=>document.querySelector(s);
  let ctx=null,estimate=null,library=[],drafts=new Map(),busy=false;
  const dialog=document.createElement('dialog');dialog.id='quick-dialog';dialog.setAttribute('aria-labelledby','quick-title');document.body.append(dialog);
  const scope=()=>{const s=getState();return s.mode+':'+(s.repo?.ownerUid||s.repo?.key||'none');};
  const error=e=>{const target=$('#quick-error');if(target)target.textContent=e.message||String(e);else toast(e.message,true);};
  const btn=(text,action,cls='',extra='')=>`<button type="button" class="button ${cls}" data-quick="${action}" ${extra}>${text}</button>`;
  const field=(label,id,value='',type='text',extra='')=>`<label class="field">${label}<input id="${id}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const select=(label,id,values,value)=>`<label class="field">${label}<select id="${id}">${Object.entries(values).map(([k,v])=>`<option value="${esc(k)}" ${k===value?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;
  const frame=(title,body,subtitle='')=>{dialog.innerHTML=`<div class="dialog-inner"><div class="dialog-header"><div><h2 id="quick-title">${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div><button class="close-button" data-quick="close" aria-label="Đóng">${icon('close')}</button></div>${body}<div id="quick-error" class="form-error" role="alert"></div></div>`;if(!dialog.open)dialog.showModal();};
  const table=type=>type==='meals'?'WebMeals':'WebWorkouts';
  async function foods(seed=false){const repo=getState().repo;if(!repo)return DEFAULT_FOODS;library=seed?await repo.seedFoods():await repo.loadFoods();if(!library.length&&(getState().mode!=='firebase'||repo.ownerUid===repo.uid))library=await repo.seedFoods();return library.length?library:DEFAULT_FOODS;}
  function scopeGuard(expected){if(scope()!==expected)throw Error('Tài khoản hoặc chế độ đã thay đổi. Đóng và mở lại thao tác.');}
  const draftKey=type=>'gymbro.quick.'+scope()+'.'+type;
  function rememberCompose(){if(!ctx||ctx.view!=='compose')return;ctx.text=$('#quick-text')?.value??ctx.text;ctx.date=$('#quick-date')?.value||ctx.date;ctx.meal=$('#quick-meal')?.value||ctx.meal;for(const key of ['food','amount','exercise','count','reps','kg','kind','duration'])ctx[key]=$('#compact-'+key)?.value??ctx[key];ctx.photoTarget=Number($('#photo-target')?.value??ctx.photoTarget??0);drafts.set(ctx.scope+ctx.type,ctx);try{sessionStorage.setItem(draftKey(ctx.type),JSON.stringify({text:ctx.text,date:ctx.date,meal:ctx.meal,method:ctx.method,food:ctx.food,amount:ctx.amount,exercise:ctx.exercise,count:ctx.count,reps:ctx.reps,kg:ctx.kg,kind:ctx.kind,duration:ctx.duration}));}catch{}}
  function close(){if(busy)return;rememberCompose();dialog.close();}
  async function open(type,opts={}){
    if(!writable())return;const currentScope=scope();let draft={};try{draft=JSON.parse(sessionStorage.getItem(draftKey(type))||'{}');}catch{}
    ctx=drafts.get(currentScope+type)||{view:'compose',type,scope:currentScope,method:'text',text:'',date:getState().date,meal:'lunch',photos:[],preview:null,amount:1,count:3,reps:12,kg:'',kind:'strength',duration:'',...draft};
    ctx={...ctx,...opts,view:'compose'};
    if(opts.text!==undefined)ctx.preview=null;
    drawCompose();
    if(type==='meals')try{await foods();if(ctx?.view==='compose'&&ctx.scope===currentScope){rememberCompose();drawCompose();}}catch(e){error(Error('Chưa tải được thư viện Firebase. Publish Rules mới rồi thử lại. '+e.message));}
  }
  function drawCompose(){
    const meal=ctx.type==='meals',known=library.length?library:DEFAULT_FOODS;
    const text=meal?'Bún gạo lứt, trứng xào và rau.\nÍt bún, 2 trứng, nhiều rau.':'Chin-up trợ lực 27.2kg 3x12\nLat pulldown 40kg 3x12\nĐi bộ 30 phút';
    const form=meal?`<label class="field">Món ăn<input id="compact-food" list="food-options" value="${esc(ctx.food||'')}" placeholder="Chọn món quen hoặc nhập tên món"><datalist id="food-options">${known.map(f=>`<option value="${esc(f.name)}"></option>`).join('')}</datalist></label>${field('Số khẩu phần','compact-amount',ctx.amount||1,'number','min="0.1" max="1000" step="0.1"')}`:`${field('Bài tập','compact-exercise',ctx.exercise||'','text','placeholder="Ví dụ: Lat pulldown"')}${select('Loại bài','compact-kind',KINDS,ctx.kind||'strength')}<div class="field-row">${ctx.kind==='cardio'?field('Phút','compact-duration',ctx.duration,'number','min="0.1" max="1440"'):ctx.kind==='rest'?'':`${field('Set','compact-count',ctx.count||3,'number','min="1" max="50" step="1"')}${field('Reps','compact-reps',ctx.reps||12,'number','min="1" max="1000" step="1"')}${ctx.kind==='bodyweight'?'':field(ctx.kind==='assisted'?'Kg trợ lực':'Kg','compact-kg',ctx.kg,'number','min="0" max="2000" step="0.1"')}`}</div>`;
    frame(meal?'Ghi ăn uống':'Ghi tập luyện',`<div class="segmented input-tabs">${btn('Viết nhanh','method-text',ctx.method==='text'?'selected':'')}${btn('Điền gọn','method-form',ctx.method==='form'?'selected':'')}</div><div class="compose-meta">${field('Ngày','quick-date',ctx.date,'date')}${meal?select('Bữa','quick-meal',MEALS,ctx.meal):''}</div>${ctx.method==='text'?`<label class="field"><span class="sr-only">${meal?'Bạn đã ăn gì?':'Bạn đã tập gì?'}</span><textarea id="quick-text" rows="5" placeholder="${esc(text)}">${esc(ctx.text)}</textarea></label><p class="form-note">${meal?'Mỗi lần nhập lưu đúng 1 món. Dấu phẩy, dấu chấm và xuống dòng đều được giữ trong mô tả.':'Mỗi bài một dòng. Dùng kg và 3x12 (3 set × 12 reps); cardio nhập số phút.'}</p>`:form}${meal?`<div class="quick-foods">${known.slice(0,6).map(f=>btn('+ '+esc(f.name),'insert-food','chip-button',`data-id="${esc(f.id)}"`)).join('')}${btn('Thư viện món','library','text-button')}</div><div class="photo-tools"><label class="button upload-label">${icon('plus')}Thêm ảnh<input class="sr-only" type="file" id="meal-photo" accept="image/*" multiple></label><label class="button upload-label">${icon('camera')}Chụp ảnh<input class="sr-only" type="file" id="meal-camera" accept="image/*" capture="environment"></label><span class="subtle">Tối đa 3 ảnh</span></div><div class="photo-strip">${ctx.photos.map((p,i)=>`<figure><img src="${p.data_url}" alt="Ảnh bữa ăn ${i+1}"><button data-quick="remove-photo" data-index="${i}" aria-label="Bỏ ảnh ${i+1}">×</button></figure>`).join('')}</div>`:''}<div id="quick-preview">${ctx.preview?preview(ctx.preview,ctx.type):''}</div><div class="form-actions">${btn('Xem trước','parse')}${ctx.preview?btn('Lưu '+ctx.preview.length+' mục','save','primary'):''}${btn('Nhập chi tiết','detailed','text-button')}</div>`);
  }
  function preview(rows,type){return `<div class="parse-preview"><p class="section-label">XEM TRƯỚC · CHƯA LƯU</p>${rows.map(r=>`<div class="preview-row"><div><strong>${esc(r.food||r.exercise||(r.skipped?'Bỏ bữa':''))}</strong><small>${type==='meals'?esc(r.portion||MEALS[r.meal]):esc(r.kind==='cardio'?r.duration_min+' phút':r.kind==='rest'?'Ngày nghỉ':setsOf(r).length+' set × '+setsOf(r)[0]?.reps+' reps'+(r.kind==='bodyweight'?'':' · '+setsOf(r)[0]?.weight_kg+' kg'+(r.kind==='assisted'?' trợ lực':'')))}</small></div><div>${type==='meals'?`<strong>${num(r.kcal)!==null?fmt(r.kcal)+' kcal':'Chưa có kcal'}</strong><small>P ${fmt(r.protein,1)} · C ${fmt(r.carbs,1)} · F ${fmt(r.fat,1)} g</small>`:num(r.kcal_burned_est)!==null?fmt(r.kcal_burned_est)+' kcal':''}</div></div>${(r.nutrition_notes||r.kcal_estimation_notes)?type==='workouts'?`<details class="estimate-note"><summary>Cách tính &amp; giả định</summary><p class="form-note">${esc(r.kcal_estimation_notes)}</p></details>`:`<p class="form-note estimate-note">${esc(r.nutrition_notes)}</p>`:''}`).join('')}${type==='meals'?'<p class="form-note">— là chưa biết, không phải 0. Số liệu thư viện là cho khẩu phần đã chọn.</p>':''}</div>`;}
  function parseCompose(){
    rememberCompose();scopeGuard(ctx.scope);let text=ctx.text;
    if(ctx.method==='form')text=ctx.type==='meals'?`${ctx.amount||1} ${ctx.food||''}`:ctx.kind==='rest'?'nghỉ':ctx.kind==='cardio'?`${ctx.exercise||'Cardio'} ${ctx.duration} phút`:`${ctx.exercise||''} ${ctx.kind==='assisted'?'trợ lực ':''}${ctx.kind==='bodyweight'?'bw':ctx.kg+'kg'} ${ctx.count}x${ctx.reps}`;
    if(ctx.method==='form'&&ctx.type==='workouts'){ctx.preview=estimateWorkoutBatch([compactWorkout(ctx,{date:ctx.date})],{weight:workoutWeight(getState().data.WebProfile,ctx.date)});return drawCompose();}
    ctx.preview=ctx.type==='meals'?parseMeals(text,{date:ctx.date,meal:ctx.meal,foods:library.length?library:DEFAULT_FOODS}):estimateWorkoutBatch(parseWorkouts(text,{date:ctx.date}),{weight:workoutWeight(getState().data.WebProfile,ctx.date)});drawCompose();
  }
  async function saveCompose(){
    if(!ctx.preview)return;rememberCompose();scopeGuard(ctx.scope);if(!writable())return;
    // Input changes remove preview, so these stable IDs also make retries safe.
    const rows=ctx.preview,repo=getState().repo,savedScope=ctx.scope;busy=true;lock(true);const saveButton=dialog.querySelector('[data-quick="save"]');if(saveButton)saveButton.textContent=getState().mode==='firebase'?'Đang lưu Firebase…':'Đang lưu trên thiết bị…';
    try{
      if(ctx.type==='workouts'){const fresh=await repo.load();ensureWorkoutDay(active(fresh.WebWorkouts),rows);const calculated=estimateWorkoutBatch(rows,{weight:workoutWeight(fresh.WebProfile,ctx.date)});rows.splice(0,rows.length,...calculated);}
      if(ctx.type==='meals'&&ctx.photos.length){const target=rows[ctx.photoTarget||0];if(!target||target.skipped)throw Error('Chọn món có tên để gắn ảnh.');for(const p of ctx.photos){if(p.meal_id!=='pending'&&p.meal_id!==target.id)p.id=uid();p.meal_id=target.id;await repo.savePhoto(p);}target.photo_ids=ctx.photos.map(p=>p.id);}
      scopeGuard(savedScope);await repo.saveMany(table(ctx.type),rows);drafts.delete(ctx.scope+ctx.type);try{sessionStorage.removeItem(draftKey(ctx.type));}catch{}
      const type=ctx.type,message=saveMessage(rows.length);ctx=null;dialog.close();toast(message);try{await reload();render();}catch(e){toast(message+' · Chưa tải lại được: '+e.message,true);}if(!['eat','gym'].includes(location.hash.slice(1)))location.hash=type==='meals'?'eat':'gym';
    }finally{busy=false;lock(false);if(ctx?.preview){const b=dialog.querySelector('[data-quick="save"]');if(b)b.textContent='Lưu '+ctx.preview.length+' mục';}}
  }
  function lock(locked){dialog.querySelectorAll('button,input,select,textarea').forEach(x=>x.disabled=locked);}
  const requestKey=kind=>'gymbro.estimate.'+scope()+'.'+kind;
  function storeRequest(q){try{sessionStorage.setItem(requestKey(q.kind),JSON.stringify(q));}catch{throw Error('Không giữ được prompt trong phiên này. Giải phóng bộ nhớ trình duyệt rồi thử lại.');}}
  async function openEstimate(type,onlyId=null){
    if(!writable())return;rememberCompose();const s=getState(),rows=active(s.data[table(type)]).filter(r=>r.date===s.date&&(type==='meals'?!r.skipped:r.kind!=='rest')&&(!onlyId||r.id===onlyId));
    if(!rows.length)throw Error('Lưu nhật ký trước khi xuất prompt.');
    let old=null;try{old=JSON.parse(sessionStorage.getItem(requestKey(type))||'null');}catch{}
    estimate={type,scope:scope(),date:s.date,rows,photos:[],q:old?.date===s.date&&old?.scope===scope()&&old.items?.length===rows.length&&old.items.every(x=>rows.some(r=>r.id===x.id))?old:null,text:'',result:null,sessionMinutes:old?.sessionMinutes??'',photoError:''};
    ctx={view:'estimate'};drawEstimate();
    if(estimate.q&&type==='meals'){const e=estimate,repo=s.repo;const results=await Promise.allSettled(e.q.items.flatMap(x=>x.record.photo_ids||[]).map(id=>repo.getPhoto(id)));if(estimate!==e||ctx.view!=='estimate'||!dialog.open)return;for(const r of results)if(r.status==='fulfilled')e.photos.push(r.value);else e.photoError='Có ảnh chưa tải được; tạo lại prompt để thử lại.';drawEstimate();}
  }
  function drawEstimate(){
    if(estimate.type==='workouts'){
      const prompt=estimate.q?`<div class="page-tools">${btn('Tạo lại prompt','generate-prompt')}${btn('Copy prompt','copy-prompt')}</div><details class="prompt-details"><summary>Xem prompt</summary><textarea id="prompt-text" readonly rows="8">${esc(requestPrompt(estimate.q))}</textarea></details>`:btn('Tạo prompt','generate-prompt');
      frame('Tính kcal tập luyện',`<p class="form-note">${dateLabel(estimate.date,true)} · ${estimate.rows.length} mục. Dùng cách tính GAS legacy ngay trong app, không cần ChatGPT.</p><p class="form-note">Thiếu thời gian bài tạ: dùng giả định tập + nghỉ theo từng set. Thời gian giả định chỉ phục vụ tính kcal, không ghi thành phút tập thực tế. Mức trợ lực không được xem là tạ nâng.</p>${field('Tổng phút buổi tập (không bắt buộc, gồm cả nghỉ)','session-minutes',estimate.sessionMinutes,'number','min="1" max="1440"')}${btn('Tính kcal ngay','calculate-workout','primary')}${estimate.result?preview(estimate.result,'workouts')+btn('Áp dụng kết quả','apply-estimate','primary'):''}<details class="exchange-steps"><summary>Tinh chỉnh với ChatGPT (tùy chọn)</summary><p class="form-note">Prompt có sẵn baseline và giả định. Không cần nhập phút để estimate bài tạ.</p>${prompt}<label class="field">Dán JSON ChatGPT trả về<textarea id="estimate-output" rows="6">${esc(estimate.text)}</textarea></label>${btn('Đọc kết quả','parse-estimate')}</details>`);
      return;
    }
    frame(estimate.type==='meals'?'Ước tính bữa ăn':'Ước tính kcal tập luyện',`<p class="form-note">${dateLabel(estimate.date,true)} · ${estimate.rows.length} mục · Không gọi API, không tốn token trong app.</p>${estimate.type==='workouts'?`<p class="form-note">Tính trực tiếp như GAS: dùng cân nặng, bài tập, sets/reps và preset tập + nghỉ nếu thiếu thời gian. Có thể nhập tổng phút để phân bổ lại. Xem giả định rồi bấm Áp dụng để lưu Firebase.</p>${btn('Tính kcal ngay','calculate-workout','primary')}`:''}<div class="exchange-steps"><strong>${estimate.type==='workouts'?'Tinh chỉnh với ChatGPT (tùy chọn)':'1. Gửi sang ChatGPT'}</strong>${estimate.type==='workouts'?field('Tổng phút buổi tập (kể cả nghỉ, nếu biết)','session-minutes',estimate.sessionMinutes,'number','min="1" max="1440"'):''}<div class="page-tools">${btn(estimate.q?'Tạo lại prompt':'Tạo prompt','generate-prompt','primary')}${estimate.q?btn('Copy prompt','copy-prompt'):''}</div>${estimate.q?`<details class="prompt-details"><summary>Xem prompt · ${estimate.q.items.length} mục</summary><textarea id="prompt-text" readonly rows="8">${esc(requestPrompt(estimate.q))}</textarea></details><div class="photo-strip">${estimate.photos.map(p=>`<figure><img src="${p.data_url}" alt="Ảnh cho món ${esc(p.meal_id)}"><figcaption>${esc(estimate.rows.find(r=>r.id===p.meal_id)?.food||'')}</figcaption></figure>`).join('')}</div>${estimate.type==='meals'?`<div class="page-tools">${btn('Chia sẻ prompt + ảnh','share-estimate')}${estimate.photos.map((p,i)=>btn('Tải ảnh '+(i+1),'download-photo','',`data-index="${i}"`)).join('')}</div><p class="form-note">Copy chỉ sao chép chữ. Dùng Chia sẻ trên điện thoại để gửi kèm ảnh nếu được hỗ trợ; hoặc tải ảnh rồi đính kèm trong ChatGPT. ${esc(estimate.photoError)}</p>`:''}`:''}</div><div class="exchange-steps"><strong>2. Dán JSON ChatGPT trả về</strong><label class="field"><span class="sr-only">JSON kết quả</span><textarea id="estimate-output" rows="6" placeholder='{"app":"GymBro", ...}'>${esc(estimate.text)}</textarea></label>${btn('Đọc kết quả','parse-estimate')}${estimate.result?preview(estimate.result,estimate.type)+btn('Áp dụng kết quả','apply-estimate','primary'):''}</div>`);
  }
  async function generatePrompt(){
    const e=estimate;scopeGuard(e.scope);e.sessionMinutes=$('#session-minutes')?.value||'';const minutes=e.sessionMinutes===''?null:Number(e.sessionMinutes);if(minutes!==null&&(!Number.isFinite(minutes)||minutes<=0||minutes>1440))throw Error('Thời lượng từ 1 đến 1440 phút.');
    const fresh=await getState().repo.load();scopeGuard(e.scope);const rows=e.rows.map(r=>fresh[table(e.type)].find(x=>x.id===r.id)).filter(r=>r&&!r.deleted);
    if(rows.length!==e.rows.length)throw Error('Nhật ký đã thay đổi. Đóng và mở lại ước tính.');
    e.rows=rows;e.q=makeRequest(e.type,e.date,rows,{scope:e.scope,weight:workoutWeight(fresh.WebProfile,e.date),sessionMinutes:minutes});e.photos=[];e.result=null;e.text='';e.photoError='';
    if(e.type==='meals'){const ids=rows.flatMap(r=>r.photo_ids||[]);const results=await Promise.allSettled(ids.map(id=>getState().repo.getPhoto(id)));for(const r of results)if(r.status==='fulfilled')e.photos.push(r.value);else e.photoError='Có ảnh chưa tải được; tạo lại prompt để thử tải lại.';}
    scopeGuard(e.scope);storeRequest(e.q);drawEstimate();
  }
  async function calculateWorkout(){
    const e=estimate;scopeGuard(e.scope);e.sessionMinutes=$('#session-minutes')?.value||'';
    const fresh=await getState().repo.load();scopeGuard(e.scope);const rows=e.rows.map(r=>fresh.WebWorkouts.find(x=>x.id===r.id&&!x.deleted));if(rows.some(r=>!r))throw Error('Nhật ký đã thay đổi. Đóng và mở lại.');
    e.q=makeRequest('workouts',e.date,rows,{scope:e.scope,weight:workoutWeight(fresh.WebProfile,e.date),sessionMinutes:e.sessionMinutes,method:'local'});
    const calculated=estimateWorkoutBatch(rows,{weight:e.q.weight,sessionMinutes:e.q.sessionMinutes,overwrite:true});
    e.text=JSON.stringify({app:'GymBro',version:1,request_id:e.q.request_id,date:e.date,kind:'workouts',items:calculated.map(r=>({id:r.id,kcal_burned:num(r.kcal_burned_est),notes:r.kcal_estimation_notes}))});
    e.result=parseEstimate(e.text,e.q,rows,e.scope);storeRequest(e.q);drawEstimate();
  }
  async function parseOutput(){
    const e=estimate;e.text=$('#estimate-output').value;scopeGuard(e.scope);const data=await getState().repo.load();scopeGuard(e.scope);e.result=parseEstimate(e.text,e.q,data[table(e.type)],e.scope);drawEstimate();
  }
  async function applyOutput(){
    const e=estimate;scopeGuard(e.scope);if(!writable()||!e.result)return;const repo=getState().repo;busy=true;lock(true);
    try{const data=await repo.load();const records=parseEstimate(e.text,e.q,data[table(e.type)],scope());await repo.saveMany(table(e.type),records);sessionStorage.removeItem(requestKey(e.type));e.q=null;e.result=null;dialog.close();await reload();render();toast('Đã cập nhật '+records.length+' mục.');}finally{busy=false;lock(false);}
  }
  async function showLibrary(){
    if(!writable())return;rememberCompose();await foods();ctx={view:'library',scope:scope()};
    frame('Món quen',`<p class="form-note">Số liệu cho một khẩu phần. Bạn có thể sửa theo nhãn đúng sản phẩm; những log cũ giữ nguyên.</p>${btn('Thêm món','new-food','primary')}${(library.length?library:DEFAULT_FOODS).map(f=>`<div class="library-row"><div><strong>${esc(f.name)}</strong><small>${esc(f.serving_label)}${f.serving_g?' · '+f.serving_g+' g':''} · ${f.source==='label'?'Theo nhãn / thông tin đã cung cấp':'Tham khảo'}</small><small>${fmt(f.kcal)} kcal · P ${fmt(f.protein,1)} · C ${fmt(f.carbs,1)} · F ${fmt(f.fat,1)}</small></div>${btn('Sửa','edit-food','',`data-id="${esc(f.id)}"`)}</div>`).join('')}<div class="page-tools">${btn('Lưu các món mẫu vào tài khoản','seed-foods')}${btn('Quay lại ghi ăn','back-meals')}</div>`);
  }
  function editFood(id){
    const f=library.find(x=>x.id===id)||(id?(DEFAULT_FOODS.find(x=>x.id===id)):null)||{id:uid(),name:'',aliases:[],serving_label:'khẩu phần',serving_g:null,kcal:null,protein:null,carbs:null,fat:null,source:'label',source_note:'',source_url:''};ctx={view:'food',food:f,scope:scope()};
    frame('Thông tin món',`${field('Tên món','food-name',f.name)}${field('Một khẩu phần là','food-serving',f.serving_label,'text','placeholder="Ví dụ: 1 scoop, 1 hộp"')}<div class="field-row">${field('Gram / khẩu phần (nếu biết)','food-grams',f.serving_g??'','number','min="0.1" step="0.1"')}${select('Nguồn','food-source',{label:'Nhãn sản phẩm',estimate:'Tham khảo / ước tính',manual:'Tự nhập'},f.source)}</div><div class="field-row">${[['kcal','Kcal'],['protein','Protein (g)'],['carbs','Carbs (g)'],['fat','Fat (g)']].map(([k,v])=>field(v,'food-'+k,f[k]??'','number','min="0" step="0.1"')).join('')}</div>${field('Tên gọi khác, cách nhau bằng dấu phẩy','food-aliases',f.aliases.join(', '))}<label class="field">Ghi chú nguồn<textarea id="food-note" rows="2">${esc(f.source_note)}</textarea></label><p class="form-note">Để trống số chưa biết. Không dùng 0 để thay số chưa xác nhận.</p><div class="form-actions">${btn('Quay lại','library')}${btn('Lưu món','save-food','primary')}</div>`);
  }
  async function saveFood(){scopeGuard(ctx.scope);const f={...ctx.food,name:$('#food-name').value.trim(),serving_label:$('#food-serving').value.trim(),aliases:$('#food-aliases').value.split(',').map(x=>x.trim()).filter(Boolean),source:$('#food-source').value,source_note:$('#food-note').value.trim(),updated_at:new Date().toISOString()};for(const k of ['kcal','protein','carbs','fat'])f[k]=$('#food-'+k).value===''?null:Number($('#food-'+k).value);f.serving_g=$('#food-grams').value===''?null:Number($('#food-grams').value);validateFood(f);await getState().repo.saveFood(f);toast('Đã lưu món vào thư viện.');await showLibrary();}
  async function showPhotos(id){
    if(!writable())return;const s=getState(),r=s.data.WebMeals.find(r=>r.id===id&&!r.deleted);if(!r)throw Error('Không tìm thấy món ăn.');ctx={view:'photos',scope:scope(),record:r,photos:[]};frame('Ảnh · '+esc(r.food),'<p>Đang tải ảnh…</p>');ctx.photos=await Promise.all((r.photo_ids||[]).map(id=>s.repo.getPhoto(id)));drawPhotos();
  }
  function drawPhotos(){frame('Ảnh · '+esc(ctx.record.food),`<div class="photo-strip large">${ctx.photos.map((p,i)=>`<figure><img src="${p.data_url}" alt="Ảnh ${i+1} của ${esc(ctx.record.food)}">${btn('Tải ảnh','download-entry-photo','',`data-index="${i}"`)}${btn('Bỏ ảnh','unlink-photo','',`data-index="${i}"`)}</figure>`).join('')}</div><div class="photo-tools"><label class="button upload-label">${icon('plus')}Thêm ảnh<input class="sr-only" type="file" id="existing-photo" accept="image/*" multiple></label><label class="button upload-label">${icon('camera')}Chụp ảnh<input class="sr-only" type="file" id="existing-camera" accept="image/*" capture="environment"></label></div><p class="form-note">Ảnh chỉ hiển thị cho bạn và admin. Tối đa 3 ảnh nén/món.</p>`);}
  async function addPhotos(files){
    const isExisting=ctx.view==='photos',target=ctx,expected=ctx.scope;rememberCompose();if(!files?.length)return;
    const existing=ctx.photos||[];if(existing.length+files.length>3)throw Error('Tối đa 3 ảnh cho mỗi món.');busy=true;lock(true);
    try{const photos=await Promise.all([...files].map(file=>compressPhoto(file,isExisting?target.record.id:'pending')));scopeGuard(expected);if(ctx!==target)throw Error('Màn hình đã thay đổi. Thêm ảnh lại.');
      if(isExisting){for(const p of photos)await getState().repo.savePhoto(p);const r={...target.record,photo_ids:[...(target.record.photo_ids||[]),...photos.map(p=>p.id)],updated_at:new Date().toISOString(),_originalUpdatedAt:target.record.updated_at};await getState().repo.saveMany('WebMeals',[r]);await reload();render();ctx.record=getState().data.WebMeals.find(x=>x.id===r.id);ctx.photos.push(...photos);drawPhotos();toast('Đã lưu ảnh.');}
      else{ctx.photos.push(...photos);drawCompose();}
    }finally{busy=false;lock(false);}
  }
  async function action(el){
    const a=el.dataset.quick;if(ctx?.view==='estimate'&&$('#estimate-output'))estimate.text=$('#estimate-output').value;if(busy&&a!=='close')return;
    if(a==='close')return close();
    if(a==='method-text'||a==='method-form'){rememberCompose();ctx.method=a==='method-text'?'text':'form';ctx.preview=null;return drawCompose();}
    if(a==='parse')return parseCompose();if(a==='save')return saveCompose();
    if(a==='detailed'){const type=ctx.type;rememberCompose();dialog.close();return env.openDetailed(table(type),null,{date:ctx.date,meal:ctx.meal});}
    if(a==='insert-food'){rememberCompose();const f=(library.length?library:DEFAULT_FOODS).find(f=>f.id===el.dataset.id);if(ctx.method==='text')ctx.text+=(ctx.text.trim()?'\n':'')+'1 '+f.name;else{ctx.food=f.name;ctx.amount=1;}ctx.preview=null;return drawCompose();}
    if(a==='remove-photo'){rememberCompose();ctx.photos.splice(Number(el.dataset.index),1);return drawCompose();}
    if(a==='calculate-workout')return calculateWorkout();if(a==='generate-prompt')return generatePrompt();
    if(a==='copy-prompt'){if(!estimate.q)throw Error('Tạo prompt trước.');await copyText(requestPrompt(estimate.q));return toast('Đã copy prompt. Ảnh cần đính kèm riêng hoặc dùng Chia sẻ.');}
    if(a==='parse-estimate')return parseOutput();if(a==='apply-estimate')return applyOutput();
    if(a==='download-photo')return downloadFile(photoFile(estimate.photos[Number(el.dataset.index)]));
    if(a==='share-estimate'){
      if(!estimate.q)throw Error('Tạo prompt trước.');const text=requestPrompt(estimate.q),files=estimate.photos.map(photoFile);
      if(navigator.share&&(!files.length||navigator.canShare?.({files}))){try{await navigator.share({title:'GymBro · '+estimate.date,text,...(files.length?{files}:{})});}catch(e){if(e.name!=='AbortError')throw Error('Không chia sẻ được. Dùng Copy prompt và tải ảnh để đính kèm.');}}
      else{await copyText(text);toast('Đã copy prompt. Trình duyệt chưa chia sẻ được ảnh; bấm Tải ảnh để đính kèm.');}return;
    }
    if(a==='library')return showLibrary();if(a==='new-food')return editFood();if(a==='edit-food')return editFood(el.dataset.id);if(a==='save-food')return saveFood();if(a==='back-meals')return open('meals');
    if(a==='seed-foods'){scopeGuard(ctx.scope);await foods(true);toast('Đã lưu món mẫu; giữ nguyên món bạn đã sửa.');return showLibrary();}
    if(a==='download-entry-photo')return downloadFile(photoFile(ctx.photos[Number(el.dataset.index)]));
    if(a==='unlink-photo'){scopeGuard(ctx.scope);const id=ctx.photos[Number(el.dataset.index)].id,r={...ctx.record,photo_ids:ctx.record.photo_ids.filter(x=>x!==id),updated_at:new Date().toISOString(),_originalUpdatedAt:ctx.record.updated_at};await getState().repo.saveMany('WebMeals',[r]);await reload();render();ctx.record=getState().data.WebMeals.find(x=>x.id===r.id);ctx.photos=ctx.photos.filter(p=>p.id!==id);return drawPhotos();}
    if(a==='estimate-meals'||a==='estimate-workouts')return openEstimate(a==='estimate-meals'?'meals':'workouts',el.dataset.id||null);
    if(a==='entry-photos')return showPhotos(el.dataset.id);
  }
  document.addEventListener('click',e=>{const el=e.target.closest('[data-quick]');if(el){e.preventDefault();if(busy)return;Promise.resolve(action(el)).catch(error);}});
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('input',e=>{
    if(ctx?.view==='compose'){rememberCompose();if(!['photo-target'].includes(e.target.id)){ctx.preview=null;const preview=$('#quick-preview');if(preview)preview.innerHTML='';dialog.querySelector('[data-quick="save"]')?.remove();}}
    if(e.target.id==='estimate-output'){estimate.text=e.target.value;estimate.result=null;dialog.querySelector('[data-quick="apply-estimate"]')?.remove();}
    if(e.target.id==='session-minutes'&&estimate?.q){estimate.sessionMinutes=e.target.value;estimate.q=null;estimate.result=null;drawEstimate();$('#session-minutes')?.focus();}
  });
  dialog.addEventListener('change',e=>{if(['meal-photo','meal-camera','existing-photo','existing-camera'].includes(e.target.id))addPhotos(e.target.files).catch(error);if(e.target.id==='compact-kind'){rememberCompose();drawCompose();}});
  return {open,openEstimate,showLibrary,showPhotos};
}
