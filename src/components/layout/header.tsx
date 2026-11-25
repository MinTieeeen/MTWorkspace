"use client";

import { usePathname } from "next/navigation";
import { Plus, Search, Settings } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

const PAGE_TITLES: Record<string, string> = {
  "/": "Tổng quan",
  "/mail": "Hộp thư Gmail",
  "/timetable": "Thời khóa biểu",
  "/academic-results": "Kết quả học tập",
};

export function Header() {
  const pathname = usePathname();
  const pageTitle = PAGE_TITLES[pathname] || "Tổng quan";

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background px-6">
      {/* Left: Page Title */}
      <div className="flex items-center">
        <h1 className="font-display text-lg font-bold tracking-tight">
          {pageTitle}
        </h1>
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
  );
}
