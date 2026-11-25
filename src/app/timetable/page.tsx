"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Download,
  FileCheck2,
  FolderKanban,
  Layers,
  ListTodo,
  MapPin,
  RefreshCw,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { TimetableSkeleton } from "@/components/ui/skeleton";
import { ScheduleDetailModal } from "@/components/mybk/schedule-detail-modal";
import { GoogleCalendarSyncModal } from "@/components/mybk/google-calendar-sync-modal";
import type {
  NormalizedTimetableItem,
  RawMyBkSemesterOption,
} from "@/lib/mybk-timetable";
import type { NormalizedExamItem } from "@/lib/mybk-exams";

type ViewMode = "WEEK" | "SEMESTER" | "DAY";

interface TimetableApiResponse {
  connected: boolean;
  studentId: string | null;
  hasAutoSso: boolean;
  isStale: boolean;
  lastSyncedAt: string | null;
  currentSemesterCode: string;
  selectedSemesterCode: string;
  semesters: RawMyBkSemesterOption[];
  items: NormalizedTimetableItem[];
}

const WEEK_DAYS = [
  { dayOfWeek: 2, shortLabel: "Thứ 2", fullLabel: "Thứ Hai" },
  { dayOfWeek: 3, shortLabel: "Thứ 3", fullLabel: "Thứ Ba" },
  { dayOfWeek: 4, shortLabel: "Thứ 4", fullLabel: "Thứ Tư" },
  { dayOfWeek: 5, shortLabel: "Thứ 5", fullLabel: "Thứ Năm" },
  { dayOfWeek: 6, shortLabel: "Thứ 6", fullLabel: "Thứ Sáu" },
  { dayOfWeek: 7, shortLabel: "Thứ 7", fullLabel: "Thứ Bảy" },
  { dayOfWeek: 8, shortLabel: "CN", fullLabel: "Chủ Nhật" },
];

// Approved solid flat palette (no purple/violet/indigo, no gradients)
const SUBJECT_COLOR_STYLES = [
  {
    bg: "bg-sky-500/10 dark:bg-sky-500/15",
    border: "border-sky-500/30 hover:border-sky-500/60",
    accent: "bg-sky-500",
    badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    text: "text-sky-700 dark:text-sky-300",
  },
  {
    bg: "bg-emerald-500/10 dark:bg-emerald-500/15",
    border: "border-emerald-500/30 hover:border-emerald-500/60",
    accent: "bg-emerald-500",
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  {
    bg: "bg-amber-500/10 dark:bg-amber-500/15",
    border: "border-amber-500/30 hover:border-amber-500/60",
    accent: "bg-amber-500",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    text: "text-amber-700 dark:text-amber-300",
  },
  {
    bg: "bg-teal-500/10 dark:bg-teal-500/15",
    border: "border-teal-500/30 hover:border-teal-500/60",
    accent: "bg-teal-500",
    badge: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
    text: "text-teal-700 dark:text-teal-300",
  },
  {
    bg: "bg-cyan-500/10 dark:bg-cyan-500/15",
    border: "border-cyan-500/30 hover:border-cyan-500/60",
    accent: "bg-cyan-500",
    badge: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
    text: "text-cyan-700 dark:text-cyan-300",
  },
  {
    bg: "bg-rose-500/10 dark:bg-rose-500/15",
    border: "border-rose-500/30 hover:border-rose-500/60",
    accent: "bg-rose-500",
    badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    text: "text-rose-700 dark:text-rose-300",
  },
];

function getMondayOfIsoWeekClient(year: number, weekNumber: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);

  const targetMonday = new Date(week1Monday);
  targetMonday.setUTCDate(week1Monday.getUTCDate() + (weekNumber - 1) * 7);
  return targetMonday;
}

function getExactDateForDayInWeek(
  year: number,
  weekNumber: number,
  dayOfWeek: number
): { iso: string; displayShort: string; displayFull: string } {
  const monday = getMondayOfIsoWeekClient(year, weekNumber);
  const offset = Math.max(0, Math.min(6, dayOfWeek - 2));
  const d = new Date(monday);
  d.setUTCDate(monday.getUTCDate() + offset);
  const iso = d.toISOString().slice(0, 10);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return {
    iso,
    displayShort: `${dd}/${mm}`,
    displayFull: `${dd}/${mm}/${yyyy}`,
  };
}

function getCurrentIsoWeekClient(now = new Date()): number {
  const d = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getTodayBkDayOfWeek(now = new Date()): number {
  const jsDay = now.getDay();
  return jsDay === 0 ? 8 : jsDay + 1;
}

function formatCampusBadge(campusNameVi: string | null): string {
  if (!campusNameVi) return "--";
  if (
    campusNameVi.includes("Cơ Sở 1") ||
    campusNameVi.includes("Lý Thường Kiệt")
  ) {
    return "Cơ sở 1 (LTK)";
  }
  if (campusNameVi.includes("Cơ Sở 2") || campusNameVi.includes("Đông Hoà")) {
    return "Cơ sở 2 (Dĩ An)";
  }
  return campusNameVi;
}

function buildIcsContent(
  items: NormalizedTimetableItem[],
  semesterCode: string
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MTWorkspace//HCMUT myBK Timetable//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:TKB Bách Khoa HK ${semesterCode}`,
    "X-WR-TIMEZONE:Asia/Ho_Chi_Minh",
  ];

  const scheduled = items.filter(
    (item) =>
      item.dayOfWeek >= 2 &&
      item.dayOfWeek <= 8 &&
      item.startLesson > 0 &&
      item.startTime !== "0:00" &&
      item.startTime !== "00:00"
  );

  const nowStamp =
    new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  for (const item of scheduled) {
    const startHHMM = item.startTime.replace(":", "").padStart(4, "0");
    const endHHMM = item.endTime.replace(":", "").padStart(4, "0");
    const roomPart =
      item.roomCode && item.roomCode !== "------"
        ? item.roomCode
        : "Chưa xếp phòng";
    const location = `${roomPart}${
      item.campusNameVi ? ` (${formatCampusBadge(item.campusNameVi)})` : ""
    }`;

    const desc = [
      `Môn học: ${item.subjectCode} - ${item.subjectNameVi}`,
      `Nhóm lớp: ${item.classGroup || "--"} (${item.numOfCredits} TC)`,
      `Tiết: ${item.startLesson} - ${
        item.startLesson + item.numOfLesson - 1
      } (${item.startTime} - ${item.endTime})`,
      item.employeeName
        ? `Giảng viên: ${item.employeeName}${
            item.employeeEmail ? ` - ${item.employeeEmail}` : ""
          }`
        : "",
    ]
      .filter(Boolean)
      .join("\\n");

    for (const wk of item.activeWeeks) {
      const { iso } = getExactDateForDayInWeek(
        item.calendarYear,
        wk,
        item.dayOfWeek
      );
      const cleanDate = iso.replace(/-/g, "");
      const uid = `mtworkspace-${semesterCode}-${item.scheduleId}-w${wk}@mybk.hcmut.edu.vn`;

      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${nowStamp}`,
        `DTSTART;TZID=Asia/Ho_Chi_Minh:${cleanDate}T${startHHMM}00`,
        `DTEND;TZID=Asia/Ho_Chi_Minh:${cleanDate}T${endHHMM}00`,
        `SUMMARY:[${item.subjectCode}] ${item.subjectNameVi}${
          item.classGroup ? ` (${item.classGroup})` : ""
        }`,
        `LOCATION:${location}`,
        `DESCRIPTION:${desc}`,
        "END:VEVENT"
      );
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export default function TimetablePage() {
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [data, setData] = useState<TimetableApiResponse | null>(null);
  const [semesterExams, setSemesterExams] = useState<NormalizedExamItem[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<string>("20261");
  const [viewMode, setViewMode] = useState<ViewMode>("WEEK");
  const [selectedWeek, setSelectedWeek] = useState<number>(() =>
    getCurrentIsoWeekClient()
  );
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | "ALL">(
    "ALL"
  );
  const [revalidating, setRevalidating] = useState(false);

  // Modals
  const [activeDetailItem, setActiveDetailItem] =
    useState<NormalizedTimetableItem | null>(null);
  const [activeDetailSessionDate, setActiveDetailSessionDate] = useState<
    string | undefined
  >(undefined);
  const [gcalModalOpen, setGcalModalOpen] = useState(false);

  const loadTimetable = useCallback(
    async (
      semCode?: string,
      opts?: { revalidate?: boolean; force?: boolean }
    ) => {
      const params = new URLSearchParams();
      if (semCode) params.set("semesterYear", semCode);
      if (opts?.revalidate) params.set("revalidate", "1");
      if (opts?.force) params.set("force", "1");

      const [res, examRes] = await Promise.all([
        fetch(`/api/mybk/timetable?${params.toString()}`),
        fetch(`/api/mybk/exams?${params.toString()}`).catch(() => null),
      ]);
      if (examRes && examRes.ok) {
        const examJson = await examRes.json().catch(() => null);
        if (Array.isArray(examJson?.items)) {
          setSemesterExams(examJson.items);
        }
      }
      if (!res.ok) return null;
      const json = (await res.json()) as TimetableApiResponse;
      setData(json);
      setSelectedSemester(json.selectedSemesterCode);
      return json;
    },
    []
  );

  // Initial load + background SWR sync
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const initial = await loadTimetable();
        if (!active) return;
        setInitialLoaded(true);

        setRevalidating(true);
        await loadTimetable(initial?.selectedSemesterCode, {
          revalidate: true,
        });
      } finally {
        if (active) {
          setInitialLoaded(true);
          setRevalidating(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [loadTimetable]);

  // Available calendar weeks across the semester
  const semesterWeeks = useMemo(() => {
    const items = data?.items || [];
    if (items.length === 0) {
      return Array.from({ length: 16 }, (_, i) => 35 + i);
    }

    let minW = 99;
    let maxW = 1;
    for (const item of items) {
      const startW = item.weeksCalendarBegin || 35;
      const tokens = item.weekSeriesDisplay
        .split("|")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const endW = startW + Math.max(0, tokens.length - 1);
      if (startW < minW) minW = startW;
      if (endW > maxW) maxW = endW;
      for (const w of item.activeWeeks) {
        if (w < minW) minW = w;
        if (w > maxW) maxW = w;
      }
    }
    for (const ex of semesterExams) {
      if (ex.weekNumber > 0) {
        if (ex.weekNumber < minW) minW = ex.weekNumber;
        if (ex.weekNumber > maxW) maxW = ex.weekNumber;
      }
    }

    if (minW > maxW) return Array.from({ length: 16 }, (_, i) => 35 + i);
    const list: number[] = [];
    for (let w = minW; w <= maxW; w++) {
      list.push(w);
    }
    return list;
  }, [data?.items, semesterExams]);

  // Clamp selectedWeek into valid semester weeks
  useEffect(() => {
    if (semesterWeeks.length === 0) return;
    const currentIso = getCurrentIsoWeekClient();
    if (!semesterWeeks.includes(selectedWeek)) {
      if (semesterWeeks.includes(currentIso)) {
        setSelectedWeek(currentIso);
      } else {
        setSelectedWeek(semesterWeeks[0]);
      }
    }
  }, [semesterWeeks, selectedWeek]);

  // Color assignment per subjectCode
  const subjectColorMap = useMemo(() => {
    const map = new Map<string, (typeof SUBJECT_COLOR_STYLES)[0]>();
    const uniqueCodes = Array.from(
      new Set((data?.items || []).map((i) => i.subjectCode))
    ).sort();
    uniqueCodes.forEach((code, idx) => {
      map.set(code, SUBJECT_COLOR_STYLES[idx % SUBJECT_COLOR_STYLES.length]);
    });
    return map;
  }, [data?.items]);

  // Split scheduled vs unscheduled/project items
  const { scheduledItems, unscheduledItems, uniqueSubjects, totalCredits } =
    useMemo(() => {
      const all = data?.items || [];
      const scheduled: NormalizedTimetableItem[] = [];
      const unscheduled: NormalizedTimetableItem[] = [];
      const creditBySubject = new Map<string, number>();

      for (const item of all) {
        if (!creditBySubject.has(item.subjectCode)) {
          creditBySubject.set(item.subjectCode, item.numOfCredits);
        }
        if (
          item.dayOfWeek >= 2 &&
          item.dayOfWeek <= 8 &&
          item.startLesson > 0 &&
          item.startTime !== "0:00" &&
          item.startTime !== "00:00"
        ) {
          scheduled.push(item);
        } else {
          unscheduled.push(item);
        }
      }

      const creditsSum = Array.from(creditBySubject.values()).reduce(
        (acc, c) => acc + c,
        0
      );

      return {
        scheduledItems: scheduled,
        unscheduledItems: unscheduled,
        uniqueSubjects: creditBySubject.size,
        totalCredits: creditsSum,
      };
    }, [data?.items]);

  // Active classes in selectedWeek
  const activeWeekItems = useMemo(() => {
    return scheduledItems
      .filter((item) => item.activeWeeks.includes(selectedWeek))
      .sort((a, b) =>
        a.dayOfWeek !== b.dayOfWeek
          ? a.dayOfWeek - b.dayOfWeek
          : a.startLesson - b.startLesson
      );
  }, [scheduledItems, selectedWeek]);

  const calendarYear = data?.items?.[0]?.calendarYear || 2026;
  const currentIsoWeek = getCurrentIsoWeekClient();
  const todayBkDay = getTodayBkDayOfWeek();

  const handleSemesterChange = async (nextSem: string) => {
    setSelectedSemester(nextSem);
    setRevalidating(true);
    try {
      await loadTimetable(nextSem, { revalidate: true });
    } finally {
      setRevalidating(false);
    }
  };

  const handleManualRefresh = async () => {
    setRevalidating(true);
    try {
      const res = await loadTimetable(selectedSemester, { force: true });
      if (res) {
        toast.success("Đã cập nhật Thời khóa biểu");
      } else {
        toast.error("Không thể làm mới Thời khóa biểu");
      }
    } finally {
      setRevalidating(false);
    }
  };

  const handleDownloadIcs = () => {
    if (!data?.items) return;
    const icsContent = buildIcsContent(data.items, selectedSemester);
    const blob = new Blob([icsContent], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `TKB-BachKhoa-HK${selectedSemester}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Đã tải tệp Thời khóa biểu (.ics)");
  };

  if (!initialLoaded) {
    return <TimetableSkeleton />;
  }

  const items = data?.items || [];
  const semesterName =
    items[0]?.semesterYearName ||
    data?.semesters?.find((s) => String(s.code) === selectedSemester)?.nameVi ||
    `Học kỳ ${selectedSemester}`;

  const totalWeekLessons = activeWeekItems.reduce(
    (s, i) => s + i.numOfLesson,
    0
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Top Toolbar: View Mode Tabs + Semester LOV + Google Calendar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode("WEEK")}
            className={cn(
              "group inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors",
              viewMode === "WEEK"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <CalendarDays className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-6" />
            <span>Lịch tuần</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("SEMESTER")}
            className={cn(
              "group inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors",
              viewMode === "SEMESTER"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Layers className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-6" />
            <span>Danh sách môn</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("DAY")}
            className={cn(
              "group inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors",
              viewMode === "DAY"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <ListTodo className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-6" />
            <span>Theo ngày</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedSemester}
            onChange={(e) => handleSemesterChange(e.target.value)}
            className="h-9 rounded-xl border bg-background px-3 text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
          >
            {(data?.semesters && data.semesters.length > 0
              ? data.semesters
              : [
                  {
                    id: 711,
                    code: 20261,
                    isCurrent: true,
                    nameVi: "Học kỳ 1 Năm học 2026 - 2027",
                    nameEn: "Academic year 2026-2027 - Semester 1",
                  },
                ]
            ).map((sem) => (
              <option key={sem.id} value={String(sem.code)}>
                {sem.code} — {sem.nameVi}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setGcalModalOpen(true)}
            className="group inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <CalendarPlus className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-12" />
            <span>Thêm vào Google Calendar</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadIcs}
            title="Tải tệp lịch .ics"
            className="group inline-flex h-9 items-center gap-1.5 rounded-xl border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <Download className="h-3.5 w-3.5 text-primary transition-transform duration-200 group-hover:translate-y-0.5" />
            <span className="hidden sm:inline">.ics</span>
          </button>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={revalidating}
            title="Làm mới Thời khóa biểu từ myBK"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", revalidating && "animate-spin")}
            />
          </button>
        </div>
      </div>

      {/* Unified Interactive Week Selector (Clicking a week expands its date range inline) */}
      {(viewMode === "WEEK" || viewMode === "DAY") && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card px-3.5 py-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const idx = semesterWeeks.indexOf(selectedWeek);
                if (idx > 0) setSelectedWeek(semesterWeeks[idx - 1]);
              }}
              disabled={semesterWeeks.indexOf(selectedWeek) <= 0}
              className="flex h-7 w-7 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              aria-label="Tuần trước"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                const idx = semesterWeeks.indexOf(selectedWeek);
                if (idx >= 0 && idx < semesterWeeks.length - 1) {
                  setSelectedWeek(semesterWeeks[idx + 1]);
                }
              }}
              disabled={
                semesterWeeks.indexOf(selectedWeek) >= semesterWeeks.length - 1
              }
              className="flex h-7 w-7 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              aria-label="Tuần sau"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Merged Week Pills: Selected week expands inline to show "Tuần X (dd/mm - dd/mm)" */}
          <div className="flex flex-1 flex-wrap items-center justify-center gap-1">
            {semesterWeeks.map((wk) => {
              const isSelected = wk === selectedWeek;
              const isCurrent = wk === currentIsoWeek;
              const hasClasses = scheduledItems.some((item) =>
                item.activeWeeks.includes(wk)
              );
              const wkStart = getExactDateForDayInWeek(calendarYear, wk, 2);
              const wkEnd = getExactDateForDayInWeek(calendarYear, wk, 8);

              return (
                <button
                  key={wk}
                  type="button"
                  onClick={() => setSelectedWeek(wk)}
                  title={`Tuần ${wk}: ${wkStart.displayShort} – ${wkEnd.displayFull}`}
                  className={cn(
                    "inline-flex h-7 items-center justify-center rounded-lg border font-mono text-xs transition-colors",
                    isSelected
                      ? "border-primary bg-primary px-3 font-bold text-primary-foreground"
                      : isCurrent
                      ? "min-w-[2rem] border-emerald-500/50 bg-emerald-500/10 px-1.5 font-bold text-emerald-600 dark:text-emerald-400"
                      : hasClasses
                      ? "min-w-[2rem] bg-background px-1.5 font-medium text-foreground hover:bg-accent"
                      : "min-w-[2rem] border-dashed bg-muted/20 px-1.5 text-muted-foreground/45 hover:bg-accent"
                  )}
                >
                  {isSelected ? (
                    <span className="flex items-center gap-1.5">
                      <span>Tuần {wk}</span>
                      <span className="font-normal opacity-90">
                        ({wkStart.displayShort} – {wkEnd.displayShort})
                      </span>
                    </span>
                  ) : (
                    wk
                  )}
                </button>
              );
            })}
          </div>

          {semesterWeeks.includes(currentIsoWeek) &&
            selectedWeek !== currentIsoWeek && (
              <button
                type="button"
                onClick={() => setSelectedWeek(currentIsoWeek)}
                className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
              >
                Tuần hiện tại ({currentIsoWeek})
              </button>
            )}
        </div>
      )}

      {/* ==================== VIEW 1: WEEKLY TIME-GRID ==================== */}
      {viewMode === "WEEK" && (
        <div className="overflow-hidden rounded-2xl border bg-card">
          {/* 7-Day Column Headers */}
          <div className="grid grid-cols-1 divide-y border-b bg-muted/25 md:grid-cols-7 md:divide-x md:divide-y-0">
            {WEEK_DAYS.map((day) => {
              const dateObj = getExactDateForDayInWeek(
                calendarYear,
                selectedWeek,
                day.dayOfWeek
              );
              const isToday =
                selectedWeek === currentIsoWeek &&
                day.dayOfWeek === todayBkDay;
              const dayCount = activeWeekItems.filter(
                (i) => i.dayOfWeek === day.dayOfWeek
              ).length;

              return (
                <div
                  key={day.dayOfWeek}
                  className={cn(
                    "flex items-center justify-between px-3.5 py-2.5 md:flex-col md:items-start md:justify-center",
                    isToday && "bg-primary/10"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "font-heading text-xs font-bold",
                        isToday ? "text-primary" : "text-foreground"
                      )}
                    >
                      {day.shortLabel}
                    </span>
                    {isToday && (
                      <span className="rounded bg-primary px-1.5 py-0.2 text-[10px] font-semibold text-primary-foreground">
                        Hôm nay
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 md:mt-0.5 md:w-full md:justify-between">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {dateObj.displayShort}
                    </span>
                    {dayCount > 0 && (
                      <span className="font-mono text-[10px] font-semibold text-primary">
                        {dayCount} buổi
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 7-Day Columns Body */}
          <div className="grid grid-cols-1 divide-y md:min-h-[380px] md:grid-cols-7 md:divide-x md:divide-y-0">
            {WEEK_DAYS.map((day) => {
              const dayClasses = activeWeekItems.filter(
                (item) => item.dayOfWeek === day.dayOfWeek
              );
              const dateObj = getExactDateForDayInWeek(
                calendarYear,
                selectedWeek,
                day.dayOfWeek
              );
              const dayExams = semesterExams.filter(
                (ex) =>
                  ex.examDate === dateObj.iso ||
                  (ex.weekNumber === selectedWeek &&
                    ex.dayOfWeek === day.dayOfWeek)
              );
              const isToday =
                selectedWeek === currentIsoWeek &&
                day.dayOfWeek === todayBkDay;

              return (
                <div
                  key={day.dayOfWeek}
                  className={cn(
                    "flex flex-col gap-2.5 p-2.5",
                    isToday && "bg-primary/[0.03]"
                  )}
                >
                  {/* Overlay Exam Cards occurring on this exact day */}
                  {dayExams.map((ex) => (
                    <Link
                      key={`exam-${ex.examId}`}
                      href="/exams"
                      className="relative flex w-full flex-col overflow-hidden rounded-xl border border-rose-500/45 bg-rose-500/10 p-2.5 text-left transition-colors hover:border-rose-500"
                    >
                      <span className="absolute inset-y-0 left-0 w-1 bg-rose-500" />
                      <div className="pl-1.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="rounded-md bg-rose-600 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                            THI {ex.examType} • {ex.startTime}
                          </span>
                          <span className="font-mono text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                            {ex.durationMinutes}p
                          </span>
                        </div>

                        <div>
                          <span className="font-mono text-xs font-bold text-rose-700 dark:text-rose-300">
                            {ex.subjectCode}
                          </span>
                          <p className="mt-0.5 line-clamp-2 font-heading text-xs font-bold leading-snug text-foreground">
                            {ex.subjectName}
                          </p>
                        </div>

                        <div className="flex items-center justify-between text-[11px] font-mono text-foreground/85">
                          <span className="inline-flex items-center gap-1 truncate">
                            <FileCheck2 className="h-3 w-3 shrink-0 text-rose-500" />
                            {ex.roomCode || "--"}
                          </span>
                          {ex.seatOrder !== null && (
                            <span className="font-bold text-rose-600 dark:text-rose-400">
                              STT:{ex.seatOrder}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}

                  {dayClasses.map((item) => {
                    const color =
                      subjectColorMap.get(item.subjectCode) ||
                      SUBJECT_COLOR_STYLES[0];
                    const endLesson = item.startLesson + item.numOfLesson - 1;

                    return (
                      <button
                        key={item.scheduleId}
                        type="button"
                        onClick={() => {
                          setActiveDetailItem(item);
                          setActiveDetailSessionDate(dateObj.iso);
                        }}
                        className={cn(
                          "group relative flex w-full flex-col overflow-hidden rounded-xl border p-2.5 text-left transition-colors",
                          color.bg,
                          color.border
                        )}
                      >
                        <span
                          className={cn(
                            "absolute inset-y-0 left-0 w-1",
                            color.accent
                          )}
                        />

                        <div className="pl-1.5 space-y-1.5">
                          {/* Time & Lesson */}
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className={cn(
                                "rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold",
                                color.badge
                              )}
                            >
                              {item.startTime} – {item.endTime}
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              T{item.startLesson}–{endLesson}
                            </span>
                          </div>

                          {/* Subject Code & Name */}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "font-mono text-xs font-bold",
                                  color.text
                                )}
                              >
                                {item.subjectCode}
                              </span>
                              {item.classGroup && (
                                <span className="rounded bg-background/70 px-1.5 py-0.2 font-mono text-[10px] font-medium text-muted-foreground">
                                  {item.classGroup}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 line-clamp-2 font-heading text-xs font-bold leading-snug text-foreground">
                              {item.subjectNameVi}
                            </p>
                          </div>

                          {/* Room */}
                          <div className="flex items-center gap-1 text-[11px] font-medium text-foreground/85">
                            <MapPin className="h-3 w-3 shrink-0 text-emerald-500" />
                            <span className="truncate font-mono">
                              {item.roomCode && item.roomCode !== "------"
                                ? item.roomCode
                                : "Chưa xếp phòng"}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== VIEW 2: CLEAN COURSE LIST ==================== */}
      {viewMode === "SEMESTER" && (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b bg-muted/20 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Mã môn</th>
                  <th className="px-4 py-3">Tên môn học</th>
                  <th className="px-3 py-3 text-center">Nhóm</th>
                  <th className="px-3 py-3 text-center">TC</th>
                  <th className="px-4 py-3">Lịch học cố định</th>
                  <th className="px-4 py-3">Phòng & Cơ sở</th>
                  <th className="px-4 py-3">Giảng viên</th>
                  <th className="px-4 py-3 text-right">Số buổi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => {
                  const color =
                    subjectColorMap.get(item.subjectCode) ||
                    SUBJECT_COLOR_STYLES[0];
                  const isUnscheduled =
                    item.dayOfWeek === 0 || item.startLesson === 0;
                  const endLesson =
                    item.startLesson > 0
                      ? item.startLesson + item.numOfLesson - 1
                      : 0;
                  const dayLabel =
                    WEEK_DAYS.find((d) => d.dayOfWeek === item.dayOfWeek)
                      ?.shortLabel || "Đồ án / SHSV";

                  const firstWk = item.activeWeeks[0];
                  const lastWk =
                    item.activeWeeks[item.activeWeeks.length - 1];

                  return (
                    <tr
                      key={item.scheduleId}
                      onClick={() => {
                        setActiveDetailItem(item);
                        setActiveDetailSessionDate(undefined);
                      }}
                      className="cursor-pointer transition-colors hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 font-mono font-bold">
                        <span
                          className={cn(
                            "rounded-lg px-2 py-1 text-xs",
                            color.badge
                          )}
                        >
                          {item.subjectCode}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-heading text-xs font-bold text-foreground">
                          {item.subjectNameVi}
                        </p>
                      </td>

                      <td className="px-3 py-3 text-center font-mono font-medium">
                        {item.classGroup || "--"}
                      </td>

                      <td className="px-3 py-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {item.numOfCredits}
                      </td>

                      <td className="px-4 py-3">
                        {isUnscheduled ? (
                          <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                            Không xếp tiết
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">
                              {dayLabel} • {item.startTime}–{item.endTime}
                            </span>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              (T{item.startLesson}–{endLesson})
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-foreground">
                          {item.roomCode && item.roomCode !== "------"
                            ? item.roomCode
                            : "--"}
                        </span>
                        <span className="ml-1.5 text-[11px] text-muted-foreground">
                          • {formatCampusBadge(item.campusNameVi)}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-medium text-foreground">
                        {item.employeeName || "--"}
                      </td>

                      <td className="px-4 py-3 text-right font-mono">
                        {item.activeWeeks.length > 0 ? (
                          <span className="rounded-lg bg-muted px-2 py-1 text-[11px] font-semibold text-foreground">
                            {item.activeWeeks.length} buổi (T{firstWk}–T{lastWk})
                          </span>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== VIEW 3: DAILY AGENDA ==================== */}
      {viewMode === "DAY" && (
        <div className="space-y-3">
          {/* Day Filter Strip */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border bg-card px-3.5 py-2">
            <button
              type="button"
              onClick={() => setSelectedDayFilter("ALL")}
              className={cn(
                "rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
                selectedDayFilter === "ALL"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              Tất cả ({activeWeekItems.length} buổi)
            </button>

            {WEEK_DAYS.map((d) => {
              const count = activeWeekItems.filter(
                (i) => i.dayOfWeek === d.dayOfWeek
              ).length;
              const dateObj = getExactDateForDayInWeek(
                calendarYear,
                selectedWeek,
                d.dayOfWeek
              );

              return (
                <button
                  key={d.dayOfWeek}
                  type="button"
                  onClick={() => setSelectedDayFilter(d.dayOfWeek)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
                    selectedDayFilter === d.dayOfWeek
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <span>{d.shortLabel}</span>
                  <span className="font-mono text-[10px] opacity-80">
                    ({dateObj.displayShort})
                  </span>
                  {count > 0 && (
                    <span className="rounded-full bg-background/25 px-1.5 py-0.2 font-mono text-[10px]">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Daily Agenda Cards */}
          <div className="space-y-2.5">
            {WEEK_DAYS.filter((d) =>
              selectedDayFilter === "ALL"
                ? true
                : d.dayOfWeek === selectedDayFilter
            ).map((day) => {
              const dayItems = activeWeekItems.filter(
                (i) => i.dayOfWeek === day.dayOfWeek
              );
              if (selectedDayFilter === "ALL" && dayItems.length === 0) {
                return null;
              }

              const dateObj = getExactDateForDayInWeek(
                calendarYear,
                selectedWeek,
                day.dayOfWeek
              );

              return (
                <div
                  key={day.dayOfWeek}
                  className="overflow-hidden rounded-2xl border bg-card"
                >
                  <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-primary" />
                      <span className="font-heading text-xs font-bold text-foreground">
                        {day.fullLabel} ({dateObj.displayFull})
                      </span>
                    </div>
                    <span className="font-mono text-xs font-semibold text-primary">
                      {dayItems.length} buổi
                    </span>
                  </div>

                  {dayItems.length === 0 ? (
                    <div className="p-5 text-center text-xs text-muted-foreground">
                      Không có lịch học trong ngày này.
                    </div>
                  ) : (
                    <div className="divide-y">
                      {dayItems.map((item) => {
                        const color =
                          subjectColorMap.get(item.subjectCode) ||
                          SUBJECT_COLOR_STYLES[0];
                        const endLesson =
                          item.startLesson + item.numOfLesson - 1;

                        return (
                          <div
                            key={item.scheduleId}
                            onClick={() => {
                              setActiveDetailItem(item);
                              setActiveDetailSessionDate(dateObj.iso);
                            }}
                            className="flex cursor-pointer flex-wrap items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/25"
                          >
                            <div className="flex items-center gap-3.5">
                              <div className="flex min-w-[6rem] flex-col items-center rounded-xl border bg-muted/15 px-2.5 py-1.5 text-center">
                                <span className="font-mono text-xs font-bold text-primary">
                                  {item.startTime} – {item.endTime}
                                </span>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  Tiết {item.startLesson}–{endLesson}
                                </span>
                              </div>

                              <div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={cn(
                                      "rounded px-1.5 py-0.5 font-mono text-xs font-bold",
                                      color.badge
                                    )}
                                  >
                                    {item.subjectCode}
                                  </span>
                                  <h3 className="font-heading text-xs font-bold text-foreground">
                                    {item.subjectNameVi}
                                  </h3>
                                  {item.classGroup && (
                                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                      {item.classGroup}
                                    </span>
                                  )}
                                </div>

                                <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                                  <span className="inline-flex items-center gap-1 font-mono font-medium text-foreground">
                                    <MapPin className="h-3 w-3 text-emerald-500" />
                                    {item.roomCode || "--"}
                                  </span>
                                  {item.employeeName && (
                                    <span className="inline-flex items-center gap-1">
                                      <User className="h-3 w-3 text-primary" />
                                      {item.employeeName}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <span className="rounded-lg border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                              Chi tiết
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Compact Unscheduled / Project Courses Row */}
      {unscheduledItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border bg-card px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <FolderKanban className="h-4 w-4 text-amber-500" />
            <span>Môn Đồ án / Sinh hoạt không xếp tiết:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {unscheduledItems.map((item) => (
              <button
                key={item.scheduleId}
                type="button"
                onClick={() => {
                  setActiveDetailItem(item);
                  setActiveDetailSessionDate(undefined);
                }}
                className="inline-flex items-center gap-2 rounded-xl border bg-muted/15 px-3 py-1.5 text-xs transition-colors hover:border-primary/40 hover:bg-muted/30"
              >
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  {item.subjectCode}
                </span>
                <span className="font-medium text-foreground">
                  {item.subjectNameVi}
                </span>
                {item.classGroup && (
                  <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[10px] text-muted-foreground">
                    {item.classGroup}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Compact Footer Summary Bar (Placed BELOW the calendar) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Học kỳ:</span>
            <span className="font-semibold text-foreground">
              {semesterName} ({selectedSemester})
            </span>
          </div>

          <span className="text-border">•</span>

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Môn đăng ký:</span>
            <span className="font-mono font-bold text-foreground">
              {uniqueSubjects} môn
            </span>
          </div>

          <span className="text-border">•</span>

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Tổng tín chỉ:</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {totalCredits} TC
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="rounded-lg bg-primary/10 px-2.5 py-1 font-semibold text-primary">
            Tuần {selectedWeek}: {activeWeekItems.length} buổi (
            {totalWeekLessons} tiết)
          </span>
        </div>
      </div>

      {/* 2-Column Split Detail Modal */}
      <ScheduleDetailModal
        open={Boolean(activeDetailItem)}
        onClose={() => setActiveDetailItem(null)}
        item={activeDetailItem}
        allSemesterItems={items}
        selectedWeek={selectedWeek}
        sessionDateIso={activeDetailSessionDate}
      />

      {/* Google Calendar Sync & .ics Modal */}
      <GoogleCalendarSyncModal
        open={gcalModalOpen}
        onClose={() => setGcalModalOpen(false)}
        semesterYearCode={selectedSemester}
        semesterYearName={semesterName}
        selectedWeek={selectedWeek}
        items={items}
        onDownloadIcs={handleDownloadIcs}
      />
    </div>
  );
}
