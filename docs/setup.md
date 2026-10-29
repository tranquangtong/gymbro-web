# Thiết lập GymBro Web

## 1. GitHub Pages

1. Mở repo `tranquangtong/gymbro-web` → Settings → Pages.
2. Source: **Deploy from a branch**.
3. Branch: **main**, thư mục **/ (root)** → Save.
4. Chờ GitHub triển khai. URL: https://tranquangtong.github.io/gymbro-web/

Repo có `.nojekyll`; tất cả link asset tương đối nên hoạt động ở đường dẫn con. Không cần GitHub Actions workflow riêng hoặc npm install.

## 2. Google Cloud

1. Mở https://console.cloud.google.com/ và tạo/chọn project riêng cho GymBro Web.
2. APIs & Services → Library → bật **Google Sheets API**.
3. Google Auth Platform → Branding: tên app và email liên hệ.
4. Audience: tài khoản cá nhân chọn External. Khi trạng thái Testing, thêm email dùng app vào Test users.
5. Data Access: thêm scope `https://www.googleapis.com/auth/spreadsheets`.
6. Clients → Create client → **Web application**.
7. Authorized JavaScript origins:
   - `https://tranquangtong.github.io`
   - `http://localhost:4173` (khi phát triển)
   - `http://127.0.0.1:4173` (khi phát triển)
8. Không thêm `/gymbro-web/` vào origin. Bản token popup không cần client secret trên frontend.
9. Copy **Client ID**, không copy Client Secret.

App dùng quyền Sheets vì bản đầu nhận link file trực tiếp. Đây là quyền rộng, không giới hạn ở file nhập trong form; chỉ sử dụng code mà bạn tin cậy. Để giới hạn quyền từng file cần phát triển thêm Google Picker + `drive.file`. Khi dùng dài hạn, kiểm tra yêu cầu publishing/verification của Google phù hợp tài khoản và scope; không coi cấu hình Testing là cấu hình production đã hoàn tất.

Tài liệu: https://developers.google.com/identity/oauth2/web/guides/use-token-model và https://developers.google.com/workspace/sheets/api/scopes

## 3. Kết nối từ web

1. Giữ spreadsheet riêng tư. Tài khoản đăng nhập cần quyền Editor.
2. Mở web bằng trình duyệt thông thường, vào **Kết nối**.
3. Điền Client ID và link spreadsheet.
4. Bấm **Đăng nhập & kết nối**, cấp quyền được mô tả.
5. Bấm **Tạo tab GymBro Web** nếu cần. Chỉ ba tab dành cho web được tạo.
6. Thử thêm một log và kiểm tra trực tiếp trong Sheets. Đăng nhập trên thiết bị khác để xác nhận đọc lại được.

Client ID và spreadsheet ID được lưu trong trình duyệt, không commit lên GitHub. Access token chỉ giữ trong RAM; khi reload hoặc hết hạn cần kết nối lại. Ngắt phiên không thu hồi quyền OAuth đã cấp; có thể thu hồi trong trang quản lý quyền của Google Account.

## 4. Trước và sau khi kết nối

- Chế độ **Trên thiết bị** dùng localStorage, không đồng bộ qua thiết bị khác. Xóa dữ liệu trình duyệt có thể làm mất log.
- Chế độ **Minh họa** có nhãn riêng và key lưu riêng; không đưa dữ liệu mẫu lên Sheets.
- Trong chế độ Google, không ghi log nếu chưa kết nối và chưa đủ header. App không âm thầm lưu sang local.
- Để đưa log thật đang lưu trên thiết bị lên Sheets, kết nối xong → **Chuyển log trên thiết bị lên Sheets**. ID đã có trên cloud được bỏ qua; không ghi đè bản cloud.
- Tab EatLog/WorkoutLog/Profile cũ chưa được migrate. Không đổi tên chúng thành tab web vì schema khác.

## 5. Kiểm tra vận hành

1. Thêm món chưa biết kcal: dashboard hiển thị chưa đầy đủ, không giả định là 0 kcal.
2. Thêm chin-up 3 × 12, trợ lực 27.2 kg: được 3 set; volume tạ ngoài vẫn 0.
3. Thêm 40 kg × 10 reps loại Tạ ngoài: volume 400 kg·rep.
4. Thêm cardio 30 phút: không tăng số set, thời lượng cardio tăng 30 phút.
5. Sửa, xóa log; tải lại trang/đăng nhập lại rồi kiểm tra kết quả.
6. Ngắt mạng trong lúc lưu: giữ form, làm mới/kiểm tra trước khi gửi lại; không mở hai form cùng ID trên hai thiết bị.
7. Kiểm tra điện thoại: menu dưới, form ngày, bàn phím số và nút lưu.

Lỗi `origin_mismatch`: kiểm tra origin gồm scheme, hostname, port và không có path. Lỗi 403: bật API, kiểm tra tài khoản, quyền Editor và scope. Popup bị chặn: mở trang bằng Safari/Chrome và cho phép popup. Header bị đổi: khôi phục header từ `core.js`; app từ chối ghi vào cấu trúc không khớp.
