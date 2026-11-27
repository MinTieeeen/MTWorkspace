"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  Box,
  ExternalLink,
  FileText,
  GitBranch,
  HardDrive,
  Link2,
  Palette,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Modal, useRetained } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { Field, ModalHeader, inputCls, thesisApi } from "@/components/thesis/form-bits";
import {
  LINK_KINDS,
  LINK_KIND_LABEL,
  THESIS_EVENT,
  guessLinkKind,
  linkHost,
  type LinkKind,
  type LinksPayload,
  type LinkView,
} from "@/lib/thesis/workspace-types";
import type { ProjectView } from "@/lib/thesis/types";
import { useMybkResource } from "@/lib/use-mybk-resource";

const KIND_ICON: Record<LinkKind, React.ReactNode> = {
  REPO: <GitBranch className="h-[18px] w-[18px]" />,
  DRIVE: <HardDrive className="h-[18px] w-[18px]" />,
  DOC: <FileText className="h-[18px] w-[18px]" />,
  DESIGN: <Palette className="h-[18px] w-[18px]" />,
  PAPER: <BookOpen className="h-[18px] w-[18px]" />,
  OTHER: <Box className="h-[18px] w-[18px]" />,
};

function LinkModal({
  open,
  onClose,
  project,
  link,
}: {
  open: boolean;
  onClose: () => void;
  project: ProjectView;
  link: LinkView | null;
}) {
  const [form, setForm] = useState({ url: "", title: "", kind: "OTHER" as LinkKind });
  const [kindTouched, setKindTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");

  const key = open ? link?.id ?? "new" : "";
  if (key !== loadedKey) {
    setLoadedKey(key);
    if (open) {
      setConfirmDelete(false);
      setKindTouched(Boolean(link));
      setForm(link ? { url: link.url, title: link.title, kind: link.kind } : { url: "", title: "", kind: "OTHER" });
    }
  }

  const onUrl = (url: string) =>
    setForm((f) => ({
      ...f,
      url,
      // Tự đoán loại khi người dùng chưa chọn tay
      kind: kindTouched ? f.kind : guessLinkKind(url.trim()),
    }));

  const save = async () => {
    const url = form.url.trim();
    if (!/^https?:\/\//i.test(url)) {
      toast.error("Đường dẫn phải bắt đầu bằng http:// hoặc https://");
      return;
    }
    const body = { url, title: form.title.trim() || linkHost(url), kind: form.kind };
    setSaving(true);
    const ok = link
      ? await thesisApi(`/api/thesis/links/${link.id}`, "PATCH", body)
      : await thesisApi("/api/thesis/links", "POST", { ...body, projectId: project.id });
    setSaving(false);
    if (ok) {
      toast.success(link ? "Đã lưu liên kết" : "Đã thêm liên kết");
      onClose();
    }
  };

  const remove = async () => {
    if (!link) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    const ok = await thesisApi(`/api/thesis/links/${link.id}`, "DELETE");
    setSaving(false);
    if (ok) {
      toast.success("Đã xóa liên kết");
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="sm" label="Liên kết">
      <ModalHeader eyebrow="Tài liệu" title={link ? "Sửa liên kết" : "Thêm liên kết"} onClose={onClose} />
      <form
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Đường dẫn *">
          <input
            className={inputCls}
            value={form.url}
            onChange={(e) => onUrl(e.target.value)}
            placeholder="https://github.com/…"
            maxLength={1000}
            autoFocus
          />
        </Field>
        <Field label="Tên hiển thị" hint="Để trống sẽ dùng tên miền.">
          <input
            className={inputCls}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            maxLength={200}
          />
        </Field>
        <Field label="Loại">
          <Select
            value={form.kind}
            onChange={(e) => {
              setKindTouched(true);
              setForm((f) => ({ ...f, kind: e.target.value as LinkKind }));
            }}
          >
            {LINK_KINDS.map((k) => (
              <option key={k} value={k}>{LINK_KIND_LABEL[k]}</option>
            ))}
          </Select>
        </Field>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
      <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
        <div>
          {link && (
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

export function LinksTab({ project }: { project: ProjectView }) {
  const res = useMybkResource<LinksPayload & { connected?: never }>({
    url: "/api/thesis/links",
    revalidate: false,
    refetchEvent: THESIS_EVENT,
  });
  const data = res.data;

  const [kindFilter, setKindFilter] = useState<LinkKind | "ALL">("ALL");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const mine = useMemo(
    () => (data?.links ?? []).filter((l) => l.projectId === project.id),
    [data, project.id]
  );
  const shown = kindFilter === "ALL" ? mine : mine.filter((l) => l.kind === kindFilter);
  const kindsInUse = LINK_KINDS.filter((k) => mine.some((l) => l.kind === k));
  const active = useRetained(mine.find((l) => l.id === activeId) ?? null);

  const openNew = () => {
    setActiveId(null);
    setOpen(true);
  };

  if (!data && res.status === "loading") {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }
  if (res.status === "error" && !data) {
    return <ErrorState title="Không tải được tài liệu" message={res.error ?? undefined} onRetry={res.retry} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {mine.length > 1 && kindsInUse.length > 1 ? (
            (["ALL", ...kindsInUse] as const).map((k) => (
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
                {k === "ALL" ? "Tất cả" : LINK_KIND_LABEL[k]}
              </button>
            ))
          ) : (
            <p className="text-[13px] text-muted-foreground">
              <span className="font-mono font-semibold text-foreground">{mine.length}</span> liên kết
            </p>
          )}
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Thêm liên kết
        </Button>
      </div>

      {mine.length === 0 ? (
        <EmptyState
          icon={<Link2 />}
          title="Chưa có liên kết nào"
          description="Gom repo, thư mục Drive, Overleaf, bài báo tham khảo về một chỗ để mở nhanh."
          action={
            <Button size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" />
              Thêm liên kết đầu tiên
            </Button>
          }
        />
      ) : (
        <div className="mt-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((l) => (
            <div
              key={l.id}
              className="group flex items-center gap-3 rounded-2xl border bg-card p-3.5 transition-colors hover:border-primary/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {KIND_ICON[l.kind]}
              </span>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1"
                title={l.url}
              >
                <p className="truncate font-display text-sm font-semibold text-foreground">{l.title}</p>
                <p className="flex items-center gap-1 truncate font-mono text-xs text-muted-foreground">
                  {linkHost(l.url)}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </p>
              </a>
              <button
                type="button"
                onClick={() => {
                  setActiveId(l.id);
                  setOpen(true);
                }}
                aria-label={`Sửa ${l.title}`}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <LinkModal open={open} onClose={() => setOpen(false)} project={project} link={activeId ? active : null} />
    </div>
  );
}
