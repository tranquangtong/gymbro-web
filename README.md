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

## Ghi nhanh (v2)

- Ăn uống → Thêm món → **Viết nhanh**: `2 chuối, 1 whey Nuta` hoặc `3 trứng luộc không lòng đỏ`. Có thể ghi `200g đậu hũ`. App tra thư viện theo tên khớp chính xác; món lạ giữ macro trống. **Điền gọn** chỉ cần tên món và số khẩu phần. Xem trước trước khi lưu.
- Tập luyện → Thêm bài: `Chin-up trợ lực 27.2kg 3x12`, `Lat pulldown 40kg 3x12`, `Đi bộ 30 phút`, mỗi bài một dòng. Cú pháp GAS `Dumbbell curl, 10kg x2, 12` ghi một set, tổng 20kg; `10kg mỗi tay, 12` cũng dùng tổng hai tay. `10kg 3x12` là ba set, không nhân đôi kg. Điền gọn có loại bài, set/reps/kg hoặc phút.
- Nhập là parser quy tắc chạy trong trình duyệt, **không có AI/API**. Nếu câu chưa được hỗ trợ, app báo lỗi; dùng mẫu hiển thị hoặc form gọn/chi tiết.
- Thư viện riêng nằm ở `users/{uid}/FoodLibrary`. Lần đầu mở Thêm món/Thư viện sẽ khởi tạo 7 món mẫu nếu thư viện rỗng. Nút lưu mẫu bổ sung món còn thiếu, không ghi đè món đã chỉnh sửa. Có thể thêm/sửa theo nhãn sản phẩm; thay đổi chỉ áp dụng cho log mới.
- Nuta Ultimate Plant Protein: nhà sản xuất công bố **27g protein/43g** tại https://nutafood.vn/bot-protein-thuc-vat-ultilmate-plant-protein-2 (30/10/2026). Kcal/carbs/fat chưa được xác minh nên để trống; không tự lấy baseline GAS cũ hay sản phẩm Nuta khác. Alias `whey Nuta` được giữ cho tiện nhập, tên chính thức là protein thực vật.

### Ảnh bữa ăn và ChatGPT

1. Thêm ảnh/Chụp ảnh khi nhập món; hoặc bấm biểu tượng ảnh ở một món đã lưu. Tối đa 3 ảnh/món. Với nhiều món trong một lần nhập, chọn món nhận ảnh ở bản xem trước.
2. Ảnh được decode và vẽ lại qua canvas (không giữ EXIF), chuyển JPEG tối đa 1280px, chuỗi base64 không quá 360.000 ký tự. Tệp được lưu riêng ở `users/{uid}/MealPhotos/{id}`, món chứa `photo_ids`. Chỉ tải ảnh khi mở ảnh/tạo prompt; không tải toàn bộ cùng lịch sử. Browser không decode được HEIC sẽ yêu cầu chọn JPG/PNG.
3. Bấm **Ước tính với ChatGPT** → Tạo prompt → Copy prompt. Copy chỉ có chữ; dùng Chia sẻ prompt + ảnh trên browser hỗ trợ Web Share files, hoặc tải từng ảnh và đính kèm vào ChatGPT. Tên ảnh chứa ID món để đối chiếu.
4. Dán JSON ChatGPT trả về → Đọc kết quả → Xem trước → Áp dụng. App kiểm tra request_id, ngày, loại, tài khoản, đủ ID duy nhất, số hợp lệ và phiên bản log. Log đã sửa sau khi tạo prompt sẽ bị từ chối, yêu cầu tạo lại. Prompt được giữ trong sessionStorage theo tài khoản và loại để tiếp tục sau khi tải lại; sau khi áp dụng phải tạo prompt mới.
5. Tập luyện dùng cùng luồng qua **Ước tính kcal với ChatGPT**. Nhập tổng phút cả buổi nếu biết. Output `kcal_burned` lưu vào `kcal_burned_est`, là gross kcal và được gắn nhãn ước tính. Thiếu thời gian có thể trả null. Không suy thời gian từ số set, không cộng EPOC và không tính cả buổi lặp lại cho mỗi bài. Sửa bài/sets/phút hoặc lặp buổi tập sẽ xóa estimate cũ.

Không gửi dữ liệu/ảnh tự động đến ChatGPT. File ảnh chỉ gửi khi người dùng chọn trong luồng chia sẻ/đính kèm. Với Spark, bản này dùng ảnh nén trong Firestore vì Cloud Storage for Firebase yêu cầu Blaze; phù hợp quy mô cá nhân, vẫn chịu hạn mức dung lượng/đọc/ghi Firestore. Có thể chuyển ảnh sang object storage khi tăng quy mô.

Ảnh có nội dung bất biến; bỏ ảnh là gỡ tham chiếu, không hard delete tài liệu ảnh. Bản sao lưu JSON hiện chỉ gồm log và ID ảnh, **không gồm byte ảnh hoặc FoodLibrary**; tải ảnh riêng nếu cần. Chế độ local lưu ảnh trong IndexedDB và thư viện trong localStorage, tách khỏi chế độ mẫu. Không có hàng đợi ghi offline.

Publish bản `firestore.rules` mới trước khi sử dụng FoodLibrary/MealPhotos. Giữ nguyên owner/admin, không mở public reads. Không đổi billing plan.


## Bản sửa đồng bộ điện thoại (v2.0.1)

- Mỗi lần mở app mặc định khôi phục Firebase, không tiếp tục âm thầm lưu local do preference cũ. Chế độ trên thiết bị phải được chọn rõ trong phiên hiện tại và có thông báo không đồng bộ.
- Firestore realtime listeners nhận tạo/sửa/xóa mềm từ thiết bị khác trong cùng tài khoản, không cần refresh. Listener tách khi đăng xuất/đổi UID, mở dữ liệu admin khác hoặc rời trang; callback cũ không được đưa dữ liệu sang tài khoản mới. Cache ban đầu không ghi đè dữ liệu đã tải từ server.
- Kết nối được khôi phục khi có mạng, quay lại tab hoặc quay lại trang từ bộ nhớ của trình duyệt. Khi đang nhập, app không tự đóng form để refresh.
- Nút Lưu chờ Firebase xác nhận; thông báo thành công kèm email đang lưu. Khi mất mạng không báo đã đồng bộ và giữ form để lưu lại sau khi có mạng. Chưa hỗ trợ tự gửi draft offline khi chưa bấm Lưu lại.
- Nếu còn log local chưa có trên Firebase, Thêm hiển thị số lượng và nút chuyển. Dùng chính điện thoại đã tạo log để chuyển: cả byte ảnh và món quen được đưa sang trước khi nhập nhật ký. Giữ ID để chạy lại không tạo bản sao; không chuyển dữ liệu mẫu, không ghi đè mục cloud đã có và không chuyển sang tài khoản người khác khi đang mở ở Admin.
- Kiểm thử bản này bằng Node tests; không điều khiển Chrome hoặc trình duyệt của người dùng. Kiểm thử thực tế trên điện thoại được bàn giao cho người dùng.

### Test thủ công trên điện thoại

1. Tải lại https://tranquangtong.github.io/gymbro-web/ (không xóa dữ liệu trình duyệt nếu có log local). Thêm → đăng nhập đúng tài khoản Google trên cả điện thoại và máy tính; nhãn phía trên phải là Firebase · tự đồng bộ.
2. Nếu Thêm báo có log trên thiết bị, bấm Chuyển log trên thiết bị và kiểm tra email ở hộp xác nhận. Bước này thực hiện trên đúng điện thoại/trình duyệt đã nhập log cũ, không phải trên máy tính.
3. Trên điện thoại thêm 1 chuối ở ngày hiện tại → Xem trước → Lưu. Chờ thông báo đã lưu vào Firebase, đúng email. Trên máy tính mở cùng ngày, mục mới phải hiện tự động trong vài giây mà không bấm refresh.
4. Sửa khẩu phần/macro hoặc xóa mềm mục đó trên điện thoại; máy tính phải tự cập nhật. Thử thêm một bài tập có định dạng được hỗ trợ rồi kiểm tra tương tự.
5. Đóng/mở lại trang điện thoại: vẫn phải khôi phục Firebase và thấy log đã lưu. Khi app đang mở, tắt mạng, nhập rồi bấm lưu: phải báo chưa lưu và giữ nội dung; bật mạng và bấm Lưu lại, chỉ có một bản ghi.
6. Có thể đối chiếu Firestore → users → UID của tài khoản → WebMeals / WebWorkouts. Xóa là deleted:true nên tài liệu vẫn còn trong Console nhưng không xuất hiện trong nhật ký.
