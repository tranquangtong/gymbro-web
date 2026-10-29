# GymBro Web

Ứng dụng web tiếng Việt để ghi ăn uống, tập luyện và xem tiến bộ. GitHub Pages + Firebase Authentication (Google) + Cloud Firestore. Không cần GAS hoặc Telegram.

## Chạy và kiểm thử

```sh
npm run dev
npm run check
npm test
```

Mở http://127.0.0.1:4173. Không có npm dependencies; Firebase SDK được nạp động từ CDN chính thức khi cần đăng nhập. Cấu hình web public nằm trong `firebase-config.js`; không có Admin SDK private key. Không bật Analytics.

## Thiết lập

Xem [hướng dẫn Firebase](docs/setup.md). Cần bật Google provider, thêm domain GitHub Pages và publish [firestore.rules](firestore.rules). Trước khi publish, database Production mode vẫn từ chối đọc/ghi. App không tự mở quyền.

## Các chế độ

- **Firebase**: tài khoản Google sở hữu dữ liệu ở `users/{uid}/WebMeals`, `WebWorkouts`, `WebProfile`, `Archive`.
- **Trên thiết bị**: dùng localStorage của trình duyệt; không tự đồng bộ.
- **Minh họa**: dữ liệu giả lưu riêng, không được import lên cloud.

Giao diện giữ bản nháp form mới trong sessionStorage. Phiên Firebase Auth được SDK lưu trên trình duyệt; đăng xuất khi dùng máy chung. Firestore hiện đọc từ server; chưa có hàng đợi ghi offline. Dữ liệu cập nhật khi tải lại, quay lại tab hoặc bấm Làm mới, chưa dùng realtime listener.

## Dữ liệu và lịch sử

Log tập hỗ trợ nhiều set, tạ ngoài, trợ lực, bodyweight, cardio, ngày nghỉ và preset chin-up. Volume tạ ngoài không bao gồm trợ lực/bodyweight. Kcal/macro trống nghĩa là chưa biết, khác với 0. Các bản ghi profile lưu cân nặng và mục tiêu theo ngày.

Bộ chuyển đổi `migration.js` nhận bảng nguồn đã đọc theo header, tạo file JSON GymBro version 2. File riêng tư được chọn ở **Kết nối → Nhập lịch sử từ Sheets**. Có bước xem trước và xác nhận tài khoản. Toàn bộ file được kiểm tra trước khi bắt đầu ghi; mỗi bản ghi nhập qua transaction theo ID ổn định. ID đã tồn tại được bỏ qua, không ghi đè log đã sửa. Nếu ngắt mạng có thể chọn lại cùng file và chạy tiếp. Quá trình không atomic cho toàn bộ file; có thể đã nhập một phần khi bị gián đoạn.

- `EatLog` → `WebMeals`: giữ kcal đã biết/ước tính, tổng kcal, buffer, macro gồm fiber, confidence và ghi chú dinh dưỡng. Ưu tiên kcal đã biết, sau đó tổng đã tính, rồi kcal ước tính.
- `WorkoutLog` → `WebWorkouts`: giữ mỗi set gốc thành một mục riêng để không thay đổi số set lịch sử. Các buổi mới có thể lưu nhiều set trong một mục. Nhận diện chin-up trợ lực; cardio thiếu thời lượng được giữ trong Archive để rà lại.
- `Profile` → `WebProfile`: giữ dữ liệu gốc, không tự đoán mục tiêu từ ghi chú.
- `Daily Report`, `WorkoutPlan`, `DietPlan` → `Archive`, xem ở **Tư liệu**. Báo cáo lịch sử không được tính lại hoặc coi là khuyến nghị hiện tại.

Không migrate Config/Logs vận hành, `source_message_id`, messageId, messageDateTime, chat/user ID Telegram, telegram_message, is_sent hoặc sent_at. `date`, `created_at`, `updated_at`, `generated_at` là mốc nghiệp vụ và được giữ. Chỉ các field trong allowlist được ghi/export/import. Không đưa bảng raw của nguồn vào Archive.

## Giới hạn và bảo mật

Rules giới hạn quyền theo Firebase UID và schema. Kiểm tra đồng thời khi sửa dùng transaction và revision; code giữ bản nháp khi lỗi. File nguồn Sheets giữ nguyên. Bộ nhập không tải Sheets trực tiếp bằng OAuth nữa; file chuyển đổi là dữ liệu riêng tư, không được commit.

Đường dẫn `.migration/` bị ignore. Chỉ commit code, Rules và fixture giả. Không đưa lịch sử, bản sao JSON cá nhân, service-account key hoặc token lên repo public. File `firebase.json` chỉ cấu hình triển khai Rules bằng CLI nếu muốn; không chuyển hosting khỏi GitHub Pages.

## Quản trị viên

`tongquangtran@gmail.com` có quyền admin khi email được Firebase Auth xác minh. Firestore Rules kiểm tra token, không đọc role tự khai từ client. Admin mở màn hình Admin, làm mới danh sách tài khoản và chọn tài khoản để xem/sửa/xóa mềm log; Tư liệu hỗ trợ sửa nội dung báo cáo/giáo án dạng JSON. Banner luôn hiện UID đang quản lý. Nút quay về dữ liệu của mình tránh nhập nhầm tài khoản. Migrate/chuyển local bị chặn khi đang quản lý tài khoản khác.

Mỗi tài khoản đăng nhập tạo một bản directory `users/{uid}` chỉ chứa uid, email, display_name và updated_at. Người thường không list directory hoặc mở dữ liệu của người khác. Không cấp IAM Owner hoặc quyền Firebase Console bằng vai trò admin của ứng dụng.
