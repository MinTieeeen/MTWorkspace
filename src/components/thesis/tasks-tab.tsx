"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  ListChecks,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal, useRetained } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { Field, ModalHeader, inputCls, thesisApi } from "@/components/thesis/form-bits";
import { calendarDaysUntil } from "@/lib/format";
import { fmtVnDayMonth } from "@/lib/thesis/format";
import {
  PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  THESIS_EVENT,
  type ChecklistItem,
  type TaskStatus,
  type TasksPayload,
  type TaskView,
} from "@/lib/thesis/workspace-types";
import type { ProjectView } from "@/lib/thesis/types";
import { useMybkResource } from "@/lib/use-mybk-resource";

const COLUMN_TONE: Record<TaskStatus, string> = {
  TODO: "bg-muted-foreground/50",
  DOING: "bg-primary",
  DONE: "bg-success",
};

const vnDateKey = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10);

function dueInfo(t: TaskView, nowMs: number): { text: string; tone: "danger" | "warning" | "neutral" } | null {
  if (!t.dueAt) return null;
  const days = calendarDaysUntil(vnDateKey(t.dueAt), new Date(nowMs));
  const overdue = t.status !== "DONE" && Date.parse(t.dueAt) < nowMs;
  if (overdue) return { text: `Quá hạn · ${fmtVnDayMonth(t.dueAt)}`, tone: "danger" };
  if (t.status !== "DONE" && days <= 1) {
    return { text: days === 0 ? "Hôm nay" : "Ngày mai", tone: "warning" };
  }
  return { text: fmtVnDayMonth(t.dueAt), tone: "neutral" };
}

function TaskCard({
  task,
  nowMs,
  onOpen,
  onMove,
}: {
  task: TaskView;
  nowMs: number;
  onOpen: () => void;
  onMove: (to: TaskStatus) => void;
}) {
  const idx = TASK_STATUSES.indexOf(task.status);
  const due = dueInfo(task, nowMs);
  const doneItems = task.checklist.filter((c) => c.done).length;

  return (
    <div
      className={cn(
        "group rounded-xl border bg-card p-3 transition-colors hover:border-primary/40",
        task.status === "DONE" && "opacity-70"
      )}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <p className={cn("text-sm font-medium leading-snug text-foreground", task.status === "DONE" && "line-through")}>
          {task.title}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {task.priority > 0 && (
            <Badge tone={task.priority === 2 ? "danger" : "warning"}>{PRIORITY_LABEL[task.priority]}</Badge>
          )}
          {due && (
            <Badge tone={due.tone}>
              <CalendarClock className="h-3 w-3" />
              {due.text}
            </Badge>
          )}
          {task.checklist.length > 0 && (
            <Badge>
              <ListChecks className="h-3 w-3" />
              {doneItems}/{task.checklist.length}
            </Badge>
          )}
          {task.meetingTitle && (
            <span className="max-w-full truncate text-xs text-muted-foreground" title={task.meetingTitle}>
              từ “{task.meetingTitle}”
            </span>
          )}
        </div>
      </button>
      <div className="mt-2 flex items-center justify-end gap-1">
        <button
          type="button"
          disabled={idx === 0}
          onClick={() => onMove(TASK_STATUSES[idx - 1])}
          aria-label={`Chuyển sang ${TASK_STATUS_LABEL[TASK_STATUSES[Math.max(idx - 1, 0)]]}`}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={idx === TASK_STATUSES.length - 1}
          onClick={() => onMove(TASK_STATUSES[idx + 1])}
          aria-label={`Chuyển sang ${TASK_STATUS_LABEL[TASK_STATUSES[Math.min(idx + 1, 2)]]}`}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

interface TaskForm {
  title: string;
  descriptionMd: string;
  status: TaskStatus;
  priority: string;
  due: string;
  checklist: ChecklistItem[];
  newItem: string;
}

function TaskModal({
  open,
  onClose,
  project,
  task,
  creating,
  defaultStatus,
}: {
  open: boolean;
  onClose: () => void;
  project: ProjectView;
  task: TaskView | null;
  creating: boolean;
  defaultStatus: TaskStatus;
}) {
  const [form, setForm] = useState<TaskForm>({
    title: "", descriptionMd: "", status: "TODO", priority: "0", due: "", checklist: [], newItem: "",
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");

  // Nạp lại form mỗi lần mở (hoặc đổi sang việc khác), tránh dùng effect để không nháy nội dung cũ
  const key = open ? `${creating ? "new" : task?.id}:${defaultStatus}` : "";
  if (key !== loadedKey) {
    setLoadedKey(key);
    if (open) {
      setConfirmDelete(false);
      setForm(
        creating || !task
          ? { title: "", descriptionMd: "", status: defaultStatus, priority: "0", due: "", checklist: [], newItem: "" }
          : {
              title: task.title,
              descriptionMd: task.descriptionMd,
              status: task.status,
              priority: String(task.priority),
              due: task.dueAt ? vnDateKey(task.dueAt) : "",
              checklist: task.checklist,
              newItem: "",
            }
      );
    }
  }

  const set =
    (k: keyof TaskForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const addItem = () => {
    const text = form.newItem.trim();
    if (!text) return;
    setForm((f) => ({ ...f, checklist: [...f.checklist, { text, done: false }], newItem: "" }));
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error("Cần nhập tên công việc");
      return;
    }
    const body = {
      title: form.title,
      descriptionMd: form.descriptionMd,
      status: form.status,
      priority: Number(form.priority),
      dueAt: form.due,
      checklist: form.checklist,
    };
    setSaving(true);
    const ok = creating
      ? await thesisApi("/api/thesis/tasks", "POST", { ...body, projectId: project.id })
      : await thesisApi(`/api/thesis/tasks/${task!.id}`, "PATCH", body);
    setSaving(false);
    if (ok) {
      toast.success(creating ? "Đã thêm công việc" : "Đã lưu công việc");
      onClose();
    }
  };

  const remove = async () => {
    if (!task) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    const ok = await thesisApi(`/api/thesis/tasks/${task.id}`, "DELETE");
    setSaving(false);
    if (ok) {
      toast.success("Đã xóa công việc");
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="md" label="Công việc">
      <ModalHeader
        eyebrow={creating ? "Công việc mới" : "Công việc"}
        title={creating ? "Thêm công việc" : form.title || "Công việc"}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <Field label="Tên công việc *">
          <input className={inputCls} value={form.title} onChange={set("title")} maxLength={200} autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Trạng thái">
            <Select value={form.status} onChange={set("status")}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ưu tiên">
            <Select value={form.priority} onChange={set("priority")}>
              {PRIORITY_LABEL.map((l, i) => (
                <option key={l} value={i}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Hạn">
            <input type="date" className={inputCls} value={form.due} onChange={set("due")} />
          </Field>
        </div>
        <Field label="Mô tả">
          <textarea className={inputCls} rows={3} value={form.descriptionMd} onChange={set("descriptionMd")} />
        </Field>

        <div>
          <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Việc nhỏ</span>
          {form.checklist.length > 0 && (
            <ul className="mb-2 divide-y rounded-xl border">
              {form.checklist.map((c, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={c.done}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        checklist: f.checklist.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)),
                      }))
                    }
                    aria-label={c.text}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                  <span className={cn("min-w-0 flex-1 text-sm", c.done && "text-muted-foreground line-through")}>
                    {c.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, checklist: f.checklist.filter((_, j) => j !== i) }))}
                    aria-label="Xóa việc nhỏ"
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-danger-fg"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={form.newItem}
              onChange={set("newItem")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addItem();
                }
              }}
              placeholder="Thêm việc nhỏ…"
              maxLength={200}
            />
            <Button variant="secondary" onClick={addItem} aria-label="Thêm việc nhỏ">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
        <div>
          {!creating && (
            <Button
              variant="ghost"
              size="sm"
              onClick={remove}
              disabled={saving}
              className={cn(confirmDelete && "bg-danger/10 text-danger-fg hover:bg-danger/15")}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirmDelete ? "Bấm lại để xóa" : "Xóa"}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Đóng</Button>
          <Button onClick={save} loading={saving}>Lưu</Button>
        </div>
      </div>
    </Modal>
  );
}

export function TasksTab({ project, nowMs }: { project: ProjectView; nowMs: number }) {
  const res = useMybkResource<TasksPayload & { connected?: never }>({
    url: "/api/thesis/tasks",
    revalidate: false,
    refetchEvent: THESIS_EVENT,
  });
  const data = res.data;

  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newStatus, setNewStatus] = useState<TaskStatus>("TODO");
  const [open, setOpen] = useState(false);
  const [showAllDone, setShowAllDone] = useState(false);

  const mine = useMemo(
    () => (data?.tasks ?? []).filter((t) => t.projectId === project.id),
    [data, project.id]
  );
  const columns = useMemo(() => {
    const byStatus: Record<TaskStatus, TaskView[]> = { TODO: [], DOING: [], DONE: [] };
    for (const t of mine) byStatus[t.status].push(t);
    // Việc xong: mới xong nằm trên
    byStatus.DONE.sort((a, b) => Date.parse(b.doneAt ?? "0") - Date.parse(a.doneAt ?? "0"));
    // Còn lại: ưu tiên cao, rồi hạn gần
    for (const s of ["TODO", "DOING"] as const) {
      byStatus[s].sort(
        (a, b) =>
          b.priority - a.priority ||
          (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity)
      );
    }
    return byStatus;
  }, [mine]);

  const active = useRetained(mine.find((t) => t.id === activeId) ?? null);
  const overdue = mine.filter((t) => t.status !== "DONE" && t.dueAt && Date.parse(t.dueAt) < nowMs).length;

  const openNew = (status: TaskStatus) => {
    setCreating(true);
    setActiveId(null);
    setNewStatus(status);
    setOpen(true);
  };
  const openTask = (t: TaskView) => {
    setCreating(false);
    setActiveId(t.id);
    setOpen(true);
  };

  if (!data && res.status === "loading") {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-64 w-full" />)}
      </div>
    );
  }
  if (res.status === "error" && !data) {
    return <ErrorState title="Không tải được công việc" message={res.error ?? undefined} onRetry={res.retry} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
        <p className="text-[13px] text-muted-foreground">
          <span className="font-mono font-semibold text-foreground">{columns.TODO.length + columns.DOING.length}</span> việc đang mở ·{" "}
          <span className="font-mono font-semibold text-foreground">{columns.DONE.length}</span> đã xong
          {overdue > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-danger-fg">{overdue} quá hạn</span>
            </>
          )}
        </p>
        <Button onClick={() => openNew("TODO")}>
          <Plus className="h-4 w-4" />
          Thêm công việc
        </Button>
      </div>

      {mine.length === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          title="Chưa có công việc nào"
          description="Chia nhỏ đồ án thành các việc có hạn. Việc phát sinh sau mỗi buổi họp cũng xuất hiện ở đây."
          action={
            <Button size="sm" onClick={() => openNew("TODO")}>
              <Plus className="h-3.5 w-3.5" />
              Thêm công việc đầu tiên
            </Button>
          }
        />
      ) : (
        <div className="mt-stagger grid items-start gap-4 md:grid-cols-3">
          {TASK_STATUSES.map((status) => {
            const list = columns[status];
            const shown = status === "DONE" && !showAllDone ? list.slice(0, 8) : list;
            return (
              <section key={status} className="rounded-2xl border bg-muted/20">
                <div className="flex items-center justify-between gap-2 px-4 py-3">
                  <h3 className="flex items-center gap-2 font-display text-[13px] font-semibold text-foreground">
                    <span className={cn("h-2 w-2 rounded-full", COLUMN_TONE[status])} />
                    {TASK_STATUS_LABEL[status]}
                    <span className="font-mono font-medium text-muted-foreground">({list.length})</span>
                  </h3>
                  {status !== "DONE" && (
                    <button
                      type="button"
                      onClick={() => openNew(status)}
                      aria-label={`Thêm vào ${TASK_STATUS_LABEL[status]}`}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="space-y-2 px-3 pb-3">
                  {shown.length === 0 ? (
                    <p className="rounded-xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                      Trống
                    </p>
                  ) : (
                    shown.map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        nowMs={nowMs}
                        onOpen={() => openTask(t)}
                        onMove={(to) => thesisApi(`/api/thesis/tasks/${t.id}`, "PATCH", { status: to })}
                      />
                    ))
                  )}
                  {status === "DONE" && list.length > 8 && (
                    <button
                      type="button"
                      onClick={() => setShowAllDone((v) => !v)}
                      className="w-full rounded-lg py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
                    >
                      {showAllDone ? "Thu gọn" : `Xem thêm ${list.length - 8} việc`}
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <TaskModal
        open={open}
        onClose={() => setOpen(false)}
        project={project}
        task={creating ? null : active}
        creating={creating}
        defaultStatus={newStatus}
      />
    </div>
  );
}
