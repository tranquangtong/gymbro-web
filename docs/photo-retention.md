# Thời hạn lưu ảnh món ăn

Ảnh chụp/upload vào GymBro được tính hạn theo `MealPhotos.created_at`, đủ 168 giờ (7 ngày) là hết hạn. Nhật ký món ăn, tên món, kcal và P/C/F vẫn giữ nguyên. Ảnh cũ cũng áp dụng quy tắc này. Không xóa ảnh gốc trong Photos/Downloads của thiết bị.

## Những phần chạy ngay trên web

App chặn đọc/upload lại ảnh đã hết hạn, gỡ ảnh hết hạn khỏi bản nháp/ảnh đang hiển thị trong bộ nhớ. Cache IndexedDB `gymbro.media/photos` được quét khi app mở, khi quay lại tab và mỗi phút khi tab chạy. Tab đóng hoặc thiết bị tắt thì cache chỉ có thể dọn ở lần mở sau. Không đụng dữ liệu nhật ký local/Firestore khi dọn cache.

## Dọn ảnh tự động trên Cloudflare D1

Ảnh món ăn hiện được lưu trên Cloudflare D1. Cron của Worker `gymbro-api` chạy mỗi ngày lúc 03:17 UTC theo [cấu hình Worker](../worker/wrangler.toml) và dọn ảnh hết hạn kể cả khi app đã đóng. Ảnh được xóa vào lần cron chạy sau khi hết hạn.

## Dọn ảnh Firestore còn sót

Workflow **Clean expired meal photos** chỉ chạy thủ công. Chế độ **Preview only (no deletes)** bật mặc định. Workflow cần secret `FIREBASE_SERVICE_ACCOUNT` để truy cập Firestore. Nếu thiếu secret, job báo `NOT ACTIVE` và bỏ qua bước dọn ảnh.

1. Mở Firebase project gymbro-web → Project settings → Service accounts → Firebase Admin SDK → Generate new private key. Hoặc dùng một service account riêng trong cùng project có role Cloud Datastore User để giới hạn quyền vào Firestore. Lưu JSON được tải về.
2. Mở https://github.com/tranquangtong/gymbro-web/settings/secrets/actions/new . Name: `FIREBASE_SERVICE_ACCOUNT`. Secret: toàn bộ nội dung JSON vừa tải. Add secret. Không đưa JSON/private key vào source code hoặc chat. Đây khác với firebaseConfig public.
3. Vào Actions → **Clean expired meal photos** → Run workflow. Lần đầu giữ **Preview only (no deletes)** bật để kiểm tra `wouldDelete`.
4. Khi kết quả đúng, Run workflow lần nữa và tắt **Preview only** để dọn ngay ảnh đã hết hạn.

Không cần đổi Firestore Rules, không bật Test mode, không dùng TTL/Cloud Functions và không yêu cầu Blaze riêng cho job này. TTL deletes của Firestore cần bật billing: https://firebase.google.com/docs/firestore/quotas . Job dùng các lượt read/write/delete thường trong quota tài khoản; không đảm bảo không hết quota nếu lượng dùng lớn.

## Cách job Firestore hoạt động

Script Node không có dependency npm; dùng OAuth service account + Firestore REST. Chỉ nhận credential project `gymbro-web`, collection `users/{uid}/MealPhotos`. Liệt kê users (kể cả parent thiếu document), query ảnh cũ theo từng user bằng index trường mặc định; chỉ đọc metadata, không tải `data_url` trong query. Tối đa 500 ảnh/lần để giới hạn tác vụ.

Mỗi ảnh hết hạn: đọc liên kết `WebMeals/{meal_id}`, rồi commit atomic để gỡ đúng ID ảnh khỏi `photo_ids` và xóa document ảnh. Chỉ thay `photo_ids`/`updated_at`, giữ nguyên các field khác. `updateTime` precondition bảo vệ cả ảnh lẫn meal: nếu có thay đổi đồng thời thì bỏ qua để thử ở lần sau. Ảnh mồ côi vẫn xóa được. Không quét/xóa collection nhật ký; ảnh mới, timestamp không đọc được hoặc đường dẫn không đúng bị bỏ qua.

Script không log credential, data_url, tên món hoặc nội dung nhật ký. Dry-run chỉ báo số lượng và không commit. Có thể xem lịch sử job tại tab Actions.

## Kiểm thử

Unit/integration test bằng dữ liệu giả: biên 168 giờ, ảnh mới/invalid date, chỉ xóa MealPhotos, giữ macro, gỡ đúng ID, ảnh mồ côi, dry-run, conflict giữa thiết bị, project sai và đọc/upload ảnh hết hạn. Chưa gọi Firebase production để xóa ảnh khi chưa có secret. Không dùng Chrome.
