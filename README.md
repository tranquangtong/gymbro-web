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

- Ăn uống → Thêm món → **Viết nhanh**: `2 chuối, 1 whey Nuta` hoặc `3 trứng luộc không lòng đỏ`. Có thể ghi `200g đậu hũ`. Mỗi lần nhập luôn tạo đúng **1 món**, giữ nguyên dấu phẩy, dấu chấm, chấm phẩy và xuống dòng trong mô tả. Ví dụ `2 chuối, 1 whey Nuta` được lưu chung một mục; app chỉ tự tính từ thư viện khi toàn bộ mô tả khớp một món quen, món phức tạp giữ macro trống để ước tính qua ChatGPT. **Điền gọn** chỉ cần tên món và số khẩu phần. Xem trước trước khi lưu.
- Tập luyện → Thêm bài: `Chin-up trợ lực 27.2kg 3x12`, `Lat pulldown 40kg 3x12`, `Đi bộ 30 phút`, mỗi bài một dòng. Cú pháp GAS `Dumbbell curl, 10kg x2, 12` ghi một set, tổng 20kg; `10kg mỗi tay, 12` cũng dùng tổng hai tay. `10kg 3x12` là ba set, không nhân đôi kg. Điền gọn có loại bài, set/reps/kg hoặc phút.
- Nhập là parser quy tắc chạy trong trình duyệt, **không có AI/API**. Nếu câu chưa được hỗ trợ, app báo lỗi; dùng mẫu hiển thị hoặc form gọn/chi tiết.
- Thư viện riêng nằm ở `users/{uid}/FoodLibrary`. Lần đầu mở Thêm món/Thư viện sẽ khởi tạo 7 món mẫu nếu thư viện rỗng. Nút lưu mẫu bổ sung món còn thiếu, không ghi đè món đã chỉnh sửa. Có thể thêm/sửa theo nhãn sản phẩm; thay đổi chỉ áp dụng cho log mới.
- Nuta Ultimate Plant Protein: nhà sản xuất công bố **27g protein/43g** tại https://nutafood.vn/bot-protein-thuc-vat-ultilmate-plant-protein-2 (30/10/2026). Kcal/carbs/fat chưa được xác minh nên để trống; không tự lấy baseline GAS cũ hay sản phẩm Nuta khác. Alias `whey Nuta` được giữ cho tiện nhập, tên chính thức là protein thực vật.

### Ảnh bữa ăn và ChatGPT

1. Thêm ảnh/Chụp ảnh khi nhập món; hoặc bấm biểu tượng ảnh ở một món đã lưu. Tối đa 3 ảnh/món. Tất cả ảnh của lần nhập được gắn vào đúng một mục món ăn đó.
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


## Đăng nhập bắt buộc & hồ sơ (v2.1.0)

Quy định ở mục này thay thế các hướng dẫn dùng local/demo ở phiên bản cũ. App không cho sử dụng khi chưa đăng nhập và đã bỏ nút dùng local/demo. Mã đọc dữ liệu local cũ chỉ được giữ cho thao tác chuyển dữ liệu có xác nhận sau khi đăng nhập và hoàn tất hồ sơ; không tạo thêm log local.

Phiên ứng dụng tối đa 14 ngày tính từ `IdTokenResult.authTime` của lần đăng nhập Firebase. Làm mới ID token, tải lại trang hoặc mở lại app không kéo dài mốc này. App tự kiểm tra khi khôi phục, khi quay lại, trước thao tác ghi/đọc trong repository, và bằng timer khi trang đang mở. Hết hạn sẽ khóa app, ngừng listener, đóng form, xóa dữ liệu tài khoản khỏi màn hình và đăng xuất. Draft được tách theo UID; không dùng thời điểm trong localStorage để tự gia hạn. Đây là chính sách của ứng dụng/SDK repository, không thay đổi vòng đời refresh token trên máy chủ Firebase.

Trước khi ghi nhật ký, tài khoản phải có cân nặng hiện tại, chiều cao, BMR, TDEE, cân nặng mục tiêu và mục tiêu tập luyện hợp lệ. Hồ sơ chỉ có cân nặng từ bản migration cũ chưa được coi là hoàn tất. Giao diện kiểm tra cả trước khi mở form và khi lưu để không bỏ qua bước này nếu hồ sơ thay đổi trên thiết bị khác. Admin giữ quyền quản lý người khác sau khi hoàn tất hồ sơ tài khoản mình.

Các field giữ tương thích với Rules đã publish: `weight_kg`, `height_cm`, `TDEE`; map `goal` chứa `bmr_kcal`, `target_weight_kg`, `training_goal`, `activity_factor`. `age` và `gender` chỉ cần nếu sử dụng helper ước tính. Hồ sơ legacy có `goal` dạng string vẫn được đọc để gợi ý mục tiêu, nhưng cần bổ sung thông tin bắt buộc.

BMR/TDEE có thể nhập thủ công. Helper cho người từ 18–100 tuổi dùng Mifflin–St Jeor (https://pubmed.ncbi.nlm.nih.gov/2305711/), ước tính REE/BMR rồi nhân hệ số vận động người dùng chọn để ước tính TDEE; không tự chọn giới tính/hệ số. Mọi kết quả đều sửa được và không tự biến thành mục tiêu ăn uống. Không cần đổi Firestore Rules cho bản cập nhật này.

### Test thủ công v2.1

1. Tải lại app, đăng xuất. Mở trực tiếp `#eat` / `#gym` / `#history`: chỉ thấy đăng nhập, không có nút dùng local/demo.
2. Đăng nhập tài khoản có hồ sơ chưa đầy đủ: app hiển thị bước Hoàn tất hồ sơ. Thử điều hướng sang Ăn uống/Tập luyện, chưa được ghi log.
3. Bấm Nhập thông tin cá nhân. Thử để trống từng field bắt buộc hoặc nhập TDEE nhỏ hơn BMR: không lưu được.
4. Nhập đủ thông tin; có thể dùng mục ước tính với tuổi/giới tính/hệ số vận động rồi sửa số. Lưu thành công → mở được nhật ký, dữ liệu được lưu Firebase.
5. Đóng/mở lại app trong 14 ngày: đăng nhập và hồ sơ được khôi phục. Vào Thêm kiểm tra hạn phiên và cập nhật hồ sơ. Không cần đăng nhập mỗi lần.
6. Mốc hết hạn 14 ngày được kiểm thử bằng test tự động với đồng hồ giả định; không cần đổi giờ hệ thống của máy hoặc chờ 2 tuần để xác nhận biên chính sách.


## Dashboard theo feedback (v2.2.0)

- Đổi tiêu đề và menu Hôm nay thành Dashboard; ngày hiện tại vẫn hiển thị dưới tiêu đề.
- Hai nút Ăn uống / Tập luyện lớn hơn, đặt giữa ngay dưới tiêu đề để dễ bấm trên điện thoại.
- Năng lượng / protein / carbs / fat hiển thị thành 4 vòng tiến độ so với mục tiêu riêng. Khi vượt: vòng và số chuyển đỏ, có chữ Vượt và phần vượt cụ thể; vòng cap ở 100% nhưng phần trăm hiển thị có thể lớn hơn 100. Không chỉ dùng màu để thông báo.
- Trong Mục tiêu → Mục tiêu dinh dưỡng, người dùng tự đặt kcal / protein / carbs / fat. Carbs và fat lưu trong `WebProfile.goal.carbs_target` / `fat_target`, tương thích Rules hiện hành. Không tự suy mục tiêu macro hoặc lấy TDEE làm mức ăn mục tiêu. Chưa đặt thì hiện Chưa đặt mục tiêu; chưa có số liệu thì hiện —. Tổng chưa đầy đủ có nhãn riêng.
- Bỏ section Tiến bộ từng bài và chart số set khỏi Dashboard. Thay bằng chart kết hợp: cột xanh là kcal ăn vào, đường cam là kcal tập luyện ước tính (gross). Mặc định 10 ngày liên tiếp gồm hôm nay; filter 7 / 10 / 28 ngày. Thiếu số liệu để trống, đường không nối qua ngày thiếu; chỉ ghi nghỉ rõ ràng mới có thể hiện 0 kcal tập luyện. Không trừ kcal tập luyện khỏi kcal ăn và không coi đó là tổng TDEE.
- Có bảng số liệu theo ngày cho người dùng điện thoại và screen reader. Dấu * là tổng chưa đủ; — là chưa biết. Dữ liệu bị xóa mềm/bỏ bữa không được cộng vào dinh dưỡng.

Test: refresh web → Dashboard, kiểm tra 4 vòng + hai nút giữa + chart mặc định 10 ngày và không còn Tiến bộ từng bài. Đặt mục tiêu trong hồ sơ, nhập lượng vượt mục tiêu để kiểm tra màu đỏ/chữ Vượt; bấm 7/10/28 để đổi khoảng ngày. Ngày thiếu data phải hiện — ở bảng chi tiết. Bản cập nhật chỉ kiểm thử bằng code, không dùng Chrome.

### Bổ sung theo ảnh mới (v2.2.1)

Dashboard mặc định Today, có nút Chọn ngày và Today để quay về hiện tại. Khi chọn ngày cũ, dữ liệu dinh dưỡng, vận động, nhật ký và điểm kết thúc khoảng biểu đồ cùng đổi theo ngày được chọn; target dùng chung hiện tại cho mọi ngày. Thêm log từ Dashboard cũng mở đúng ngày đang xem. Không chọn ngày tương lai.

Biểu đồ hiển thị số kcal trên từng cột/điểm đã biết, kể cả 0; tổng chưa đầy đủ có dấu *. Cột ăn vào dùng trục trái, đường kcal tập luyện dùng trục phải với thang đo riêng để nhìn rõ biến động. Biểu đồ dài có thể cuộn ngang trên điện thoại; bảng chi tiết vẫn có sẵn.

Test thủ công: tải lại web → Today được chọn mặc định → Chọn ngày có log cũ → đối chiếu các mục với Nhật ký → đổi 7/10/28 ngày → kiểm tra nhãn và hai trục → bấm Today quay lại hôm nay. Mở Thêm món/bài từ Dashboard ngày cũ để xác nhận ngày trong form. Kiểm thử tự động xác nhận chọn ngày, biên tuần, hồ sơ theo ngày, tọa độ trục phải và nhãn dữ liệu; không chạy trình duyệt.


### Macro và tóm tắt buổi tập (v2.3.0)

- Vòng tiến độ dùng SVG pathLength 100, dash theo % actual/target, cap 100 và giữ số % thực nếu vượt; target trống vẫn ghi rõ cần đặt target, không bịa target.
- Hồ sơ → Mục tiêu dinh dưỡng có hướng mục tiêu (gợi ý theo text mục tiêu, người dùng chọn lại được) và nút Ước tính target macro. Chỉ cập nhật form, bấm Lưu mới áp dụng. Hướng mục tiêu lưu trong goal.macro_goal, không đổi Rules.
- Preset khởi điểm cho người trưởng thành khỏe mạnh: giảm mỡ TDEE ×0,85; tăng cơ ×1,10; duy trì/sức mạnh hoặc recomp ×1. Protein 2 g/kg cân nặng hiện tại cho giảm mỡ/recomp, 1,8 g/kg cho tăng cơ/duy trì; fat 25% kcal; carbs là kcal còn lại theo 4/4/9. Làm tròn g đến 0,1; sai lệch kcal do làm tròn dưới 1 kcal. Không cộng kcal tập thêm vào TDEE. Không dùng cân nặng đích thay hiện tại.
- Các con số preset là lựa chọn triển khai, không phải số tối ưu được nghiên cứu chứng minh cho mọi cá nhân. ISSN protein: https://pubmed.ncbi.nlm.nih.gov/28642676/ ; cân bằng năng lượng: https://pmc.ncbi.nlm.nih.gov/articles/PMC5470183/ ; review tập tạ: https://pmc.ncbi.nlm.nih.gov/articles/PMC6680710/ ; fat/carbs trong giảm cân thi đấu: https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492/ . Không áp nguyên bộ chế độ thi đấu vào người tập thông thường. Theo dõi cân trung bình, sức tập 2–3 tuần để chỉnh.
- Helper cần tuổi 18–100, cân 30–250 kg, BMR và TDEE hợp lệ; ngoài phạm vi đặt thủ công. Nếu preset tạo kcal dưới BMR hoặc carbs âm, không tự đề xuất. Đây là biên thận trọng của app, không phải khẳng định BMR là ngưỡng an toàn chung cho tất cả.
- Thẻ Vận động nhận diện tên bài để gợi ý Upper body, Lower body, Full body khi có cả upper và lower, hoặc Bổ trợ / Accessory nếu chỉ có bài bổ trợ. Upper + core/face pull vẫn là Upper + Bổ trợ; thêm bài bổ trợ không tự biến thành Full body. Hiển thị nhóm cơ, tên bài, các nhóm set × kg × reps; tạ trợ lực được ghi rõ, bodyweight không hiện kg tạ ngoài. Cardio/nghỉ/unknown xử lý riêng. Đây là heuristic, chưa phải phân tích chính xác mọi tên bài tùy biến.

Test thủ công: tải lại Dashboard → Mục tiêu → bổ sung tuổi ở mục BMR/TDEE nếu thiếu → Mục tiêu dinh dưỡng → chọn hướng mục tiêu → Ước tính → xem/sửa 4 target → Lưu. Đối chiếu vòng: ăn 50% target thì tô nửa vòng, vượt thì đỏ và chữ Vượt. Chọn ngày có chin-up/pulldown để xem Upper; face pull + crunch + cable rotation để xem Bổ trợ; có thêm squat/leg press cùng upper để xem Full body. Kiểm tra các mức tạ khác nhau vẫn giữ đúng reps, tạ máy chin-up hiện trợ lực. Chỉ kiểm thử code, không chạy Chrome.


### Mục tiêu dùng chung (v2.3.2 — thay thế cách xử lý v2.3.1)

Target kcal/protein/carbs/fat hiện tại dùng cho tất cả các ngày trên Dashboard. Ngày đang xem chỉ lọc actual ăn uống, tập luyện và khoảng chart; đổi target thì các vòng ở ngày cũ cũng tính theo target mới.

Nút Mục tiêu mở hồ sơ hiện tại, không lấy ngày Dashboard làm ngày hiệu lực target. Ngày trong hồ sơ chỉ là ngày ghi thông tin cá nhân. Lưu hồ sơ đánh dấu goal.global_targets=true; bộ target mới nhất theo updated_at được dùng chung. Khi chưa có marker, app đọc bộ target legacy được cập nhật gần nhất, kể cả bộ được lưu vào ngày hồ sơ cũ; không cần migration hay đổi Rules. Xóa trắng target có chủ đích không làm sống lại giá trị cũ. Hồ sơ đã xóa mềm bị bỏ qua. Mở sửa hồ sơ cũ vẫn điền target chung hiện tại.

Test: đặt target một lần và Lưu → chọn 28/10, 29/10 và Today: mẫu số mục tiêu giống nhau, actual và phần trăm đổi theo dữ liệu từng ngày. Đổi target rồi quay lại ngày cũ: dùng target mới. Thử để trống một target và lưu: target đó hiển thị Chưa đặt mục tiêu ở mọi ngày. Realtime Firebase chuyển bộ target chung giữa các thiết bị như hồ sơ khác. Chỉ test code, không chạy Chrome.


### Kcal tập luyện trực tiếp (v2.4.0)

Khôi phục cách fallback trong `Code stable 1.legacy.txt`: bài tạ tính từng set, lấy profile MET/phút và hệ số reps/tải/volume cũ, cộng các set đúng một lần. Một dòng migration có một set chỉ tính một set. Các MET riêng từng bài và phút/set là heuristic của app legacy, không phải giá trị đo riêng cho người tập hoặc bảng Compendium nguyên bản. Có nhãn giả định và độ tin cậy thấp khi thiếu thời gian. Chin-up nhận diện như bài kéo; trợ lực/bodyweight không dùng kg làm tạ ngoài. Không giữ cách nhầm trợ lực thành tải nâng từ code cũ.

Log nhanh (text/form), log chi tiết và Lặp buổi trước tự tính kcal khi chưa có số. Không ghi phút giả định vào duration_min thực tế. Ước tính có sẵn được giữ khi tự lưu; sửa bài/sets làm mất hiệu lực estimate thì tính lại. Cân nặng ưu tiên hồ sơ tại ngày log, fallback hồ sơ hiện tại nếu ngày cũ chưa có hồ sơ; không âm thầm dùng 70 kg.

Tập luyện → Tính / cập nhật kcal → Tính kcal ngay → xem trước → Áp dụng kết quả: lưu vào Firebase và đồng bộ Dashboard; không cần ChatGPT. Tính lại chủ động có thể thay estimate cũ. Dữ liệu phải còn đúng revision/ID trước khi áp dụng để không ghi đè log đã sửa trên thiết bị khác.

Tổng phút buổi không bắt buộc. Nếu nhập, trừ phút cardio/bài có thời lượng rõ ràng rồi phân bổ phần còn lại cho các bài tạ theo tỷ trọng set. Không gán toàn bộ buổi vào mỗi ID. Cardio dùng thời lượng đã ghi: incline walking dùng công thức tốc độ/độ dốc GAS, bike dùng watts nếu có và các preset Compendium mới trong Code.gs, mặc định bike vừa 5.8 MET. Nguồn tham khảo: https://pacompendium.com/conditioning-exercise/ và https://pacompendium.com/bicycling/ . Không cộng EPOC; kcal là gross.

ChatGPT nằm trong mục tùy chọn, prompt kèm baseline + giả định và cho phép estimate từ set/reps khi chưa biết phút, bỏ yêu cầu trả null chỉ vì thiếu thời gian. JSON/ID/ngày/scope vẫn giữ để import an toàn. null chỉ dùng khi thật sự thiếu cả căn cứ tập hoặc cân nặng.

Test thủ công: tải lại → Tập luyện → chọn ngày có log cũ → Tính / cập nhật kcal → để trống tổng phút → Tính kcal ngay → xem số và mở Cách tính & giả định → Áp dụng → kiểm tra Dashboard. Thêm log mới `Lat pulldown 40kg 3x12` rồi Xem trước: có kcal ngay, lưu xong có trên Firebase. Thử một dòng một set, chin-up trợ lực, buổi có cardio + tổng phút; nếu dùng ChatGPT, tạo lại prompt để thay bản cũ có yêu cầu trả null. Không dùng Chrome để kiểm thử.

### Prompt macro gọn và đọc kết quả trên điện thoại (v2.5.0)

Prompt món ăn chỉ gửi mô tả, khẩu phần, ghi chú người dùng khi có, ảnh đánh số và macro nhãn đã biết. Không gửi UUID món/ảnh, cân nặng, macro ước tính cũ hoặc wrapper dài. Kết quả dạng `{"r":"mã-ngắn","m":[[1,510,24,45,26]]}`; mỗi dòng là [số món,kcal,protein,carbs,fat]. Mã r gắn với request đang lưu trong tài khoản/phiên; app tự nối số món với ID thật, ngày và snapshot. Kết quả có thể đổi thứ tự nhưng phải đủ món, không trùng, không vượt phạm vi. Unknown dùng null, zero dùng 0; nhãn đã biết vẫn được giữ.

Parser tiếp tục nhận JSON wrapper cũ, array các object có ID thật hoặc một object ID thật khi chỉ có một món. Hỗ trợ code fence, chữ dẫn/kết sau một khối JSON duy nhất, BOM/zero-width khi dán, smart quotes và dấu phẩy dư ở cuối object/array. Không dùng eval, không tự hoàn thiện JSON bị cắt, không sáng tác số bị thiếu. Nhiều khối JSON, sai mã prompt, thiếu/trùng món, sai tài khoản và log đã thay đổi đều bị chặn trước khi lưu. Báo lỗi riêng cho JSON có vẻ bị cắt, thiếu món và mã không khớp.

Ảnh prompt được tải/chia sẻ bằng tên ngắn monN_anhM.jpg; caption hiển thị số món để khớp. Copy vẫn chỉ có chữ. Kết quả đã dán giữ ở sessionStorage theo tài khoản/request, khôi phục khi đóng/mở lại hộp thoại trong cùng phiên; xóa bản nháp kết quả sau áp dụng thành công hoặc thay prompt. Có Nhập file JSON/TXT (tối đa 200 KB) để tránh clipboard khi cần. Không thể kết luận lỗi cũ do giới hạn/cache clipboard từ ảnh chụp; sửa nhằm giảm payload và phân biệt lỗi nhập liệu chính xác.

Test thủ công trên điện thoại: tải lại → Ăn uống → Ước tính với ChatGPT → Tạo lại prompt → Copy prompt gọn → gửi kèm ảnh tương ứng → copy toàn bộ JSON gọn trả về → Đọc kết quả → đối chiếu tên món/macro → Áp dụng. Đóng/mở lại hộp thoại trước khi áp dụng phải giữ nội dung đã dán trong cùng tab/phiên. Thử copy cả code fence/chữ dẫn vẫn đọc được; nếu chỉ copy một phần thì báo bị cắt hoặc thiếu món và không lưu. Có thể chọn file .json/.txt thay cho dán. Code test bao gồm định dạng mới/cũ, lỗi clipboard điển hình, đối chiếu ID, scope, snapshot, nhãn, 0/null. Không chạy Chrome.


### Nhận diện thanh cua / Điền gọn (v2.5.1)

Parser trước đây ăn chữ thanh trong tên thanh cua như đơn vị, rồi tìm món cua nên mất macro. Viết nhanh giờ ưu tiên khớp toàn bộ tên sau số lượng trước khi bỏ đơn vị. Điền gọn truyền tên món và số khẩu phần riêng, không chuyển thành câu để parse lại; giữ được cả tên tùy chỉnh bắt đầu bằng số. Macro lấy từ thư viện người dùng và nhân số khẩu phần; không ghi đè bằng preset mẫu.

Test: Điền gọn → thanh cua → 6 → Xem trước: 6 × thanh 20 g và preset 114 kcal, P9/C18/F0,6. Nếu đã sửa macro trong thư viện thì dùng giá trị đã sửa. Viết nhanh 6 thanh cua và 120 g thanh cua cũng ra macro; món thanh cua chiên sốt chưa có trong thư viện vẫn để trống. Không tự cập nhật các log đã lưu trước đây. Không chạy Chrome.
