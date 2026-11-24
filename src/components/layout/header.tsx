"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Plus, RefreshCw, Search, Settings, Sparkles } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { MyBkConnectModal } from "@/components/mybk/mybk-connect-modal";

const PAGE_TITLES: Record<string, string> = {
  "/": "Tổng quan",
  "/mail": "Hộp thư Gmail",
  "/academic-results": "Kết quả học tập",
};

export function Header() {
  const pathname = usePathname();
  const pageTitle = PAGE_TITLES[pathname] || "Tổng quan";

  const [mybkOpen, setMybkOpen] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const loadMyBkStatus = async () => {
    try {
      const res = await fetch("/api/mybk/transcript", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setStudentId(data.studentId || null);
      setLastSyncedAt(data.lastSyncedAt || null);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadMyBkStatus();
    const onUpdate = () => loadMyBkStatus();
    window.addEventListener("mt-mybk-updated", onUpdate);
    return () => window.removeEventListener("mt-mybk-updated", onUpdate);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background px-6">
        {/* Left: Page Title & Solid Academic Week Pill */}
        <div className="flex items-center gap-3.5">
          <h1 className="font-display text-lg font-bold tracking-tight">
            {pageTitle}
          </h1>
          <div className="group inline-flex items-center gap-1.5 rounded-full border border-sky-500/25 bg-sky-500/10 px-3.5 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
            <Sparkles className="h-3.5 w-3.5 text-sky-500 icon-anim-wiggle" />
            <span>
              {studentId ? `myBK • ${studentId}` : "Tuần -- • myBK"}
            </span>
          </div>
        </div>

        {/* Right: Fast Actions & Theme Toggle */}
        <div className="flex items-center gap-2.5">
          {/* Quick Search */}
          <button
            type="button"
            className="group flex h-10 w-60 items-center justify-between rounded-xl border bg-card px-3.5 text-sm text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:text-foreground"
          >
            <span className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground icon-anim-wiggle group-hover:text-primary" />
              <span>Tìm kiếm...</span>
            </span>
            <kbd className="font-mono rounded-md border bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
              Ctrl K
            </kbd>
          </button>

          {/* 1-Click myBK SSO Connect / Sync */}
          <button
            type="button"
            onClick={() => setMybkOpen(true)}
            title="Kết nối & Đồng bộ dữ liệu myBK"
            className="group inline-flex h-10 items-center gap-2 rounded-xl border bg-card px-3.5 text-sm font-semibold text-foreground transition-colors duration-200 hover:border-teal-500/40 hover:bg-teal-500/10"
          >
            <RefreshCw className="h-4 w-4 text-teal-600 dark:text-teal-400 transition-transform duration-500 group-hover:rotate-180" />
            <span className="hidden sm:inline">Đồng bộ myBK</span>
          </button>

          {/* Quick Add Task */}
          <button
            type="button"
            className="group inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
            <span>Tạo việc</span>
          </button>

          {/* Theme Toggle (Light / Dark) */}
          <ThemeToggle />

          {/* Settings Action */}
          <button
            type="button"
            title="Cài đặt"
            className="group inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-card text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
          >
            <Settings className="h-4 w-4 transition-transform duration-500 group-hover:rotate-90" />
          </button>
        </div>
      </header>

      <MyBkConnectModal
        open={mybkOpen}
        onClose={() => setMybkOpen(false)}
        connectedStudentId={studentId}
        lastSyncedAt={lastSyncedAt}
      />
    </>
  );
}
