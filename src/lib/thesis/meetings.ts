import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { parseVnDateTime } from "./normalize";
import type {
  DoneTaskView,
  MeetingKind,
  MeetingMode,
  MeetingStatus,
  MeetingsPayload,
  MeetingView,
} from "./meeting-types";

export class MeetingInputError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "MeetingInputError";
  }
}

const KINDS: MeetingKind[] = ["SUPERVISOR", "TEAM", "MIDTERM", "OTHER"];
const MODES: MeetingMode[] = ["IN_PERSON", "ONLINE"];
const STATUSES: MeetingStatus[] = ["PLANNED", "DONE", "CANCELLED"];

const clean = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
};

export interface MeetingInput {
  projectId?: string;
  kind: MeetingKind;
  title: string;
  startAt: Date;
  durationMin: number;
  mode: MeetingMode;
  location: string | null;
  meetUrl: string | null;
  attendees: string[];
  agendaMd: string;
  minutesMd: string;
  status: MeetingStatus;
  /** Số buổi lặp thêm (mỗi tuần một buổi), chỉ dùng khi tạo mới */
  repeatWeeks: number;
}

export function parseMeetingInput(body: unknown, partial = false): Partial<MeetingInput> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const out: Partial<MeetingInput> = {};

  if (!partial || "title" in b) {
    const title = clean(b.title, 200);
    if (!title) throw new MeetingInputError("Cần nhập tiêu đề cuộc họp");
    out.title = title;
  }
  if (!partial || "startAt" in b) {
    const d = parseVnDateTime(typeof b.startAt === "string" ? b.startAt : "");
    if (!d) throw new MeetingInputError("Ngày giờ họp không hợp lệ");
    out.startAt = d;
  }
  if (!partial || "durationMin" in b) {
    const n = Number(b.durationMin ?? 60);
    if (!Number.isFinite(n) || n < 5 || n > 600) {
      throw new MeetingInputError("Thời lượng phải từ 5 đến 600 phút");
    }
    out.durationMin = Math.round(n);
  }
  if ("kind" in b || !partial) {
    out.kind = KINDS.includes(b.kind as MeetingKind) ? (b.kind as MeetingKind) : "SUPERVISOR";
  }
  if ("mode" in b || !partial) {
    out.mode = MODES.includes(b.mode as MeetingMode) ? (b.mode as MeetingMode) : "IN_PERSON";
  }
  if ("location" in b || !partial) out.location = clean(b.location, 160) ?? null;
  if ("meetUrl" in b || !partial) {
    const url = clean(b.meetUrl, 500) ?? null;
    if (url && !/^https?:\/\//i.test(url)) {
      throw new MeetingInputError("Đường dẫn họp phải bắt đầu bằng http:// hoặc https://");
    }
    out.meetUrl = url;
  }
  if ("attendees" in b || !partial) {
    out.attendees = Array.isArray(b.attendees)
      ? b.attendees.map((a) => clean(a, 120)).filter((a): a is string => Boolean(a)).slice(0, 20)
      : [];
  }
  if ("agendaMd" in b || !partial) out.agendaMd = (clean(b.agendaMd, 20000) ?? "");
  if ("minutesMd" in b || !partial) out.minutesMd = (clean(b.minutesMd, 50000) ?? "");
  if ("status" in b) {
    if (!STATUSES.includes(b.status as MeetingStatus)) throw new MeetingInputError("Trạng thái không hợp lệ");
    out.status = b.status as MeetingStatus;
  }
  if (!partial) {
    const r = Number(b.repeatWeeks ?? 0);
    out.repeatWeeks = Number.isFinite(r) ? Math.min(Math.max(Math.round(r), 0), 15) : 0;
    out.projectId = clean(b.projectId, 60);
  }
  return out;
}

function parseAttendees(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

type DbMeeting = Awaited<ReturnType<typeof prisma.thesisMeeting.findMany>>[number];
type DbTask = Awaited<ReturnType<typeof prisma.task.findMany>>[number];

function toView(m: DbMeeting, tasks: DbTask[]): MeetingView {
  return {
    id: m.id,
    projectId: m.projectId,
    kind: (KINDS.includes(m.kind as MeetingKind) ? m.kind : "OTHER") as MeetingKind,
    title: m.title,
    startAt: m.startAt.toISOString(),
    endAt: m.endAt ? m.endAt.toISOString() : null,
    mode: m.mode === "ONLINE" ? "ONLINE" : "IN_PERSON",
    location: m.location,
    meetUrl: m.meetUrl,
    attendees: parseAttendees(m.attendeesJson),
    agendaMd: m.agendaMd ?? "",
    minutesMd: m.minutesMd ?? "",
    status: (STATUSES.includes(m.status as MeetingStatus) ? m.status : "PLANNED") as MeetingStatus,
    seriesId: m.recurrence?.startsWith("WEEKLY:") ? m.recurrence.slice(7) : null,
    tasks: tasks
      .filter((t) => t.meetingId === m.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime())
      .map((t) => ({
        id: t.id,
        title: t.title,
        done: t.status === "DONE",
        dueAt: t.dueAt ? t.dueAt.toISOString() : null,
      })),
  };
}

export async function listMeetings(userId: string, projectId?: string): Promise<MeetingsPayload> {
  const projects = await prisma.thesisProject.findMany({
    where: { userId, ...(projectId ? { id: projectId } : {}) },
    select: { id: true },
  });
  const ids = projects.map((p) => p.id);
  if (ids.length === 0) return { meetings: [], doneTasks: [] };

  const [meetings, tasks] = await Promise.all([
    prisma.thesisMeeting.findMany({
      where: { projectId: { in: ids } },
      orderBy: { startAt: "asc" },
    }),
    prisma.task.findMany({ where: { userId, projectId: { in: ids } } }),
  ]);

  const doneTasks: DoneTaskView[] = tasks
    .filter((t) => t.status === "DONE" && t.doneAt)
    .sort((a, b) => b.doneAt!.getTime() - a.doneAt!.getTime())
    .slice(0, 100)
    .map((t) => ({ title: t.title, doneAt: t.doneAt!.toISOString() }));

  return { meetings: meetings.map((m) => toView(m, tasks)), doneTasks };
}

async function assertProject(userId: string, projectId: string | undefined) {
  if (!projectId) throw new MeetingInputError("Thiếu thông tin đồ án");
  const p = await prisma.thesisProject.findFirst({ where: { id: projectId, userId }, select: { id: true } });
  if (!p) throw new MeetingInputError("Không tìm thấy đồ án", 404);
  return p.id;
}

export async function createMeetings(userId: string, input: Partial<MeetingInput>): Promise<string[]> {
  const projectId = await assertProject(userId, input.projectId);
  const repeat = input.repeatWeeks ?? 0;
  const seriesId = repeat > 0 ? randomUUID() : null;
  const WEEK = 7 * 24 * 3600_000;
  const ids: string[] = [];

  for (let i = 0; i <= repeat; i++) {
    const startAt = new Date(input.startAt!.getTime() + i * WEEK);
    const created = await prisma.thesisMeeting.create({
      data: {
        projectId,
        kind: input.kind!,
        title: input.title!,
        startAt,
        endAt: new Date(startAt.getTime() + input.durationMin! * 60_000),
        mode: input.mode!,
        location: input.location ?? null,
        meetUrl: input.meetUrl ?? null,
        attendeesJson: JSON.stringify(input.attendees ?? []),
        agendaMd: input.agendaMd || null,
        // Biên bản chỉ thuộc buổi đầu; các buổi lặp để trống
        minutesMd: i === 0 ? input.minutesMd || null : null,
        status: "PLANNED",
        recurrence: seriesId ? `WEEKLY:${seriesId}` : null,
      },
      select: { id: true },
    });
    ids.push(created.id);
  }
  return ids;
}

async function ownedMeeting(userId: string, id: string) {
  const m = await prisma.thesisMeeting.findFirst({
    where: { id, project: { userId } },
  });
  if (!m) throw new MeetingInputError("Không tìm thấy cuộc họp", 404);
  return m;
}

export async function updateMeeting(userId: string, id: string, input: Partial<MeetingInput>) {
  const current = await ownedMeeting(userId, id);
  const startAt = input.startAt ?? current.startAt;
  const durationMin =
    input.durationMin ??
    (current.endAt ? Math.round((current.endAt.getTime() - current.startAt.getTime()) / 60_000) : 60);

  await prisma.thesisMeeting.update({
    where: { id },
    data: {
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.title !== undefined && { title: input.title }),
      startAt,
      endAt: new Date(startAt.getTime() + durationMin * 60_000),
      ...(input.mode !== undefined && { mode: input.mode }),
      ...(input.location !== undefined && { location: input.location }),
      ...(input.meetUrl !== undefined && { meetUrl: input.meetUrl }),
      ...(input.attendees !== undefined && { attendeesJson: JSON.stringify(input.attendees) }),
      ...(input.agendaMd !== undefined && { agendaMd: input.agendaMd || null }),
      ...(input.minutesMd !== undefined && { minutesMd: input.minutesMd || null }),
      ...(input.status !== undefined && { status: input.status }),
    },
  });
}

export async function deleteMeeting(userId: string, id: string) {
  await ownedMeeting(userId, id);
  // Việc gắn với buổi họp: giữ lại nhưng bỏ liên kết
  await prisma.task.updateMany({ where: { userId, meetingId: id }, data: { meetingId: null } });
  await prisma.thesisMeeting.delete({ where: { id } });
}

export async function addMeetingTasks(
  userId: string,
  meetingId: string,
  items: { title: string; dueAt?: Date | null }[]
) {
  const m = await ownedMeeting(userId, meetingId);
  const existing = await prisma.task.findMany({
    where: { userId, meetingId },
    select: { title: true, sortOrder: true },
  });
  const have = new Set(existing.map((t) => t.title.toLowerCase()));
  let order = existing.reduce((mx, t) => Math.max(mx, t.sortOrder), 0);
  const data = items
    .map((i) => ({ ...i, title: i.title.trim().slice(0, 200) }))
    .filter((i) => i.title && !have.has(i.title.toLowerCase()))
    .slice(0, 30)
    .map((i) => ({
      userId,
      projectId: m.projectId,
      meetingId,
      title: i.title,
      dueAt: i.dueAt ?? null,
      sortOrder: ++order,
    }));
  if (data.length > 0) await prisma.task.createMany({ data });
  return data.length;
}

export async function setTaskDone(userId: string, taskId: string, done: boolean) {
  const t = await prisma.task.findFirst({ where: { id: taskId, userId }, select: { id: true } });
  if (!t) throw new MeetingInputError("Không tìm thấy công việc", 404);
  await prisma.task.update({
    where: { id: taskId },
    data: { status: done ? "DONE" : "TODO", doneAt: done ? new Date() : null },
  });
}

export async function deleteTask(userId: string, taskId: string) {
  const t = await prisma.task.findFirst({ where: { id: taskId, userId }, select: { id: true } });
  if (!t) throw new MeetingInputError("Không tìm thấy công việc", 404);
  await prisma.task.delete({ where: { id: taskId } });
}
