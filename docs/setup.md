# Thiết lập Firebase cho GymBro

## Những gì đã cấu hình trong code

- Frontend: https://tranquangtong.github.io/gymbro-web/
- Firebase project: gymbro-web
- Web app config: firebase-config.js (cấu hình public; không phải credential Admin).
- SDK: Firebase JavaScript 13.1.0, CDN Google, Auth + Firestore. Không bật Analytics.

## Firebase Console

1. Authentication → Sign-in method: bật Google, chọn email hỗ trợ.
2. Authentication → Settings → Authorized domains: thêm `tranquangtong.github.io`. Khi phát triển local, thêm localhost hoặc 127.0.0.1 nếu cần.
3. Firestore: tạo database `(default)`, Standard edition, location `asia-southeast1`, Production mode.
4. Firestore → Rules: thay nội dung bằng file `firestore.rules` trong repo, kiểm tra và Publish. Rules chỉ cho tài khoản đọc/ghi nhánh UID của chính nó; các path khác và hard delete bị chặn.
5. Vào web → Kết nối → Đăng nhập bằng Google. Dùng cùng tài khoản trên điện thoại và máy tính.

Có thể deploy Rules bằng Firebase CLI khi đã đăng nhập và có quyền:

```sh
firebase deploy --only firestore:rules --project gymbro-web
```

Không đưa service-account JSON vào frontend hoặc repo. Code không tự cấp quyền, đổi Rules hoặc tạo database.

## Chuyển lịch sử cũ

1. Lấy bản chuyển đổi JSON GymBro riêng tư từ Sheets nguồn. Kiểm tra ngày và số lượng bản ghi.
2. Đăng nhập Google vào GymBro Web.
3. Kết nối → Nhập lịch sử từ Sheets → chọn file JSON.
4. Xem trước số lượng và tài khoản nhận dữ liệu, rồi bấm Nhập dữ liệu vào Firebase.
5. Chờ thông báo hoàn tất. Nếu gián đoạn, dùng lại cùng file; ID đã có sẽ được bỏ qua.
6. Đối chiếu lịch sử đầu/cuối, số set và các báo cáo trong Tư liệu. Mở thiết bị thứ hai, đăng nhập cùng tài khoản và làm mới.

Không bao gồm các field phục vụ Telegram. Bộ nhập không sửa Sheets nguồn, không tự tính lại kcal hoặc nhận xét. Dòng cũ thiếu thông tin sẽ được báo trong phần review/summary thay vì tạo số liệu giả. Dữ liệu từ chế độ mẫu không được nhập.

File nguồn có thể có hàng trống hoặc công thức không có ngày; các hàng Daily Report không có ngày không được nhập.

## Trạng thái và lỗi

- `permission-denied`: kiểm tra database đã tạo và Rules đã Publish, không chuyển sang Test mode.
- `auth/unauthorized-domain`: thêm domain GitHub Pages vào Authentication.
- `auth/operation-not-allowed`: bật Google provider.
- Popup bị chặn: cho phép popup rồi bấm đăng nhập lại.
- Chưa có SDK/mạng: vẫn có thể dùng chế độ trên thiết bị. App không âm thầm ghi cloud thành local.
- Khi quay lại tab hoặc bấm Làm mới, app tải lại dữ liệu server. Không có realtime listener hoặc offline write queue trong bản này.

Firestore Rules cần được kiểm thử với tài khoản thật trước khi đưa dữ liệu nhạy cảm vào. Kiểm thử tự động trong repo dùng dịch vụ transaction giả và dữ liệu giả, không thay thế xác nhận Rules trên Firebase thật.
