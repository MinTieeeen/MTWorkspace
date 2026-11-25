"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  Hash,
  MapPin,
  PartyPopper,
  RefreshCw,
  Timer,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { ExamScheduleSkeleton } from "@/components/ui/skeleton";
import { ExamDetailModal } from "@/components/mybk/exam-detail-modal";
import { ExamGoogleCalendarModal } from "@/components/mybk/exam-google-calendar-modal";
import type { ExamPrepStatus, NormalizedExamItem } from "@/lib/mybk-exams";
import type { RawMyBkSemesterOption } from "@/lib/mybk-timetable";

type ExamTypeFilter = "ALL" | "CK" | "GK";

interface ExamsApiResponse {
  connected: boolean;
  studentId: string | null;
  hasAutoSso: boolean;
  isStale: boolean;
  lastSyncedAt: string | null;
  currentSemesterCode: string;
  selectedSemesterCode: string;
  semesters: RawMyBkSemesterOption[];
  items: NormalizedExamItem[];
}

const DAY_LABELS: Record<number, string> = {
  2: "Thứ 2",
  3: "Thứ 3",
  4: "Thứ 4",
  5: "Thứ 5",
  6: "Thứ 6",
  7: "Thứ 7",
  8: "CN",
};

const DAY_FULL_LABELS: Record<number, string> = {
  2: "Thứ Hai",
  3: "Thứ Ba",
  4: "Thứ Tư",
  5: "Thứ Năm",
  6: "Thứ Sáu",
  7: "Thứ Bảy",
  8: "Chủ Nhật",
};

function getExamTimestampMs(examDate: string, timeHHMM: string): number {
  if (!examDate) return 0;
  const cleanTime =
    timeHHMM && timeHHMM.includes(":") ? timeHHMM : "07:00";
  const dt = new Date(`${examDate}T${cleanTime}:00+07:00`);
  return Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
}

function formatDateVi(isoDate: string): {
  dd: string;
  mm: string;
  yyyy: string;
  short: string;
  full: string;
} {
  if (!isoDate || !isoDate.includes("-")) {
    return {
      dd: "--",
      mm: "--",
      yyyy: "----",
      short: "--/--",
      full: isoDate || "--",
    };
  }
  const [yyyy, mm, dd] = isoDate.split("-");
  return {
    dd,
    mm,
    yyyy,
    short: `${dd}/${mm}`,
    full: `${dd}/${mm}/${yyyy}`,
  };
}

function formatCampusShort(campusCode: string | null): string {
  if (!campusCode) return "ĐHBK";
  if (campusCode.includes("CS1")) return "Cơ sở 1 — Lý Thường Kiệt";
  if (campusCode.includes("CS2")) return "Cơ sở 2 — Dĩ An";
  return campusCode;
}

function computeCountdownParts(targetMs: number, nowMs: number) {
  const diff = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { diff, days, hours, minutes, seconds };
}

function buildExamIcsContent(
  items: NormalizedExamItem[],
  semesterCode: string
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MTWorkspace//HCMUT myBK Exam Schedule//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Lịch thi Bách Khoa HK ${semesterCode}`,
    "X-WR-TIMEZONE:Asia/Ho_Chi_Minh",
  ];

  const nowStamp =
    new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  for (const item of items) {
    if (!item.examDate) continue;
    const cleanDate = item.examDate.replace(/-/g, "");
    const startHHMM = item.startTime.replace(":", "").padStart(4, "0");
    const endHHMM = item.endTime.replace(":", "").padStart(4, "0");
    const typeLabel = item.examType === "GK" ? "Thi Giữa kỳ" : "Thi Cuối kỳ";
    const roomPart = item.roomCode || "Chưa xếp phòng";
    const location = `${roomPart} (${formatCampusShort(item.campusCode)})`;

    const desc = [
      `Kỳ thi: ${typeLabel} (${item.semesterYearName})`,
      `Môn thi: ${item.subjectCode} - ${item.subjectName} (${item.numOfCredits} TC)`,
      item.seatOrder ? `STT phòng thi: ${item.seatOrder}` : "",
      `Thời lượng: ${item.durationMinutes} phút (${item.startTime} - ${item.endTime})`,
    ]
      .filter(Boolean)
      .join("\\n");

    const uid = `mtworkspace-exam-${semesterCode}-${item.examId}@mybk.hcmut.edu.vn`;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;TZID=Asia/Ho_Chi_Minh:${cleanDate}T${startHHMM}00`,
      `DTEND;TZID=Asia/Ho_Chi_Minh:${cleanDate}T${endHHMM}00`,
      `SUMMARY:[${typeLabel}] ${item.subjectCode} - ${item.subjectName}`,
      `LOCATION:${location}`,
      `DESCRIPTION:${desc}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT60M",
      "ACTION:DISPLAY",
      "DESCRIPTION:Chuẩn bị vào phòng thi",
      "END:VALARM",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export default function ExamSchedulePage() {
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [data, setData] = useState<ExamsApiResponse | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<string>("20261");
  const [examTypeFilter, setExamTypeFilter] = useState<ExamTypeFilter>("ALL");
  const [revalidating, setRevalidating] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Modals
  const [activeExam, setActiveExam] = useState<NormalizedExamItem | null>(null);
  const [gcalModalOpen, setGcalModalOpen] = useState(false);

  // Live 1-second ticker for countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const loadExams = useCallback(
    async (
      semCode?: string,
      opts?: { revalidate?: boolean; force?: boolean }
    ) => {
      const params = new URLSearchParams();
      if (semCode) params.set("semesterYear", semCode);
      if (opts?.revalidate) params.set("revalidate", "1");
      if (opts?.force) params.set("force", "1");

      const res = await fetch(`/api/mybk/exams?${params.toString()}`);
      if (!res.ok) return null;
      const json = (await res.json()) as ExamsApiResponse;
      setData(json);
      setSelectedSemester(json.selectedSemesterCode);
      return json;
    },
    []
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const initial = await loadExams();
        if (!active) return;
        setInitialLoaded(true);

        setRevalidating(true);
        await loadExams(initial?.selectedSemesterCode, { revalidate: true });
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
  }, [loadExams]);

  const allItems = useMemo(() => {
    return [...(data?.items || [])].sort((a, b) => {
      const aMs = getExamTimestampMs(a.examDate, a.startTime);
      const bMs = getExamTimestampMs(b.examDate, b.startTime);
      return aMs - bMs;
    });
  }, [data?.items]);

  const filteredItems = useMemo(() => {
    if (examTypeFilter === "ALL") return allItems;
    return allItems.filter((item) => item.examType === examTypeFilter);
  }, [allItems, examTypeFilter]);

  // Split into upcoming vs completed:
  // - If there is at least 1 upcoming exam: nextExam goes on the left, remaining (upcoming + completed) go on the right.
  // - If ALL exams in the selected semester/filter are completed: nextExam is null (left shows Congratulations card), ALL completed exams go on the right!
  const { nextExam, rightListExams, allFinished } = useMemo(() => {
    if (filteredItems.length === 0) {
      return {
        nextExam: null,
        rightListExams: [] as NormalizedExamItem[],
        allFinished: false,
      };
    }

    const upcoming = filteredItems.filter(
      (item) => getExamTimestampMs(item.examDate, item.endTime) >= nowMs
    );
    const completed = filteredItems.filter(
      (item) => getExamTimestampMs(item.examDate, item.endTime) < nowMs
    );

    if (upcoming.length > 0) {
      const [firstUpcoming, ...restUpcoming] = upcoming;
      return {
        nextExam: firstUpcoming,
        rightListExams: [...restUpcoming, ...completed],
        allFinished: false,
      };
    }

    return {
      nextExam: null,
      rightListExams: [...completed].reverse(),
      allFinished: true,
    };
  }, [filteredItems, nowMs]);

  const handleSemesterChange = async (nextSem: string) => {
    setSelectedSemester(nextSem);
    setRevalidating(true);
    try {
      await loadExams(nextSem, { revalidate: true });
    } finally {
      setRevalidating(false);
    }
  };

  const handleManualRefresh = async () => {
    setRevalidating(true);
    try {
      const res = await loadExams(selectedSemester, { force: true });
      if (res) {
        toast.success("Đã cập nhật Lịch thi");
      } else {
        toast.error("Không thể làm mới Lịch thi");
      }
    } finally {
      setRevalidating(false);
    }
  };

  const handleDownloadIcs = () => {
    if (allItems.length === 0) return;
    const ics = buildExamIcsContent(allItems, selectedSemester);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `LichThi-BachKhoa-HK${selectedSemester}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Đã tải tệp Lịch thi (.ics)");
  };

  const handlePrepUpdated = (
    examId: number,
    prepStatus: ExamPrepStatus,
    personalNote?: string
  ) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((it) =>
          it.examId === examId
            ? {
                ...it,
                prepStatus,
                ...(personalNote !== undefined ? { personalNote } : {}),
              }
            : it
        ),
      };
    });
    setActiveExam((prev) =>
      prev && prev.examId === examId
        ? {
            ...prev,
            prepStatus,
            ...(personalNote !== undefined ? { personalNote } : {}),
          }
        : prev
    );
  };

  if (!initialLoaded) {
    return <ExamScheduleSkeleton />;
  }

  const semesterName =
    allItems[0]?.semesterYearName ||
    data?.semesters?.find((s) => String(s.code) === selectedSemester)?.nameVi ||
    `Học kỳ ${selectedSemester}`;

  const gkCount = allItems.filter((i) => i.examType === "GK").length;
  const ckCount = allItems.filter((i) => i.examType === "CK").length;

  const countdown = nextExam
    ? computeCountdownParts(
        getExamTimestampMs(nextExam.examDate, nextExam.startTime),
        nowMs
      )
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Top Toolbar: Semester LOV + Exam Type LOV + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border bg-card px-4 py-2.5">
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

          <select
            value={examTypeFilter}
            onChange={(e) =>
              setExamTypeFilter(e.target.value as ExamTypeFilter)
            }
            className="h-9 rounded-xl border bg-background px-3 text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
          >
            <option value="ALL">Tất cả đợt thi ({allItems.length})</option>
            <option value="CK">Thi Cuối kỳ ({ckCount})</option>
            <option value="GK">Thi Giữa kỳ ({gkCount})</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
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
            title="Tải tệp .ics"
            className="group inline-flex h-9 items-center gap-1.5 rounded-xl border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <Download className="h-3.5 w-3.5 text-primary transition-transform duration-200 group-hover:translate-y-0.5" />
            <span className="hidden sm:inline">.ics</span>
          </button>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={revalidating}
            title="Làm mới Lịch thi"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", revalidating && "animate-spin")}
            />
          </button>
        </div>
      </div>

      {/* Empty Semester State */}
      {filteredItems.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-8 text-center">
          <FileCheck2 className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-semibold text-foreground">
            Chưa có dữ liệu lịch thi cho học kỳ này
          </p>
        </div>
      ) : (
        /* Asymmetric Split Layout: Left column is narrower (5/12) & fits content tightly; Right column is wider (7/12) */
        <div className="grid items-start gap-4 lg:grid-cols-12">
          {/* ==================== LEFT COLUMN (5/12): Distributed Bento Stack ==================== */}
          <div className="space-y-3 lg:col-span-5">
            {nextExam && countdown ? (
              <>
                {/* 1. Compact Countdown Bar on Top */}
                <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Timer className="h-4 w-4" />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Đếm ngược
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 font-mono">
                    {[
                      { v: countdown.days, u: "ng" },
                      { v: countdown.hours, u: "g" },
                      { v: countdown.minutes, u: "p" },
                      { v: countdown.seconds, u: "s" },
                    ].map((seg) => (
                      <div
                        key={seg.u}
                        className="inline-flex items-baseline gap-0.5 rounded-lg border bg-muted/25 px-2 py-1"
                      >
                        <span className="text-sm font-extrabold text-primary">
                          {String(seg.v).padStart(2, "0")}
                        </span>
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          {seg.u}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Main Next Subject Header Card (Tight Fit) */}
                <div
                  onClick={() => setActiveExam(nextExam)}
                  className="cursor-pointer rounded-2xl border bg-card p-5 transition-colors hover:border-primary/50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-lg bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">
                        Môn thi tiếp theo
                      </span>
                      <span
                        className={cn(
                          "rounded-lg px-2 py-0.5 font-mono text-[11px] font-bold",
                          nextExam.examType === "CK"
                            ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        )}
                      >
                        {nextExam.examType === "CK" ? "Cuối kỳ" : "Giữa kỳ"}
                      </span>
                    </div>

                    <span className="font-mono text-xs font-bold text-primary">
                      {nextExam.subjectCode} • {nextExam.numOfCredits} TC
                    </span>
                  </div>

                  <h2 className="mt-3 font-heading text-xl font-extrabold leading-snug tracking-tight text-foreground">
                    {nextExam.subjectName}
                  </h2>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-sky-500" />
                      Nhóm thi:{" "}
                      <strong className="font-mono text-foreground">
                        {nextExam.classGroup || "--"}
                      </strong>
                    </span>
                    <span className="font-mono">Tuần {nextExam.weekNumber}</span>
                  </div>
                </div>

                {/* 3. Distributed Separate Mini Bento Tiles (Date/Time & Room/Seat) */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Date Tile */}
                  <div
                    onClick={() => setActiveExam(nextExam)}
                    className="cursor-pointer rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 text-primary" />
                      <span>Ngày thi</span>
                    </div>
                    <p className="mt-1.5 font-heading text-sm font-bold text-foreground">
                      {DAY_FULL_LABELS[nextExam.dayOfWeek]}
                    </p>
                    <p className="font-mono text-xs font-semibold text-primary">
                      {formatDateVi(nextExam.examDate).full}
                    </p>
                  </div>

                  {/* Time & Duration Tile */}
                  <div
                    onClick={() => setActiveExam(nextExam)}
                    className="cursor-pointer rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                      <span>Giờ làm bài</span>
                    </div>
                    <p className="mt-1.5 font-mono text-sm font-bold text-foreground">
                      {nextExam.startTime} – {nextExam.endTime}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      Thời lượng {nextExam.durationMinutes} phút
                    </p>
                  </div>

                  {/* Room & Campus Tile */}
                  <div
                    onClick={() => setActiveExam(nextExam)}
                    className="cursor-pointer rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Phòng thi</span>
                    </div>
                    <p className="mt-1.5 font-mono text-sm font-bold text-foreground">
                      {nextExam.roomCode || "Chưa xếp phòng"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatCampusShort(nextExam.campusCode)}
                    </p>
                  </div>

                  {/* Seat Order & Grade Deadline Tile */}
                  <div
                    onClick={() => setActiveExam(nextExam)}
                    className="cursor-pointer rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Hash className="h-3.5 w-3.5 text-teal-500" />
                      <span>Số thứ tự</span>
                    </div>
                    <p className="mt-1.5 font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {nextExam.seatOrder !== null
                        ? `STT ${nextExam.seatOrder}`
                        : "--"}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {nextExam.gradeDeadline
                        ? `Điểm: ${nextExam.gradeDeadline}`
                        : `Tiết ${nextExam.startLesson}–${nextExam.endLesson}`}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              /* Completed Semester Celebration Card on the Left */
              <div className="rounded-2xl border bg-card p-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <PartyPopper className="h-6 w-6" />
                </div>

                <h2 className="mt-4 font-heading text-lg font-extrabold text-foreground">
                  Không còn môn thi tiếp theo
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Chúc mừng bạn đã hoàn thành toàn bộ kỳ thi của{" "}
                  <strong className="text-foreground">{semesterName}</strong>!
                </p>

                <div className="mt-5 grid grid-cols-2 gap-2.5 text-left">
                  <div className="rounded-xl border bg-muted/15 p-3">
                    <p className="text-[11px] text-muted-foreground">
                      Đã hoàn thành
                    </p>
                    <p className="mt-0.5 font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {rightListExams.length} / {rightListExams.length} ca thi
                    </p>
                  </div>
                  <div className="rounded-xl border bg-muted/15 p-3">
                    <p className="text-[11px] text-muted-foreground">
                      Tổng tín chỉ thi
                    </p>
                    <p className="mt-0.5 font-mono text-sm font-bold text-foreground">
                      {Array.from(
                        new Map(
                          rightListExams.map((x) => [
                            x.subjectCode,
                            x.numOfCredits,
                          ])
                        ).values()
                      ).reduce((a, b) => a + b, 0)}{" "}
                      TC
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ==================== RIGHT COLUMN (7/12): Wider Scrollable Exam List ==================== */}
          <div className="flex max-h-[calc(100vh-12rem)] flex-col overflow-hidden rounded-2xl border bg-card lg:col-span-7">
            <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-3">
              <span className="font-heading text-xs font-bold uppercase tracking-wider text-foreground">
                {allFinished ? "Danh sách môn đã thi" : "Các môn thi tiếp theo & Đã thi"}
              </span>
              <span className="rounded-lg bg-primary/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
                {rightListExams.length} ca thi
              </span>
            </div>

            {rightListExams.length === 0 ? (
              <div className="flex h-44 items-center justify-center p-6 text-xs text-muted-foreground">
                Không có ca thi nào khác trong danh sách lọc
              </div>
            ) : (
              <div className="flex-1 space-y-2.5 overflow-y-auto p-3.5">
                {rightListExams.map((item) => {
                  const dateParts = formatDateVi(item.examDate);
                  const endMs = getExamTimestampMs(item.examDate, item.endTime);
                  const startMs = getExamTimestampMs(
                    item.examDate,
                    item.startTime
                  );
                  const isDone = endMs < nowMs;
                  const cd = computeCountdownParts(startMs, nowMs);
                  const isFinal = item.examType === "CK";

                  return (
                    <div
                      key={item.examId}
                      onClick={() => setActiveExam(item)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors hover:border-primary/50",
                        isDone
                          ? "bg-muted/10 opacity-80 hover:opacity-100"
                          : "bg-background hover:bg-muted/20"
                      )}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        {/* Balanced Proportional Date Box */}
                        <div
                          className={cn(
                            "flex h-14 w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-xl border px-2.5 py-1.5 text-center",
                            isDone
                              ? "bg-muted/40"
                              : "border-primary/30 bg-primary/10"
                          )}
                        >
                          <span className="text-[11px] font-bold leading-none text-primary">
                            {DAY_LABELS[item.dayOfWeek]}
                          </span>
                          <span className="mt-1 font-mono text-sm font-extrabold leading-none text-foreground">
                            {dateParts.short}
                          </span>
                        </div>

                        {/* Subject & Time/Room */}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.2 font-mono text-[10px] font-bold",
                                isFinal
                                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              )}
                            >
                              {item.examType}
                            </span>
                            <span className="font-mono text-xs font-bold text-primary">
                              {item.subjectCode}
                            </span>
                            <p className="truncate font-heading text-sm font-bold text-foreground">
                              {item.subjectName}
                            </p>
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
                            <span className="font-semibold text-foreground/90">
                              {item.startTime}–{item.endTime} (
                              {item.durationMinutes}p)
                            </span>
                            <span>•</span>
                            <span className="font-semibold text-foreground/90">
                              {item.roomCode || "--"}
                            </span>
                            {item.seatOrder !== null && (
                              <>
                                <span>•</span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                  STT {item.seatOrder}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Status / Countdown Pill */}
                      <div className="shrink-0">
                        {isDone ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Đã thi
                          </span>
                        ) : (
                          <span className="rounded-lg bg-primary/10 px-2.5 py-1 font-mono text-[11px] font-bold text-primary">
                            {cd.days > 0
                              ? `${cd.days} ngày`
                              : `${cd.hours}g ${cd.minutes}p`}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <ExamDetailModal
        open={Boolean(activeExam)}
        onClose={() => setActiveExam(null)}
        item={activeExam}
        allSemesterExams={allItems}
        onPrepUpdated={handlePrepUpdated}
      />

      <ExamGoogleCalendarModal
        open={gcalModalOpen}
        onClose={() => setGcalModalOpen(false)}
        semesterYearCode={selectedSemester}
        semesterYearName={semesterName}
        items={allItems}
        onDownloadIcs={handleDownloadIcs}
      />
    </div>
  );
}
