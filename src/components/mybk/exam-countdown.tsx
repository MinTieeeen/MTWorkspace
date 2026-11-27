"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function parts(targetMs: number, nowMs: number) {
  const totalSeconds = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    done: totalSeconds <= 0,
  };
}

/**
 * Đếm ngược tới mốc `targetMs`. Có ticker 1 giây riêng nên chỉ component này
 * render lại mỗi giây, phần còn lại của trang không bị ảnh hưởng.
 */
export function ExamCountdown({
  targetMs,
  className,
}: {
  targetMs: number;
  className?: string;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Chưa mount (server render): giữ chỗ để không nhảy bố cục
  const p = now === null ? null : parts(targetMs, now);
  const segments = [
    { v: p?.days, label: "ngày" },
    { v: p?.hours, label: "giờ" },
    { v: p?.minutes, label: "phút" },
    { v: p?.seconds, label: "giây" },
  ];

  return (
    <div
      role="timer"
      aria-label={
        p
          ? `Còn ${p.days} ngày ${p.hours} giờ ${p.minutes} phút`
          : "Đang tính thời gian"
      }
      className={cn("grid grid-cols-4 gap-2", className)}
    >
      {segments.map((seg) => (
        <div
          key={seg.label}
          className="rounded-xl border bg-muted/30 px-2 py-2.5 text-center"
        >
          <p className="font-mono text-2xl font-semibold leading-none text-foreground">
            {seg.v === undefined ? "--" : String(seg.v).padStart(2, "0")}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">{seg.label}</p>
        </div>
      ))}
    </div>
  );
}
