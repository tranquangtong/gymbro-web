# GymBro Web

Web app tiếng Việt để ghi ăn uống, tập luyện và theo dõi tiến bộ. HTML/CSS/JavaScript thuần, không cần build hoặc backend; dành cho GitHub Pages + Google Sheets riêng tư. Không dùng Telegram hoặc GAS.

## Chạy trên máy

Yêu cầu Python 3, Node.js 18+ cho kiểm thử. Không có npm dependencies.

```sh
npm run dev
```

Mở http://127.0.0.1:4173. Thư mục chạy lệnh là thư mục repo `gymbro-web`.

```sh
npm run check
npm test
```

## Chức năng

- Dashboard: dinh dưỡng hôm nay, số buổi và set, lịch tuần, biểu đồ tiến bộ riêng theo bài và loại tải.
- Nhật ký ăn: ngày, bữa, món, khẩu phần, dinh dưỡng tùy chọn, nguồn số liệu, bỏ bữa.
- Nhật ký tập: nhiều set/bài, tạ ngoài, trợ lực, bodyweight, cardio, ngày nghỉ; preset chin-up và lặp buổi tập gần nhất.
- Sửa, xóa mềm, lọc lịch sử, cân nặng và mục tiêu theo ngày, xuất JSON.
- Lưu trên thiết bị, minh họa và Google Sheets là các chế độ riêng. Không tự đồng bộ chéo.
- Giữ bản nháp form mới trong sessionStorage; access token Google chỉ nằm trong bộ nhớ.

## Google Sheets và GitHub Pages

Xem [hướng dẫn thiết lập](docs/setup.md). Vào **Kết nối** trên web để nhập OAuth Client ID và link spreadsheet. Cấu hình này lưu trong trình duyệt của bạn, không có ID file cá nhân hay secret trong source.

Ứng dụng chỉ tạo/đọc/ghi ba tab `WebMeals`, `WebWorkouts`, `WebProfile`. Các tab cũ của GymBro được giữ nguyên. **Chưa triển khai nhập lịch sử từ EatLog/WorkoutLog hoặc đọc Daily Report cũ.** Dữ liệu trên thiết bị có nút chuyển riêng lên Sheets; dữ liệu minh họa không được chuyển.

Google OAuth scope bản đầu: `https://www.googleapis.com/auth/spreadsheets`. Scope có quyền rộng trên các spreadsheet mà tài khoản truy cập được; UI mô tả rõ trước khi đăng nhập. Dùng `drive.file` cùng Picker là hướng thu hẹp quyền cho phiên bản sau.

## Quy ước dữ liệu

- Ngày nhật ký: `YYYY-MM-DD`, mặc định theo `Asia/Ho_Chi_Minh`; timestamp: ISO UTC.
- Một dòng `WebWorkouts` là một bài trong buổi; `sets_json` chứa mảng `{weight_kg, reps}`. Cardio dùng `duration_min`; nghỉ dùng `kind=rest`.
- Volume tạ ngoài chỉ tính `kind=strength`. Không cộng trợ lực hoặc bodyweight vào volume.
- Cột dinh dưỡng trống nghĩa là chưa biết. `0` là giá trị đã biết bằng 0.
- Ghi Sheets bằng `RAW`, tên món và ghi chú không được thực thi thành công thức.
- `id` ổn định để sửa và hạn chế trùng. `deleted=true` là xóa mềm, có thể khôi phục bằng cách chỉnh trong Sheets hoặc bản JSON.
- Mỗi bản ghi profile là ảnh chụp cân nặng và mục tiêu tại ngày ghi; dashboard dùng bản mới nhất không nằm trong tương lai.

## Giới hạn

OAuth và Sheets thật cần cấu hình Google Cloud và tài khoản có quyền chỉnh sửa file. Chưa có AI, tải ảnh, offline sync queue hoặc import JSON. JSON hiện dùng để sao lưu/đọc bằng công cụ khác. Bản nháp chỉnh sửa được giữ khi token hết hạn trong lúc form còn mở; bản nháp form mới còn được lưu trong sessionStorage.

Sheets không có transaction/CAS cho chỉnh sửa theo ID. Code đọc lại trước khi sửa, từ chối revision đã đổi và kiểm tra lại khi mất phản hồi, nhưng không đảm bảo chống trùng tuyệt đối nếu hai thiết bị ghi cùng ID đồng thời. Dành cho một người, tránh chỉnh cùng log đồng thời. Không tự retry append sau lỗi mạng chưa rõ kết quả.

Không đưa dữ liệu ăn uống/tập luyện thật, token, Client Secret hoặc file export vào repo public.
