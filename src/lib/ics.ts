import type { NormalizedTimetableItem } from "@/lib/mybk-timetable";
import type { NormalizedExamItem } from "@/lib/mybk-exams";
import { formatCampus, getDateForDayInWeek } from "@/lib/format";
import { MEETING_KIND_LABEL, type MeetingView } from "@/lib/thesis/meeting-types";

function nowStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** Buổi học có xếp tiết cố định (loại bỏ đồ án / sinh hoạt không xếp tiết) */
export function isScheduledItem(item: NormalizedTimetableItem): boolean {
  return (
    item.dayOfWeek >= 2 &&
    item.dayOfWeek <= 8 &&
    item.startLesson > 0 &&
    item.startTime !== "0:00" &&
    item.startTime !== "00:00"
  );
}

export function buildTimetableIcs(
  items: NormalizedTimetableItem[],
  semesterCode: string
): string {
  // PRODID và UID giữ nguyên để lịch đã nhập trước đó không bị trùng sự kiện
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MTWorkspace//HCMUT myBK Timetable//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:TKB Bách Khoa HK ${semesterCode}`,
    "X-WR-TIMEZONE:Asia/Ho_Chi_Minh",
  ];
  const stamp = nowStamp();

  for (const item of items.filter(isScheduledItem)) {
    const startHHMM = item.startTime.replace(":", "").padStart(4, "0");
    const endHHMM = item.endTime.replace(":", "").padStart(4, "0");
    const roomPart =
      item.roomCode && item.roomCode !== "------"
        ? item.roomCode
        : "Chưa xếp phòng";
    const location = `${roomPart}${
      item.campusNameVi ? ` (${formatCampus(item.campusNameVi)})` : ""
    }`;
    const desc = [
      `Môn học: ${item.subjectCode} - ${item.subjectNameVi}`,
      `Nhóm lớp: ${item.classGroup || "--"} (${item.numOfCredits} TC)`,
      `Tiết: ${item.startLesson} - ${
        item.startLesson + item.numOfLesson - 1
      } (${item.startTime} - ${item.endTime})`,
      item.employeeName
        ? `Giảng viên: ${item.employeeName}${
            item.employeeEmail ? ` - ${item.employeeEmail}` : ""
          }`
        : "",
    ]
      .filter(Boolean)
      .join("\\n");

    for (const wk of item.activeWeeks) {
      const { iso } = getDateForDayInWeek(item.calendarYear, wk, item.dayOfWeek);
      const cleanDate = iso.replace(/-/g, "");
      const uid = `mtworkspace-${semesterCode}-${item.scheduleId}-w${wk}@mybk.hcmut.edu.vn`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=Asia/Ho_Chi_Minh:${cleanDate}T${startHHMM}00`,
        `DTEND;TZID=Asia/Ho_Chi_Minh:${cleanDate}T${endHHMM}00`,
        `SUMMARY:[${item.subjectCode}] ${item.subjectNameVi}${
          item.classGroup ? ` (${item.classGroup})` : ""
        }`,
        `LOCATION:${location}`,
        `DESCRIPTION:${desc}`,
        "END:VEVENT"
      );
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function buildExamIcs(
  items: NormalizedExamItem[],
  semesterCode: string
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MTWorkspace//HCMUT myBK Exam Schedule//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Lịch thi Bách Khoa HK ${semesterCode}`,
    "X-WR-TIMEZONE:Asia/Ho_Chi_Minh",
  ];
  const stamp = nowStamp();

  for (const item of items) {
    if (!item.examDate) continue;
    const cleanDate = item.examDate.replace(/-/g, "");
    const startHHMM = item.startTime.replace(":", "").padStart(4, "0");
    const endHHMM = item.endTime.replace(":", "").padStart(4, "0");
    const typeLabel = item.examType === "GK" ? "Thi Giữa kỳ" : "Thi Cuối kỳ";
    const roomPart = item.roomCode || "Chưa xếp phòng";
    const location = `${roomPart} (${formatCampus(item.campusCode)})`;
    const desc = [
      `Kỳ thi: ${typeLabel} (${item.semesterYearName})`,
      `Môn thi: ${item.subjectCode} - ${item.subjectName} (${item.numOfCredits} TC)`,
      `Thời lượng: ${item.durationMinutes} phút (${item.startTime} - ${item.endTime})`,
    ]
      .filter(Boolean)
      .join("\\n");
    const uid = `mtworkspace-exam-${semesterCode}-${item.examId}@mybk.hcmut.edu.vn`;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Ho_Chi_Minh:${cleanDate}T${startHHMM}00`,
      `DTEND;TZID=Asia/Ho_Chi_Minh:${cleanDate}T${endHHMM}00`,
      `SUMMARY:[${typeLabel}] ${item.subjectCode} - ${item.subjectName}`,
      `LOCATION:${location}`,
      `DESCRIPTION:${desc}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT60M",
      "ACTION:DISPLAY",
      "DESCRIPTION:Chuẩn bị vào phòng thi",
      "END:VALARM",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

const icsEscape = (t: string) =>
  t
    .split("\\").join("\\\\")
    .split(";").join("\\;")
    .split(",").join("\\,")
    .replace(/\r?\n/g, "\\n");

/** ISO (UTC) → `YYYYMMDDTHHmmss` theo giờ Việt Nam */
function vnIcsStamp(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 3600_000)
    .toISOString()
    .replace(/[-:]/g, "")
    .slice(0, 15);
}

export function buildMeetingIcs(
  meetings: MeetingView[],
  projectTitle: string
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MTWorkspace//Thesis Meetings//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Cuộc họp đồ án",
    "X-WR-TIMEZONE:Asia/Ho_Chi_Minh",
  ];
  const stamp = nowStamp();

  for (const m of meetings) {
    if (m.status === "CANCELLED") continue;
    const end = m.endAt ?? new Date(Date.parse(m.startAt) + 3600_000).toISOString();
    const desc = [
      `Đồ án: ${projectTitle}`,
      m.attendees.length ? `Tham dự: ${m.attendees.join(", ")}` : "",
      m.meetUrl ? `Đường dẫn họp: ${m.meetUrl}` : "",
      m.agendaMd ? `\nChương trình:\n${m.agendaMd.slice(0, 1500)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:mtworkspace-meeting-${m.id}@mtworkspace`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Ho_Chi_Minh:${vnIcsStamp(m.startAt)}`,
      `DTEND;TZID=Asia/Ho_Chi_Minh:${vnIcsStamp(end)}`,
      `SUMMARY:${icsEscape(`[${MEETING_KIND_LABEL[m.kind]}] ${m.title}`)}`,
      `LOCATION:${icsEscape(m.location || m.meetUrl || "")}`,
      `DESCRIPTION:${icsEscape(desc)}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT60M",
      "ACTION:DISPLAY",
      "DESCRIPTION:Sắp đến giờ họp",
      "END:VALARM",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/** Tải nội dung .ics về máy (chỉ chạy ở client) */
export function downloadIcs(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
