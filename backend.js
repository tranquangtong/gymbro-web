import {BACKEND} from './backend-config.js';
import {FirebaseRepository} from './firebase.js';
import {CloudflareRepository} from './cloudflare.js';
export {BACKEND};
export const backendName=()=>BACKEND.kind==='cloudflare'?'Cloudflare':'Firebase';
// One place decides where logs live; the UI only ever sees the shared repository surface.
export function createRepository(service,targetUid=null){
  return BACKEND.kind==='cloudflare'?new CloudflareRepository(service,targetUid,{apiBase:BACKEND.apiBase}):new FirebaseRepository(service,targetUid);
}
