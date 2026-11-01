// Cloudflare Workers + D1 repository with the same surface as FirebaseRepository.
// Differences by design:
// - load() fetches a recent window of meals/workouts (plus all profile and archive rows),
//   never the whole history; ensureRange() pages older dates in on demand.
// - subscribe() polls /v1/changes instead of realtime listeners.
// - Meal photos are stored by the API for 7 days so every device sees them; a copy is cached
//   on this device (IndexedDB) for fast, repeat viewing.
import {SCHEMAS,emptyData,today,shiftDate,LocalRepository} from './core.js';
import {cleanRecord} from './migration.js';
import {DEFAULT_FOODS,cleanFood} from './quick.js';
import {assertSession} from './access.js';
import {isAdmin} from './firebase.js';
import {listLocalPhotos} from './local-extras.js';
import {validatePhoto} from './media.js';
import {photoExpired} from './photo-retention.js';

export const WINDOW_DAYS=120;
export const POLL_MS=45000;
const DATED=['WebMeals','WebWorkouts'],ALL=['WebProfile','Archive'],TABLES=[...Object.keys(SCHEMAS),'Archive'];
const clone=v=>structuredClone(v);
const strip=r=>{const c={...r};delete c._revision;delete c._originalUpdatedAt;return c;};

export class CloudflareRepository{
  constructor(s,targetUid=null,{apiBase,windowDays=WINDOW_DAYS,fetchImpl=(...a)=>fetch(...a)}={}){
    if(!apiBase)throw Error('Chưa cấu hình địa chỉ API Cloudflare.');
    this.s=s;this.uid=s.auth.currentUser?.uid;if(!this.uid)throw Error('Hãy đăng nhập Google.');
    this.ownerUid=targetUid||this.uid;this.apiBase=apiBase.replace(/\/+$/,'');this.fetchImpl=fetchImpl;this.windowDays=windowDays;
    this.backendName='Cloudflare';this._cache=null;this._loadTask=null;this.loadedFrom=null;this.seq=0;
    this.photos=new LocalRepository(globalThis.localStorage,'gymbro.cf.'+this.ownerUid);
    this.check();
    this.title=this.ownerUid===this.uid?'Cloudflare · '+s.auth.currentUser.email:'Quản trị · dữ liệu UID '+this.ownerUid;
  }
  check(){assertSession(this.s.sessionExpiresAt);if(this.s.auth.currentUser?.uid!==this.uid)throw Error('Tài khoản đã thay đổi. Đăng nhập lại trước khi ghi dữ liệu.');if(this.ownerUid!==this.uid&&!isAdmin(this.s.auth.currentUser))throw Error('Chỉ admin được mở dữ liệu người khác.');}
  async api(path,{method='GET',params={},body}={}){
    this.check();
    const url=new URL(this.apiBase+path);for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,v);
    if(this.ownerUid!==this.uid&&method==='GET')url.searchParams.set('owner',this.ownerUid);
    const token=await this.s.auth.currentUser.getIdToken();let res;
    try{res=await this.fetchImpl(url.toString(),{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(this.ownerUid!==this.uid?{...body,owner:this.ownerUid}:body):undefined});}
    catch{const e=Error('Không kết nối được máy chủ GymBro (Cloudflare). Kiểm tra mạng; nội dung đang nhập vẫn được giữ.');e.code='unavailable';throw e;}
    const data=await res.json().catch(()=>({}));
    if(!res.ok){const e=Error(data.error||`Máy chủ GymBro trả lỗi ${res.status}.`);e.code=data.code||String(res.status);e.status=res.status;throw e;}
    this.check();return data;
  }
  async page(kind,{from='',to=''}={}){
    const rows=[];let cursor='',seq=null;
    do{const r=await this.api('/v1/records',{params:{kind,from,to,cursor,limit:1000}});rows.push(...r.rows);seq=seq===null?r.seq:Math.min(seq,r.seq);cursor=r.next_cursor;}while(cursor);
    return {rows,seq};
  }
  async registerOwner(){await this.api('/v1/me',{method:'POST',body:{}});}
  async listUsers(){if(!isAdmin(this.s.auth.currentUser))throw Error('Chỉ admin được xem danh sách tài khoản.');return (await this.api('/v1/admin/users')).users;}
  async load({force=false}={}){
    if(this._cache&&!force)return clone(this._cache);
    if(this._loadTask)return clone(await this._loadTask);
    this._loadTask=(async()=>{try{
      const from=this.loadedFrom&&!force?this.loadedFrom:shiftDate(today(),-this.windowDays),data=emptyData();data.Archive=[];
      const parts=await Promise.all([...DATED.map(k=>this.page(k,{from}).then(r=>[k,r])),...ALL.map(k=>this.page(k).then(r=>[k,r]))]);
      for(const [k,r] of parts)data[k]=r.rows;
      this.seq=Math.min(...parts.map(([,r])=>r.seq));this.loadedFrom=from;this._cache=data;this.uploadLocalPhotos().catch(()=>{});return data;
    }finally{this._loadTask=null;}})();
    return clone(await this._loadTask);
  }
  // Pages in meals/workouts older than the loaded window. Returns null when already covered.
  async ensureRange(from){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from||''))return null;
    if(!this._cache)await this.load();
    if(from>=this.loadedFrom)return null;
    const to=shiftDate(this.loadedFrom,-1);
    const parts=await Promise.all(DATED.map(k=>this.page(k,{from,to}).then(r=>[k,r.rows])));
    for(const [k,rows] of parts){const ids=new Set(this._cache[k].map(r=>r.id));this._cache[k].push(...rows.filter(r=>!ids.has(r.id)));}
    this.loadedFrom=from;return clone(this._cache);
  }
  async loadAll(){await this.ensureRange('2000-01-01');return clone(this._cache);}
  remember(table,records){
    if(!this._cache||!TABLES.includes(table))return;
    const map=new Map(this._cache[table].map(r=>[r.id,r]));
    for(const r of records)map.set(r.id,{...clone(r),_revision:r.updated_at});
    this._cache[table]=[...map.values()];
  }
  async poll(){
    const touched=new Set();let more=true;
    while(more){
      const r=await this.api('/v1/changes',{params:{since:this.seq}});
      for(const {kind,row} of r.changes){if(TABLES.includes(kind)){this.remember(kind,[strip(row)]);touched.add(kind);}}
      this.seq=r.seq;more=r.more;
    }
    return touched;
  }
  subscribe(onRows,onError){
    this.check();let stopped=false,running=false;
    const tick=async()=>{
      if(stopped||running||(typeof document!=='undefined'&&document.visibilityState==='hidden'))return;
      running=true;
      try{const touched=await this.poll();if(!stopped)for(const t of touched)onRows(t,clone(this._cache[t]));}
      catch(e){if(!stopped){stop();onError(e);}}
      finally{running=false;}
    };
    const timer=setInterval(tick,POLL_MS),onVisible=()=>{if(document.visibilityState==='visible')tick();};
    if(typeof document!=='undefined')document.addEventListener('visibilitychange',onVisible);
    function stop(){stopped=true;clearInterval(timer);if(typeof document!=='undefined')document.removeEventListener('visibilitychange',onVisible);}
    return stop;
  }
  async write(kind,items){
    const r=await this.api('/v1/records',{method:'POST',body:{kind,items}});
    return r;
  }
  async save(table,record,{insertOnly=false}={}){
    const clean=cleanRecord(table,record),expected=record._originalUpdatedAt??record._revision;
    const r=await this.write(table,[{record:clean,expected:insertOnly?undefined:expected,insertOnly}]);
    const inserted=r.saved.includes(clean.id);if(inserted)this.remember(table,[clean]);return inserted;
  }
  async saveMany(table,records){
    if(!records.length||records.length>100)throw Error('Mỗi lần lưu từ 1 đến 100 mục.');
    const cleans=records.map(r=>cleanRecord(table,r));
    if(new Set(cleans.map(r=>r.id)).size!==cleans.length)throw Error('Trùng ID trong lần lưu.');
    await this.write(table,cleans.map((record,i)=>({record,expected:records[i]._originalUpdatedAt??records[i]._revision})));
    this.remember(table,cleans);
  }
  async loadFoods(){return (await this.page('FoodLibrary')).rows;}
  async seedFoods(){const now=new Date().toISOString();await this.write('FoodLibrary',DEFAULT_FOODS.map(f=>({record:cleanFood({...f,updated_at:now}),insertOnly:true})));return this.loadFoods();}
  async saveFood(food,{insertOnly=false}={}){const clean=cleanFood(food);await this.write('FoodLibrary',[{record:clean,expected:insertOnly?undefined:food._revision,insertOnly}]);}
  async savePhoto(photo){
    this.check();await this.api('/v1/photos',{method:'POST',body:{photo}});
    try{await this.photos.savePhoto(photo);}catch{}// cache only; the API copy is the shared one
  }
  async getPhoto(id){
    this.check();
    try{return await this.photos.getPhoto(id);}catch(e){if(e.code==='photo/expired')throw e;}
    const photo=validatePhoto(await this.api('/v1/photos/'+encodeURIComponent(id)));
    try{await this.photos.savePhoto(photo);}catch{}
    return photo;
  }
  // Photos taken before cloud sync existed only live in this device's cache: upload them once.
  async uploadLocalPhotos(){
    if(this.ownerUid!==this.uid||this._uploading)return 0;this._uploading=true;
    const doneKey='gymbro.cf.uploaded.'+this.ownerUid;let done=[];try{done=JSON.parse(globalThis.localStorage?.getItem(doneKey)||'[]');}catch{}
    const seen=new Set(done);let uploaded=0;
    for(const photo of await listLocalPhotos(this.photos.key+'/').catch(()=>[])){
      if(seen.has(photo.id)||photoExpired(photo))continue;
      try{await this.api('/v1/photos',{method:'POST',body:{photo}});seen.add(photo.id);uploaded++;}catch(e){if(e.code==='photo/expired')seen.add(photo.id);}
    }
    try{globalThis.localStorage?.setItem(doneKey,JSON.stringify([...seen].slice(-200)));}catch{}
    return uploaded;
  }
  async importBundle(bundle,onProgress=()=>{}){
    let inserted=0,skipped=0,done=0;const total=TABLES.reduce((n,t)=>n+(bundle.data[t]||[]).length,0);
    for(const table of TABLES){const rows=(bundle.data[table]||[]).map(r=>cleanRecord(table,r));
      for(let i=0;i<rows.length;i+=100){const r=await this.write(table,rows.slice(i,i+100).map(record=>({record,insertOnly:true})));inserted+=r.saved.length;skipped+=r.skipped.length;done+=Math.min(100,rows.length-i);onProgress({done,total,inserted,skipped});}}
    await this.load({force:true});return {inserted,skipped};
  }
  // Migration helpers: copy rows keeping IDs; re-runs only replace rows with a later updated_at.
  async copyRows(kind,rows,onChunk=()=>{}){
    let saved=0,skipped=0;
    for(let i=0;i<rows.length;i+=100){const r=await this.write(kind,rows.slice(i,i+100).map(record=>({record,newerOnly:true})));saved+=r.saved.length;skipped+=r.skipped.length;onChunk(Math.min(i+100,rows.length));}
    return {saved,skipped};
  }
  async reconcile(){return this.api('/v1/reconcile');}
  async registerDirectory(user){if(!isAdmin(this.s.auth.currentUser))throw Error('Chỉ admin được ghi danh bạ tài khoản.');await this.api('/v1/admin/users',{method:'POST',body:{uid:user.uid,email:user.email||'',display_name:user.display_name||''}});}
  async listIds(kind){return (await this.page(kind)).rows.map(r=>({id:r.id,updated_at:r.updated_at,deleted:r.deleted}));}
}
