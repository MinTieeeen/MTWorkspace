// Helper định dạng ngày giờ / tuần / cơ sở dùng chung (an toàn cho cả client và server).

/** Thứ viết ngắn: 2..7 = Thứ 2..Thứ 7, 8 = CN */
export const DAY_SHORT: Record<number, string> = {
  2: "Thứ 2",
  3: "Thứ 3",
  4: "Thứ 4",
  5: "Thứ 5",
  6: "Thứ 6",
  7: "Thứ 7",
  8: "CN",
};

export const DAY_LABELS: Record<number, string> = {
  ...DAY_SHORT,
  8: "Chủ Nhật",
};

export const DAY_FULL_LABELS: Record<number, string> = {
  2: "Thứ Hai",
  3: "Thứ Ba",
  4: "Thứ Tư",
  5: "Thứ Năm",
  6: "Thứ Sáu",
  7: "Thứ Bảy",
  8: "Chủ Nhật",
};

export const WEEK_DAYS = [2, 3, 4, 5, 6, 7, 8].map((dayOfWeek) => ({
  dayOfWeek,
  shortLabel: DAY_SHORT[dayOfWeek],
  fullLabel: DAY_FULL_LABELS[dayOfWeek],
}));

/** Số tuần ISO của ngày `now` (theo giờ máy) */
export function getCurrentIsoWeek(now = new Date()): number {
  const d = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Thứ theo quy ước myBK: 2 = Thứ 2 ... 7 = Thứ 7, 8 = CN */
export function getTodayBkDayOfWeek(now = new Date()): number {
  const jsDay = now.getDay();
  return jsDay === 0 ? 8 : jsDay + 1;
}

export function getMondayOfIsoWeek(year: number, weekNumber: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (weekNumber - 1) * 7);
  return target;
}

export function getDateForDayInWeek(
  year: number,
  weekNumber: number,
  dayOfWeek: number
): { iso: string; displayShort: string; displayFull: string } {
  const monday = getMondayOfIsoWeek(year, weekNumber);
  const offset = Math.max(0, Math.min(6, dayOfWeek - 2));
  const d = new Date(monday);
  d.setUTCDate(monday.getUTCDate() + offset);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return {
    iso: d.toISOString().slice(0, 10),
    displayShort: `${dd}/${mm}`,
    displayFull: `${dd}/${mm}/${d.getUTCFullYear()}`,
  };
}

export function formatDateVi(isoDate: string): {
  dd: string;
  mm: string;
  yyyy: string;
  short: string;
  full: string;
} {
  if (!isoDate || !isoDate.includes("-")) {
    return { dd: "--", mm: "--", yyyy: "----", short: "--/--", full: isoDate || "--" };
  }
  const [yyyy, mm, dd] = isoDate.split("-");
  return { dd, mm, yyyy, short: `${dd}/${mm}`, full: `${dd}/${mm}/${yyyy}` };
}

/**
 * Tên cơ sở thống nhất cho mọi nơi. Nhận mã (CS1/CS2) hoặc tên tiếng Việt từ myBK.
 * `fallback` hiển thị khi không có thông tin.
 */
export function formatCampus(
  value: string | null | undefined,
  fallback = "ĐH Bách Khoa TP.HCM"
): string {
  if (!value) return fallback;
  if (
    value.includes("CS1") ||
    value.includes("Cơ Sở 1") ||
    value.includes("Cơ sở 1") ||
    value.includes("Lý Thường Kiệt")
  ) {
    return "Cơ sở 1 · Lý Thường Kiệt";
  }
  if (
    value.includes("CS2") ||
    value.includes("Cơ Sở 2") ||
    value.includes("Cơ sở 2") ||
    value.includes("Đông Hoà") ||
    value.includes("Dĩ An")
  ) {
    return "Cơ sở 2 · Dĩ An";
  }
  return value;
}

/** Mốc thời gian (ms) của một ca thi, giờ Việt Nam */
export function getExamTimestampMs(examDate: string, timeHHMM: string): number {
  if (!examDate) return 0;
  const cleanTime = timeHHMM && timeHHMM.includes(":") ? timeHHMM : "07:00";
  const dt = new Date(`${examDate}T${cleanTime}:00+07:00`);
  return Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
}

/** Số ngày lịch (múi giờ VN) từ hôm nay đến `isoDate`: 0 = hôm nay, 1 = ngày mai */
export function calendarDaysUntil(isoDate: string, now = new Date()): number {
  const todayVn = new Date(now.getTime() + 7 * 3600000)
    .toISOString()
    .slice(0, 10);
  const diff =
    Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${todayVn}T00:00:00Z`);
  return Math.max(0, Math.round(diff / 86400000));
}

export function relativeDayLabel(days: number): string {
  if (days === 0) return "Hôm nay";
  if (days === 1) return "Ngày mai";
  return `Còn ${days} ngày`;
}

/** Bỏ dấu tiếng Việt + hạ chữ thường, dùng cho tìm kiếm không phân biệt dấu */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

/** "7:5" -> "07:05" */
export function padTime(hhmm: string): string {
  const [h = "0", m = "0"] = (hhmm || "").split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

/** Mốc thời gian (ms) của `dateIso` + giờ `hhmm`, theo giờ Việt Nam. 0 nếu không hợp lệ. */
export function toVnMs(dateIso: string, hhmm: string): number {
  const t = Date.parse(`${dateIso}T${padTime(hhmm)}:00+07:00`);
  return Number.isNaN(t) ? 0 : t;
}
