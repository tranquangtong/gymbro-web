import {SCHEMAS} from './core.js';
import {validateBundle} from './migration.js';

// Old releases persisted "local" indefinitely, even with a restored Google login.
// Device-only/demo are now explicit choices for this page session, never a boot default.
export const startupMode=()=> 'firebase';
export const localOnlyMessage=mode=>mode==='demo'?'Đã lưu vào dữ liệu mẫu · Không đồng bộ Firebase.':'Đã lưu riêng trên thiết bị · Chưa đồng bộ Firebase.';
export function saveMessage(state,count){return state.mode==='firebase'?`Đã lưu ${count??''} ${count?'mục ':''}vào Firebase · ${state.repo?.s.auth.currentUser?.email||''}`.replace('  ',' '):localOnlyMessage(state.mode);}
export const recordCount=data=>[...Object.keys(SCHEMAS),'Archive'].reduce((n,t)=>n+(data[t]||[]).length,0);
export function localMissingCount(local,remote){return [...Object.keys(SCHEMAS),'Archive'].reduce((n,t)=>{const ids=new Set((remote[t]||[]).map(r=>r.id));return n+(local[t]||[]).filter(r=>!ids.has(r.id)).length;},0);}

export async function loadCurrentData(state){
  const repo=state.repo,mode=state.mode;if(!repo)return false;
  const data=await repo.load();
  if(state.repo!==repo||state.mode!==mode)return false;
  state.data=data;return true;
}

// The UI owns this single listener lease. Replacing/logging out a repository
// invalidates callbacks before unsubscribe, including already queued callbacks.
export function createLiveSync({isCurrent,onRows,onError}){
  let dispose=null,generation=0;
  function stop(){generation++;const previous=dispose;dispose=null;previous?.();}
  function start(repo){stop();const version=generation;dispose=repo.subscribe((table,rows)=>{if(version===generation&&isCurrent(repo))onRows(table,rows);},e=>{if(version===generation&&isCurrent(repo))onError(e);});}
  return {start,stop};
}

// Explicitly transfer actual device data, including image bytes; never demo data.
// Inserts are resumable by ID and never overwrite an existing cloud log or food.
export async function transferLocalData(localRepo,cloudRepo,onProgress=()=>{}){
  if(cloudRepo.ownerUid!==cloudRepo.uid)throw Error('Quay về dữ liệu của mình trước khi chuyển log.');
  const bundle=validateBundle({app:'GymBro Web',version:2,data:await localRepo.load()});
  const remote=await cloudRepo.load();
  const freshMeals=bundle.data.WebMeals.filter(r=>!(remote.WebMeals||[]).some(x=>x.id===r.id));
  for(const meal of freshMeals){for(const id of meal.photo_ids||[]){const photo=await localRepo.getPhoto(id);if(photo.meal_id!==meal.id)throw Error('Ảnh không thuộc món ăn cần chuyển.');await cloudRepo.savePhoto(photo);}}
  const [localFoods,cloudFoods]=await Promise.all([localRepo.loadFoods(),cloudRepo.loadFoods()]);
  for(const food of localFoods)if(!cloudFoods.some(f=>f.id===food.id)){const clean={...food};delete clean._revision;await cloudRepo.saveFood(clean,{insertOnly:true});}
  return cloudRepo.importBundle(bundle,onProgress);
}
