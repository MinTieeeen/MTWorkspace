"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { AccountMenu } from "@/components/auth/account-menu";
import { BRAND } from "@/lib/brand";
import { DAY_FULL_LABELS, getCurrentIsoWeek, getTodayBkDayOfWeek } from "@/lib/format";
import { BrandMark } from "./logo";
import { NextUpChip } from "./next-up-chip";
import { getPageTitle, openCommandPalette } from "./nav-items";
import { ThemeToggle } from "./theme-toggle";

/** "Thứ Năm, 26/11 · Tuần 48": tính ở client để không lệch múi giờ khi render server */
function useTodayLabel() {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const update = () => {
      const d = new Date();
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      setLabel(
        `${DAY_FULL_LABELS[getTodayBkDayOfWeek(d)]}, ${dd}/${mm} · Tuần ${getCurrentIsoWeek(d)}`
      );
    };
    update();
    const t = setInterval(update, 60000);
    return () => clearInterval(t);
  }, []);
  return label;
}

export function Header() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const today = useTodayLabel();

  return (
    <header className="relative z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-xl sm:px-6">
      <Link
        href="/"
        aria-label={`${BRAND.name}, về Tổng quan`}
        className="brand-logo shrink-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <BrandMark />
      </Link>

      <div className="min-w-0">
        <h1
          key={pathname}
          className="mt-title-in truncate font-display text-lg font-bold leading-tight tracking-tight"
        >
          {title}
        </h1>
        <p className="h-4 truncate text-xs text-muted-foreground">{today}</p>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <NextUpChip />

        <button
          type="button"
          onClick={openCommandPalette}
          aria-label="Tìm kiếm (Ctrl K)"
          className="group inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground lg:w-52"
        >
          <Search className="h-4 w-4 shrink-0 transition-colors group-hover:text-primary" />
          <span className="hidden flex-1 text-left lg:inline">Tìm kiếm...</span>
          <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-xs lg:inline">
            Ctrl K
          </kbd>
        </button>

        <ThemeToggle />
        <AccountMenu />
      </div>
    </header>
  );
}
