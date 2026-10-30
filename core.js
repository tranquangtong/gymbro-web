export const TIMEZONE = 'Asia/Ho_Chi_Minh';
export const SCHEMAS = {
  WebMeals: ['id','date','meal','food','portion','kcal','protein','carbs','fat','nutrition_source','skipped','notes','created_at','updated_at','deleted'],
  WebWorkouts: ['id','date','exercise','kind','sets_json','duration_min','notes','created_at','updated_at','deleted'],
  WebProfile: ['id','date','weight_kg','kcal_target','protein_target','notes','created_at','updated_at','deleted']
};
export const MEALS = { breakfast:'Bữa sáng', lunch:'Bữa trưa', dinner:'Bữa tối', snack:'Bữa phụ' };
export const KINDS = { strength:'Tạ ngoài', assisted:'Có trợ lực', bodyweight:'Trọng lượng cơ thể', cardio:'Cardio', rest:'Ngày nghỉ' };
export const EXERCISES = ['Kneeling easy chin-up','Lat pulldown','Reverse grip lat pulldown','Seated cable row','Incline bench press','Chest press','Dumbbell shoulder press','Lateral raise','Biceps curl','Triceps pushdown','Leg press','Leg curl','Leg extension','Squat','Đi bộ','Đạp xe'];
export const uid = () => globalThis.crypto.randomUUID();
export const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function shiftDate(date, days) { const d=new Date(date+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
export function dateLabel(date, long=false) { return new Intl.DateTimeFormat('vi-VN',{day:'numeric',month:long?'long':'2-digit',...(long?{weekday:'long',year:'numeric'}:{}) ,timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')); }
export const num = v => v === '' || v == null || typeof v === 'boolean' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
export const active = rows => rows.filter(r=>r.deleted !== true && String(r.deleted).toLowerCase()!=='true');
export function setsOf(row) { try { const s=JSON.parse(row.sets_json||'[]'); return Array.isArray(s)?s.filter(x=>x&&typeof x==='object'):[]; } catch { return []; } }
export const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/[^a-z0-9]+/g,' ').trim();
export const sameExercise = (a,b) => norm(a)===norm(b);
export function nutrition(rows) {
  const entries=active(rows).filter(r=>String(r.skipped).toLowerCase()!=='true');
  const sum = field => entries.reduce((s,r)=>s+(num(r[field])??0),0);
  return {kcal:sum('kcal'),protein:sum('protein'),carbs:sum('carbs'),fat:sum('fat'),count:entries.length,knownKcal:entries.filter(r=>num(r.kcal)!==null).length,knownProtein:entries.filter(r=>num(r.protein)!==null).length};
}
export function workoutSummary(rows) {
  const entries=active(rows).filter(r=>r.kind!=='rest');
  return {sessions:new Set(entries.map(r=>r.date)).size,sets:entries.reduce((s,r)=>s+setsOf(r).length,0),minutes:entries.reduce((s,r)=>s+(num(r.duration_min)??0),0),externalVolume:entries.filter(r=>r.kind==='strength').reduce((s,r)=>s+setsOf(r).reduce((t,x)=>t+(num(x.weight_kg)??0)*(num(x.reps)??0),0),0)};
}
export function latestProfile(rows,date=today()) { return active(rows).filter(r=>r.date<=date).sort((a,b)=>b.date.localeCompare(a.date)||String(b.updated_at).localeCompare(String(a.updated_at)))[0]||{}; }
export function validateRecord(table,r) {
  if(!SCHEMAS[table]) throw Error('Loại dữ liệu không hợp lệ.');
  if(!r.id || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)|| !Number.isFinite(Date.parse(r.date+'T12:00:00Z'))||new Date(r.date+'T12:00:00Z').toISOString().slice(0,10)!==r.date) throw Error('Ngày ghi nhận không hợp lệ.');
  const nonneg = (v,label,max=100000) => { if(v!==''&&v!=null&&(num(v)===null||num(v)<0||num(v)>max)) throw Error(label+' không hợp lệ.'); };
  if(table==='WebMeals') {
    if(!MEALS[r.meal]) throw Error('Hãy chọn bữa ăn.');
    if(!r.skipped && !String(r.food||'').trim()) throw Error('Hãy nhập tên món ăn.');
    ['kcal','protein','carbs','fat'].forEach(k=>nonneg(r[k],k));
    if(!r.skipped && ['kcal','protein','carbs','fat'].some(k=>num(r[k])!==null)&&!['manual','label','estimate'].includes(r.nutrition_source)) throw Error('Hãy chọn nguồn thông tin dinh dưỡng.');
  }
  if(table==='WebWorkouts') {
    if(!KINDS[r.kind]) throw Error('Loại bài tập không hợp lệ.');
    if(r.kind!=='rest'&&!String(r.exercise||'').trim()) throw Error('Hãy nhập tên bài tập.');
    if(['strength','assisted','bodyweight'].includes(r.kind)) {
      const sets=setsOf(r); if(!sets.length||sets.length>50) throw Error('Cần từ 1 đến 50 set tập.');
      sets.forEach(s=>{ if(!Number.isInteger(num(s.reps))||num(s.reps)<1||num(s.reps)>1000) throw Error('Reps phải là số nguyên từ 1 đến 1000.'); if(r.kind!=='bodyweight'&&num(s.weight_kg)===null) throw Error('Hãy nhập kg cho từng set.'); nonneg(s.weight_kg,'Số kg',2000); });
    }
    if(r.kind==='cardio'&&(num(r.duration_min)===null||num(r.duration_min)<=0||num(r.duration_min)>1440)) throw Error('Thời lượng cardio phải lớn hơn 0 và tối đa 1440 phút.');
  }
  if(table==='WebProfile') { if(num(r.weight_kg)===null||num(r.weight_kg)<=0) throw Error('Cân nặng phải lớn hơn 0.'); nonneg(r.weight_kg,'Cân nặng',500); ['kcal_target','protein_target'].forEach(k=>nonneg(r[k],k)); }
  if(table==='WebMeals'&&r.photo_ids!==undefined&&(!Array.isArray(r.photo_ids)||r.photo_ids.length>3||r.photo_ids.some(id=>typeof id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(id))))throw Error('Tối đa 3 ảnh hợp lệ cho mỗi món.');
  if(table==='WebWorkouts'){nonneg(r.kcal_burned_est,'Kcal tiêu hao',15000);nonneg(r.duration_min,'Thời lượng',1440);}
  return r;
}
export function serialize(table, record) { return SCHEMAS[table].map(k=>record[k]??''); }
export function deserialize(table, values) { return Object.fromEntries(SCHEMAS[table].map((key,i)=>[key,values[i]??''])); }
export function emptyData() { return Object.fromEntries(Object.keys(SCHEMAS).map(k=>[k,[]])); }
export function demoData() {
  const data=emptyData(), end=today();
  for(let i=27;i>=0;i--) {
    const date=shiftDate(end,-i), base={date,created_at:date+'T05:00:00Z',updated_at:date+'T05:00:00Z',deleted:false};
    for(const [meal,food,kcal,protein] of [['breakfast','Bánh mì trứng & sữa đậu nành',420,23],['lunch','Bún gạo lứt, đậu hũ & rau',560,27],['dinner','Cơm, nấm & đậu hũ kho',520,29],['snack','Sữa chua & edamame',250,19]]) data.WebMeals.push({...base,id:uid(),meal,food,portion:'1 phần',kcal:kcal+(i%3)*20,protein,carbs:55,fat:12,nutrition_source:'estimate',skipped:false,notes:'Dữ liệu minh họa'});
    if(i%2===0) {
      data.WebWorkouts.push({...base,id:uid(),exercise:EXERCISES[0],kind:'assisted',sets_json:JSON.stringify(Array.from({length:3},()=>({weight_kg:i>14?32:i>6?29.5:27.2,reps:12}))),duration_min:'',notes:'Dữ liệu minh họa'});
      data.WebWorkouts.push({...base,id:uid(),exercise:'Seated cable row',kind:'strength',sets_json:JSON.stringify(Array.from({length:3},()=>({weight_kg:35+Math.floor((27-i)/8)*5,reps:12}))),notes:'Dữ liệu minh họa'});
    }
    if(i%7===0) data.WebProfile.push({...base,id:uid(),weight_kg:84.5-(27-i)*0.025,kcal_target:2100,protein_target:120,notes:'Dữ liệu minh họa'});
  }
  return data;
}

export class LocalRepository {
  constructor(storage,key='gymbro.v1.local') { this.storage=storage; this.key=key; }
  async load() { const raw=this.storage.getItem(this.key); if(!raw)return emptyData(); let d; try{ d=JSON.parse(raw); }catch{throw Error('Dữ liệu trên thiết bị bị lỗi. Hãy xuất bản sao trước khi xử lý.');} if(!d||Object.keys(SCHEMAS).some(t=>!Array.isArray(d[t])))throw Error('Cấu trúc dữ liệu lưu trên thiết bị không hợp lệ.'); return d; }
  async save(table,record){return this.saveMany(table,[record]);}
  async saveMany(table,records){const d=await this.load();for(const r of records){validateRecord(table,r);const i=d[table].findIndex(x=>x.id===r.id),expected=r._originalUpdatedAt??r._revision;if(i>=0&&expected&&d[table][i].updated_at!==expected)throw Error('Mục này đã thay đổi. Làm mới trước khi sửa.');const clean={...r};delete clean._revision;delete clean._originalUpdatedAt;if(i<0)d[table].push(clean);else d[table][i]=clean;}try{this.storage.setItem(this.key,JSON.stringify(d));}catch{throw Error('Không lưu được trên thiết bị. Có thể bộ nhớ đã đầy hoặc bị chặn.');}}
}
