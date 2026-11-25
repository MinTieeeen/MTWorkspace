"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckSquare,
  FileCheck2,
  GraduationCap,
  MapPin,
  StickyNote,
  User,
} from "lucide-react";
import { GmailInboxWidget } from "@/components/dashboard/gmail-inbox-widget";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import type { NormalizedTimetableItem } from "@/lib/mybk-timetable";

const DAY_NAMES: Record<number, string> = {
  2: "Thứ 2",
  3: "Thứ 3",
  4: "Thứ 4",
  5: "Thứ 5",
  6: "Thứ 6",
  7: "Thứ 7",
  8: "Chủ Nhật",
};

function getCurrentIsoWeekClient(now = new Date()): number {
  const d = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export default function HomePage() {
  const [cpaDisplay, setCpaDisplay] = useState("--");
  const [scheduleDisplay, setScheduleDisplay] = useState("--");
  const [currentWeekNum, setCurrentWeekNum] = useState<number>(48);
  const [weekSessions, setWeekSessions] = useState<NormalizedTimetableItem[]>(
    []
  );
  const [ready, setReady] = useState(false);

  const loadDashboardData = async () => {
    try {
      const [transRes, tkbRes] = await Promise.all([
        fetch("/api/mybk/transcript", { cache: "no-store" }).catch(() => null),
        fetch("/api/mybk/timetable", { cache: "no-store" }).catch(() => null),
      ]);

      if (transRes && transRes.ok) {
        const data = await transRes.json();
        const semesters: Array<{
          maNamHocHocKy: string;
          soTCTLChung: string;
          diemTBTLChung: string;
        }> = data.semesters || [];
        const latest =
          semesters.find(
            (s) => s.maNamHocHocKy !== "BL" && Number(s.soTCTLChung) > 0
          ) || semesters[0];
        if (latest) {
          setCpaDisplay(`${latest.diemTBTLChung} (${latest.soTCTLChung} TC)`);
        }
      }

      if (tkbRes && tkbRes.ok) {
        const tkbData = await tkbRes.json();
        const items: NormalizedTimetableItem[] = tkbData.items || [];
        const isoWk = getCurrentIsoWeekClient();
        setCurrentWeekNum(isoWk);

        const scheduled = items.filter(
          (i) =>
            i.dayOfWeek >= 2 &&
            i.dayOfWeek <= 8 &&
            i.startLesson > 0 &&
            i.startTime !== "0:00" &&
            i.startTime !== "00:00"
        );
        const activeInWeek = scheduled
          .filter((i) => i.activeWeeks.includes(isoWk))
          .sort((a, b) =>
            a.dayOfWeek !== b.dayOfWeek
              ? a.dayOfWeek - b.dayOfWeek
              : a.startLesson - b.startLesson
          );

        const uniqueSubjectsCount = new Set(items.map((i) => i.subjectCode))
          .size;
        setScheduleDisplay(
          `${activeInWeek.length} buổi (${uniqueSubjectsCount} môn)`
        );
        setWeekSessions(activeInWeek);
      }
    } catch {
      // ignore
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    loadDashboardData();
    const onUpdate = () => loadDashboardData();
    window.addEventListener("mt-mybk-updated", onUpdate);
    return () => window.removeEventListener("mt-mybk-updated", onUpdate);
  }, []);

  if (!ready) return <DashboardSkeleton />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Top Quick Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Card 1: Linked to /timetable */}
        <Link
          href="/timetable"
          className="group relative overflow-hidden rounded-2xl border bg-card p-5 transition-colors duration-200 hover:border-sky-500/50 cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted-foreground">
              Lịch học (Tuần {currentWeekNum})
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <CalendarClock className="h-5 w-5 icon-anim-tick" />
            </div>
          </div>
          <p className="font-display mt-3 text-2xl font-extrabold tracking-tight">
            {scheduleDisplay}
          </p>
        </Link>

        {/* Card 2 */}
        <div className="group relative overflow-hidden rounded-2xl border bg-card p-5 transition-colors duration-200 hover:border-teal-500/50 cursor-pointer">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted-foreground">
              Công việc
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <CheckSquare className="h-5 w-5 icon-anim-wiggle" />
            </div>
          </div>
          <p className="font-display mt-3 text-3xl font-extrabold tracking-tight">
            --
          </p>
        </div>

        {/* Card 3 */}
        <div className="group relative overflow-hidden rounded-2xl border bg-card p-5 transition-colors duration-200 hover:border-amber-500/50 cursor-pointer">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted-foreground">
              Lịch thi
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <FileCheck2 className="h-5 w-5 icon-anim-slide" />
            </div>
          </div>
          <p className="font-display mt-3 text-3xl font-extrabold tracking-tight">
            --
          </p>
        </div>

        {/* Card 4: Linked to /academic-results with live synced CPA */}
        <Link
          href="/academic-results"
          className="group relative overflow-hidden rounded-2xl border bg-card p-5 transition-colors duration-200 hover:border-emerald-500/50 cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted-foreground">
              GPA / CPA
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <GraduationCap className="h-5 w-5 icon-anim-wiggle" />
            </div>
          </div>
          <p className="font-display mt-3 text-2xl font-extrabold tracking-tight">
            {cpaDisplay}
          </p>
        </Link>
      </div>

      {/* Main Workspace Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left & Center Column (2/3) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Current Week's Schedule */}
          <section className="group rounded-2xl border bg-card transition-colors duration-200 hover:border-sky-500/40">
            <div className="flex items-center justify-between border-b px-5 py-3.5">
              <div className="flex items-center gap-2.5 text-base font-bold">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <CalendarClock className="h-[18px] w-[18px] icon-anim-tick" />
                </span>
                <span className="font-display">
                  Lịch học Tuần {currentWeekNum}
                </span>
              </div>
              <Link
                href="/timetable"
                className="inline-flex items-center gap-1 rounded-lg bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-600 transition-colors hover:bg-sky-500/20 dark:text-sky-400"
              >
                <span>Xem toàn bộ TKB</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {weekSessions.length === 0 ? (
              <div className="flex h-52 flex-col items-center justify-center gap-3 p-6">
                <span className="text-sm font-medium text-muted-foreground">
                  Không có buổi học cố định trong tuần này
                </span>
              </div>
            ) : (
              <div className="divide-y">
                {weekSessions.slice(0, 5).map((item) => (
                  <Link
                    key={item.scheduleId}
                    href="/timetable"
                    className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="flex w-20 shrink-0 flex-col items-center rounded-xl border bg-sky-500/10 px-2 py-1.5 text-center">
                        <span className="font-heading text-[11px] font-bold text-sky-600 dark:text-sky-400">
                          {DAY_NAMES[item.dayOfWeek] || "Lịch"}
                        </span>
                        <span className="font-mono text-[10px] font-semibold text-foreground">
                          {item.startTime}–{item.endTime}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-primary">
                            {item.subjectCode}
                          </span>
                          <p className="truncate font-heading text-xs font-bold text-foreground">
                            {item.subjectNameVi}
                          </p>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1 font-mono font-medium text-foreground/85">
                            <MapPin className="h-3 w-3 text-emerald-500" />
                            {item.roomCode || "--"}
                          </span>
                          {item.employeeName && (
                            <span className="inline-flex items-center gap-1 truncate">
                              <User className="h-3 w-3 text-sky-500" />
                              {item.employeeName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <span className="shrink-0 rounded-lg border bg-background px-2 py-1 font-mono text-[10px] font-medium text-muted-foreground">
                      T{item.startLesson}–
                      {item.startLesson + item.numOfLesson - 1}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Priority Tasks */}
          <section className="group rounded-2xl border bg-card transition-colors duration-200 hover:border-teal-500/40">
            <div className="flex items-center justify-between border-b px-5 py-3.5">
              <div className="flex items-center gap-2.5 text-base font-bold">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <CheckSquare className="h-[18px] w-[18px] icon-anim-wiggle" />
                </span>
                <span className="font-display">Công việc</span>
              </div>
            </div>

            <div className="flex h-52 flex-col items-center justify-center gap-3 p-6">
              <svg width="115" height="90" viewBox="0 0 115 90" fill="none">
                <g className="transition-transform duration-300 group-hover:translate-x-1.5">
                  <rect
                    x="18"
                    y="18"
                    width="74"
                    height="22"
                    rx="8"
                    className="fill-card stroke-teal-500"
                    strokeWidth="2"
                  />
                  <circle cx="30" cy="29" r="5.5" fill="#14B8A6" />
                  <path
                    d="M27.5 29L29.3 30.8L32.8 27.2"
                    stroke="white"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <rect x="41" y="26" width="38" height="6" rx="3" fill="#5EEAD4" />
                </g>
                <g className="transition-transform duration-300 group-hover:-translate-x-1.5">
                  <rect
                    x="24"
                    y="48"
                    width="74"
                    height="22"
                    rx="8"
                    className="fill-card stroke-sky-500"
                    strokeWidth="2"
                  />
                  <circle cx="36" cy="59" r="5.5" fill="#0EA5E9" />
                  <path
                    d="M33.5 59L35.3 60.8L38.8 57.2"
                    stroke="white"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <rect x="47" y="56" width="36" height="6" rx="3" fill="#7DD3FC" />
                </g>
                <path
                  d="M98 14L99.5 18L103.5 19.5L99.5 21L98 25L96.5 21L92.5 19.5L96.5 18L98 14Z"
                  fill="#FBBF24"
                  className="origin-[98px_19.5px] transition-transform duration-500 group-hover:rotate-90"
                />
              </svg>
              <span className="text-sm font-medium text-muted-foreground">
                Trống
              </span>
            </div>
          </section>
        </div>

        {/* Right Column (1/3) */}
        <div className="space-y-6">
          {/* Live Gmail Quick Inbox Widget */}
          <GmailInboxWidget />

          {/* Quick Notes */}
          <section className="group rounded-2xl border bg-card transition-colors duration-200 hover:border-amber-500/40">
            <div className="flex items-center justify-between border-b px-5 py-3.5">
              <div className="flex items-center gap-2.5 text-base font-bold">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <StickyNote className="h-[18px] w-[18px] icon-anim-wiggle" />
                </span>
                <span className="font-display">Ghi chú</span>
              </div>
            </div>

            <div className="flex h-52 flex-col items-center justify-center gap-3 p-6">
              <svg width="105" height="90" viewBox="0 0 105 90" fill="none">
                <rect
                  x="26"
                  y="18"
                  width="52"
                  height="54"
                  rx="10"
                  className="fill-card stroke-amber-500"
                  strokeWidth="2.2"
                />
                <line
                  x1="36"
                  y1="34"
                  x2="64"
                  y2="34"
                  stroke="#F59E0B"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
                <line
                  x1="36"
                  y1="45"
                  x2="68"
                  y2="45"
                  stroke="#FBBF24"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="transition-transform duration-300 group-hover:translate-x-2"
                />
                <line
                  x1="36"
                  y1="56"
                  x2="52"
                  y2="56"
                  stroke="#FDE68A"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
                <circle
                  cx="52"
                  cy="18"
                  r="5"
                  fill="#EF4444"
                  className="transition-transform duration-300 group-hover:-translate-y-1"
                />
              </svg>
              <span className="text-sm font-medium text-muted-foreground">
                Trống
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
