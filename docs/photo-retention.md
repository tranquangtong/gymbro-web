# Thời hạn lưu ảnh món ăn

Ảnh chụp/upload vào GymBro được tính hạn theo `MealPhotos.created_at`, đủ 168 giờ (7 ngày) là hết hạn. Nhật ký món ăn, tên món, kcal và P/C/F vẫn giữ nguyên. Ảnh cũ cũng áp dụng quy tắc này. Không xóa ảnh gốc trong Photos/Downloads của thiết bị.

## Những phần chạy ngay trên web

App chặn đọc/upload lại ảnh đã hết hạn, gỡ ảnh hết hạn khỏi bản nháp/ảnh đang hiển thị trong bộ nhớ. Cache IndexedDB `gymbro.media/photos` được quét khi app mở, khi quay lại tab và mỗi phút khi tab chạy. Tab đóng hoặc thiết bị tắt thì cache chỉ có thể dọn ở lần mở sau. Dọn cache chỉ xóa bản sao ảnh trên thiết bị.

## Dọn ảnh tự động trên Cloudflare D1

Ảnh món ăn hiện được lưu trên Cloudflare D1. Cron của Worker `gymbro-api` chạy mỗi ngày lúc 03:17 UTC theo [cấu hình Worker](../worker/wrangler.toml) và dọn ảnh hết hạn kể cả khi app đã đóng. Ảnh được xóa vào lần cron chạy sau khi hết hạn.

## Workflow Firestore cũ

Firestore đã được xóa sạch ngày 2026-11-27. Rules chặn mọi thao tác đọc/ghi từ ứng dụng. Workflow thủ công **Clean expired meal photos** dành cho dữ liệu Firestore cũ. Worker `gymbro-api` xử lý ảnh hiện tại trên D1.
