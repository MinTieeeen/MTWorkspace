"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  CheckSquare,
  Mail,
  CalendarClock,
  FileCheck2,
  GraduationCap,
  StickyNote,
} from "lucide-react";
import { BrandLogo } from "./logo";
import { UserProfileSidebar } from "@/components/auth/user-profile-sidebar";

export interface NavItem {
  id: string;
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  animClass: string;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const SIDEBAR_GROUPS: NavGroup[] = [
  {
    label: "Không gian làm việc",
    items: [
      {
        id: "dashboard",
        title: "Tổng quan",
        href: "/",
        icon: LayoutDashboard,
        accentColor: "text-sky-600 dark:text-sky-400",
        animClass: "icon-anim-wiggle",
      },
      {
        id: "calendar",
        title: "Lịch trình",
        href: "/#calendar",
        icon: Calendar,
        accentColor: "text-cyan-600 dark:text-cyan-400",
        animClass: "icon-anim-slide",
      },
      {
        id: "tasks",
        title: "Công việc",
        href: "/#tasks",
        icon: CheckSquare,
        accentColor: "text-teal-600 dark:text-teal-400",
        animClass: "icon-anim-tick",
      },
      {
        id: "notes",
        title: "Ghi chú",
        href: "/#notes",
        icon: StickyNote,
        accentColor: "text-amber-600 dark:text-amber-400",
        animClass: "icon-anim-wiggle",
      },
      {
        id: "mail",
        title: "Hộp thư",
        href: "/mail",
        icon: Mail,
        accentColor: "text-rose-600 dark:text-rose-400",
        animClass: "icon-anim-slide",
      },
    ],
  },
  {
    label: "Học tập (myBK)",
    items: [
      {
        id: "timetable",
        title: "Thời khóa biểu",
        href: "/timetable",
        icon: CalendarClock,
        accentColor: "text-blue-600 dark:text-blue-400",
        animClass: "icon-anim-tick",
      },
      {
        id: "exams",
        title: "Lịch thi",
        href: "/#exams",
        icon: FileCheck2,
        accentColor: "text-orange-600 dark:text-orange-400",
        animClass: "icon-anim-slide",
      },
      {
        id: "academic-results",
        title: "Kết quả học tập",
        href: "/academic-results",
        icon: GraduationCap,
        accentColor: "text-emerald-600 dark:text-emerald-400",
        animClass: "icon-anim-wiggle",
      },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r bg-card text-card-foreground select-none">
      {/* Brand Header */}
      <div className="flex h-16 items-center border-b px-5">
        <Link href="/">
          <BrandLogo />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
        {SIDEBAR_GROUPS.map((group, idx) => (
          <div key={group.label ?? idx} className="space-y-2">
            {group.label && (
              <p className="px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : !item.href.includes("#") &&
                      pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={
                      isActive
                        ? "group relative flex w-full items-center justify-between rounded-xl bg-primary/10 px-3 py-2.5 text-[15px] font-semibold text-primary transition-colors duration-200"
                        : "group relative flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-[15px] font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
                    }
                  >
                    {isActive && (
                      <span className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-primary" />
                    )}

                    <span className="flex items-center gap-3 truncate">
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-200 ${
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted group-hover:bg-background"
                        }`}
                      >
                        <Icon
                          className={`h-[18px] w-[18px] shrink-0 ${item.animClass} ${
                            isActive
                              ? "text-primary-foreground"
                              : item.accentColor
                          }`}
                        />
                      </span>
                      <span className="truncate">{item.title}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Google User Profile & Multi-Account Switcher */}
      <UserProfileSidebar />
    </aside>
  );
}
