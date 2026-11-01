import {photoExpired,photoExpiryError} from './photo-retention.js';
import {DEFAULT_FOODS,cleanFood,validateFood} from './quick.js';
import {validatePhoto} from './media.js';
import {LocalRepository} from './core.js';
const database=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('gymbro.media',1);r.onupgradeneeded=()=>r.result.createObjectStore('photos');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Trình duyệt không cho lưu ảnh.'));});
LocalRepository.prototype.loadFoods=async function(){const rows=JSON.parse(this.storage.getItem(this.key+'.foods')||'[]');if(!Array.isArray(rows))throw Error('Thư viện bị lỗi.');return rows.map(f=>({...f,_revision:f.updated_at}));};
LocalRepository.prototype.seedFoods=async function(){const rows=await this.loadFoods();for(const f of DEFAULT_FOODS)if(!rows.some(x=>x.id===f.id))rows.push({...f,updated_at:new Date().toISOString()});this.storage.setItem(this.key+'.foods',JSON.stringify(rows.map(cleanFood)));return this.loadFoods();};
LocalRepository.prototype.saveFood=async function(food){validateFood(food);const rows=await this.loadFoods(),i=rows.findIndex(x=>x.id===food.id);if(food._revision&&rows[i]?.updated_at!==food._revision)throw Error('Món đã thay đổi. Mở lại thư viện.');if(i<0)rows.push(cleanFood(food));else rows[i]=cleanFood(food);this.storage.setItem(this.key+'.foods',JSON.stringify(rows));};
LocalRepository.prototype.savePhoto=async function(photo){validatePhoto(photo);if(photoExpired(photo))throw photoExpiryError();const db=await database();try{await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put(photo,this.key+'/'+photo.id);tx.oncomplete=resolve;tx.onerror=()=>reject(Error('Không lưu được ảnh trên thiết bị.'));tx.onabort=()=>reject(Error('Không lưu được ảnh trên thiết bị.'));});}finally{db.close();}};
LocalRepository.prototype.getPhoto=async function(id){const db=await database();try{return await new Promise((resolve,reject)=>{const req=db.transaction('photos').objectStore('photos').get(this.key+'/'+id);req.onsuccess=()=>{if(!req.result){const e=Error('Không tìm thấy ảnh trên thiết bị; ảnh chỉ giữ 7 ngày.');e.code='photo/not-found';return reject(e);}if(photoExpired(req.result))return reject(photoExpiryError());resolve(validatePhoto(req.result));};req.onerror=()=>reject(Error('Không đọc được ảnh.'));});}finally{db.close();}};

export async function purgeLocalPhotoCache(now=Date.now()){
 if(typeof indexedDB==='undefined')return 0;
 const db=await database();try{return await new Promise((resolve,reject)=>{
  let removed=0;const tx=db.transaction('photos','readwrite'),req=tx.objectStore('photos').openCursor();
  req.onsuccess=()=>{const cursor=req.result;if(!cursor)return;if(photoExpired(cursor.value,now)){cursor.delete();removed++;}cursor.continue();};
  tx.oncomplete=()=>resolve(removed);tx.onerror=()=>reject(Error('Không dọn được cache ảnh.'));tx.onabort=()=>reject(Error('Không dọn được cache ảnh.'));
 });}finally{db.close();}
}
// Photos cached on this device under a key prefix (e.g. "gymbro.cf.<uid>/"), used to upload
// photos that were taken before cloud photo sync existed.
export async function listLocalPhotos(prefix){
 if(typeof indexedDB==='undefined')return [];
 const db=await database();try{return await new Promise((resolve,reject)=>{
  const out=[],req=db.transaction('photos').objectStore('photos').openCursor();
  req.onsuccess=()=>{const cursor=req.result;if(!cursor)return resolve(out);if(String(cursor.key).startsWith(prefix))out.push(cursor.value);cursor.continue();};
  req.onerror=()=>reject(Error('Không đọc được ảnh trên thiết bị.'));
 });}finally{db.close();}
}
