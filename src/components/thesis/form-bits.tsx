"use client";

import { X } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { notifyThesisChanged } from "@/lib/thesis/workspace-types";

export const inputCls =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-2 focus:ring-ring/30";

export function Field({
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
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function ModalHeader({
  eyebrow,
  title,
  onClose,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-primary">{eyebrow}</p>
        <h2 className="mt-0.5 truncate font-display text-base font-bold text-foreground">{title}</h2>
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
  );
}

/** Gọi API đồ án; thành công thì báo các tab tải lại, lỗi thì hiện thông báo */
export async function thesisApi(url: string, method: string, body?: unknown): Promise<boolean> {
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
    notifyThesisChanged();
    return true;
  } catch {
    toast.error("Lỗi kết nối, vui lòng thử lại");
    return false;
  }
}
