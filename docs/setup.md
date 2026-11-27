# Thiết lập Firebase cho GymBro

## Những gì đã cấu hình trong code

- Frontend: https://tranquangtong.github.io/gymbro-web/
- Firebase project: gymbro-web
- Web app config: src/config/firebase-config.js (cấu hình public; không phải credential Admin).
- SDK: Firebase JavaScript 13.1.0, CDN Google, dùng cho đăng nhập Google. Không bật Analytics.

## Firebase Console

1. Authentication → Sign-in method: bật Google, chọn email hỗ trợ.
2. Authentication → Settings → Authorized domains: thêm `tranquangtong.github.io`. Khi phát triển local, thêm localhost hoặc 127.0.0.1 nếu cần.
3. Vào web → Kết nối → Đăng nhập bằng Google. Dùng cùng tài khoản trên điện thoại và máy tính.

## Khóa Firestore

Dữ liệu GymBro đã chuyển sang Cloudflare D1 qua Worker `gymbro-api`. Firestore đã được xóa sạch ngày 2026-11-27. Trong Firebase Console → Firestore → Rules, áp dụng nội dung `firestore.rules` để chặn toàn bộ thao tác đọc/ghi từ ứng dụng.

Có thể deploy Rules bằng Firebase CLI khi đã đăng nhập và có quyền:

```sh
firebase deploy --only firestore:rules --project gymbro-web
```

Không đưa service-account JSON vào frontend hoặc repo. Code không tự cấp quyền, đổi Rules hoặc tạo database.

## Chuyển lịch sử cũ

1. Lấy bản chuyển đổi JSON GymBro riêng tư từ Sheets nguồn. Kiểm tra ngày và số lượng bản ghi.
2. Đăng nhập Google vào GymBro Web.
3. Kết nối → Nhập lịch sử từ Sheets → chọn file JSON.
4. Xem trước số lượng và tài khoản nhận dữ liệu, rồi xác nhận nhập dữ liệu.
5. Chờ thông báo hoàn tất. Nếu gián đoạn, dùng lại cùng file; ID đã có sẽ được bỏ qua.
6. Đối chiếu lịch sử đầu/cuối, số set và các báo cáo trong Tư liệu. Mở thiết bị thứ hai, đăng nhập cùng tài khoản và làm mới.

Không bao gồm các field phục vụ Telegram. Bộ nhập không sửa Sheets nguồn, không tự tính lại kcal hoặc nhận xét. Dòng cũ thiếu thông tin sẽ được báo trong phần review/summary thay vì tạo số liệu giả. Dữ liệu từ chế độ mẫu không được nhập.

File nguồn có thể có hàng trống hoặc công thức không có ngày; các hàng Daily Report không có ngày không được nhập.

## Trạng thái và lỗi

- `auth/unauthorized-domain`: thêm domain GitHub Pages vào Authentication.
- `auth/operation-not-allowed`: bật Google provider.
- Popup bị chặn: cho phép popup rồi bấm đăng nhập lại.
- Cần kết nối mạng để đăng nhập và đồng bộ dữ liệu với D1.
- Khi quay lại tab hoặc bấm Làm mới, app tải lại dữ liệu server. Không có realtime listener hoặc offline write queue trong bản này.
