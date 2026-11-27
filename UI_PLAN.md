# Kế hoạch làm lại giao diện MTWorkspace

> Trạng thái: Giai đoạn 0, 1, 1B (logo + favicon) và 2 (animation) đã xong. Tiếp theo: Giai đoạn 3 (từng màn hình). Bước đầu tiên khi được duyệt: sao chép nguyên văn file này vào repo thành `UI_PLAN.md` (cạnh `PLAN.md`) để theo dõi. Mỗi mục có ô `[ ]`, tick khi xong.

## Bối cảnh

Giao diện hiện tại có các vấn đề: nhiều thông tin bị lặp, chữ quá nhỏ và nhiều màu gây nhiễu, chữ đậm bị lỗi dấu tiếng Việt, lỗi API bị bỏ qua im lặng, modal không có hiệu ứng. Mục tiêu là giao diện **tinh gọn, chỉ giữ thông tin cần thiết, thân thiện**, có **bộ font riêng có cá tính**, **animation chuyển cảnh nhất quán** và **xử lý lỗi rõ ràng ở từng màn hình**.

### Nguyên nhân gốc đã xác định

| # | Vấn đề | Vị trí |
|---|---|---|
| 1 | **Lỗi font chữ đậm**: `Outfit` (heading, `font-display`/`font-heading`) chỉ nạp subset `latin, latin-ext`, không có `vietnamese`, nên chữ có dấu rơi về font dự phòng. | `src/app/layout.tsx:14-18` |
| 2 | **Bảo mật**: iframe hiển thị HTML email không có `sandbox`. `srcDoc` chạy cùng origin với app nên có rủi ro XSS. | `src/app/mail/page.tsx:557` |
| 3 | Lỗi bị nuốt: `catch {}` / `if (!res.ok) return` ở mọi trang. API đã trả `connected`, `isStale`, `lastSyncedAt`, `error` nhưng client không dùng. | tất cả trang |
| 4 | 7 modal tự viết lại cùng một khung: không có ESC, không khóa cuộn, không có hiệu ứng. `backdrop-blur-xs` không tồn tại trong Tailwind 3.4. `py-0.2` là class không hợp lệ. | `src/components/mybk/*-modal.tsx` |
| 5 | Helper bị chép lặp, mỗi bản ra kết quả khác nhau: `getCurrentIsoWeekClient`, `DAY_LABELS/DAY_NAMES`, `formatCampus*`, `buildIcs*`. | `app/page.tsx`, `timetable`, `exams`, các modal, `api/exams/google-calendar` |
| 6 | Dark mode dựa vào khoảng 150 dòng CSS ghi đè class Tailwind. Theme được bật trong `useEffect` nên trang nháy nền sáng khi tải. | `src/app/globals.css`, `components/layout/theme-toggle.tsx` |
| 7 | `text-[10px]/[11px]` ở khắp nơi, sidebar có 8 màu icon, mỗi card hover một màu viền riêng. | toàn bộ |
| 8 | Nút giả (Tìm kiếm Ctrl K, Tạo việc, Cài đặt) không có `onClick`. Link sidebar `/#calendar`, `/#tasks`, `/#notes` không trỏ tới đâu. | `layout/header.tsx`, `layout/sidebar.tsx` |

---

## Bộ font mới (đã kiểm tra hỗ trợ tiếng Việt trong `next/font` font-data.json)

| Vai trò | Font | Lý do |
|---|---|---|
| **Heading / chữ đậm** | **Bricolage Grotesque** (variable, trục `opsz` + `wdth` + `wght`, subset `vietnamese`) | Grotesque có cá tính, hơi "editorial". Trục optical size giúp tiêu đề lớn sắc nét, cỡ nhỏ vẫn dễ đọc. Dấu tiếng Việt chuẩn ở 600–700. |
| **Body / UI** | **Mona Sans** (variable, trục `wdth` + `wght`, subset `vietnamese`) | Font sans của GitHub, thiết kế cho giao diện công cụ và workspace. Trục width cho phép dùng bản hơi hẹp ở bảng dày dữ liệu. Phối tốt với Bricolage. |
| **Số / mã môn / giờ** | **IBM Plex Mono** (400/500/600, subset `vietnamese`) | Mono có chất kỹ thuật, số rõ. Dùng kèm `tabular-nums` cho đếm ngược và điểm. |

Thay thế Plus Jakarta Sans, Outfit, JetBrains Mono. Quy tắc độ đậm: body 400/500, nhấn 600, heading 600–700. Không dùng 800 nữa.

```ts
// src/app/layout.tsx
const display = Bricolage_Grotesque({ subsets: ["latin","vietnamese"], variable: "--font-display", axes: ["opsz","wdth"], display: "swap" });
const sans    = Mona_Sans({ subsets: ["latin","vietnamese"], variable: "--font-sans", axes: ["wdth"], display: "swap" });
const mono    = IBM_Plex_Mono({ subsets: ["latin","vietnamese"], weight: ["400","500","600"], variable: "--font-mono", display: "swap" });
```
`tailwind.config.ts`: `sans → var(--font-sans)`, `display`/`heading → var(--font-display)`, `mono → var(--font-mono)`.

---

## Giai đoạn 0: Sửa nóng (ĐÃ XONG, build sạch) (nhỏ, giá trị cao)

- [x] Đổi bộ font như trên (`layout.tsx`, `tailwind.config.ts`).
- [x] iframe email: `sandbox="allow-popups allow-popups-to-escape-sandbox"` (không `allow-scripts`, không `allow-same-origin`), thêm `<base target="_blank">` và meta CSP trong `srcDoc`.
- [x] Chống nháy theme: script inline trong `<head>` đọc `localStorage["mt-theme"]` và đặt class `dark` trước khi paint.
- [x] Bug đếm ngược Dashboard (`app/page.tsx`): `Math.floor(diff/86400000)` khiến ca thi ngày mai hiện "Hôm nay". Đổi sang tính theo ngày lịch: "Hôm nay / Ngày mai / Còn N ngày".
- [x] Thay `backdrop-blur-xs` bằng `backdrop-blur-sm`, `py-0.2` bằng `py-px`.

## Giai đoạn 1: Nền tảng dùng chung

**1.1 Thang thiết kế**
- [x] Cỡ chữ: đã bỏ mọi cỡ dưới 12px (105 chỗ → `text-xs`). Chuẩn hóa dần 13/14/16 khi làm từng màn hình ở Giai đoạn 3.
- [ ] Bo góc/viền hover: các component mới đã theo chuẩn (`rounded-2xl`/`rounded-lg`); trang cũ sẽ đồng bộ ở Giai đoạn 3.

**1.2 Token màu theo ngữ nghĩa** (`globals.css` + `tailwind.config.ts`)
- [x] `--success / --warning / --danger / --info`, kèm 6 token `--subject-1..6`, mỗi token có bản light/dark.
- [ ] Thay dần `bg-sky-500/10`… bằng token (đã xong: màu môn học, toast, badge, state). Khối "Tone Tamer" vẫn giữ cho tới khi Giai đoạn 3 thay hết các trang.

**1.3 Component UI** (`src/components/ui/`)
- [x] `modal.tsx`: portal, ESC, khóa cuộn body, focus trap, `aria-modal`, animation vào/ra (giữ mounted thêm 180ms với `data-state="closing"` rồi mới unmount). Mỗi modal hiện tự có `mounted` + `createPortal` + overlay riêng; đổi thành `<Modal open onClose size>` bọc phần thân. Thay khung của cả 7 modal (`course-detail`, `curriculum-course`, `exam-detail`, `exam-google-calendar`, `google-calendar-sync`, `mybk-connect`, `schedule-detail`).
- [x] `segmented-tabs.tsx`: pill nền trượt theo tab active.
- [x] `button.tsx` (cva: primary/secondary/ghost, size sm/md, có trạng thái loading), `select.tsx`, `badge.tsx`, `card.tsx` (header + action slot).
- [x] `state.tsx`: `EmptyState`, `ErrorState` (có Thử lại), `StaleBanner` ("Cập nhật lúc 14:20 · Làm mới"), `ConnectPrompt`.
- [x] `toast.tsx` (đã có): thêm animation ra + thanh thời gian. Hỗ trợ action "Hoàn tác" (đã có `action.onClick`).

**1.4 Gom helper**
- [x] `src/lib/format.ts`: `DAY_LABELS`, `getCurrentIsoWeek`, `getDateForDayInWeek`, `formatCampus` (một chuẩn duy nhất: "CS1 · Lý Thường Kiệt" / "CS2 · Dĩ An"), `formatDateVi`, `relativeDayLabel`.
- [x] `src/lib/ics.ts`: chuyển `buildIcsContent` (timetable) và `buildExamIcsContent` (exams) vào, cùng hàm `downloadIcs`.
- [x] `src/lib/subject-colors.ts`: chuyển `SUBJECT_COLOR_STYLES` từ `timetable/page.tsx` sang token.
- [x] Sửa các file đang chép lặp sang import (kể cả `api/exams/google-calendar/route.ts`).

**1.5 Hook dữ liệu**: `src/lib/use-mybk-resource.ts`
- [x] Trả `{ status: "loading"|"ready"|"empty"|"not-connected"|"sso-expired"|"error", data, isStale, lastSyncedAt, error, retry, refresh }`.
- [x] `AbortController` để chống race khi đổi học kỳ nhanh.
- [x] Giữ luồng SWR hiện có: đọc DB trước, sau đó `revalidate=1`.
- [x] Cache theo module (Map) để tab Tiến độ dùng chung dữ liệu timetable/exams, không gọi lại.
- [x] API (`api/mybk/*/route.ts`, `api/gmail/*`) thống nhất trả `{ error, code }` với `code ∈ NOT_CONNECTED | SSO_EXPIRED | UPSTREAM | UNKNOWN`. Khi lỗi nhưng còn bản lưu thì vẫn trả `fallback` (đã có sẵn `getStored*`) kèm `isStale: true`.

### Ma trận trạng thái (áp dụng mọi màn hình myBK/Gmail)

| Trạng thái | Hiển thị |
|---|---|
| Tải lần đầu | Skeleton đúng bố cục (`ui/skeleton.tsx` đã có), crossfade sang nội dung |
| Đồng bộ ngầm | Icon xoay nhỏ ở toolbar, không chặn UI |
| Chưa kết nối | `ConnectPrompt` + nút "Kết nối myBK / Google" |
| SSO/Token hết hạn | Banner vàng + "Đăng nhập lại" (mở `MyBkConnectModal`) |
| Lỗi, có cache | Hiện cache + `StaleBanner` + Thử lại |
| Lỗi, không cache | `ErrorState` hiện thông điệp từ `error` + Thử lại |
| Rỗng thật | `EmptyState` một dòng, icon nhỏ |

## Giai đoạn 1B: Logo, nhận diện và favicon (giữ tên MTWorkspace)

**Ý tưởng "Một nét liền"**: chữ **M** và **T** được vẽ bằng *một đường liền duy nhất*: nét M đi lên xuống hai nhịp rồi nối thẳng sang thanh ngang của T, tượng trưng cho việc học và công việc nối liền một mạch. Cuối đường là một **chấm mốc** (deadline / điểm đến) màu nhấn.

- [x] `src/components/layout/logo.tsx`: viết lại. Ô logo bo góc, nền `primary`, đường nét trắng `stroke-linecap: round`, chấm mốc màu `warning`.
- [x] **Hiệu ứng hover** (chỉ CSS, trong `globals.css`, tôn trọng `prefers-reduced-motion`):
  1. Đường nét **tự vẽ lại**: `stroke-dasharray = độ dài path`, `stroke-dashoffset` từ full về 0 trong 700ms.
  2. **Chấm mốc chạy dọc đường** (`offset-path` + `offset-distance` 0→100%) rồi dừng ở cuối và nảy nhẹ.
  3. Ô logo nghiêng nhẹ `rotate(-4deg) scale(1.05)`, bóng đổ nở ra.
  4. Chữ **MTWorkspace**: "MT" đậm (Bricolage 700), "Workspace" nhẹ hơn; khi hover `letter-spacing` giãn dần và gạch chân trượt từ trái sang phải.
- [x] Trạng thái tĩnh (không hover): hiển thị đầy đủ, không animation, nên không tốn tài nguyên khi người dùng không tương tác.
- [x] `src/lib/brand.ts`: hằng số tên, mô tả, màu thương hiệu dùng chung cho metadata, logo, favicon.
- [x] **Favicon và tài sản xuất ra**:
  - `src/app/icon.svg`: favicon vector (nền primary, nét M-T trắng, chấm mốc vàng). Next tự gắn thẻ `<link rel="icon">`.
  - `src/app/apple-icon.png` (180x180), sinh bởi script bên dưới.
  - `src/app/favicon.ico`: sinh bằng script một lần `scripts/make-favicon.mjs` (tự rasterize hình logo bằng Node thuần: ICO 16/32/48, PNG 180/512; chạy lại khi đổi logo), để trình duyệt cũ và tab mới đều có icon.
  - `src/app/manifest.ts`: tên, màu `theme_color`, icon 192/512 (PWA nhẹ).
  - `public/brand/`: `logo-mark.svg`, `logo-full.svg` (kèm chữ), `icon-512.png` để dùng ngoài hệ thống.
- [x] `layout.tsx` metadata: `title` dạng template `%s · MTWorkspace`, `themeColor`, `icons`.
- [x] Không đổi `PRODID` và `UID` trong file .ics (đổi sẽ làm lịch Google bị trùng sự kiện).

## Giai đoạn 2: Hệ thống animation (CSS + `tailwindcss-animate` sẵn có, không thêm thư viện)

| Hiệu ứng | Cách làm | Thời lượng |
|---|---|---|
| Chuyển trang | `src/app/template.tsx`: fade + `translateY(6px→0)` | 200ms ease-out |
| Danh sách xuất hiện lần lượt | class `.stagger > *` với `--i`, delay `min(i*30ms,240ms)` | 180ms |
| Modal | overlay fade 150ms, panel `scale .97→1` + fade; khi đóng chạy ngược rồi mới unmount | 180ms |
| Chuyển tab | pill nền trượt `translateX` | 200ms |
| Thu gọn/mở (học kỳ, khối CTĐT) | `grid-template-rows: 0fr→1fr` | 220ms |
| Đổi tuần TKB | lưới trượt ngang theo hướng tuần trước/sau | 200ms |
| Toast | vào: trượt lên; ra: fade + trượt xuống; thanh thời gian | 200ms |
| Đếm ngược | `tabular-nums`, số không bị giật | — |

- [x] Định nghĩa keyframes và utility trong `globals.css` / `tailwind.config.ts`.
- [x] `@media (prefers-reduced-motion: reduce)`: tắt translate/scale, chỉ giữ fade.
- [x] Icon wiggle (`icon-anim-*`): đã bỏ ở card, header, nút; chỉ còn ở sidebar.

**Đã áp dụng**: `template.tsx` (chuyển trang), `.mt-stagger` (Tổng quan, Lịch thi, Kết quả học tập, agenda TKB), `Collapse` (học kỳ ở Kết quả học tập, khối CTĐT), trượt ngang khi đổi tuần (TKB), `font-mono` có `tabular-nums`. **Chuyển trang (bổ sung theo yêu cầu)**: thanh tiến trình trên cùng (`route-progress.tsx`), mục sidebar sáng ngay khi bấm, nội dung trượt theo hướng thứ tự menu (`template.tsx`), tiêu đề header đổi có hiệu ứng. **Chưa gắn vào trang**: `SegmentedTabs` (thay tab ở Giai đoạn 3).

## Giai đoạn 3: Từng màn hình

### 3.1 Layout: Dock nổi + header chỉ huy (ĐÃ XONG, theo lựa chọn "Dock nổi")
- [x] Bỏ sidebar. Điều hướng là **dock nổi** ở cạnh dưới (`layout/dock.tsx`): icon phóng to theo con trỏ kiểu macOS, nhãn hiện khi rà chuột/focus, chấm dưới mục đang mở, sáng ngay khi bấm, vạch ngăn 2 nhóm (Workspace | Học tập), nút tìm kiếm ở cuối.
- [x] Bỏ link chết "Lịch trình / Công việc / Ghi chú" (sẽ thêm lại vào `nav-items.ts` khi có tính năng).
- [x] Header (`layout/header.tsx`): logo (hover có hiệu ứng) · tiêu đề trang + "Thứ Năm, 26/11 · Tuần 48" · **chip Tiếp theo** · tìm kiếm Ctrl K · đổi theme · avatar.
- [x] Chip "Tiếp theo" (`layout/next-up-chip.tsx`): buổi học / ca thi đang diễn ra hoặc gần nhất trong 7 ngày, chấm nhấp nháy khi đang diễn ra, ca thi tô màu cảnh báo; tự cập nhật 30 giây.
- [x] **Bảng lệnh Ctrl K** thật (`layout/command-palette.tsx`): tìm trang, môn học, ca thi sắp tới, đổi giao diện; không phân biệt dấu; điều khiển bằng phím mũi tên.
- [x] Bỏ 3 nút giả ("Tạo việc", "Cài đặt", ô tìm kiếm không hoạt động). Tài khoản chuyển vào **menu avatar** (`auth/account-menu.tsx`).
- [x] Toast đẩy lên trên dock; chiều cao Hộp thư / Lịch thi tính lại theo phần đệm dưới.

### 3.2 Tổng quan: `src/app/page.tsx` (ĐÃ XONG)
- [x] Dùng `useMybkResource` + `ConnectPrompt` / `ErrorState` / `StaleBanner`: phân biệt chưa kết nối, hết hạn SSO, lỗi API, rỗng thật.
- [x] Cột trái **Lịch học · Tuần N** gom theo ngày từ hôm nay đến hết tuần (Hôm nay / Ngày mai / Thứ X), mỗi buổi có giờ, vạch màu theo môn, phòng, giảng viên, nhãn Đang học / Tiếp theo / Đã xong.
- [x] Cột phải **Lịch thi** (tối đa 3 ca, không còn STT): khối ngày · loại kỳ · tên môn · giờ thi · phòng, mỗi thông tin một dòng; nhãn đếm ngược theo ngày lịch.
- [x] Công việc / Ghi chú gộp thành một dòng "Sắp có". Bỏ giá trị cứng tuần `48`.

### 3.3 Thời khóa biểu: `src/app/timetable/page.tsx` (ĐÃ XONG)
- [x] Khối điều khiển hai tầng: (1) tab Tuần / Môn học · học kỳ · "6 môn · 18 TC" · **Xuất lịch** (gộp nút `.ics` vào `GoogleCalendarSyncModal`) · làm mới; (2) điều hướng tuần `‹ Tuần 48 · 23/11 – 29/11 ›` + nút "Tuần này" + tóm tắt "N buổi · M tiết · K ca thi".
- [x] Bỏ tab "Theo ngày" (trùng với Lịch tuần); dưới `md` lưới tuần tự chuyển thành danh sách theo ngày.
- [x] `WeekPicker`: popover lưới tuần cả học kỳ, đánh dấu tuần này và tuần có ca thi.
- [x] Card buổi học chỉ còn giờ · tên môn · phòng (tiết, nhóm xem trong modal); ca thi không còn STT.
- [x] Bảng Môn học: 4 cột Môn (kèm mã · nhóm · TC) · Lịch (kèm số buổi, tuần) · Phòng (kèm cơ sở) · Giảng viên.
- [x] Bỏ thanh footer tóm tắt. Dùng `useMybkResource` (kết nối / hết hạn / lỗi / rỗng / dữ liệu đã lưu), bỏ học kỳ giả cứng, giữ dữ liệu cũ khi đổi học kỳ.

### 3.4 Lịch thi: `src/app/exams/page.tsx` (ĐÃ XONG)
- [x] Cột trái: **một thẻ "Ca thi tiếp theo"** (nhãn loại kỳ + thời điểm · tên môn + mã/TC/nhóm · đếm ngược Ng/G/P/S · 3 hàng Ngày thi / Giờ làm bài / Phòng thi), cố định khi cuộn; hết ca thi thì thẻ chúc mừng gọn.
- [x] `ExamCountdown` (`components/mybk/exam-countdown.tsx`) có ticker 1 giây riêng; trang chỉ cập nhật mỗi 30 giây.
- [x] Cột phải: nhóm **Sắp thi (n)** mở sẵn, **Đã thi (n)** thu gọn (có animation), không còn cuộn lồng; mỗi dòng: khối ngày · loại kỳ · tên môn · giờ + phòng · nhãn Tiếp theo / Đang thi / Còn N ngày / Đã thi.
- [x] Khối điều khiển một hàng: học kỳ · chip lọc Tất cả/Cuối kỳ/Giữa kỳ kèm số lượng · Xuất lịch (gộp .ics) · làm mới.
- [x] Dùng `useMybkResource`: kết nối / hết hạn / lỗi / rỗng / dữ liệu đã lưu; giữ dữ liệu cũ khi đổi học kỳ; bỏ học kỳ giả cứng.
- [x] **Bỏ STT** ở mọi nơi: trang, modal chi tiết ca thi, modal môn học (Tiến độ), mô tả .ics và Google Calendar. Skeleton theo bố cục mới.

### 3.5 Kết quả học tập: `src/app/academic-results/page.tsx`
**Tab Bảng điểm (ĐÃ XONG):**
- [x] Thanh trên: tab (nền trượt) · trạng thái đồng bộ (Đang đồng bộ / Đồng bộ lỗi · Thử lại / Cập nhật HH:MM) · làm mới · Tài khoản SSO.
- [x] Tổng quan một thẻ: Tên + MSSV · Lớp, rồi 3 chỉ số CPA · Tín chỉ tích lũy · GPA kỳ gần nhất (bỏ "Tổng môn đã học").
- [x] Header học kỳ: GPA · TC chính, CPA phụ; mở sẵn 2 học kỳ thường gần nhất, các kỳ còn lại thu gọn (animation); đang lọc/tìm thì tự mở các kỳ có kết quả.
- [x] Bảng môn: Môn (tên, rồi mã · nhóm) · TC · Điểm (số + chữ cùng ô) · Ghi chú; bỏ tên tiếng Anh và cột Nhóm riêng.
- [x] Môn khác & chứng chỉ: thu gọn sẵn. Tìm kiếm không phân biệt dấu, có nút xóa.
- [x] Banner điểm mới: bấm để mở môn, đóng và nhớ (localStorage, hiện lại khi có thay đổi mới).
- [x] Dùng `useMybkResource`; interval 5 phút chỉ chạy khi đã kết nối; xử lý chưa kết nối / hết hạn SSO / lỗi / rỗng / dữ liệu đã lưu. Route `/api/mybk/transcript` trả lỗi thống nhất qua `errorResponse`.

**Modal điểm môn (ĐÃ XONG):** `course-detail-modal.tsx` một cột: tên + nhãn mã · TC · nhóm · HK → kết quả (hệ 10, điểm chữ, hệ 4.0) → điểm thành phần (thanh theo điểm đạt trên thang 10) → các lần học → chân modal. Helper điểm dùng chung ở `src/lib/grades.ts`.

**Tab Tiến độ học tập (ĐÃ XONG):** `curriculum-progress-tab.tsx`
- [x] Tổng quan một thẻ: CTĐT + mã, `116 / 128 tín chỉ`, thanh 3 đoạn (đã đạt / đang học / còn thiếu) kèm chú thích, 3 chỉ số CPA theo CTĐT · khối hoàn tất · đang đăng ký. Bỏ số giả khi thiếu dữ liệu (CPA, tên CTĐT, tổng 128).
- [x] "Cần hoàn thành để tốt nghiệp": thẻ có thanh tiến độ, tối đa 3 môn thiếu + "và N môn khác".
- [x] Chip lọc kèm số lượng, tìm không phân biệt dấu có nút xóa. Khối chưa đủ mở sẵn, khối hoàn thành thu gọn. Bảng môn 4 cột (Môn · TC · Điểm · Trạng thái). Môn ngoài CTĐT thu gọn sẵn.
- [x] Dùng `useMybkResource` (kết nối / hết hạn / lỗi / rỗng / dữ liệu đã lưu), dùng chung cache TKB và lịch thi thay vì gọi lại, nút kết nối mở modal của trang cha.

### 3.6 Hộp thư: `src/app/mail/page.tsx` (ĐÃ XONG)
- [x] Thanh trên: thư mục · tài khoản (chỉ hiện khi có từ 2 tài khoản, **bỏ lựa chọn mặc định HCMUT / Cá nhân**, chỉ liệt kê từng tài khoản) | tìm kiếm có nút xóa · làm mới.
- [x] Danh sách thư: chấm chưa đọc riêng một cột, người gửi + giờ, tiêu đề, nhãn HCMUT/Cá nhân + đoạn trích, sao. Khung đọc thư: thanh thao tác → tiêu đề → người gửi (avatar, email, giờ, tài khoản) → nội dung (iframe sandbox giữ nguyên).
- [x] **Skeleton khi đổi thư** (không giữ nội dung thư cũ); skeleton cho danh sách khi đổi thư mục / tìm kiếm.
- [x] Lỗi: tải danh sách / mở thư lỗi có Thử lại, chưa đăng nhập Google có nút đăng nhập, thao tác (đọc/sao/lưu trữ) lỗi thì hoàn lại trạng thái.
- [x] Dưới `lg` chỉ hiện một khung (danh sách hoặc thư) kèm nút quay lại.
- [x] Nhóm nút (đã đọc, sao, lưu trữ, Mở Gmail) căn phải cạnh tiêu đề thư; ảnh đại diện người gửi (Gravatar → logo tên miền → chữ cái) dùng chung ở `components/mail/sender-avatar.tsx`; hai khung kéo dài tới đáy, iframe thư tự giãn (một thanh cuộn); đường dẫn Mở Gmail dùng `#all/` (`lib/gmail-ui.ts`).
- [x] Widget Gmail ở Tổng quan (`dashboard/gmail-inbox-widget.tsx`) viết lại cùng phong cách: lọc nhanh Tất cả / Chưa đọc / Gắn sao (bỏ HCMUT / Cá nhân), avatar, huy hiệu số thư chưa đọc, trạng thái chưa đăng nhập / lỗi / rỗng, hoàn lại khi đánh dấu đã đọc lỗi.

## Thứ tự commit

1. Sao chép kế hoạch vào `UI_PLAN.md`.
2. Giai đoạn 0 (sửa nóng): 1 commit.
3. Giai đoạn 1 (nền tảng): token + UI kit + helper + hook.
4. Giai đoạn 2 (animation).
5. Giai đoạn 3 theo thứ tự Layout → Lịch thi → Thời khóa biểu → Kết quả học tập → Hộp thư → Tổng quan, mỗi màn hình 1 commit.

## Kiểm tra

- `npm run build` sau mỗi giai đoạn (bắt lỗi TypeScript/lint).
- `npm run dev`, mở từng trang trong integrated browser:
  - Font: soi tiêu đề có dấu ("Kết quả học tập", "Thời khóa biểu") ở 600/700, kiểm tra trong DevTools rằng font render đúng là Bricolage/Mona (không fallback).
  - Light/dark, reload không nháy nền.
  - Độ rộng 375px, 768px, 1280px.
  - Bật `prefers-reduced-motion` (emulate) để kiểm tra hiệu ứng đã giảm.
  - Giả lập lỗi: tắt mạng, sửa tạm API trả 500, xóa session myBK để kiểm tra từng ô trong ma trận trạng thái.
  - Email chứa `<script>`: không chạy được, link mở tab mới.
  - Modal: ESC đóng, Tab không thoát khỏi modal, body không cuộn.
