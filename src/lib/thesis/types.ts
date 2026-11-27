// Kiểu dữ liệu của phân hệ Đồ án, dùng chung cho server và giao diện.

export interface PersonView {
  name: string;
  email: string | null;
  phone?: string | null;
  role?: string | null;
}

export interface MemberView {
  studentId: string | null;
  name: string;
  email: string | null;
  className?: string | null;
}

export interface BilingualText {
  vi: string | null;
  en: string | null;
}

export interface MilestoneView {
  id: string;
  source: "SCHOOL" | "PERSONAL";
  key: string;
  title: string;
  startAt: string | null;
  endAt: string | null;
  doneAt: string | null;
}

export interface CommitteeView {
  source: "REMOTE" | "MANUAL";
  name: string | null;
  status: string | null;
  startAt: string | null;
  campus: string | null;
  room: string | null;
  chair: PersonView | null;
  secretary: PersonView | null;
  members: PersonView[];
  projectCount: number | null;
}

export interface ProjectView {
  id: string;
  source: "REMOTE" | "MANUAL";
  customId: string | null;
  titleVi: string | null;
  titleEn: string | null;
  description: BilingualText;
  requirements: BilingualText;
  references: BilingualText;
  status: string | null;
  reviewerStatus: string | null;
  committeeStatus: string | null;
  batchName: string | null;
  semesterName: string | null;
  projectType: string | null;
  major: string | null;
  department: string | null;
  supervisor: PersonView | null;
  coSupervisors: PersonView[];
  members: MemberView[];
  isRegistered: boolean | null;
  isDeferred: boolean | null;
  syncedAt: string | null;
}

/** Một dòng trong bộ chọn đồ án (ĐACN, ĐATN...) */
export interface ProjectOption {
  id: string;
  source: "REMOTE" | "MANUAL";
  title: string;
  /** Nhãn ngắn, vd mã đồ án hoặc tên đợt */
  label: string;
  semesterName: string | null;
}

/** Phản hồi của GET /api/thesis (tương thích ResourcePayload của useMybkResource) */
export interface ThesisPayload {
  /**
   * Đã liên kết tài khoản Google @hcmut.edu.vn (đủ điều kiện đồng bộ từ trường).
   * Cố ý KHÔNG đặt tên `connected` để useMybkResource không tự coi là "chưa kết nối" khi còn đồ án nhập tay.
   */
  linked: boolean;
  /** Tất cả đồ án của người dùng, mới nhất trước */
  projects: ProjectOption[];
  project: ProjectView | null;
  milestones: MilestoneView[];
  committee: CommitteeView | null;
  lastSyncedAt: string | null;
  authState?: string | null;
  isStale?: boolean;
  warning?: string;
  errorCode?: string;
  error?: string;
  code?: string;
}

/** Dữ liệu đã chuẩn hóa từ API trường, sẵn sàng ghi vào database (đã loại mọi trường nhạy cảm) */
export interface NormalizedProject {
  remoteId: string;
  customId: string | null;
  titleVi: string | null;
  titleEn: string | null;
  description: BilingualText;
  requirements: BilingualText;
  references: BilingualText;
  status: string | null;
  reviewerStatus: string | null;
  committeeStatus: string | null;
  batchId: string | null;
  batchName: string | null;
  semesterName: string | null;
  projectType: string | null;
  major: string | null;
  department: string | null;
  supervisor: PersonView | null;
  coSupervisors: PersonView[];
  members: MemberView[];
  isRegistered: boolean | null;
  isDeferred: boolean | null;
}

export interface NormalizedMilestone {
  key: string;
  title: string;
  startAt: Date | null;
  endAt: Date | null;
  sortOrder: number;
}

export interface NormalizedCommittee {
  remoteId: string | null;
  name: string | null;
  status: string | null;
  startAt: Date | null;
  campus: string | null;
  room: string | null;
  language: string | null;
  chair: PersonView | null;
  secretary: PersonView | null;
  members: PersonView[];
  projectCount: number | null;
}
