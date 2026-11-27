"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

/** Tab dạng viên thuốc, nền active trượt mượt sang tab được chọn. */
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentOption<T>[];
  className?: string;
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>());
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current.get(value);
      if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    const raf = requestAnimationFrame(() => setAnimate(true));
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [value, options.length]);

  return (
    <div
      role="tablist"
      className={cn(
        "relative inline-flex items-center gap-0.5 rounded-xl bg-muted/60 p-1",
        className
      )}
    >
      {pill && (
        <span
          aria-hidden
          className={cn(
            "absolute left-0 top-1 bottom-1 rounded-lg bg-primary",
            animate &&
              "transition-[transform,width] duration-200 ease-out motion-reduce:transition-none"
          )}
          style={{ width: pill.w, transform: `translateX(${pill.x}px)` }}
        />
      )}
      {options.map((opt) => (
        <button
          key={opt.value}
          ref={(el) => {
            if (el) refs.current.set(opt.value, el);
          }}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "relative z-10 inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-200",
            value === opt.value
              ? "text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
