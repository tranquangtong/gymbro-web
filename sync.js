import {SCHEMAS} from './core.js';
import {validateBundle} from './migration.js';

// Old releases persisted "local" indefinitely, even with a restored Google login.
// Device-only/demo are now explicit choices for this page session, never a boot default.
export const startupMode=()=> 'firebase';
export const localOnlyMessage=mode=>mode==='demo'?'Đã lưu vào dữ liệu mẫu · Không đồng bộ Firebase.':'Đã lưu riêng trên thiết bị · Chưa đồng bộ Firebase.';
export function saveMessage(state,count){return state.mode==='firebase'?`Đã lưu ${count??''} ${count?'mục ':''}vào ${state.repo?.backendName||'Firebase'} · ${state.repo?.s.auth.currentUser?.email||''}`.replace('  ',' '):localOnlyMessage(state.mode);}
export const recordCount=data=>[...Object.keys(SCHEMAS),'Archive'].reduce((n,t)=>n+(data[t]||[]).length,0);
export function localMissingCount(local,remote){return [...Object.keys(SCHEMAS),'Archive'].reduce((n,t)=>{const ids=new Set((remote[t]||[]).map(r=>r.id));return n+(local[t]||[]).filter(r=>!ids.has(r.id)).length;},0);}

export async function loadCurrentData(state,options={}){
  const repo=state.repo,mode=state.mode;if(!repo)return false;
  const data=await repo.load(options);
  if(state.repo!==repo||state.mode!==mode)return false;
  state.data=data;return true;
}

// The UI owns this single listener lease. Replacing/logging out a repository
// invalidates callbacks before unsubscribe, including already queued callbacks.
export function createLiveSync({isCurrent,onRows,onError}){
  let dispose=null,generation=0,currentRepo=null;
  function stop(){generation++;const previous=dispose;dispose=null;currentRepo=null;previous?.();}
  function start(repo){
    if(dispose&&currentRepo===repo&&isCurrent(repo))return;
    stop();const version=generation;currentRepo=repo;
    const cleanup=repo.subscribe((table,rows)=>{if(version===generation&&isCurrent(repo))onRows(table,rows);},e=>{if(version===generation&&isCurrent(repo)){stop();onError(e);}});
    if(version===generation)dispose=cleanup;else cleanup?.();
  }
  return {start,stop};
}

// Explicitly transfer actual device data, including image bytes; never demo data.
// Inserts are resumable by ID and never overwrite an existing cloud log or food.
export async function transferLocalData(localRepo,cloudRepo,onProgress=()=>{}){
  if(cloudRepo.ownerUid!==cloudRepo.uid)throw Error('Quay về dữ liệu của mình trước khi chuyển log.');
  const bundle=validateBundle({app:'GymBro Web',version:2,data:await localRepo.load()});
  const remote=await cloudRepo.load();
  const freshMeals=bundle.data.WebMeals.filter(r=>!(remote.WebMeals||[]).some(x=>x.id===r.id));
  for(const meal of freshMeals){const keep=[];for(const id of meal.photo_ids||[]){try{const photo=await localRepo.getPhoto(id);if(photo.meal_id!==meal.id)throw Error('Ảnh không thuộc món ăn cần chuyển.');await cloudRepo.savePhoto(photo);keep.push(id);}catch(e){if(e.code!=='photo/expired'&&e.code!=='photo/not-found')throw e;}}if(meal.photo_ids)meal.photo_ids=keep;}
  const [localFoods,cloudFoods]=await Promise.all([localRepo.loadFoods(),cloudRepo.loadFoods()]);
  for(const food of localFoods)if(!cloudFoods.some(f=>f.id===food.id)){const clean={...food};delete clean._revision;await cloudRepo.saveFood(clean,{insertOnly:true});}
  return cloudRepo.importBundle(bundle,onProgress);
}
