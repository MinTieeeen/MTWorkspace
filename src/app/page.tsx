"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckSquare,
  FileCheck2,
  MapPin,
  StickyNote,
  User,
} from "lucide-react";
import { GmailInboxWidget } from "@/components/dashboard/gmail-inbox-widget";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import type { NormalizedTimetableItem } from "@/lib/mybk-timetable";
import type { NormalizedExamItem } from "@/lib/mybk-exams";

const DAY_NAMES: Record<number, string> = {
  2: "Thứ 2",
  3: "Thứ 3",
  4: "Thứ 4",
  5: "Thứ 5",
  6: "Thứ 6",
  7: "Thứ 7",
  8: "CN",
};

function getCurrentIsoWeekClient(now = new Date()): number {
  const d = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function formatExamShortDate(iso: string): string {
  if (!iso || !iso.includes("-")) return iso || "--";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export default function HomePage() {
  const [currentWeekNum, setCurrentWeekNum] = useState<number>(48);
  const [weekSessions, setWeekSessions] = useState<NormalizedTimetableItem[]>(
    []
  );
  const [upcomingExams, setUpcomingExams] = useState<NormalizedExamItem[]>([]);
  const [ready, setReady] = useState(false);

  const loadDashboardData = async () => {
    try {
      const [tkbRes, examRes] = await Promise.all([
        fetch("/api/mybk/timetable", { cache: "no-store" }).catch(() => null),
        fetch("/api/mybk/exams", { cache: "no-store" }).catch(() => null),
      ]);

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

        setWeekSessions(activeInWeek);
      }

      if (examRes && examRes.ok) {
        const examData = await examRes.json();
        const exams: NormalizedExamItem[] = examData.items || [];
        const nowMs = Date.now();
        const upcoming = exams
          .filter((e) => {
            const dt = new Date(`${e.examDate}T${e.endTime}:00+07:00`);
            return !Number.isNaN(dt.getTime()) && dt.getTime() >= nowMs;
          })
          .sort((a, b) => a.examDate.localeCompare(b.examDate));

        setUpcomingExams(upcoming);
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
    <div className="mx-auto max-w-6xl">
      {/* Main Workspace Grid (Top summary stat cards removed per user request) */}
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
              <div className="flex h-48 flex-col items-center justify-center gap-3 p-6">
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
                      <div className="flex w-24 shrink-0 flex-col items-center justify-center rounded-xl border bg-sky-500/10 px-2.5 py-1.5 text-center">
                        <span className="font-heading text-xs font-bold text-sky-600 dark:text-sky-400">
                          {DAY_NAMES[item.dayOfWeek] || "Lịch"}
                        </span>
                        <span className="mt-0.5 font-mono text-[11px] font-semibold text-foreground">
                          {item.startTime}–{item.endTime}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-primary">
                            {item.subjectCode}
                          </span>
                          <p className="truncate font-heading text-sm font-bold text-foreground">
                            {item.subjectNameVi}
                          </p>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1 font-mono font-semibold text-foreground/90">
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

                    <span className="shrink-0 rounded-lg border bg-background px-2.5 py-1 font-mono text-xs font-semibold text-muted-foreground">
                      T{item.startLesson}–
                      {item.startLesson + item.numOfLesson - 1}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Upcoming Exams Countdown Section */}
          <section className="group rounded-2xl border bg-card transition-colors duration-200 hover:border-amber-500/40">
            <div className="flex items-center justify-between border-b px-5 py-3.5">
              <div className="flex items-center gap-2.5 text-base font-bold">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <FileCheck2 className="h-[18px] w-[18px] icon-anim-slide" />
                </span>
                <span className="font-display">Đếm ngược Lịch thi</span>
              </div>
              <Link
                href="/exams"
                className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
              >
                <span>Xem chi tiết</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {upcomingExams.length === 0 ? (
              <div className="flex h-44 flex-col items-center justify-center gap-2 p-6 text-center">
                <span className="text-sm font-medium text-muted-foreground">
                  Không có ca thi nào sắp tới
                </span>
              </div>
            ) : (
              <div className="divide-y">
                {upcomingExams.slice(0, 4).map((exam) => {
                  const targetDt = new Date(
                    `${exam.examDate}T${exam.startTime}:00+07:00`
                  );
                  const daysLeft = Math.max(
                    0,
                    Math.floor((targetDt.getTime() - Date.now()) / 86400000)
                  );

                  return (
                    <Link
                      key={exam.examId}
                      href="/exams"
                      className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="flex h-14 w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-center">
                          <span className="text-[11px] font-bold leading-none text-amber-600 dark:text-amber-400">
                            {DAY_NAMES[exam.dayOfWeek] || "Thi"}
                          </span>
                          <span className="mt-1 font-mono text-sm font-extrabold leading-none text-foreground">
                            {formatExamShortDate(exam.examDate)}
                          </span>
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-600 dark:text-rose-400">
                              {exam.examType}
                            </span>
                            <span className="font-mono text-xs font-bold text-primary">
                              {exam.subjectCode}
                            </span>
                            <p className="truncate font-heading text-sm font-bold text-foreground">
                              {exam.subjectName}
                            </p>
                          </div>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {exam.startTime}–{exam.endTime} ({exam.durationMinutes}p) •{" "}
                            <span className="font-semibold text-foreground/90">
                              {exam.roomCode || "--"}
                            </span>
                            {exam.seatOrder !== null
                              ? ` • STT ${exam.seatOrder}`
                              : ""}
                          </p>
                        </div>
                      </div>

                      <span className="shrink-0 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-mono text-xs font-bold text-amber-700 dark:text-amber-300">
                        {daysLeft > 0 ? `Còn ${daysLeft} ngày` : "Hôm nay"}
                      </span>
                    </Link>
                  );
                })}
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

            <div className="flex h-44 flex-col items-center justify-center gap-3 p-6">
              <span className="text-sm font-medium text-muted-foreground">
                Chưa có công việc cần xử lý
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

            <div className="flex h-44 flex-col items-center justify-center gap-3 p-6">
              <span className="text-sm font-medium text-muted-foreground">
                Chưa có ghi chú nhanh
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
