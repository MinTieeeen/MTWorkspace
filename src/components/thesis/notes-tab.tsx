"use client";

import { useMemo, useState } from "react";
import { NotebookPen, Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal, useRetained } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { Field, ModalHeader, inputCls, thesisApi } from "@/components/thesis/form-bits";
import { normalizeSearch } from "@/lib/format";
import { extractChecklist } from "@/lib/thesis/meeting-types";
import {
  NOTE_KINDS,
  NOTE_KIND_LABEL,
  THESIS_EVENT,
  WEEKLY_TEMPLATE,
  vnMonday,
  type NoteKind,
  type NotesPayload,
  type NoteView,
} from "@/lib/thesis/workspace-types";
import type { ProjectView } from "@/lib/thesis/types";
import { useMybkResource } from "@/lib/use-mybk-resource";

const KIND_TONE: Record<NoteKind, "neutral" | "primary" | "warning" | "info"> = {
  NOTE: "neutral",
  WEEKLY_LOG: "primary",
  IDEA: "warning",
  QUESTION: "info",
};

/** "2026-11-23" → "23/11" */
const dm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

/** Tuần bắt đầu từ thứ Hai `monday` (YYYY-MM-DD): "23/11 – 29/11" */
function weekRange(monday: string): string {
  const end = new Date(Date.parse(`${monday}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
  return `${dm(monday)} – ${dm(end)}`;
}

/** Bỏ ký hiệu Markdown để làm đoạn trích */
function excerpt(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+(\[[ xX]\]\s+)?/gm, "• ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

interface NoteForm {
  title: string;
  kind: NoteKind;
  bodyMd: string;
  tags: string;
  pinned: boolean;
  weekOf: string | null;
}

function NoteModal({
  open,
  onClose,
  project,
  note,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  project: ProjectView;
  /** null = tạo mới */
  note: NoteView | null;
  /** Dữ liệu điền sẵn khi tạo mới (vd nhật ký tuần) */
  preset: Partial<NoteForm> | null;
}) {
  const [form, setForm] = useState<NoteForm>({ title: "", kind: "NOTE", bodyMd: "", tags: "", pinned: false, weekOf: null });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");

  const key = open ? `${note?.id ?? "new"}:${preset?.weekOf ?? ""}:${preset?.kind ?? ""}` : "";
  if (key !== loadedKey) {
    setLoadedKey(key);
    if (open) {
      setConfirmDelete(false);
      setForm(
        note
          ? { title: note.title, kind: note.kind, bodyMd: note.bodyMd, tags: note.tags.join(", "), pinned: note.pinned, weekOf: note.weekOf }
          : { title: "", kind: "NOTE", bodyMd: "", tags: "", pinned: false, weekOf: null, ...preset }
      );
    }
  }

  const set =
    (k: keyof NoteForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const pending = extractChecklist(form.bodyMd).filter((c) => !c.done);

  const save = async () => {
    if (!form.title.trim()) {
      toast.error("Cần nhập tiêu đề");
      return;
    }
    const body = {
      title: form.title,
      kind: form.kind,
      bodyMd: form.bodyMd,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      pinned: form.pinned,
      weekOf: form.kind === "WEEKLY_LOG" ? form.weekOf ?? vnMonday(Date.now()) : null,
    };
    setSaving(true);
    const ok = note
      ? await thesisApi(`/api/thesis/notes/${note.id}`, "PATCH", body)
      : await thesisApi("/api/thesis/notes", "POST", { ...body, projectId: project.id });
    setSaving(false);
    if (ok) {
      toast.success("Đã lưu ghi chú");
      onClose();
    }
  };

  const toTasks = async () => {
    const ok = await thesisApi("/api/thesis/tasks", "POST", {
      projectId: project.id,
      items: pending.map((c) => ({ title: c.title })),
    });
    if (ok) toast.success(`Đã chuyển ${pending.length} dòng thành công việc`);
  };

  const remove = async () => {
    if (!note) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    const ok = await thesisApi(`/api/thesis/notes/${note.id}`, "DELETE");
    setSaving(false);
    if (ok) {
      toast.success("Đã xóa ghi chú");
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="md" label="Ghi chú">
      <ModalHeader
        eyebrow={note ? NOTE_KIND_LABEL[form.kind] : "Ghi chú mới"}
        title={note ? form.title || "Ghi chú" : "Viết ghi chú"}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <Field label="Tiêu đề *">
            <input className={inputCls} value={form.title} onChange={set("title")} maxLength={200} autoFocus />
          </Field>
          <Field label="Loại">
            <Select
              value={form.kind}
              onChange={(e) => {
                const kind = e.target.value as NoteKind;
                setForm((f) => ({
                  ...f,
                  kind,
                  // Chọn nhật ký tuần cho ghi chú trống: điền sẵn mẫu
                  bodyMd: kind === "WEEKLY_LOG" && !f.bodyMd.trim() ? WEEKLY_TEMPLATE : f.bodyMd,
                  weekOf: kind === "WEEKLY_LOG" ? f.weekOf ?? vnMonday(Date.now()) : null,
                }));
              }}
            >
              {NOTE_KINDS.map((k) => (
                <option key={k} value={k}>{NOTE_KIND_LABEL[k]}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Nội dung" hint="Văn bản thường hoặc Markdown. Dòng “- [ ] việc” có thể chuyển thành công việc.">
          <textarea
            className={cn(inputCls, "min-h-[14rem] font-mono text-[13px] leading-relaxed")}
            value={form.bodyMd}
            onChange={set("bodyMd")}
          />
        </Field>
        <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto]">
          <Field label="Thẻ" hint="Cách nhau bằng dấu phẩy.">
            <input className={inputCls} value={form.tags} onChange={set("tags")} placeholder="vd: báo cáo, chương 3" />
          </Field>
          <label className="mb-6 inline-flex items-center gap-2 text-[13px] font-medium text-foreground">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />
            Ghim lên đầu
          </label>
        </div>
        {note && pending.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5">
            <p className="text-[13px] text-foreground">
              Có <b>{pending.length}</b> dòng việc chưa xong. Lưu ghi chú trước rồi chuyển.
            </p>
            <Button size="sm" onClick={toTasks}>Tạo công việc</Button>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
        <div>
          {note && (
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

export function NotesTab({ project, nowMs }: { project: ProjectView; nowMs: number }) {
  const res = useMybkResource<NotesPayload & { connected?: never }>({
    url: "/api/thesis/notes",
    revalidate: false,
    refetchEvent: THESIS_EVENT,
  });
  const data = res.data;

  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<NoteKind | "ALL">("ALL");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [preset, setPreset] = useState<Partial<NoteForm> | null>(null);
  const [open, setOpen] = useState(false);

  const mine = useMemo(
    () => (data?.notes ?? []).filter((n) => n.projectId === project.id),
    [data, project.id]
  );
  const allTags = useMemo(() => Array.from(new Set(mine.flatMap((n) => n.tags))).sort(), [mine]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(query.trim());
    return mine.filter(
      (n) =>
        (kindFilter === "ALL" || n.kind === kindFilter) &&
        (!tagFilter || n.tags.includes(tagFilter)) &&
        (!q || normalizeSearch(`${n.title} ${n.bodyMd} ${n.tags.join(" ")}`).includes(q))
    );
  }, [mine, query, kindFilter, tagFilter]);

  const active = useRetained(mine.find((n) => n.id === activeId) ?? null);

  const monday = vnMonday(nowMs);
  const thisWeek = mine.find((n) => n.kind === "WEEKLY_LOG" && n.weekOf === monday) ?? null;

  const openNote = (n: NoteView) => {
    setActiveId(n.id);
    setPreset(null);
    setOpen(true);
  };
  const openNew = (p: Partial<NoteForm> | null = null) => {
    setActiveId(null);
    setPreset(p);
    setOpen(true);
  };
  const openWeekly = () => {
    if (thisWeek) return openNote(thisWeek);
    openNew({
      kind: "WEEKLY_LOG",
      title: `Nhật ký tuần ${weekRange(monday)}`,
      bodyMd: WEEKLY_TEMPLATE,
      weekOf: monday,
    });
  };

  if (!data && res.status === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      </div>
    );
  }
  if (res.status === "error" && !data) {
    return <ErrorState title="Không tải được ghi chú" message={res.error ?? undefined} onRetry={res.retry} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className={cn(inputCls, "pl-9")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm ghi chú…"
            aria-label="Tìm ghi chú"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={openWeekly}>
            <NotebookPen className="h-4 w-4" />
            {thisWeek ? "Nhật ký tuần này" : "Viết nhật ký tuần"}
          </Button>
          <Button onClick={() => openNew()}>
            <Plus className="h-4 w-4" />
            Ghi chú mới
          </Button>
        </div>
      </div>

      {mine.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {(["ALL", ...NOTE_KINDS] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kindFilter === k}
              onClick={() => setKindFilter(k)}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-[13px] transition-colors",
                kindFilter === k
                  ? "border-primary/50 bg-primary/10 font-semibold text-primary"
                  : "text-muted-foreground hover:border-primary/30 hover:text-foreground"
              )}
            >
              {k === "ALL" ? "Tất cả" : NOTE_KIND_LABEL[k]}
            </button>
          ))}
          {allTags.length > 0 && <span className="mx-1 h-4 w-px bg-border" aria-hidden />}
          {allTags.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tagFilter === t}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
              className={cn(
                "rounded-lg border px-2 py-1 font-mono text-xs transition-colors",
                tagFilter === t
                  ? "border-primary/50 bg-primary/10 font-semibold text-primary"
                  : "text-muted-foreground hover:border-primary/30 hover:text-foreground"
              )}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {!thisWeek && mine.length > 0 && kindFilter === "ALL" && !query && (
        <button
          type="button"
          onClick={openWeekly}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-primary/10"
        >
          <span className="text-foreground">
            Chưa có nhật ký tuần <b>{weekRange(monday)}</b>. Ghi lại đã làm gì, vướng gì để họp GVHD dễ hơn.
          </span>
          <span className="shrink-0 font-semibold text-primary">Viết ngay</span>
        </button>
      )}

      {mine.length === 0 ? (
        <EmptyState
          icon={<NotebookPen />}
          title="Chưa có ghi chú nào"
          description="Ghi lại ý tưởng, câu hỏi cho GVHD, hoặc nhật ký tuần để theo dõi tiến độ."
          action={
            <Button size="sm" onClick={openWeekly}>
              <Plus className="h-3.5 w-3.5" />
              Viết nhật ký tuần đầu tiên
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="Không có ghi chú phù hợp"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setQuery("");
                setKindFilter("ALL");
                setTagFilter(null);
              }}
            >
              Xóa bộ lọc
            </Button>
          }
        />
      ) : (
        <div className="mt-stagger grid gap-3 md:grid-cols-2">
          {filtered.map((n) => (
            <div
              key={n.id}
              className="group relative rounded-2xl border bg-card transition-colors hover:border-primary/40"
            >
              <button type="button" onClick={() => openNote(n)} className="block w-full p-4 pr-11 text-left">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={KIND_TONE[n.kind]}>{NOTE_KIND_LABEL[n.kind]}</Badge>
                  {n.kind === "WEEKLY_LOG" && n.weekOf && (
                    <span className="font-mono text-xs text-muted-foreground">{weekRange(n.weekOf)}</span>
                  )}
                </div>
                <p className="mt-2 line-clamp-1 font-display text-sm font-semibold text-foreground">{n.title}</p>
                {n.bodyMd && (
                  <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">
                    {excerpt(n.bodyMd)}
                  </p>
                )}
                <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {n.tags.map((t) => (
                    <span key={t} className="font-mono text-xs text-primary">#{t}</span>
                  ))}
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {new Date(n.updatedAt).toLocaleDateString("vi-VN", {
                      timeZone: "Asia/Ho_Chi_Minh",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => thesisApi(`/api/thesis/notes/${n.id}`, "PATCH", { pinned: !n.pinned })}
                aria-label={n.pinned ? "Bỏ ghim" : "Ghim"}
                title={n.pinned ? "Bỏ ghim" : "Ghim lên đầu"}
                className={cn(
                  "absolute right-3 top-3 rounded-md p-1.5 transition-colors hover:bg-muted",
                  n.pinned ? "text-primary" : "text-muted-foreground/60 hover:text-foreground"
                )}
              >
                {n.pinned ? <Pin className="h-4 w-4 fill-current" /> : <PinOff className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      )}

      <NoteModal open={open} onClose={() => setOpen(false)} project={project} note={active && activeId ? active : null} preset={preset} />
    </div>
  );
}
