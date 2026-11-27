// Kiểu và hằng số của Cuộc họp đồ án (dùng chung server và giao diện).

export type MeetingKind = "SUPERVISOR" | "TEAM" | "MIDTERM" | "OTHER";
export type MeetingMode = "IN_PERSON" | "ONLINE";
export type MeetingStatus = "PLANNED" | "DONE" | "CANCELLED";

export const MEETING_KIND_LABEL: Record<MeetingKind, string> = {
  SUPERVISOR: "Họp GVHD",
  TEAM: "Họp nhóm",
  MIDTERM: "Báo cáo giữa kỳ",
  OTHER: "Khác",
};

export interface MeetingTaskView {
  id: string;
  title: string;
  done: boolean;
  dueAt: string | null;
}

export interface MeetingView {
  id: string;
  projectId: string;
  kind: MeetingKind;
  title: string;
  startAt: string;
  endAt: string | null;
  mode: MeetingMode;
  location: string | null;
  meetUrl: string | null;
  attendees: string[];
  agendaMd: string;
  minutesMd: string;
  status: MeetingStatus;
  /** Có giá trị khi thuộc một chuỗi họp lặp */
  seriesId: string | null;
  tasks: MeetingTaskView[];
}

export interface DoneTaskView {
  title: string;
  doneAt: string;
}

export interface MeetingsPayload {
  meetings: MeetingView[];
  /** Việc đã xong gần đây (để gợi ý "đã làm từ lần họp trước") */
  doneTasks: DoneTaskView[];
  error?: string;
  code?: string;
}

/** Các dòng `- [ ] việc` / `- [x] việc` trong Markdown */
export function extractChecklist(md: string): { title: string; done: boolean }[] {
  const out: { title: string; done: boolean }[] = [];
  for (const line of md.split(/\r?\n/)) {
    const m = /^\s*[-*]\s+\[( |x|X)\]\s+(.+?)\s*$/.exec(line);
    if (m) out.push({ done: m[1].toLowerCase() === "x", title: m[2].slice(0, 200) });
  }
  return out;
}
