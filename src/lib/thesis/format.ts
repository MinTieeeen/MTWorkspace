// Định dạng ngày giờ theo múi giờ Việt Nam cho phân hệ Đồ án (dùng được ở client).

const TZ = "Asia/Ho_Chi_Minh";

function parts(iso: string): Record<string, string> | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const f = new Intl.DateTimeFormat("vi-VN", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const out: Record<string, string> = {};
  for (const p of f.formatToParts(d)) out[p.type] = p.value;
  // Một số môi trường trả giờ "24" cho nửa đêm
  if (out.hour === "24") out.hour = "00";
  return out;
}

/** "15/08/2026" */
export function fmtVnDate(iso: string | null | undefined): string {
  const p = iso ? parts(iso) : null;
  return p ? `${p.day}/${p.month}/${p.year}` : "--";
}

/** "15/08" */
export function fmtVnDayMonth(iso: string | null | undefined): string {
  const p = iso ? parts(iso) : null;
  return p ? `${p.day}/${p.month}` : "--";
}

/** "08:30" */
export function fmtVnTime(iso: string | null | undefined): string {
  const p = iso ? parts(iso) : null;
  return p ? `${p.hour}:${p.minute}` : "--";
}

/** "Thứ Tư, 06/01/2027" */
export function fmtVnDateLong(iso: string | null | undefined): string {
  const p = iso ? parts(iso) : null;
  if (!p) return "--";
  const wd = p.weekday ? p.weekday.charAt(0).toUpperCase() + p.weekday.slice(1) : "";
  return `${wd}, ${p.day}/${p.month}/${p.year}`;
}

/** "07:30 · Thứ Tư, 06/01/2027" */
export function fmtVnDateTime(iso: string | null | undefined): string {
  if (!iso) return "--";
  return `${fmtVnTime(iso)} · ${fmtVnDateLong(iso)}`;
}

/** "15/08 – 07/09" hoặc "hạn 30/09" khi chỉ có ngày kết thúc */
export function fmtVnRange(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  if (start && end) return `${fmtVnDayMonth(start)} – ${fmtVnDayMonth(end)}`;
  if (end) return `hạn ${fmtVnDayMonth(end)}`;
  if (start) return `từ ${fmtVnDayMonth(start)}`;
  return "";
}

/** ISO (UTC) → `YYYY-MM-DDTHH:mm` theo giờ Việt Nam, cho input datetime-local */
export function toVnLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Date(ms + 7 * 3600_000).toISOString().slice(0, 16);
}

const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** Thứ viết tắt (theo giờ Việt Nam) của một thời điểm ISO: "T2".."CN" */
export function vnWeekdayShort(iso: string): string {
  return WEEKDAY_SHORT[new Date(Date.parse(iso) + 7 * 3600_000).getUTCDay()];
}

/** Ngày `YYYY-MM-DD` theo giờ Việt Nam của một thời điểm ISO */
export function vnDateKey(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10);
}
