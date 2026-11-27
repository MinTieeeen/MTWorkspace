"use client";

import { useEffect, useRef, useState } from "react";
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
  leaving?: boolean;
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

  // Đánh dấu đang thoát để chạy animation, sau 200ms mới gỡ khỏi danh sách
  const dismiss = (id: string) => {
    setItems((prev) =>
      prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))
    );
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  };

  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

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
        setTimeout(() => dismissRef.current(id), nextItem.durationMs);
      }
    };

    window.addEventListener(TOAST_EVENT_NAME, onToast);
    return () => window.removeEventListener(TOAST_EVENT_NAME, onToast);
  }, []);

  if (!mounted || items.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed right-5 bottom-24 z-[200] flex w-full max-w-sm flex-col gap-2.5">
      {items.map((t) => {
        const isSuccess = t.variant === "success";
        const isError = t.variant === "error";

        return (
          <div
            key={t.id}
            data-state={t.leaving ? "closing" : "open"}
            className={cn(
              "mt-toast pointer-events-auto relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl border bg-card px-4 py-3 text-card-foreground shadow-xl",
              isSuccess && "border-success/40",
              isError && "border-danger/40",
              !isSuccess && !isError && "border-primary/35"
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                  isSuccess &&
                    "bg-success/15 text-success-fg",
                  isError &&
                    "bg-danger/15 text-danger-fg",
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
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
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
                    className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    {t.action.label}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      t.action?.onClick?.();
                      dismiss(t.id);
                    }}
                    className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    {t.action.label}
                  </button>
                ))}

              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Đóng thông báo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {t.durationMs > 0 && (
              <span
                aria-hidden
                className={cn(
                  "mt-toast-progress absolute bottom-0 left-0 h-0.5 w-full",
                  isSuccess && "bg-success/60",
                  isError && "bg-danger/60",
                  !isSuccess && !isError && "bg-primary/60"
                )}
                style={{ animationDuration: `${t.durationMs}ms` }}
              />
            )}
          </div>
        );
      })}
    </div>,
    document.body
  );
}
