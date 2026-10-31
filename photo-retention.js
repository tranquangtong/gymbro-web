export const PHOTO_RETENTION_DAYS=5;
export const PHOTO_RETENTION_MS=PHOTO_RETENTION_DAYS*24*60*60*1000;
export function photoExpiresAt(photo){const created=Date.parse(photo?.created_at||'');return Number.isFinite(created)?created+PHOTO_RETENTION_MS:null;}
export function photoExpired(photo,now=Date.now()){const expires=photoExpiresAt(photo);return expires!==null&&expires<=now;}
export function photoExpiryError(){const e=Error('Ảnh đã quá hạn lưu 5 ngày và được dọn tự động. Nhật ký và macro vẫn được giữ.');e.code='photo/expired';return e;}
export function forgetExpiredPhotos(photos=[],now=Date.now()){return photos.filter(photo=>!photoExpired(photo,now));}
