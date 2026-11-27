import { prisma } from "@/lib/prisma";
import { MeetingInputError } from "./meetings";
import { parseVnDateTime } from "./normalize";
import {
  LINK_KINDS,
  NOTE_KINDS,
  TASK_STATUSES,
  vnMonday,
  type ChecklistItem,
  type LinkKind,
  type LinksPayload,
  type LinkView,
  type NoteKind,
  type NotesPayload,
  type NoteView,
  type TaskStatus,
  type TasksPayload,
  type TaskView,
} from "./workspace-types";

const clean = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
};

async function ownedProjectId(userId: string, projectId: unknown): Promise<string> {
  if (typeof projectId !== "string" || !projectId) throw new MeetingInputError("Thiếu thông tin đồ án");
  const p = await prisma.thesisProject.findFirst({ where: { id: projectId, userId }, select: { id: true } });
  if (!p) throw new MeetingInputError("Không tìm thấy đồ án", 404);
  return p.id;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** `YYYY-MM-DD` → cuối ngày giờ Việt Nam; rỗng → null */
function parseDue(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = parseVnDateTime(`${v.trim().slice(0, 10)}T23:59`);
  if (!d) throw new MeetingInputError("Hạn không hợp lệ");
  return d;
}

// =============================================================================================
// Công việc
// =============================================================================================

export interface TaskInput {
  projectId?: string;
  title?: string;
  descriptionMd?: string;
  status?: TaskStatus;
  priority?: number;
  dueAt?: Date | null;
  checklist?: ChecklistItem[];
}

export function parseTaskInput(body: unknown, partial: boolean): TaskInput {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const out: TaskInput = {};
  if (!partial || "title" in b) {
    const title = clean(b.title, 200);
    if (!title) throw new MeetingInputError("Cần nhập tên công việc");
    out.title = title;
  }
  if ("descriptionMd" in b) out.descriptionMd = clean(b.descriptionMd, 5000) ?? "";
  // Tương thích kiểu cũ { done: boolean }
  if (typeof b.done === "boolean") out.status = b.done ? "DONE" : "TODO";
  if ("status" in b) {
    if (!TASK_STATUSES.includes(b.status as TaskStatus)) throw new MeetingInputError("Trạng thái không hợp lệ");
    out.status = b.status as TaskStatus;
  }
  if ("priority" in b) {
    const p = Number(b.priority);
    out.priority = p === 1 || p === 2 ? p : 0;
  }
  if ("dueAt" in b) out.dueAt = parseDue(b.dueAt);
  if ("checklist" in b) {
    out.checklist = Array.isArray(b.checklist)
      ? b.checklist
          .map((c) => {
            const r = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
            const text = clean(r.text, 200);
            return text ? { text, done: r.done === true } : null;
          })
          .filter((c): c is ChecklistItem => c !== null)
          .slice(0, 30)
      : [];
  }
  if (!partial) out.projectId = clean(b.projectId, 60);
  return out;
}

type DbTask = Awaited<ReturnType<typeof prisma.task.findMany>>[number];

function taskView(t: DbTask, meetingTitles: Map<string, string>): TaskView {
  return {
    id: t.id,
    projectId: t.projectId,
    meetingId: t.meetingId,
    meetingTitle: t.meetingId ? meetingTitles.get(t.meetingId) ?? null : null,
    title: t.title,
    descriptionMd: t.descriptionMd ?? "",
    status: (TASK_STATUSES.includes(t.status as TaskStatus) ? t.status : "TODO") as TaskStatus,
    priority: (t.priority === 1 || t.priority === 2 ? t.priority : 0) as 0 | 1 | 2,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    checklist: parseJson<ChecklistItem[]>(t.checklistJson, []),
    doneAt: t.doneAt ? t.doneAt.toISOString() : null,
  };
}

export async function listTasks(userId: string, projectId?: string): Promise<TasksPayload> {
  const tasks = await prisma.task.findMany({
    where: { userId, ...(projectId ? { projectId } : {}) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const meetingIds = Array.from(new Set(tasks.map((t) => t.meetingId).filter((x): x is string => Boolean(x))));
  const meetings = meetingIds.length
    ? await prisma.thesisMeeting.findMany({ where: { id: { in: meetingIds } }, select: { id: true, title: true } })
    : [];
  const titles = new Map(meetings.map((m) => [m.id, m.title]));
  return { tasks: tasks.map((t) => taskView(t, titles)) };
}

/** Tạo một hoặc nhiều việc (bỏ qua tên trùng với việc đã có của đồ án) */
export async function createTasks(
  userId: string,
  projectIdRaw: unknown,
  items: { title: string; dueAt?: Date | null; priority?: number; descriptionMd?: string; checklist?: ChecklistItem[] }[]
): Promise<number> {
  const projectId = await ownedProjectId(userId, projectIdRaw);
  const existing = await prisma.task.findMany({ where: { userId, projectId }, select: { title: true, sortOrder: true } });
  const have = new Set(existing.map((t) => t.title.toLowerCase()));
  let order = existing.reduce((m, t) => Math.max(m, t.sortOrder), 0);
  const data = items
    .filter((i) => i.title && !have.has(i.title.toLowerCase()))
    .slice(0, 30)
    .map((i) => ({
      userId,
      projectId,
      title: i.title,
      dueAt: i.dueAt ?? null,
      priority: i.priority ?? 0,
      descriptionMd: i.descriptionMd || null,
      checklistJson: i.checklist?.length ? JSON.stringify(i.checklist) : null,
      sortOrder: ++order,
    }));
  if (data.length > 0) await prisma.task.createMany({ data });
  return data.length;
}

export async function updateTask(userId: string, id: string, input: TaskInput) {
  const t = await prisma.task.findFirst({ where: { id, userId }, select: { id: true, status: true } });
  if (!t) throw new MeetingInputError("Không tìm thấy công việc", 404);
  await prisma.task.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.descriptionMd !== undefined && { descriptionMd: input.descriptionMd || null }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.dueAt !== undefined && { dueAt: input.dueAt }),
      ...(input.checklist !== undefined && { checklistJson: input.checklist.length ? JSON.stringify(input.checklist) : null }),
      ...(input.status !== undefined && {
        status: input.status,
        doneAt: input.status === "DONE" ? (t.status === "DONE" ? undefined : new Date()) : null,
      }),
    },
  });
}

// =============================================================================================
// Ghi chú
// =============================================================================================

export interface NoteInput {
  projectId?: string;
  kind?: NoteKind;
  title?: string;
  bodyMd?: string;
  tags?: string[];
  pinned?: boolean;
  weekOf?: string | null;
}

export function parseNoteInput(body: unknown, partial: boolean): NoteInput {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const out: NoteInput = {};
  if (!partial || "title" in b) {
    const title = clean(b.title, 200);
    if (!title) throw new MeetingInputError("Cần nhập tiêu đề ghi chú");
    out.title = title;
  }
  if (!partial || "kind" in b) {
    out.kind = NOTE_KINDS.includes(b.kind as NoteKind) ? (b.kind as NoteKind) : "NOTE";
  }
  if ("bodyMd" in b || !partial) out.bodyMd = clean(b.bodyMd, 100000) ?? "";
  if ("tags" in b || !partial) {
    out.tags = Array.isArray(b.tags)
      ? Array.from(new Set(b.tags.map((t) => clean(t, 30)).filter((t): t is string => Boolean(t)))).slice(0, 8)
      : [];
  }
  if ("pinned" in b) out.pinned = b.pinned === true;
  if ("weekOf" in b) {
    const w = clean(b.weekOf, 10);
    if (w && !/^\d{4}-\d{2}-\d{2}$/.test(w)) throw new MeetingInputError("Tuần không hợp lệ");
    out.weekOf = w ?? null;
  }
  if (!partial) out.projectId = clean(b.projectId, 60);
  return out;
}

type DbNote = Awaited<ReturnType<typeof prisma.note.findMany>>[number];

function noteView(n: DbNote): NoteView {
  return {
    id: n.id,
    projectId: n.projectId,
    kind: (NOTE_KINDS.includes(n.kind as NoteKind) ? n.kind : "NOTE") as NoteKind,
    title: n.title,
    bodyMd: n.bodyMd,
    tags: parseJson<string[]>(n.tagsJson, []),
    pinned: n.pinned,
    weekOf: n.weekOf ? vnMonday(n.weekOf.getTime()) : null,
    updatedAt: n.updatedAt.toISOString(),
  };
}

export async function listNotes(userId: string, projectId?: string): Promise<NotesPayload> {
  const notes = await prisma.note.findMany({
    where: { userId, ...(projectId ? { projectId } : {}) },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  });
  return { notes: notes.map(noteView) };
}

const weekDate = (w: string | null | undefined) => (w ? new Date(`${w}T00:00:00+07:00`) : null);

export async function createNote(userId: string, input: NoteInput) {
  const projectId = await ownedProjectId(userId, input.projectId);
  const kind = input.kind ?? "NOTE";
  await prisma.note.create({
    data: {
      userId,
      projectId,
      kind,
      title: input.title!,
      bodyMd: input.bodyMd ?? "",
      tagsJson: JSON.stringify(input.tags ?? []),
      pinned: input.pinned ?? false,
      weekOf: kind === "WEEKLY_LOG" ? weekDate(input.weekOf ?? vnMonday(Date.now())) : null,
    },
  });
}

export async function updateNote(userId: string, id: string, input: NoteInput) {
  const n = await prisma.note.findFirst({ where: { id, userId }, select: { id: true } });
  if (!n) throw new MeetingInputError("Không tìm thấy ghi chú", 404);
  await prisma.note.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.bodyMd !== undefined && { bodyMd: input.bodyMd }),
      ...(input.tags !== undefined && { tagsJson: JSON.stringify(input.tags) }),
      ...(input.pinned !== undefined && { pinned: input.pinned }),
      ...(input.weekOf !== undefined && { weekOf: weekDate(input.weekOf) }),
    },
  });
}

export async function deleteNote(userId: string, id: string) {
  const n = await prisma.note.findFirst({ where: { id, userId }, select: { id: true } });
  if (!n) throw new MeetingInputError("Không tìm thấy ghi chú", 404);
  await prisma.note.delete({ where: { id } });
}

// =============================================================================================
// Tài liệu & liên kết
// =============================================================================================

export interface LinkInput {
  projectId?: string;
  kind?: LinkKind;
  title?: string;
  url?: string;
}

export function parseLinkInput(body: unknown, partial: boolean): LinkInput {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const out: LinkInput = {};
  if (!partial || "url" in b) {
    const url = clean(b.url, 1000);
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new MeetingInputError("Đường dẫn phải bắt đầu bằng http:// hoặc https://");
    }
    try {
      new URL(url);
    } catch {
      throw new MeetingInputError("Đường dẫn không hợp lệ");
    }
    out.url = url;
  }
  if (!partial || "title" in b) {
    const title = clean(b.title, 200);
    if (!title) throw new MeetingInputError("Cần nhập tên liên kết");
    out.title = title;
  }
  if (!partial || "kind" in b) {
    out.kind = LINK_KINDS.includes(b.kind as LinkKind) ? (b.kind as LinkKind) : "OTHER";
  }
  if (!partial) out.projectId = clean(b.projectId, 60);
  return out;
}

type DbLink = Awaited<ReturnType<typeof prisma.resourceLink.findMany>>[number];

const linkView = (l: DbLink): LinkView => ({
  id: l.id,
  projectId: l.projectId,
  kind: (LINK_KINDS.includes(l.kind as LinkKind) ? l.kind : "OTHER") as LinkKind,
  title: l.title,
  url: l.url,
});

export async function listLinks(userId: string, projectId?: string): Promise<LinksPayload> {
  const links = await prisma.resourceLink.findMany({
    where: { userId, ...(projectId ? { projectId } : {}) },
    orderBy: { createdAt: "asc" },
  });
  return { links: links.map(linkView) };
}

export async function createLink(userId: string, input: LinkInput) {
  const projectId = await ownedProjectId(userId, input.projectId);
  await prisma.resourceLink.create({
    data: { userId, projectId, kind: input.kind ?? "OTHER", title: input.title!, url: input.url! },
  });
}

export async function updateLink(userId: string, id: string, input: LinkInput) {
  const l = await prisma.resourceLink.findFirst({ where: { id, userId }, select: { id: true } });
  if (!l) throw new MeetingInputError("Không tìm thấy liên kết", 404);
  await prisma.resourceLink.update({
    where: { id },
    data: {
      ...(input.kind !== undefined && { kind: input.kind }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.url !== undefined && { url: input.url }),
    },
  });
}

export async function deleteLink(userId: string, id: string) {
  const l = await prisma.resourceLink.findFirst({ where: { id, userId }, select: { id: true } });
  if (!l) throw new MeetingInputError("Không tìm thấy liên kết", 404);
  await prisma.resourceLink.delete({ where: { id } });
}
