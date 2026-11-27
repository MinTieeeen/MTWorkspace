// Helper điểm số dùng chung cho bảng điểm, modal điểm môn và tiến độ học tập.

export type GradeTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

/** Màu nhãn theo điểm chữ */
export function gradeTone(letter: string | null | undefined): GradeTone {
  const l = (letter || "").trim().toUpperCase();
  if (l === "A+" || l === "A") return "success";
  if (l === "B+" || l === "B") return "info";
  if (l === "C+" || l === "C") return "warning";
  if (l === "MT" || l === "DT") return "primary";
  if (l === "D+" || l === "D" || l === "F" || l === "RT") return "danger";
  return "neutral";
}

/** Quy đổi điểm chữ sang thang 4.0 */
export function letterToGpa4(letter: string | null | undefined): string {
  switch ((letter || "").trim().toUpperCase()) {
    case "A+":
    case "A":
      return "4.0";
    case "B+":
      return "3.5";
    case "B":
      return "3.0";
    case "C+":
      return "2.5";
    case "C":
      return "2.0";
    case "D+":
      return "1.5";
    case "D":
      return "1.0";
    case "F":
      return "0.0";
    default:
      return "--";
  }
}

/** Điểm hệ 10 dạng chuỗi; "--" khi không có điểm số thật (miễn, đạt, rút môn) */
export function formatScore10(
  diemSo: number | null,
  diemChu: string | null
): string {
  if (diemSo === null || diemSo === undefined) return "--";
  const l = (diemChu || "").trim().toUpperCase();
  if (l === "MT" || l === "DT" || l === "RT" || diemSo > 10) return "--";
  // Chưa có điểm chữ và điểm số 0: môn đang học, chưa công bố điểm tổng
  if (!l && diemSo === 0) return "--";
  return diemSo.toFixed(1);
}

/** Điểm chữ kèm giải nghĩa cho các mã đặc biệt */
export function formatLetterDisplay(
  diemChu: string | null,
  diemSo: number | null
): string {
  const l = (diemChu || "").trim().toUpperCase();
  if (l === "MT" || diemSo === 12) return "MT · Miễn";
  if (l === "DT" || diemSo === 21) return "DT · Đạt";
  if (l === "RT" || diemSo === 17) return "RT · Rút môn";
  return l || "--";
}

/** Điểm thành phần: xử lý các mã đặc biệt của myBK (13 = vắng thi, 12 = miễn, 21 = đạt) */
export function formatComponentScore(score: number | null): string {
  if (score === null || score === undefined) return "--";
  if (score === 13) return "Vắng thi";
  if (score === 12) return "Miễn";
  if (score === 21) return "Đạt";
  if (score > 10) return String(score);
  return Number.isInteger(score) ? score.toFixed(1) : String(score);
}
