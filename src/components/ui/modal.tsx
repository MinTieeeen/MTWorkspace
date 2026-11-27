"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const CLOSE_MS = 180;
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Ngăn xếp modal đang mở: chỉ modal trên cùng xử lý ESC; khóa cuộn khi còn ít nhất 1 modal
const openStack: symbol[] = [];

/** Giữ lại giá trị khác null gần nhất, để nội dung modal không biến mất giữa lúc chạy hiệu ứng đóng. */
export function useRetained<T>(value: T | null | undefined): T | null {
  const ref = useRef<T | null>(null);
  if (value !== null && value !== undefined) ref.current = value;
  return value ?? ref.current;
}

const SIZES = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-5xl",
} as const;

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: keyof typeof SIZES;
  /** Ghi đè class của khung (thay cho size) */
  panelClassName?: string;
  label?: string;
}

export function Modal({
  open,
  onClose,
  children,
  size = "md",
  panelClassName,
  label,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(open);
  const panelRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<symbol>(Symbol("modal"));
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => setMounted(true), []);

  // Mở: hiện ngay. Đóng: chạy hiệu ứng rồi mới gỡ khỏi DOM
  useEffect(() => {
    if (open) {
      setVisible(true);
      return;
    }
    const t = setTimeout(() => setVisible(false), CLOSE_MS);
    return () => clearTimeout(t);
  }, [open]);

  // ESC, khóa cuộn, focus trap
  useEffect(() => {
    if (!open || !mounted) return;
    const id = idRef.current;
    openStack.push(id);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const prevFocus = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== id) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const nodes = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      const idx = openStack.indexOf(id);
      if (idx >= 0) openStack.splice(idx, 1);
      if (openStack.length === 0) document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, [open, mounted]);

  if (!mounted || (!open && !visible)) return null;
  const state = open ? "open" : "closing";

  return createPortal(
    <div
      data-state={state}
      className="mt-modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        data-state={state}
        className={cn(
          "mt-modal-panel relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl outline-none",
          panelClassName ?? SIZES[size]
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
