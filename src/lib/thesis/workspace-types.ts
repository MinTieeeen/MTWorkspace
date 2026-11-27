// Kiểu dùng chung cho Công việc, Ghi chú, Tài liệu của đồ án.

/** Sự kiện báo dữ liệu đồ án (cuộc họp, việc, ghi chú, liên kết) đã thay đổi để các tab tải lại */
export const THESIS_EVENT = "mt-thesis-changed";
export const notifyThesisChanged = () => window.dispatchEvent(new Event(THESIS_EVENT));

// ----- Công việc -----
export type TaskStatus = "TODO" | "DOING" | "DONE";
export const TASK_STATUSES: TaskStatus[] = ["TODO", "DOING", "DONE"];
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "Cần làm",
  DOING: "Đang làm",
  DONE: "Xong",
};
export const PRIORITY_LABEL = ["Thường", "Cao", "Khẩn"] as const;

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export interface TaskView {
  id: string;
  projectId: string | null;
  meetingId: string | null;
  meetingTitle: string | null;
  title: string;
  descriptionMd: string;
  status: TaskStatus;
  priority: 0 | 1 | 2;
  dueAt: string | null;
  checklist: ChecklistItem[];
  doneAt: string | null;
}
export interface TasksPayload {
  tasks: TaskView[];
  error?: string;
  code?: string;
}

// ----- Ghi chú -----
export type NoteKind = "NOTE" | "WEEKLY_LOG" | "IDEA" | "QUESTION";
export const NOTE_KINDS: NoteKind[] = ["NOTE", "WEEKLY_LOG", "IDEA", "QUESTION"];
export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  NOTE: "Ghi chú",
  WEEKLY_LOG: "Nhật ký tuần",
  IDEA: "Ý tưởng",
  QUESTION: "Câu hỏi cho GVHD",
};
export const WEEKLY_TEMPLATE =
  "## Đã làm\n- \n\n## Khó khăn\n- \n\n## Kế hoạch tuần tới\n- [ ] ";

export interface NoteView {
  id: string;
  projectId: string | null;
  kind: NoteKind;
  title: string;
  bodyMd: string;
  tags: string[];
  pinned: boolean;
  /** Thứ Hai của tuần (YYYY-MM-DD, giờ Việt Nam), chỉ có với nhật ký tuần */
  weekOf: string | null;
  updatedAt: string;
}
export interface NotesPayload {
  notes: NoteView[];
  error?: string;
  code?: string;
}

// ----- Tài liệu & liên kết -----
export type LinkKind = "REPO" | "DRIVE" | "DOC" | "DESIGN" | "PAPER" | "OTHER";
export const LINK_KINDS: LinkKind[] = ["REPO", "DRIVE", "DOC", "DESIGN", "PAPER", "OTHER"];
export const LINK_KIND_LABEL: Record<LinkKind, string> = {
  REPO: "Mã nguồn",
  DRIVE: "Lưu trữ",
  DOC: "Tài liệu",
  DESIGN: "Thiết kế",
  PAPER: "Bài báo",
  OTHER: "Khác",
};

export interface LinkView {
  id: string;
  projectId: string | null;
  kind: LinkKind;
  title: string;
  url: string;
}
export interface LinksPayload {
  links: LinkView[];
  error?: string;
  code?: string;
}

/** Đoán loại liên kết từ tên miền */
export function guessLinkKind(url: string): LinkKind {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "OTHER";
  }
  if (/(github|gitlab|bitbucket)\./.test(host)) return "REPO";
  if (/(drive\.google|dropbox|onedrive|1drv)/.test(host)) return "DRIVE";
  if (/(docs\.google|overleaf|notion|sharepoint)/.test(host)) return "DOC";
  if (/(figma|canva|miro)\./.test(host)) return "DESIGN";
  if (/(arxiv|doi\.org|ieee|acm\.org|scholar\.google|springer|sciencedirect)/.test(host)) return "PAPER";
  return "OTHER";
}

export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Thứ Hai (giờ Việt Nam) của tuần chứa `ms`, dạng YYYY-MM-DD */
export function vnMonday(ms: number): string {
  const d = new Date(ms + 7 * 3600_000);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = thứ Hai
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
