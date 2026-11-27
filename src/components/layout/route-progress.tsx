"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Thanh tiến trình mỏng trên cùng khi chuyển trang.
 * Bắt đầu ngay khi bấm link nội bộ, nhích dần tới ~90%, hoàn tất khi đường dẫn đổi.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathRef = useRef(pathname);
  const runningRef = useRef(false);

  const clearTimers = () => {
    if (timer.current) clearInterval(timer.current);
    if (safety.current) clearTimeout(safety.current);
    timer.current = null;
    safety.current = null;
  };

  const finish = () => {
    clearTimers();
    runningRef.current = false;
    setProgress(1);
    setTimeout(() => setVisible(false), 220);
    setTimeout(() => setProgress(0), 480);
  };

  // Hoàn tất khi đã sang trang mới
  useEffect(() => {
    if (pathRef.current !== pathname) {
      pathRef.current = pathname;
      if (runningRef.current) finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Bắt đầu khi bấm vào link nội bộ sang trang khác
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === pathRef.current) return;

      clearTimers();
      runningRef.current = true;
      setVisible(true);
      setProgress(0.08);
      timer.current = setInterval(() => {
        setProgress((p) => (p < 0.9 ? p + (0.9 - p) * 0.12 : p));
      }, 180);
      // Phòng trường hợp điều hướng thất bại: tự tắt sau 10 giây
      safety.current = setTimeout(finish, 10000);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[300] h-[3px]"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 0.22s ease" }}
    >
      <div
        className="h-full origin-left bg-primary"
        style={{
          transform: `scaleX(${progress})`,
          transition: progress === 0 ? "none" : "transform 0.25s ease-out",
          boxShadow: "0 0 10px hsl(var(--primary) / 0.7)",
        }}
      />
    </div>
  );
}
