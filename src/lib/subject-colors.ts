// 6 màu phân biệt môn học, dựa trên token --subject-N (tự đổi theo sáng/tối).
// Lưu ý: class phải viết tường minh để Tailwind quét được (không ghép chuỗi động).

export interface SubjectColorStyle {
  bg: string;
  border: string;
  accent: string;
  badge: string;
  text: string;
}

export const SUBJECT_COLOR_STYLES: SubjectColorStyle[] = [
  {
    bg: "bg-subject-1/10",
    border: "border-subject-1/30 hover:border-subject-1/60",
    accent: "bg-subject-1",
    badge: "bg-subject-1/15 text-subject-1-fg",
    text: "text-subject-1-fg",
  },
  {
    bg: "bg-subject-2/10",
    border: "border-subject-2/30 hover:border-subject-2/60",
    accent: "bg-subject-2",
    badge: "bg-subject-2/15 text-subject-2-fg",
    text: "text-subject-2-fg",
  },
  {
    bg: "bg-subject-3/10",
    border: "border-subject-3/30 hover:border-subject-3/60",
    accent: "bg-subject-3",
    badge: "bg-subject-3/15 text-subject-3-fg",
    text: "text-subject-3-fg",
  },
  {
    bg: "bg-subject-4/10",
    border: "border-subject-4/30 hover:border-subject-4/60",
    accent: "bg-subject-4",
    badge: "bg-subject-4/15 text-subject-4-fg",
    text: "text-subject-4-fg",
  },
  {
    bg: "bg-subject-5/10",
    border: "border-subject-5/30 hover:border-subject-5/60",
    accent: "bg-subject-5",
    badge: "bg-subject-5/15 text-subject-5-fg",
    text: "text-subject-5-fg",
  },
  {
    bg: "bg-subject-6/10",
    border: "border-subject-6/30 hover:border-subject-6/60",
    accent: "bg-subject-6",
    badge: "bg-subject-6/15 text-subject-6-fg",
    text: "text-subject-6-fg",
  },
];

/** Gán màu theo mã môn, ổn định theo thứ tự chữ cái */
export function buildSubjectColorMap(
  subjectCodes: string[]
): Map<string, SubjectColorStyle> {
  const map = new Map<string, SubjectColorStyle>();
  Array.from(new Set(subjectCodes))
    .sort()
    .forEach((code, idx) => {
      map.set(code, SUBJECT_COLOR_STYLES[idx % SUBJECT_COLOR_STYLES.length]);
    });
  return map;
}
