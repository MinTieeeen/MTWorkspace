"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface ToastPayload {
  id?: string;
  variant?: ToastVariant;
  title: string;
  description?: string;
  action?: ToastAction;
  durationMs?: number;
}

interface ActiveToast extends Required<Pick<ToastPayload, "id" | "variant" | "title">> {
  description?: string;
  action?: ToastAction;
  durationMs: number;
}

const TOAST_EVENT_NAME = "mt-workspace-toast";

export function showToast(payload: ToastPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ToastPayload>(TOAST_EVENT_NAME, { detail: payload })
  );
}

export const toast = {
  success: (title: string, opts?: Omit<ToastPayload, "title" | "variant">) =>
    showToast({ ...opts, title, variant: "success" }),
  error: (title: string, opts?: Omit<ToastPayload, "title" | "variant">) =>
    showToast({ ...opts, title, variant: "error" }),
  info: (title: string, opts?: Omit<ToastPayload, "title" | "variant">) =>
    showToast({ ...opts, title, variant: "info" }),
};

export function ToastViewport() {
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<ActiveToast[]>([]);

  useEffect(() => {
    setMounted(true);

    const onToast = (e: Event) => {
      const custom = e as CustomEvent<ToastPayload>;
      const detail = custom.detail;
      if (!detail?.title) return;

      const id =
        detail.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const nextItem: ActiveToast = {
        id,
        variant: detail.variant || "info",
        title: detail.title,
        description: detail.description,
        action: detail.action,
        durationMs: detail.durationMs ?? 3800,
      };

      setItems((prev) => [...prev.slice(-3), nextItem]);

      if (nextItem.durationMs > 0) {
        setTimeout(() => {
          setItems((prev) => prev.filter((t) => t.id !== id));
        }, nextItem.durationMs);
      }
    };

    window.addEventListener(TOAST_EVENT_NAME, onToast);
    return () => window.removeEventListener(TOAST_EVENT_NAME, onToast);
  }, []);

  if (!mounted || items.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed right-5 bottom-5 z-[200] flex w-full max-w-sm flex-col gap-2.5">
      {items.map((t) => {
        const isSuccess = t.variant === "success";
        const isError = t.variant === "error";

        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-card-foreground shadow-xl animate-in fade-in slide-in-from-bottom-3 duration-200",
              isSuccess && "border-emerald-500/40",
              isError && "border-rose-500/40",
              !isSuccess && !isError && "border-primary/35"
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                  isSuccess &&
                    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                  isError &&
                    "bg-rose-500/15 text-rose-600 dark:text-rose-400",
                  !isSuccess &&
                    !isError &&
                    "bg-primary/15 text-primary"
                )}
              >
                {isSuccess ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : isError ? (
                  <AlertCircle className="h-4 w-4" />
                ) : (
                  <Info className="h-4 w-4" />
                )}
              </div>

              <div className="min-w-0">
                <p className="truncate font-heading text-xs font-bold text-foreground">
                  {t.title}
                </p>
                {t.description && (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {t.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {t.action &&
                (t.action.href ? (
                  <a
                    href={t.action.href}
                    className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    {t.action.label}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      t.action?.onClick?.();
                      setItems((prev) => prev.filter((x) => x.id !== t.id));
                    }}
                    className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    {t.action.label}
                  </button>
                ))}

              <button
                type="button"
                onClick={() =>
                  setItems((prev) => prev.filter((x) => x.id !== t.id))
                }
                className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Đóng thông báo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
