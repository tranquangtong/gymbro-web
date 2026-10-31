export function quotaMessage(e){
 const code=String(e?.code||'');
 if(code==='resource-exhausted'||code==='firestore/resource-exhausted')return 'Firestore đã chạm quota (resource-exhausted). Có thể là lượt đọc/ghi trong ngày, băng thông hoặc dung lượng; không đồng nghĩa đã đầy 1 GiB. Kiểm tra Firebase → Firestore Database → Usage. Chưa xác nhận lưu thành công; nội dung đang nhập vẫn được giữ.';
 if(e?.name==='QuotaExceededError'||e?.code===22||e?.code===1014)return 'Bộ nhớ lưu trữ của trình duyệt đã chạm quota (QuotaExceededError), không phải dung lượng Firestore 1 GiB. Nội dung trong form vẫn được giữ; chưa xác nhận lưu thành công.';
 if(/quota.*exceed|exceed.*quota/i.test(e?.message||''))return 'Đã chạm một hạn mức (quota). Chưa xác định là Firestore hay bộ nhớ trình duyệt vì dịch vụ không trả mã lỗi cụ thể. Nội dung đang nhập vẫn được giữ.';
 return null;
}
