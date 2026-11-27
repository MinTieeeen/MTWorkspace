"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { CommitteeView, ProjectView } from "@/lib/thesis/types";

interface FormState {
  titleVi: string;
  supervisorName: string;
  supervisorEmail: string;
  members: string;
  batchName: string;
  defenseAt: string;
  defenseCampus: string;
  defenseRoom: string;
}

const EMPTY: FormState = {
  titleVi: "",
  supervisorName: "",
  supervisorEmail: "",
  members: "",
  batchName: "",
  defenseAt: "",
  defenseCampus: "",
  defenseRoom: "",
};

/** ISO (UTC) → `YYYY-MM-DDTHH:mm` theo giờ Việt Nam cho input datetime-local */
function toVnLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Date(ms + 7 * 3600_000).toISOString().slice(0, 16);
}

function fromProject(
  project: ProjectView | null,
  committee: CommitteeView | null
): FormState {
  if (!project) return EMPTY;
  return {
    titleVi: project.titleVi ?? "",
    supervisorName: project.supervisor?.name ?? "",
    supervisorEmail: project.supervisor?.email ?? "",
    members: project.members.map((m) => m.name).join("\n"),
    batchName: project.batchName ?? "",
    defenseAt: toVnLocal(committee?.startAt),
    defenseCampus: committee?.campus ?? "",
    defenseRoom: committee?.room ?? "",
  };
}

const inputCls =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-2 focus:ring-ring/30";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

export function ManualProjectModal({
  open,
  onClose,
  project,
  committee,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Đồ án nhập tay đang có (để sửa); null khi tạo mới */
  project: ProjectView | null;
  committee: CommitteeView | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  // Nạp lại mỗi lần mở
  useEffect(() => {
    if (open) setForm(fromProject(project, committee));
  }, [open, project, committee]);

  const set = (k: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titleVi.trim()) {
      toast.error("Cần nhập tên đề tài");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/thesis/manual", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titleVi: form.titleVi,
          supervisorName: form.supervisorName,
          supervisorEmail: form.supervisorEmail,
          members: form.members.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean),
          batchName: form.batchName,
          defenseAt: form.defenseAt,
          defenseCampus: form.defenseCampus,
          defenseRoom: form.defenseRoom,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? "Không lưu được đồ án");
        return;
      }
      toast.success("Đã lưu thông tin đồ án");
      onSaved();
      onClose();
    } catch {
      toast.error("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="md" label="Thông tin đồ án nhập tay">
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <p className="text-xs font-semibold text-primary">Nhập tay</p>
            <h2 className="mt-0.5 font-display text-base font-bold text-foreground">
              {project ? "Sửa thông tin đồ án" : "Thêm thông tin đồ án"}
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <Field label="Tên đề tài *">
            <input
              className={inputCls}
              value={form.titleVi}
              onChange={set("titleVi")}
              maxLength={300}
              placeholder="Ví dụ: Xây dựng hệ thống quản lý…"
              autoFocus
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Giảng viên hướng dẫn">
              <input
                className={inputCls}
                value={form.supervisorName}
                onChange={set("supervisorName")}
                maxLength={120}
              />
            </Field>
            <Field label="Email giảng viên">
              <input
                type="email"
                className={inputCls}
                value={form.supervisorEmail}
                onChange={set("supervisorEmail")}
                maxLength={160}
              />
            </Field>
          </div>
          <Field label="Thành viên nhóm" hint="Mỗi người một dòng.">
            <textarea
              className={inputCls}
              rows={3}
              value={form.members}
              onChange={set("members")}
            />
          </Field>
          <Field label="Đợt đồ án">
            <input
              className={inputCls}
              value={form.batchName}
              onChange={set("batchName")}
              maxLength={200}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Ngày giờ bảo vệ">
              <input
                type="datetime-local"
                className={inputCls}
                value={form.defenseAt}
                onChange={set("defenseAt")}
              />
            </Field>
            <Field label="Cơ sở">
              <input
                className={inputCls}
                value={form.defenseCampus}
                onChange={set("defenseCampus")}
                maxLength={40}
              />
            </Field>
            <Field label="Phòng">
              <input
                className={inputCls}
                value={form.defenseRoom}
                onChange={set("defenseRoom")}
                maxLength={60}
              />
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button type="submit" loading={saving}>
            Lưu
          </Button>
        </div>
      </form>
    </Modal>
  );
}
