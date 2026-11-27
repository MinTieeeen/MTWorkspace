"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Check, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { Select } from "@/components/ui/select";
import { buildMeetingIcs, downloadIcs } from "@/lib/ics";
import { toVnLocalInput } from "@/lib/thesis/format";
import {
  MEETING_KIND_LABEL,
  extractChecklist,
  type DoneTaskView,
  type MeetingKind,
  type MeetingMode,
  type MeetingStatus,
  type MeetingView,
} from "@/lib/thesis/meeting-types";
import { THESIS_EVENT, notifyThesisChanged } from "@/lib/thesis/workspace-types";
import type { ProjectView } from "@/lib/thesis/types";

export const MEETINGS_EVENT = THESIS_EVENT;
export const notifyMeetingsChanged = notifyThesisChanged;

type Tab = "info" | "agenda" | "minutes" | "tasks";

interface FormState {
  title: string;
  kind: MeetingKind;
  startAt: string;
  durationMin: string;
  mode: MeetingMode;
  location: string;
  meetUrl: string;
  attendees: string[];
  extraAttendee: string;
  agendaMd: string;
  minutesMd: string;
  status: MeetingStatus;
  repeatWeeks: string;
}

const inputCls =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-2 focus:ring-ring/30";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** Giờ mặc định cho buổi họp mới: 9:00 ngày mai (giờ Việt Nam) */
function defaultStart(): string {
  const d = new Date(Date.now() + 7 * 3600_000 + 24 * 3600_000);
  return `${d.toISOString().slice(0, 10)}T09:00`;
}

function emptyForm(project: ProjectView): FormState {
  return {
    title: "Họp với GVHD",
    kind: "SUPERVISOR",
    startAt: defaultStart(),
    durationMin: "60",
    mode: "IN_PERSON",
    location: "",
    meetUrl: "",
    attendees: project.supervisor ? [project.supervisor.name] : [],
    extraAttendee: "",
    agendaMd: "",
    minutesMd: "",
    status: "PLANNED",
    repeatWeeks: "0",
  };
}

function fromMeeting(m: MeetingView): FormState {
  const dur = m.endAt
    ? Math.round((Date.parse(m.endAt) - Date.parse(m.startAt)) / 60_000)
    : 60;
  return {
    title: m.title,
    kind: m.kind,
    startAt: toVnLocalInput(m.startAt),
    durationMin: String(dur),
    mode: m.mode,
    location: m.location ?? "",
    meetUrl: m.meetUrl ?? "",
    attendees: m.attendees,
    extraAttendee: "",
    agendaMd: m.agendaMd,
    minutesMd: m.minutesMd,
    status: m.status,
    repeatWeeks: "0",
  };
}

async function api(url: string, method: string, body?: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      toast.error(json?.error ?? "Thao tác không thành công");
      return false;
    }
    notifyMeetingsChanged();
    return true;
  } catch {
    toast.error("Lỗi kết nối, vui lòng thử lại");
    return false;
  }
}

export function MeetingModal({
  open,
  onClose,
  project,
  creating,
  meeting: meetingProp,
  allMeetings,
  doneTasks,
}: {
  open: boolean;
  onClose: () => void;
  project: ProjectView;
  /** true = tạo mới (bỏ qua `meeting`) */
  creating: boolean;
  meeting: MeetingView | null;
  allMeetings: MeetingView[];
  doneTasks: DoneTaskView[];
}) {
  const meeting = creating ? null : meetingProp;
  const isNew = creating;

  const [tab, setTab] = useState<Tab>("info");
  const [form, setForm] = useState<FormState>(() => emptyForm(project));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");

  const meetingId = meeting?.id ?? null;
  // Nạp lại form khi mở hoặc đổi sang cuộc họp khác (không nạp lại khi chỉ có việc thay đổi)
  useEffect(() => {
    if (!open) return;
    setForm(meeting ? fromMeeting(meeting) : emptyForm(project));
    setTab("info");
    setConfirmDelete(false);
    setNewTask("");
    setNewTaskDue("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, meetingId]);

  const set =
    (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const people = [
    ...(project.supervisor ? [project.supervisor.name] : []),
    ...project.coSupervisors.map((p) => p.name),
    ...project.members.map((m) => m.name),
  ];
  const toggleAttendee = (name: string) =>
    setForm((f) => ({
      ...f,
      attendees: f.attendees.includes(name)
        ? f.attendees.filter((a) => a !== name)
        : [...f.attendees, name],
    }));
  const addExtra = () => {
    const name = form.extraAttendee.trim();
    if (!name) return;
    setForm((f) => ({
      ...f,
      attendees: f.attendees.includes(name) ? f.attendees : [...f.attendees, name],
      extraAttendee: "",
    }));
  };

  const payload = () => ({
    title: form.title,
    kind: form.kind,
    startAt: form.startAt,
    durationMin: Number(form.durationMin),
    mode: form.mode,
    location: form.location,
    meetUrl: form.meetUrl,
    attendees: form.attendees,
    agendaMd: form.agendaMd,
    minutesMd: form.minutesMd,
    status: form.status,
  });

  const save = async (patch?: Partial<{ status: MeetingStatus }>) => {
    if (!form.title.trim()) {
      toast.error("Cần nhập tiêu đề cuộc họp");
      setTab("info");
      return;
    }
    setSaving(true);
    const ok = meeting
      ? await api(`/api/thesis/meetings/${meeting.id}`, "PATCH", { ...payload(), ...patch })
      : await api("/api/thesis/meetings", "POST", {
          ...payload(),
          projectId: project.id,
          repeatWeeks: Number(form.repeatWeeks) || 0,
        });
    setSaving(false);
    if (ok) {
      toast.success(meeting ? "Đã lưu cuộc họp" : "Đã tạo cuộc họp");
      onClose();
    }
  };

  const remove = async () => {
    if (!meeting) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    const ok = await api(`/api/thesis/meetings/${meeting.id}`, "DELETE");
    setSaving(false);
    if (ok) {
      toast.success("Đã xóa cuộc họp");
      onClose();
    }
  };

  // ----- Chương trình: chèn việc đã xong từ lần họp trước -----
  const insertDoneSincePrev = () => {
    const startMs = Date.parse(`${form.startAt}:00+07:00`);
    const prev = allMeetings
      .filter(
        (m) =>
          m.id !== meeting?.id &&
          m.status !== "CANCELLED" &&
          Date.parse(m.startAt) < startMs
      )
      .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt))[0];
    const from = prev ? Date.parse(prev.startAt) : 0;
    const items = doneTasks.filter((t) => {
      const at = Date.parse(t.doneAt);
      return at > from && at <= startMs;
    });
    if (items.length === 0) {
      toast.info("Chưa có việc nào hoàn thành kể từ lần họp trước");
      return;
    }
    const block = `### Đã làm từ lần họp trước\n${items.map((t) => `- ${t.title}`).join("\n")}\n`;
    setForm((f) => ({ ...f, agendaMd: f.agendaMd ? `${f.agendaMd.trimEnd()}\n\n${block}` : block }));
  };

  // ----- Việc cần làm -----
  const tasks = meeting?.tasks ?? [];
  const fromMinutes = extractChecklist(form.minutesMd).filter(
    (c) => !c.done && !tasks.some((t) => t.title.toLowerCase() === c.title.toLowerCase())
  );
  const addTasks = async (items: { title: string; dueAt?: string }[]) => {
    if (!meeting || items.length === 0) return;
    await api(`/api/thesis/meetings/${meeting.id}/tasks`, "POST", { items });
  };

  const downloadOne = () => {
    if (!meeting) return;
    downloadIcs(buildMeetingIcs([meeting], project.titleVi ?? "Đồ án"), "CuocHop-DoAn.ics");
    toast.success("Đã tải tệp lịch (.ics)");
  };

  const tabs: { value: Tab; label: string }[] = isNew
    ? [{ value: "info", label: "Thông tin" }]
    : [
        { value: "info", label: "Thông tin" },
        { value: "agenda", label: "Chương trình" },
        { value: "minutes", label: "Biên bản" },
        { value: "tasks", label: `Việc cần làm${tasks.length ? ` (${tasks.length})` : ""}` },
      ];

  return (
    <Modal open={open} onClose={onClose} size="md" label="Cuộc họp đồ án">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">
            {isNew ? "Cuộc họp mới" : MEETING_KIND_LABEL[form.kind]}
          </p>
          <h2 className="mt-0.5 truncate font-display text-base font-bold text-foreground">
            {isNew ? "Thêm cuộc họp" : form.title || "Cuộc họp"}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {tabs.length > 1 && (
        <div className="border-b px-5 py-3">
          <SegmentedTabs value={tab} onChange={setTab} options={tabs} className="max-w-full overflow-x-auto" />
        </div>
      )}

      <div className="min-h-[18rem] flex-1 overflow-y-auto px-5 py-4">
        {tab === "info" && (
          <div className="space-y-4">
            <Field label="Tiêu đề *">
              <input className={inputCls} value={form.title} onChange={set("title")} maxLength={200} autoFocus />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Loại">
                <Select value={form.kind} onChange={set("kind")}>
                  {(Object.keys(MEETING_KIND_LABEL) as MeetingKind[]).map((k) => (
                    <option key={k} value={k}>
                      {MEETING_KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Hình thức">
                <Select value={form.mode} onChange={set("mode")}>
                  <option value="IN_PERSON">Trực tiếp</option>
                  <option value="ONLINE">Trực tuyến</option>
                </Select>
              </Field>
              <Field label="Bắt đầu">
                <input type="datetime-local" className={inputCls} value={form.startAt} onChange={set("startAt")} />
              </Field>
              <Field label="Thời lượng (phút)">
                <input type="number" min={5} max={600} step={5} className={inputCls} value={form.durationMin} onChange={set("durationMin")} />
              </Field>
            </div>
            {form.mode === "IN_PERSON" ? (
              <Field label="Địa điểm">
                <input className={inputCls} value={form.location} onChange={set("location")} maxLength={160} placeholder="Phòng, cơ sở…" />
              </Field>
            ) : (
              <Field label="Đường dẫn họp">
                <input className={inputCls} value={form.meetUrl} onChange={set("meetUrl")} maxLength={500} placeholder="https://meet.google.com/…" />
              </Field>
            )}

            <div>
              <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Người tham dự</span>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(new Set([...people, ...form.attendees])).map((name) => {
                  const on = form.attendees.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleAttendee(name)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[13px] transition-colors",
                        on
                          ? "border-primary/50 bg-primary/10 font-semibold text-primary"
                          : "text-muted-foreground hover:border-primary/30 hover:text-foreground"
                      )}
                    >
                      {on && <Check className="h-3 w-3" />}
                      {name}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  className={inputCls}
                  value={form.extraAttendee}
                  onChange={set("extraAttendee")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addExtra();
                    }
                  }}
                  placeholder="Thêm người khác…"
                  maxLength={120}
                />
                <Button variant="secondary" onClick={addExtra} aria-label="Thêm người tham dự">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {isNew ? (
              <Field label="Lặp lại hằng tuần">
                <Select value={form.repeatWeeks} onChange={set("repeatWeeks")}>
                  <option value="0">Không lặp</option>
                  {[3, 7, 11, 15].map((n) => (
                    <option key={n} value={n}>
                      Thêm {n} tuần nữa ({n + 1} buổi)
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Trạng thái">
                <Select value={form.status} onChange={set("status")}>
                  <option value="PLANNED">Sắp tới</option>
                  <option value="DONE">Đã họp</option>
                  <option value="CANCELLED">Đã hủy</option>
                </Select>
              </Field>
            )}
          </div>
        )}

        {tab === "agenda" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] text-muted-foreground">
                Điều cần báo cáo, câu hỏi cho GVHD. Văn bản thường hoặc Markdown.
              </p>
              <Button variant="secondary" size="sm" onClick={insertDoneSincePrev}>
                Chèn việc đã xong
              </Button>
            </div>
            <textarea
              className={cn(inputCls, "min-h-[14rem] font-mono text-[13px] leading-relaxed")}
              value={form.agendaMd}
              onChange={set("agendaMd")}
              placeholder={"- Báo cáo tiến độ\n- Câu hỏi cho GVHD: …"}
            />
          </div>
        )}

        {tab === "minutes" && (
          <div className="space-y-2">
            <p className="text-[13px] text-muted-foreground">
              Nhận xét và kết luận của buổi họp. Dòng dạng <code className="rounded bg-muted px-1 font-mono">- [ ] việc</code> có thể chuyển thành việc cần làm.
            </p>
            <textarea
              className={cn(inputCls, "min-h-[14rem] font-mono text-[13px] leading-relaxed")}
              value={form.minutesMd}
              onChange={set("minutesMd")}
              placeholder={"## Kết luận\n- …\n\n## Việc cần làm\n- [ ] Sửa chương 3 trước thứ Sáu"}
            />
          </div>
        )}

        {tab === "tasks" && meeting && (
          <div className="space-y-3">
            {fromMinutes.length > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5">
                <p className="text-[13px] text-foreground">
                  Biên bản có <b>{fromMinutes.length}</b> việc chưa thêm.
                </p>
                <Button size="sm" onClick={() => addTasks(fromMinutes.map((c) => ({ title: c.title })))}>
                  Thêm vào danh sách
                </Button>
              </div>
            )}

            {tasks.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted-foreground">
                Chưa có việc nào sau buổi họp này.
              </p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={(e) => api(`/api/thesis/tasks/${t.id}`, "PATCH", { done: e.target.checked })}
                      aria-label={`Hoàn thành: ${t.title}`}
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                    <span className={cn("min-w-0 flex-1 text-sm", t.done && "text-muted-foreground line-through")}>
                      {t.title}
                    </span>
                    {t.dueAt && (
                      <span className="font-mono text-xs text-muted-foreground">
                        hạn {new Date(t.dueAt).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" })}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => api(`/api/thesis/tasks/${t.id}`, "DELETE")}
                      aria-label="Xóa việc"
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-danger-fg"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form
              className="flex flex-wrap gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newTask.trim()) return;
                await addTasks([{ title: newTask, dueAt: newTaskDue || undefined }]);
                setNewTask("");
                setNewTaskDue("");
              }}
            >
              <input
                className={cn(inputCls, "min-w-0 flex-1")}
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                placeholder="Thêm việc cần làm…"
                maxLength={200}
              />
              <input
                type="date"
                className={cn(inputCls, "w-auto")}
                value={newTaskDue}
                onChange={(e) => setNewTaskDue(e.target.value)}
                aria-label="Hạn"
              />
              <Button type="submit" variant="secondary">
                <Plus className="h-4 w-4" />
                Thêm
              </Button>
            </form>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3">
        <div className="flex items-center gap-1.5">
          {meeting && (
            <>
              <Button variant="ghost" size="sm" onClick={downloadOne} title="Tải tệp lịch .ics">
                <CalendarPlus className="h-3.5 w-3.5" />
                .ics
              </Button>
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
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {meeting && meeting.status === "PLANNED" && (
            <Button
              variant="secondary"
              onClick={() => {
                setForm((f) => ({ ...f, status: "DONE" }));
                save({ status: "DONE" });
              }}
              disabled={saving}
            >
              Đánh dấu đã họp
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Đóng
          </Button>
          <Button onClick={() => save()} loading={saving}>
            Lưu
          </Button>
        </div>
      </div>
    </Modal>
  );
}
