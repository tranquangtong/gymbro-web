// One-way copy Firestore → Cloudflare D1, run from the signed-in web app.
// - Reads each Firestore collection once; never writes to or deletes from Firestore.
// - Keeps every record ID and its owner UID.
// - Re-runnable: rows already in D1 are kept unless Firestore has a later updated_at.
// - Ends with a reconcile: per-type count + SHA-256 fingerprint on both sides,
//   and a row-level diff only when they disagree.
import {SCHEMAS} from './core.js';
import {cleanRecord} from './migration.js';
import {cleanFood} from './quick.js';
import {FirebaseRepository,withFirestore,isAdmin} from './firebase.js';
import {CloudflareRepository} from './cloudflare.js';
import {summarize} from './reconcile.js';

export const KINDS=[...Object.keys(SCHEMAS),'Archive','FoodLibrary'];
export const KIND_LABELS={WebMeals:'Ăn uống',WebWorkouts:'Tập luyện',WebProfile:'Hồ sơ',Archive:'Tư liệu',FoodLibrary:'Thư viện món'};

export function cleanForCopy(kind,row){const c=kind==='FoodLibrary'?cleanFood(row):cleanRecord(kind,row);return c;}

export function diffRows(source,target){
  const t=new Map(target.map(r=>[r.id,r])),s=new Map(source.map(r=>[r.id,r]));
  const missing=source.filter(r=>!t.has(r.id)).map(r=>r.id);
  const changed=source.filter(r=>t.has(r.id)&&String(t.get(r.id).updated_at||'')!==String(r.updated_at||'')).map(r=>r.id);
  const extra=target.filter(r=>!s.has(r.id)).map(r=>r.id);
  return {missing,changed,extra};
}

export async function migrateOwner({service,uid,apiBase,onProgress=()=>{}}){
  await withFirestore(service);
  const fire=new FirebaseRepository(service,uid),cf=new CloudflareRepository(service,uid,{apiBase});
  onProgress('Đang đọc Firestore…');
  const data=await fire.load({force:true}),foods=await fire.loadFoods();
  const source=Object.fromEntries(KINDS.map(k=>[k,(k==='FoodLibrary'?foods:data[k]||[]).map(r=>cleanForCopy(k,r))]));
  const copied={};
  for(const kind of KINDS){
    const rows=source[kind];
    copied[kind]=rows.length?await cf.copyRows(kind,rows,n=>onProgress(`${KIND_LABELS[kind]}: ${n}/${rows.length}`)):{saved:0,skipped:0};
  }
  onProgress('Đang đối chiếu…');
  const server=await cf.reconcile(),kinds={};
  for(const kind of KINDS){
    const src=await summarize(source[kind]),dst=server[kind]||{count:0,hash:''};
    const entry={source:src.count,target:dst.count,saved:copied[kind].saved,kept:copied[kind].skipped,match:src.count===dst.count&&src.hash===dst.hash};
    if(!entry.match)entry.diff=diffRows(source[kind],await cf.listIds(kind));
    kinds[kind]=entry;
  }
  return {uid,at:new Date().toISOString(),match:Object.values(kinds).every(k=>k.match),kinds};
}

// Admin: every account in the Firestore user directory, one after another.
export async function migrateAll({service,apiBase,onProgress=()=>{}}){
  if(!isAdmin(service.auth.currentUser))throw Error('Chỉ admin được chuyển dữ liệu mọi tài khoản.');
  await withFirestore(service);
  const self=new FirebaseRepository(service),users=await self.listUsers(),cf=new CloudflareRepository(service,null,{apiBase});
  const reports=[];
  for(const [i,u] of users.entries()){
    await cf.registerDirectory(u);
    reports.push({...await migrateOwner({service,uid:u.uid,apiBase,onProgress:m=>onProgress(`${i+1}/${users.length} · ${u.email||u.uid} · ${m}`)}),email:u.email||''});
  }
  return reports;
}
