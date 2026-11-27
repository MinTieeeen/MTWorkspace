# Kế hoạch Phân hệ Đồ án chuyên ngành (`/thesis`)

> Trạng thái: **chưa triển khai**. Tài liệu ghi lại kiểm kê chức năng hệ thống đồ án của trường (`project-cse.hcmut.edu.vn`), danh sách chức năng chọn lọc, kiến trúc kết nối, mô hình dữ liệu và lộ trình. Tick `[ ]` khi xong. Kết quả bước T0 (spike) ở mục 5.
>
> Liên quan: `PLAN.md` (Phân hệ 7), `SYNC_PLAN` (đồng bộ nền và thông báo, nếu đã được lưu vào repo), `UI_PLAN.md` (kiểu giao diện đang dùng).

## 0. Kết quả khảo sát trực tiếp trên hệ thống trường (27/11/2026)

Đọc bằng trình duyệt đã đăng nhập sẵn của bạn. Chỉ xem và gọi GET, **không nộp hay sửa gì**. Mục này **thay thế** các suy đoán ở mục 1 và mục 2 khi có khác biệt.

### 0.1 Giao diện dành cho sinh viên

| Màn hình | Nội dung | Thao tác ghi trên trang trường |
|---|---|---|
| Trang chủ `/` | **Đồ án của tôi** (mã, tên, tập thể hướng dẫn, sinh viên tham gia, tổ chuyên môn, ngành, đợt, tình trạng). **Đồ án còn nhận sinh viên**: danh sách chung 21 trang, có ô tìm kiếm | Xin đăng ký đề tài khác (không dùng) |
| Chi tiết đồ án `/projects/{id}` | Thẻ tóm tắt. Nút "Xem chi tiết" mở hộp **Mô tả / Yêu cầu / Tài liệu tham khảo** (yêu cầu chia **Giai đoạn 1 (ĐACN)** và **Giai đoạn 2 (LVTN/ĐATN)**). Tab **Nộp báo cáo** (Báo cáo, Báo cáo chỉnh sửa, hiện chưa có). Tab **Hội đồng** | Nộp báo cáo |
| Nội bộ `/my` → Thông báo `/my/notifications` | Danh sách thông báo, ô tìm "theo tiêu đề, nội dung", bộ lọc. Hiện rỗng | Đánh dấu đã đọc |

Menu chỉ có **Trang chủ** và **Nội bộ**. Hệ thống trường **không có** lịch họp, nhật ký, ghi chú, công việc, tài liệu. Vì vậy Cuộc họp, Ghi chú, Công việc đúng là chỗ trống mà workspace nên làm.

### 0.2 API đã xác nhận (tất cả GET, trả 200; có header ETag nhưng không hỗ trợ 304, xem 0.6)

`/auth/profile`, `/projects/my-projects`, `/projects/{id}`, `/project-batches/{batchId}/timeline`, `/project-batches/{batchId}/registered-students/me`, `/project-reports/project/{id}`, `/notifications/my/unread-count`, và **mới**: `/project-committee/projects/{id}/committee` (chỉ gọi khi mở tab Hội đồng). Mở trang chi tiết gọi 7 request.

### 0.3 Cấu trúc dữ liệu thật

- **Đồ án:** `id`, `title/description/requirements/references` (mỗi cái có `vi`, `en`), `status` (đang là `department_approved`, giao diện ghi "Đã duyệt TCM"), `rejectionReason`, `projectCustomId` (mã hiển thị kiểu `HK261-DAGD1-242`), `maxStudents`, `externalSupervisorNote`, `hasChangesFromPreviousStage` + `changesFromPreviousStageNote`, `publicNote`, `reviewerApprovalStatus` (`pending`), `projectedCommitteeApprovalStatus` (`pending`), `projectBatch` (`name`, `projectType` = `specialized_project`, `semester.name{vi,en}`, `status`, `timeline`), `supervisor` (tên, mã cán bộ, số điện thoại, bộ môn, tài khoản có email), `coSupervisors[]`, `major`, `department`, `projectStudents[]`.
- **Timeline đợt:** giá trị dạng `YYYY-MM-DDTHH:mm` **không có múi giờ** (hiểu là giờ Việt Nam), **chuỗi rỗng = chưa công bố**. Các mốc (cặp Start/End): `proposalSubmission`, `departmentReview`, `majorReview`, `studentRegistrationEnd` (chỉ có End), `midtermEvaluation`, `supervisorGradingAssignment`, `reviewerGrading`, `reportSubmission`, `reportReview`, `revisedReportSubmission`, `revisedReportReview`.
  **Hiện tại chỉ 4 mốc đầu có ngày và đều đã qua** (nộp đề cương 15/08–07/09, duyệt bộ môn đến 08/09, duyệt ngành đến 14/09, hạn đăng ký sinh viên 30/09/2026). Các mốc **giữa kỳ, chấm điểm, nộp báo cáo, phản biện, nộp bản sửa chưa được công bố**.
- **Hội đồng:** `name`, `status` (đang là `draft`), `startTime` (ISO UTC, ví dụ `2027-01-06T00:30:00.000Z` = **07:30 ngày 06/01/2027 giờ Việt Nam**), `location` (null), `locationCampus` (`CS2`), `locationRoom` (null), `language`, `department`, `chair`, `secretary`, `members[]` (mỗi người có `role` và `staff{displayName, email}`), `projectIds` (7 đề tài), `projects[]`. **Phòng chưa xếp, trạng thái nháp**, nên thông tin này còn có thể đổi.
- **Đăng ký:** `isRegisteredSuccess: true`, `isDeferred: false`. **Báo cáo:** danh sách rỗng. **Thông báo chưa đọc:** 0.

### 0.4 Ý nghĩa cho kế hoạch

1. **Thêm chức năng P0: Lịch bảo vệ (Hội đồng)** (mục 3.1, T6): ngày giờ, cơ sở và phòng, chủ tịch / thư ký / ủy viên (có email), số đề tài trong hội đồng, đếm ngược (hiện còn khoảng 40 ngày), nhãn Nháp / Chính thức. Đây là mốc quan trọng nhất đang có dữ liệu thật.
2. **Theo dõi thay đổi có giá trị thật:** hội đồng đang `draft`, chưa có phòng, nên rất có thể đổi. So sánh **mã băm nội dung** (không dựa vào ETag, xem 0.6) của endpoint hội đồng, timeline và thông báo để phát hiện: phòng được xếp, đổi giờ, nháp → chính thức, mốc nộp báo cáo vừa được công bố.
3. **Mốc chưa công bố phải có trạng thái riêng:** hiển thị "Chưa công bố" thay vì đếm ngược. Chỉ đếm ngược khi mốc có ngày. Mốc đã qua hiện "Đã xong". Mốc chính hiện tại là ngày bảo vệ.
4. **Vòng đời trạng thái đồ án:** `department_approved` (TCM duyệt) → `reviewerApprovalStatus` (phản biện duyệt) → `projectedCommitteeApprovalStatus` (hội đồng duyệt). Hiển thị dạng stepper ba bước trong thẻ Hồ sơ.
5. **Hai giai đoạn của đề tài (ĐACN và LVTN/ĐATN)** có yêu cầu riêng: tách thành checklist tiến độ hai giai đoạn trong tab Công việc (P1), tự nạp từ phần "Yêu cầu".
6. **Bỏ:** danh sách "Đồ án còn nhận sinh viên" (không liên quan).
7. **Xác thực:** cookie `auth_token` như mục 5. Trang web gọi API cùng origin nên không vướng CORS, workspace thì bắt buộc gọi phía server.

### 0.5 Kết quả theo dõi đăng nhập (đăng xuất rồi đăng nhập lại, 27/11/2026)

**Đã xác nhận** (từ nhật ký mạng của trình duyệt và đọc file JS công khai của trang, **không đọc hay ghi lại token nào**):

| Điều | Kết quả |
|---|---|
| Đăng xuất | `POST /api/auth/logout`, trả 200 và `{ messageCode }`. Sau đó trang tải lại sang `/login`. |
| Đăng nhập | Trang nạp `accounts.google.com/gsi/client` và dùng **`initTokenClient`** của Google (luồng OAuth **access token**, **không phải ID token**), rồi gọi **`POST /api/auth/google/validate`**, trả 200. Sau đó `GET /api/auth/profile` trả 200. |
| Body của request đăng nhập | JSON có đúng một trường: **`access_token`**. Gọi kèm `credentials: "include"` nên server đặt cookie `auth_token`. (Tên endpoint trước đó ghi là `/api/auth/google`; đúng là `/api/auth/google/validate`.) |
| Làm mới phiên | **Không có endpoint refresh** trong mã giao diện. Phiên chỉ là một cookie, không tự gia hạn. Khi hết hạn người dùng phải đăng nhập Google lại. |
| Header `Authorization` | Mã giao diện **không dùng**. Việc server có nhận Bearer hay không vẫn chưa kiểm chứng. |
| Các request khác | `GET /api/projects/insufficient-students?page=1&limit=10` là danh sách "Đồ án còn nhận sinh viên" (bỏ). |

### 0.6 Kết quả thử nghiệm đăng nhập bằng access token của workspace (27/11/2026, đã được bạn đồng ý)

Gọi **một lần** `POST /api/auth/google/validate` với access token Google (đã làm mới bằng refresh token) của tài khoản `@hcmut.edu.vn` đã liên kết trong workspace. Chỉ in mã trạng thái, tên trường và thuộc tính cookie; không in hay lưu token, cookie.

| Điều | Kết quả |
|---|---|
| Server trường có chấp nhận token của workspace? | **Có, trả 200.** Không kiểm tra `aud` theo client ID riêng của họ. **Workspace tự đăng nhập được, không cần bạn dán cookie.** |
| Phản hồi | JSON có hai trường `messageCode`, `user`. Cookie đặt về: `auth_token`, `Max-Age=86400`, `HttpOnly`, `Secure`, `SameSite`. |
| **Thời hạn phiên** | **24 giờ** (JWT `exp - iat` = 24,00 giờ). Không có endpoint làm mới, nên **cứ khoảng 24 giờ phải đăng nhập lại**; workspace làm tự động bằng refresh token Google. |
| Claim trong JWT | `sub`, `email`, `username`, `userType`, `studentId`, `name`, `roles`, `googleId`, `iat`, `exp`. Có `studentId` (MSSV) nên **khớp được với tài khoản myBK**. |
| Cách gửi phiên | **Cả hai đều được:** `Cookie: auth_token=...` và `Authorization: Bearer <jwt>` đều trả 200 ở `/auth/profile`. Dùng Bearer cho đơn giản. |
| Gọi dữ liệu | `/projects/my-projects` trả 200 với 1 đồ án; endpoint hội đồng trả 200. |
| **ETag / 304** | Phản hồi có header `ETag` nhưng gửi lại `If-None-Match` **vẫn trả 200, không phải 304**. **Sửa lại nhận định ở mục 0.2 và 0.4:** không dựa vào 304; phát hiện thay đổi bằng **mã băm nội dung** phản hồi. |

**Hệ quả cho kiến trúc (mục 5):** `RemoteSessionSource` trở thành cách **chính**, hoàn toàn tự động. `PastedCookieSource` bị hạ xuống dự phòng, `ManualSource` vẫn giữ để dùng khi chưa kết nối. Luồng mỗi lần đồng bộ: lấy access token Google (làm mới bằng refresh token nếu hết hạn) → `POST /auth/google/validate` → dùng JWT 24 giờ trong bộ nhớ đến lúc sắp hết hạn → gọi các GET. Không cần lưu cookie vào database.

**Yêu cầu bảo mật bắt buộc khi làm thật:** access token của workspace có các scope `gmail.modify` và `calendar.events` ngoài `openid`, `userinfo.profile`, `userinfo.email`. **Không được gửi token mang quyền Gmail / Lịch tới hệ thống trường.** Khi triển khai phải xin **một access token riêng chỉ có scope `openid email profile`** (làm mới bằng refresh token với tham số `scope` thu hẹp; **cần kiểm chứng** Google chấp nhận và server trường vẫn nhận token đó) rồi mới gửi đi. Phải có kiểm thử xác nhận token gửi đi không chứa `gmail.*` hay `calendar.*`.

**Còn chờ:** thử xin token chỉ có scope cơ bản và gọi lại `validate` (xem trên); quy định sử dụng của hệ thống trường; giá trị đầy đủ của `status`.

---

## 1. Đã kiểm chứng và chưa kiểm chứng

| Điều | Tình trạng |
|---|---|
| Danh sách endpoint, ID, dữ liệu trả về | **Lấy từ đoạn bạn dán** (kết quả gọi thử GET từ một phiên đăng nhập khác). Mình **không tự gọi lại được**: cần đăng nhập Google của bạn và cookie HttpOnly. Công cụ Chrome đang ngắt kết nối, tìm kiếm web không có tài liệu công khai nào của `project-cse.hcmut.edu.vn`. |
| Đăng nhập | Chỉ biết: `POST /api/auth/google`, phiên giữ bằng cookie HttpOnly, frontend dùng `credentials: "include"`. **Chưa biết** nội dung request (idToken? access token?), tên và thời hạn cookie. |
| Tên trường dữ liệu, giá trị `status`, định dạng mốc timeline | **Đã biết** từ khảo sát trực tiếp (mục 0.3). Còn chưa rõ: danh sách đầy đủ các giá trị của `status` và `committee.status` (mới thấy `department_approved`, `pending`, `draft`). |
| Hạ tầng workspace đã có | Google OAuth (scope `openid email profile gmail.modify calendar.events`), lưu `accessToken/refreshToken` theo `GoogleAccount` (HCMUT hoặc cá nhân), **chưa lưu `id_token`**. Có `useMybkResource`, `errorResponse`, `Modal`, `SegmentedTabs`, `Collapse`, `ExamCountdown`, `lib/ics.ts`, API đồng bộ Google Calendar. |
| Chưa có | Module Task / Ghi chú (mới nằm trong `PLAN.md` Phân hệ 3), `middleware.ts` chặn truy cập (SYNC_PLAN S0). |

## 2. Kiểm kê chức năng hệ thống đồ án của trường (suy ra từ API)

| Nhóm | Endpoint (GET) | Dữ liệu | Giá trị cho workspace | Quyết định |
|---|---|---|---|---|
| Danh tính | `/auth/profile` | MSSV, họ tên, email, lớp, `student.id` | Xác định đúng sinh viên, khớp MSSV với myBK | Dùng nội bộ |
| Hồ sơ đồ án | `/projects/my-projects`, `/projects/{id}` | Tên, mô tả, yêu cầu, tài liệu tham khảo (vi/en), trạng thái, GVHD, đồng hướng dẫn, thành viên, chuyên ngành, bộ môn, đợt đồ án | Cao: thẻ "Hồ sơ đồ án" | **P0** |
| Mốc thời gian đợt | `/project-batches/{id}/timeline` | Nộp đề cương, đăng ký, giữa kỳ, nộp báo cáo, phản biện, nộp bản sửa (cặp ngày bắt đầu/kết thúc) | Rất cao: đếm ngược, nhắc, lịch hợp nhất | **P0** |
| Hội đồng bảo vệ | `/project-committee/projects/{id}/committee` | Tên hội đồng, trạng thái (nháp), ngày giờ, cơ sở, phòng, chủ tịch / thư ký / ủy viên, số đề tài | **Rất cao:** mốc bảo vệ, có thể đổi nên cần theo dõi | **P0** |
| Trạng thái đăng ký | `/project-batches/{id}/registered-students/me` | `isRegisteredSuccess`, `isDeferred` | Thấp: một nhãn trong hồ sơ | **P0 (nhãn)** |
| Báo cáo đã nộp | `/project-reports/project/{id}`, `/project-reports/my-reports` | Danh sách báo cáo (hiện rỗng) | Trung bình: biết đã nộp hay chưa | **P1** |
| Thông báo của hệ thống | `/notifications/my`, `/notifications/my/unread-count` | Thông báo có phân trang, số chưa đọc | Cao nếu có thông báo quan trọng của GVHD/khoa | **P1** |
| Đợt đang mở, học kỳ | `/project-batches/active/list`, `/semesters` | 4 đợt đang mở, danh sách học kỳ | Thấp: chỉ lấy tên học kỳ | Chỉ dùng nội bộ |
| Bị chặn với tài khoản sinh viên (403) | `/notifications` (chung), `/students/{id}/timeline` | – | – | **Bỏ** |

Nguyên tắc: **chỉ gọi GET**, không bao giờ gọi endpoint ghi của hệ thống trường (đánh dấu đã đọc, nộp báo cáo... làm trên chính trang trường).

## 3. Danh sách chức năng chọn lọc

### 3.1 Phản chiếu từ trường (chỉ đọc, lưu cache trong Postgres, hiện "cập nhật lúc …")

| # | Chức năng | Mô tả | Ưu tiên |
|---|---|---|---|
| T1 | **Hồ sơ đồ án** | Tên đề tài (vi/en), mô tả, yêu cầu, tài liệu tham khảo, trạng thái, chuyên ngành · bộ môn, đợt và học kỳ, nhãn Đã đăng ký / Hoãn. GVHD + đồng hướng dẫn + thành viên nhóm kèm email (chép, gửi mail). | P0 |
| T2 | **Mốc thời gian + đếm ngược** | Stepper dọc các mốc của đợt (đã qua, đang diễn ra, sắp tới, **chưa công bố** khi ngày còn trống). Thẻ "Mốc tiếp theo" có đếm ngược. Hạn nộp hiện trên chip "Tiếp theo" ở header và trang Tổng quan, xuất `.ics` / Google Calendar. Nhắc trước 7, 3, 1 ngày. | P0 |
| T3 | **Thông báo của hệ thống đồ án** | Phản chiếu vào chuông thông báo của workspace và một danh sách chỉ đọc; số chưa đọc; mỗi thông báo chỉ báo một lần (khóa chống trùng). "Đã đọc" chỉ đánh dấu trong workspace. | P1 |
| T4 | **Báo cáo đã nộp** | Danh sách báo cáo đã nộp (tên, ngày nộp, trạng thái) gắn vào mốc tương ứng, để biết mốc nào đã nộp hay chưa. | P1 |
| T5 | **Theo dõi thay đổi** | Phát hiện đổi GVHD, đổi trạng thái, dời mốc, có thông báo mới; tạo thông báo cụ thể (dùng chung bộ máy ở SYNC_PLAN S3). | P1 |
| T6 | **Lịch bảo vệ (Hội đồng)** | Thẻ riêng: ngày giờ (07:30 giờ VN, đổi từ ISO UTC), cơ sở và phòng ("Chưa xếp phòng" khi trống), nhãn Nháp / Chính thức, chủ tịch / thư ký / ủy viên kèm email (chép, soạn thư), số đề tài trong hội đồng. Đếm ngược tới buổi bảo vệ, hiện ở chip "Tiếp theo" và trang Tổng quan, xuất `.ics` / Google Calendar. Theo dõi thay đổi bằng mã băm nội dung. | **P0** |

### 3.2 Workspace tự quản lý (yêu cầu của bạn, dữ liệu của riêng bạn, dùng được cả khi chưa kết nối trường)

| # | Chức năng | Mô tả | Ưu tiên |
|---|---|---|---|
| M1 | **Danh sách cuộc họp** | Xem chi tiết bên dưới (3.3). | P0 |
| N1 | **Ghi chú + Nhật ký tuần** | Xem chi tiết bên dưới (3.4). | P0 |
| K1 | **Công việc đồ án** | Bảng 3 cột Cần làm / Đang làm / Xong. Hạn, ưu tiên, checklist con, gắn vào mốc hoặc cuộc họp. Việc quá hạn tô cảnh báo. Nút chuyển cột (kéo thả để sau). | P0 |
| L1 | **Tài liệu & liên kết** | Lưới liên kết có phân loại: repo GitHub, Drive, Overleaf, Figma, bài báo. Tự thêm các tài liệu tham khảo từ hồ sơ trường. Mở nhanh, hiện favicon. | P0 |
| D1 | **Mốc cá nhân** | Thêm mốc riêng chen vào stepper (vd "Nộp bản nháp cho GVHD thứ 6"), cùng đếm ngược và nhắc như mốc của trường. | P0 |
| C1 | **Checklist nộp bài** | Theo từng mốc: đề cương → báo cáo giữa kỳ → báo cáo cuối kỳ → slide → bản sửa sau phản biện. Mỗi mốc có danh sách việc cần chuẩn bị tick được; nếu có dữ liệu báo cáo (T4) thì tự tick "đã nộp trên hệ thống". | P1 |
| P1 | **Liên hệ nhanh** | GVHD và thành viên: email (chép / soạn thư Gmail), thêm SĐT, Zalo tự nhập. | P1 |
| Q1 | **Câu hỏi chuẩn bị phản biện** | Ngân hàng câu hỏi dự kiến + câu trả lời ngắn, luyện tập ngẫu nhiên. | P2 |
| E1 | **Xuất nhật ký thành báo cáo** | Gộp nhật ký tuần thành tài liệu Markdown / PDF để gửi GVHD hoặc làm phụ lục. | P2 |
| S1 | **Chia sẻ với nhóm** | Chia sẻ biên bản và công việc với thành viên (cần tài khoản nhiều người, ngoài phạm vi hiện tại). | P2 |

### 3.3 Chi tiết "Cuộc họp"

- **Thông tin:** tiêu đề, loại (Họp GVHD / Họp nhóm / Báo cáo giữa kỳ / Khác), ngày giờ bắt đầu và kết thúc, hình thức (trực tiếp: phòng và cơ sở; trực tuyến: đường dẫn Meet, Zoom), người tham dự (chọn từ GVHD và thành viên, thêm tay), trạng thái Sắp tới / Đã họp / Hủy.
- **Trước họp:** *Chương trình* dạng checklist. Mục "Đã làm từ lần họp trước" **tự điền** từ các công việc chuyển sang Xong kể từ cuộc họp gần nhất, và "Câu hỏi cho GVHD" từ ghi chú đổ thẳng vào chương trình, để báo cáo nhanh.
- **Trong và sau họp:** *Biên bản* (Markdown), nhận xét và yêu cầu của GVHD, kết luận. *Việc cần làm*: mỗi dòng `- [ ]` trong biên bản chuyển được thành công việc (K1) có hạn, gắn với cuộc họp.
- **Lặp lại:** họp định kỳ hằng tuần (tạo cả chuỗi), sửa riêng một buổi.
- **Nhắc và lịch:** nhắc trước 1 ngày / 1 giờ qua chip "Tiếp theo" và thông báo; xuất Google Calendar (theo mẫu `src/app/api/exams/google-calendar/route.ts`) và `.ics` (thêm `buildMeetingIcs` vào `src/lib/ics.ts`).
- **Giao diện:** danh sách chia nhóm **Sắp tới** (mở sẵn) và **Đã họp** (theo mẫu trang Lịch thi, dùng `Collapse`); bấm một cuộc họp mở modal chia 3 tab **Chương trình | Biên bản | Việc cần làm** (theo mẫu `curriculum-course-modal.tsx`). Nhãn "Lần họp thứ N", "cách lần trước N ngày".

### 3.4 Chi tiết "Ghi chú"

- **Loại:** Ghi chú tự do, **Nhật ký tuần** (mẫu có sẵn: *Đã làm / Khó khăn / Kế hoạch tuần tới*), Ý tưởng, Câu hỏi cho GVHD.
- Markdown có xem trước, ghim, thẻ (tag), gắn vào cuộc họp hoặc mốc, tìm không phân biệt dấu (`normalizeSearch` trong `src/lib/format.ts`), tự lưu nháp.
- Một dòng checklist chuyển được thành công việc chỉ bằng một lần bấm.
- Mỗi tuần tự gợi ý tạo Nhật ký tuần nếu chưa có.

## 4. Bố cục giao diện

- Thêm mục **"Đồ án"** vào dock (nhóm Học tập), file `src/components/layout/nav-items.ts`: icon `FolderKanban`, màu nhận diện dịu dạng teal (`hue` khoảng `180 38% 46%`, đúng độ bão hòa thấp như 5 mục hiện có). Trang `/thesis` dùng `SegmentedTabs`:
  **Tổng quan | Cuộc họp | Công việc | Ghi chú | Tài liệu**.
- **Tab Tổng quan** (hai cột như trang Lịch thi): trái là thẻ "Mốc tiếp theo" có đếm ngược (khái quát hóa `ExamCountdown` thành `Countdown`) cùng stepper các mốc; phải là thẻ Hồ sơ đồ án (tên, GVHD, nhóm, trạng thái), cuộc họp sắp tới, công việc sắp đến hạn, thông báo mới từ trường.
- Chưa kết nối trường: tab Tổng quan hiện `ConnectPrompt` kèm lựa chọn **Nhập tay thông tin đồ án** (xem mục 5), các tab còn lại **vẫn dùng bình thường**.
- Trang Tổng quan (`/`): thêm một thẻ gọn "Đồ án" (mốc tiếp theo, cuộc họp kế tiếp, số việc đến hạn). Chip "Tiếp theo" ở header gồm cả cuộc họp và mốc đồ án. Bảng lệnh Ctrl K tìm được cuộc họp, ghi chú, công việc.

## 5. Kiến trúc kết nối (cần một bước spike trước khi làm)

Dùng một **bộ chuyển đổi nguồn dữ liệu** để giao diện không phụ thuộc cách đăng nhập: `ProjectSource` có các cài đặt `RemoteSessionSource`, `PastedCookieSource`, `ManualSource`, đều trả về cùng một kiểu dữ liệu đã chuẩn hóa. Việc gọi luôn chạy **phía server** (cookie HttpOnly và CORS khiến trình duyệt không gọi trực tiếp được), kết quả lưu vào Postgres theo kiểu offline-first như myBK, lỗi đi qua `errorResponse` (`src/lib/api-error.ts`) và hiển thị bằng `useMybkResource`.

### Kết quả T0 (làm ngày 27/11/2026, hoàn thành một phần)

**Đã xác nhận** (từ ảnh Cookies và request bạn gửi, cùng vài request không đăng nhập mình thử, chỉ đọc):

| Điều | Kết quả |
|---|---|
| Cơ chế xác thực | **Chỉ bằng cookie** `auth_token`. Request GET của bạn không có header `Authorization`, chỉ có `credentials: "include"`. |
| Cookie `auth_token` | **JWT ký HS256** (phần đầu đọc được `{"alg":"HS256","typ":"JWT"}`), chỉ của host `project-cse.hcmut.edu.vn`, Path `/`, **HttpOnly, Secure, SameSite=Strict**, 451 byte. Hạn dùng ghi năm **2026**, trong khi các cookie theo dõi hết hạn 2027, nên phiên này **ngắn hơn**; ngày giờ chính xác bị cắt trong ảnh. |
| Cookie khác | `_ga`, `_fbp`, `_gcl_au`, `_ttp`, `ttcsid`… chỉ là cookie theo dõi, **không cần gửi**. `i18nextLng=vi` chỉ là ngôn ngữ. |
| Ai ký token | **Chính hệ thống trường ký** (khóa bí mật của họ). Workspace **không thể tự tạo** token, phải lấy qua đăng nhập (`POST /api/auth/google`) hoặc do bạn cung cấp. |
| Gọi từ server | `HttpOnly`, `Secure`, `SameSite` chỉ ràng buộc **trình duyệt**. Server của workspace tự gắn `Cookie: auth_token=...` vào request được. |
| Truy cập mạng | Máy này gọi được `project-cse.hcmut.edu.vn` (nginx + Express, lỗi dạng NestJS `{statusCode, timestamp, path, message}`). Không có cookie trả **401**. |
| CORS | Có `access-control-allow-credentials: true` nhưng **không cho origin `http://localhost:3000`**. Trình duyệt của workspace không gọi trực tiếp được, **bắt buộc gọi phía server**. Bookmarklet cũng sẽ bị CORS chặn khi đẩy dữ liệu về, nên hạ xuống P2 (chỉ làm kiểu sao chép JSON). |
| Header được phép | `Content-Type, Authorization, X-Requested-With`. **Có thể** server cũng nhận `Authorization: Bearer <jwt>` (chưa kiểm chứng). |
| ETag | Có header `ETag` nhưng **không hỗ trợ 304** khi gửi `If-None-Match` (đã thử, xem 0.6). Phát hiện thay đổi bằng mã băm nội dung. |

**Kết luận một phần:** `PastedCookieSource` **khả thi về kỹ thuật** (chỉ cần cookie `auth_token`). Có dùng lâu dài được hay không còn phụ thuộc **thời hạn phiên** và việc workspace **có tự đăng nhập được** hay không, hai điều này **chưa biết**.

**Ba câu hỏi còn lại của bước T0 đều đã được trả lời (xem mục 0.5 và 0.6):**
1. **Đã xong (mục 0.5, 0.6):** đăng nhập là `POST /api/auth/google/validate` với body `{ access_token }`, và **server trường chấp nhận access token của workspace**.
2. **Đã xong (mục 0.6):** phiên **24 giờ**.
3. **Đã xong (mục 0.6):** nhận **cả cookie lẫn Bearer**.

Lệnh chạy trên máy bạn cho mục 2 và 3 (token chỉ nằm trong biến môi trường, chỉ in claim, ngày hết hạn và mã trạng thái):

```powershell
# Lấy giá trị ở DevTools > Application > Cookies > auth_token. Token là bí mật như mật khẩu: không dán vào chat.
$env:CSE_TOKEN = Read-Host "Dán giá trị auth_token"
# (a) Tên các claim + ngày hết hạn + thời lượng phiên
node -e "const p=JSON.parse(Buffer.from(process.env.CSE_TOKEN.split('.')[1],'base64url'));console.log(Object.keys(p).join(','),'| hết hạn:',new Date(p.exp*1000).toLocaleString('vi-VN'),'| thời lượng:',((p.exp-p.iat)/3600).toFixed(1)+'h')"
# (b) Server nhận cookie?
curl.exe -s -o NUL -w "cookie: %{http_code}\n" -H "Cookie: auth_token=$env:CSE_TOKEN" https://project-cse.hcmut.edu.vn/api/auth/profile
# (c) Server nhận Bearer?
curl.exe -s -o NUL -w "bearer: %{http_code}\n" -H "Authorization: Bearer $env:CSE_TOKEN" https://project-cse.hcmut.edu.vn/api/auth/profile
Remove-Item Env:CSE_TOKEN
```

Bạn chỉ cần gửi lại: dòng in ra của (a), hai dòng `cookie:` và `bearer:` (chỉ là số như 200 hoặc 401), và tên các trường của request `POST /api/auth/google`. Sau đó cần thêm một mẫu JSON (che thông tin cá nhân) của `/projects/{id}` và `/project-batches/{id}/timeline` để chốt tên trường dữ liệu.

**Cây quyết định (là suy luận, chưa kiểm chứng):**

| Kết quả spike | Cách làm |
|---|---|
| Server nhận **access token** rồi tự gọi userinfo của Google **(ĐÃ XÁC NHẬN: trang dùng access token và server chấp nhận token của workspace, xem 0.6)** | Dùng chính `accessToken` của tài khoản HCMUT đã liên kết trong workspace (làm mới bằng `refreshToken` sẵn có). Tự đăng nhập và tự làm mới, đồng bộ nền được (xem SYNC_PLAN). |
| Server nhận **ID token** xác minh `aud` theo client ID của họ | Token do OAuth client của workspace cấp sẽ có `aud` khác nên **bị từ chối**. Chọn `PastedCookieSource` hoặc `ManualSource`. |
| Chỉ chạy được qua trang của họ | `PastedCookieSource`: bạn dán cookie phiên (lấy từ DevTools, vì HttpOnly nên không lấy được bằng JS), lưu mã hóa bằng `CREDENTIAL_KEY`; hết hạn thì báo "Cần đăng nhập lại". Hoặc dùng bookmarklet chạy trong tab đã đăng nhập rồi đẩy JSON về workspace (P2). |
| Luôn khả dụng | `ManualSource`: nhập tay tên đề tài, GVHD, thành viên, các mốc. Giữ cho phân hệ dùng được kể cả khi không có kết nối. |

**An toàn:** chỉ GET, tối đa 1 lần / 15 phút / loại dữ liệu, ghi log; không lưu cookie dạng văn bản thường; kiểm tra điều khoản sử dụng của hệ thống trường; hiển thị rõ nguồn và thời điểm cập nhật. Các API mới phải nằm sau lớp chặn truy cập (SYNC_PLAN S0) vì dữ liệu đồ án và cookie phiên là nhạy cảm.

## 6. Mô hình dữ liệu (phác thảo Prisma)

Dùng bảng **chung** cho Ghi chú, Công việc, Liên kết với cột `projectId` có thể trống, để sau này trang Công việc / Ghi chú tổng quát (PLAN.md Phân hệ 3) tái sử dụng, không làm bảng riêng cho đồ án.

```prisma
model ThesisProject {            // bản phản chiếu hoặc nhập tay
  id            String   @id @default(cuid())
  userId        String
  remoteId      String?  @unique        // id ở hệ thống trường
  source        String   @default("REMOTE")   // REMOTE | MANUAL
  titleVi       String?
  titleEn       String?
  descriptionJson String? @db.Text      // vi/en
  requirementsJson String? @db.Text
  referencesJson  String? @db.Text
  status        String?
  supervisorJson  String? @db.Text
  coSupervisorsJson String? @db.Text
  membersJson   String?  @db.Text
  major         String?
  department    String?
  batchId       String?
  semesterCode  String?
  isRegistered  Boolean?
  isDeferred    Boolean?
  fingerprint   String?                 // phát hiện thay đổi
  syncedAt      DateTime?
  milestones    ThesisMilestone[]
  meetings      ThesisMeeting[]
  committee     ThesisCommittee?
}

model ThesisMilestone {
  id        String   @id @default(cuid())
  projectId String
  source    String   // SCHOOL | PERSONAL
  key       String   // vd proposalSubmission, midterm, reportSubmission...
  title     String
  startAt   DateTime?
  endAt     DateTime?
  doneAt    DateTime?
  project   ThesisProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model ThesisCommittee {          // hội đồng bảo vệ (chỉ phản chiếu từ trường)
  id          String   @id @default(cuid())
  projectId   String   @unique
  remoteId    String?
  name        String
  status      String               // draft | ... (giá trị lạ hiển thị nguyên văn)
  startAt     DateTime?            // đổi từ ISO UTC
  campus      String?              // vd CS2
  room        String?
  language    String?
  chairJson   String?  @db.Text    // { name, email }
  secretaryJson String? @db.Text
  membersJson String?  @db.Text
  projectCount Int?
  contentHash String?              // mã băm nội dung phản hồi, dùng phát hiện thay đổi
  syncedAt    DateTime?
  project     ThesisProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model ThesisMeeting {
  id          String   @id @default(cuid())
  projectId   String
  kind        String   // SUPERVISOR | TEAM | MIDTERM | OTHER
  title       String
  startAt     DateTime
  endAt       DateTime?
  mode        String   // IN_PERSON | ONLINE
  location    String?
  meetUrl     String?
  attendeesJson String? @db.Text
  agendaMd    String?  @db.Text
  minutesMd   String?  @db.Text
  status      String   @default("PLANNED") // PLANNED | DONE | CANCELLED
  recurrence  String?                       // RRULE
  gcalEventId String?
  project     ThesisProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model Task {                       // chung, dùng cho đồ án và sau này cho toàn workspace
  id          String   @id @default(cuid())
  userId      String
  projectId   String?
  meetingId   String?
  milestoneId String?
  title       String
  descriptionMd String? @db.Text
  status      String   @default("TODO")  // TODO | DOING | DONE
  priority    Int      @default(0)
  dueAt       DateTime?
  checklistJson String? @db.Text
  sortOrder   Int      @default(0)
  doneAt      DateTime?
}

model Note {                       // chung
  id        String   @id @default(cuid())
  userId    String
  projectId String?
  meetingId String?
  kind      String   @default("NOTE") // NOTE | WEEKLY_LOG | IDEA | QUESTION
  title     String
  bodyMd    String   @db.Text
  tagsJson  String?  @db.Text
  pinned    Boolean  @default(false)
  weekOf    DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model ResourceLink {               // chung
  id        String   @id @default(cuid())
  userId    String
  projectId String?
  kind      String   // REPO | DRIVE | DOC | DESIGN | PAPER | OTHER
  title     String
  url       String
}
```

Thông báo của trường: dùng lại `AcademicSyncNotification` với `category = "THESIS"` và `dedupeKey` (cột được thêm ở SYNC_PLAN S3). Kết nối và phiên: `ProjectCseConnection { userId, authMode, encryptedSession, sessionExpiresAt, authState, lastSyncedAt, lastError }`.

## 7. Tích hợp với phần đã có

| Phần có sẵn | Cách tích hợp |
|---|---|
| Header: chip "Tiếp theo" (`src/components/layout/next-up-chip.tsx`) | Thêm sự kiện: cuộc họp và hạn nộp của đồ án |
| Bảng lệnh (`command-palette.tsx`) | Tìm cuộc họp, ghi chú, công việc, mốc |
| Tổng quan (`src/app/page.tsx`) | Thẻ "Đồ án" gọn |
| Lịch / xuất lịch (`src/lib/ics.ts`, API Google Calendar) | Thêm `buildMeetingIcs`, `buildMilestoneIcs` và đồng bộ cuộc họp lên Google Calendar |
| Thông báo (SYNC_PLAN S4) | Nguồn thông báo mới: THESIS, nhắc cuộc họp và hạn nộp |
| Gmail | (Sau) "Tạo ghi chú / công việc từ email của GVHD" theo `PLAN.md` mục 5 |
| Kiểu giao diện | `Modal`, `SegmentedTabs`, `Collapse`, `Badge`, `Card`, `state.tsx`, `useMybkResource`, `lib/grades.ts` không đụng tới |

## 8. Lộ trình

- [x] **T0 Spike:** xong (mục 0). Workspace tự đăng nhập được bằng access token Google, phiên 24 giờ, nhận cả cookie và Bearer. **Việc phải làm ở T1:** xin token **chỉ có scope `openid email profile`** để gửi cho trường (xem 0.6).
- [x] **T1 Nền tảng (xong 27/11/2026; chờ bạn thử đồng bộ thật bằng tài khoản HCMUT):** (gồm `RemoteSessionSource` tự đăng nhập bằng token scope hẹp) model Prisma, `src/lib/thesis/` (kiểu, bộ chuyển đổi nguồn, chuẩn hóa), API `/api/thesis/*` có `errorResponse`, mục "Đồ án" trong dock, khung trang `/thesis`, `ManualSource`.
- [ ] **T2 Hồ sơ + mốc + lịch bảo vệ:** thẻ hồ sơ (stepper ba bước duyệt), stepper mốc (có trạng thái "Chưa công bố"), thẻ Hội đồng, đếm ngược, mốc cá nhân, nhắc, `.ics`.
- [x] **T3 Cuộc họp (xong 27/11/2026; chưa làm: đồng bộ Google Calendar, nhắc, xem trước Markdown):** CRUD, chương trình, biên bản, việc cần làm, lặp lại, Google Calendar.
- [x] **T4 Công việc + Ghi chú + Liên kết (xong 27/11/2026; chưa làm: kéo thả, xem trước Markdown):** bảng 3 cột, nhật ký tuần, lưới liên kết.
- [~] **T5 Tích hợp (phạm vi đã thu hẹp 28/11/2026):** chỉ làm thẻ "Nhắc họp đồ án" trên trang Tổng quan (`src/components/dashboard/thesis-meeting-reminder.tsx`, dùng kiểu `ReminderItem` độc lập nguồn để gộp vào tính năng Lịch sau này). KHÔNG làm: chip "Tiếp theo", Ctrl K, thông báo từ trường, checklist nộp bài.
- [ ] **T6 P2:** câu hỏi phản biện, xuất báo cáo, kéo thả, bookmarklet.

Phụ thuộc: lớp chặn truy cập (SYNC_PLAN S0) trước khi đưa lên mạng; `CREDENTIAL_KEY` trước khi lưu cookie phiên.

## 9. Kiểm tra

- **Không cần đăng nhập trường:** dùng `ManualSource` và bộ dữ liệu mẫu (`fixtures/thesis/*.json`, dựng theo mẫu JSON thật lấy ở bước spike) để chạy trang đầy đủ.
- `npx tsc --noEmit` sạch; `curl` các route `/api/thesis/*` trả 200 / đúng mã lỗi; không dùng `next build` khi server dev đang chạy.
- Trạng thái: chưa kết nối, hết phiên (cần đăng nhập lại), lỗi mạng, chưa có đồ án, đã có dữ liệu đã lưu; các tab Cuộc họp, Công việc, Ghi chú vẫn dùng được khi trường lỗi.
- Luồng chính: tạo cuộc họp → viết biên bản có `- [ ]` → chuyển thành công việc → công việc hiện ở Tổng quan; tạo họp lặp hằng tuần; xuất Google Calendar và `.ics`; chip "Tiếp theo" nhận cuộc họp; thông báo của trường không báo trùng; tìm Ctrl K ra cuộc họp.
- Bảo mật: chưa đăng nhập workspace thì `/api/thesis/*` trả 401; cookie phiên không xuất hiện ở bất kỳ phản hồi nào gửi về trình duyệt.

## 10. Rủi ro và câu hỏi mở

- **Đã giải quyết:** server trường chấp nhận access token do workspace cấp (0.6). Rủi ro còn lại: phải dùng token **scope hẹp** để không đưa quyền Gmail / Lịch cho hệ thống ngoài; và trường có thể đổi cách xác thực về sau (khi đó chuyển về `PastedCookieSource` hoặc `ManualSource`).
- Dùng tài khoản và cookie của bạn để gọi hệ thống trường cần phù hợp quy định sử dụng của trường; tần suất gọi thấp, chỉ đọc.
- Đồ án của bạn là **nhóm hay cá nhân**? (`projectStudents[]` là danh sách) → quyết định có cần mục thành viên và chia sẻ (S1) hay không.
- GVHD họp với bạn **bao lâu một lần** và qua kênh nào? → mẫu họp lặp lại mặc định.
- Bạn muốn nhận nhắc qua kênh nào (chuông trong app, Google Calendar, Telegram theo SYNC_PLAN)?
- Danh sách đầy đủ các giá trị `status` (đồ án, hội đồng) chưa biết; mới quan sát được `department_approved`, `pending`, `draft`. Giao diện phải chịu được giá trị lạ (hiển thị nguyên văn).
