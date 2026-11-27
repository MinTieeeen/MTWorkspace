import crypto from "crypto";
import type {
  BilingualText,
  MemberView,
  NormalizedCommittee,
  NormalizedMilestone,
  NormalizedProject,
  PersonView,
} from "./types";

/**
 * Chuẩn hóa phản hồi của hệ thống trường thành dữ liệu của workspace.
 *
 * QUAN TRỌNG: chỉ lấy các trường trong danh sách trắng bên dưới. API của trường trả cả các trường
 * nhạy cảm (vd `password`, `googleId` trong `student.user`); chúng KHÔNG ĐƯỢC lưu hay ghi log.
 */

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const bool = (v: unknown): boolean | null =>
  typeof v === "boolean" ? v : null;

function bilingual(v: unknown): BilingualText {
  const r = rec(v);
  return { vi: str(r.vi), en: str(r.en) };
}

function fullName(r: Rec): string | null {
  const joined = [str(r.familyName), str(r.givenName)].filter(Boolean).join(" ");
  return str(r.displayName) ?? (joined || null);
}

function person(raw: unknown, role?: string | null): PersonView | null {
  const r = rec(raw);
  // Hội đồng bọc người trong `staff`
  const base = Object.keys(rec(r.staff)).length ? rec(r.staff) : r;
  const name = fullName(base);
  if (!name) return null;
  return {
    name,
    email: str(base.email) ?? str(rec(base.user).email),
    phone: str(base.phone),
    role: role ?? str(r.role),
  };
}

function member(raw: unknown): MemberView | null {
  const ps = rec(raw);
  const st = rec(ps.student);
  const name = fullName(st) ?? str(rec(st.user).displayName);
  if (!name) return null;
  return {
    studentId: str(st.studentId) ?? str(ps.studentId),
    name,
    email: str(rec(st.user).email),
    className: str(st.class),
  };
}

export function normalizeProject(
  rawProject: unknown,
  registered: unknown
): NormalizedProject | null {
  const p = rec(rawProject);
  const id = str(p.id);
  if (!id) return null;
  const batch = rec(p.projectBatch);
  const reg = rec(registered);

  return {
    remoteId: id,
    customId: str(p.projectCustomId),
    titleVi: str(rec(p.title).vi),
    titleEn: str(rec(p.title).en),
    description: bilingual(p.description),
    requirements: bilingual(p.requirements),
    references: bilingual(p.references),
    status: str(p.status),
    reviewerStatus: str(p.reviewerApprovalStatus),
    committeeStatus: str(p.projectedCommitteeApprovalStatus),
    batchId: str(batch.id),
    batchName: str(rec(batch.name).vi) ?? str(batch.name),
    semesterName: str(rec(rec(batch.semester).name).vi),
    projectType: str(batch.projectType),
    major: str(rec(rec(p.major).name).vi),
    department: str(rec(rec(p.department).name).vi),
    supervisor: person(p.supervisor),
    coSupervisors: arr(p.coSupervisors)
      .map((c) => person(c))
      .filter((x): x is PersonView => x !== null),
    members: arr(p.projectStudents)
      .map(member)
      .filter((x): x is MemberView => x !== null),
    isRegistered: bool(reg.isRegisteredSuccess),
    isDeferred: bool(reg.isDeferred),
  };
}

// ---------------------------------------------------------------------------------------------
// Mốc thời gian của đợt
// ---------------------------------------------------------------------------------------------

interface MilestoneDef {
  key: string;
  title: string;
  /** Chỉ có ngày kết thúc (vd hạn đăng ký) */
  endOnly?: boolean;
}

/** Thứ tự và tên hiển thị; khóa trong API là `<key>StartDate` / `<key>EndDate` */
export const SCHOOL_MILESTONES: MilestoneDef[] = [
  { key: "proposalSubmission", title: "Nộp đề cương" },
  { key: "departmentReview", title: "Bộ môn duyệt" },
  { key: "majorReview", title: "Ngành duyệt" },
  { key: "studentRegistration", title: "Sinh viên đăng ký", endOnly: true },
  { key: "midtermEvaluation", title: "Đánh giá giữa kỳ" },
  { key: "supervisorGradingAssignment", title: "GVHD chấm điểm" },
  { key: "reviewerGrading", title: "Phản biện chấm điểm" },
  { key: "reportSubmission", title: "Nộp báo cáo" },
  { key: "reportReview", title: "Duyệt báo cáo" },
  { key: "revisedReportSubmission", title: "Nộp báo cáo chỉnh sửa" },
  { key: "revisedReportReview", title: "Duyệt báo cáo chỉnh sửa" },
];

/**
 * Ngày của timeline có dạng `YYYY-MM-DDTHH:mm` KHÔNG kèm múi giờ (giờ Việt Nam);
 * chuỗi rỗng nghĩa là chưa công bố.
 */
export function parseVnDateTime(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(s);
  const iso = hasZone ? s : s.length === 16 ? `${s}:00+07:00` : `${s}+07:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function normalizeTimeline(rawTimeline: unknown): NormalizedMilestone[] {
  const t = rec(rawTimeline);
  return SCHOOL_MILESTONES.map((def, i) => ({
    key: def.key,
    title: def.title,
    startAt: def.endOnly ? null : parseVnDateTime(t[`${def.key}StartDate`]),
    endAt: parseVnDateTime(t[`${def.key}EndDate`]),
    sortOrder: i,
  }));
}

// ---------------------------------------------------------------------------------------------
// Hội đồng bảo vệ
// ---------------------------------------------------------------------------------------------

export function normalizeCommittee(rawCommittee: unknown): NormalizedCommittee | null {
  const c = rec(rawCommittee);
  if (!str(c.id) && !str(c.name)) return null;
  const startRaw = str(c.startTime);
  const startAt = startRaw ? new Date(startRaw) : null;

  return {
    remoteId: str(c.id),
    name: str(c.name),
    status: str(c.status),
    startAt: startAt && !Number.isNaN(startAt.getTime()) ? startAt : null,
    campus: str(c.locationCampus),
    room: str(c.locationRoom) ?? str(c.location),
    language: str(c.language),
    chair: person(c.chair, "chair"),
    secretary: person(c.secretary, "secretary"),
    members: arr(c.members)
      .map((m) => person(m, "member"))
      .filter((x): x is PersonView => x !== null),
    projectCount: Array.isArray(c.projectIds) ? c.projectIds.length : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Mã băm nội dung (phát hiện thay đổi; ETag của trường không dùng được, xem THESIS_PLAN 0.6)
// ---------------------------------------------------------------------------------------------

function stable(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Rec)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, val]) => [k, stable(val)])
    );
  }
  return v;
}

export function contentHash(v: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stable(v)))
    .digest("hex")
    .slice(0, 32);
}
