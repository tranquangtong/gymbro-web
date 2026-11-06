// Last data this device loaded for the signed-in account, so reopening the app shows the
// dashboard at once while sign-in and the server load run in the background.
// View-only until the server answers; removed on sign-out, session expiry or account change.
import {sessionValid} from './access.js';
import {SCHEMAS} from './core.js';

export const SNAPSHOT_KEY='gymbro.snapshot.v1';
export const SNAPSHOT_MAX_BYTES=2_500_000;
const TABLES=[...Object.keys(SCHEMAS),'Archive'];

export function writeSnapshot(storage,{uid,sessionExpiresAt,data},now=Date.now()){
  if(!storage||!uid||!sessionValid(sessionExpiresAt,now))return false;
  try{
    const text=JSON.stringify({v:1,uid,sessionExpiresAt,savedAt:now,data});
    if(text.length>SNAPSHOT_MAX_BYTES){storage.removeItem(SNAPSHOT_KEY);return false;}
    storage.setItem(SNAPSHOT_KEY,text);return true;
  }catch{try{storage.removeItem(SNAPSHOT_KEY);}catch{}return false;}
}

export function readSnapshot(storage,now=Date.now()){
  let s=null;
  try{s=JSON.parse(storage?.getItem(SNAPSHOT_KEY)||'null');}catch{}
  const ok=s&&s.v===1&&typeof s.uid==='string'&&s.uid&&sessionValid(s.sessionExpiresAt,now)&&s.data&&typeof s.data==='object'
    &&TABLES.every(t=>s.data[t]===undefined||Array.isArray(s.data[t]));
  if(!ok){clearSnapshot(storage);return null;}
  for(const t of TABLES)if(!s.data[t])s.data[t]=[];
  return s;
}

export function clearSnapshot(storage){try{storage?.removeItem(SNAPSHOT_KEY);}catch{}}
