import {uid} from './core.js';
export const PHOTO_LIMIT=360000; // Encoded JPEG length: well below Firestore's 1 MiB/document.
export function validatePhoto(photo){if(!photo||!/^[a-zA-Z0-9_-]{1,100}$/.test(photo.id)||typeof photo.meal_id!=='string'||!photo.meal_id||photo.meal_id.length>200||typeof photo.data_url!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(photo.data_url)||photo.data_url.length>PHOTO_LIMIT||typeof photo.created_at!=='string')throw Error('Ảnh chưa hợp lệ hoặc quá lớn.');return photo;}
export async function compressPhoto(file,mealId){
  if(!file||!['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.type)||file.size>25000000)throw Error('Chọn ảnh JPG, PNG, WEBP hoặc HEIC tối đa 25 MB.');
  const url=URL.createObjectURL(file),img=new Image();
  try{img.src=url;try{await img.decode();}catch{throw Error('Trình duyệt chưa đọc được ảnh này. Chụp lại hoặc chọn JPG/PNG.');}
    const canvas=document.createElement('canvas');let scale=Math.min(1,1280/Math.max(img.naturalWidth,img.naturalHeight)),quality=.82,data;
    for(let i=0;i<10;i++){canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);data=canvas.toDataURL('image/jpeg',quality);if(data.length<=PHOTO_LIMIT)break;quality=Math.max(.45,quality-.08);scale*=.88;}
    return validatePhoto({id:uid(),meal_id:mealId,data_url:data,created_at:new Date().toISOString()});
  }finally{URL.revokeObjectURL(url);}
}
export function photoFile(photo){const raw=atob(photo.data_url.split(',')[1]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));return new File([bytes],photo.meal_id+'_'+photo.id+'.jpg',{type:'image/jpeg'});}
export function downloadFile(file){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export async function copyText(text){try{await navigator.clipboard.writeText(text);}catch{const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';const root=[...document.querySelectorAll('dialog[open]')].at(-1)||document.body;root.append(area);area.select();const ok=document.execCommand('copy');area.remove();if(!ok)throw Error('Không copy được. Chọn nội dung prompt và copy thủ công.');}}
