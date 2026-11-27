"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Layers,
  MapPin,
  RefreshCw,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useRetained } from "@/components/ui/modal";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { TimetableSkeleton } from "@/components/ui/skeleton";
import {
  ConnectPrompt,
  EmptyState,
  ErrorState,
  StaleBanner,
} from "@/components/ui/state";
import { MyBkConnectModal } from "@/components/mybk/mybk-connect-modal";
import { ScheduleDetailModal } from "@/components/mybk/schedule-detail-modal";
import { GoogleCalendarSyncModal } from "@/components/mybk/google-calendar-sync-modal";
import type {
  NormalizedTimetableItem,
  RawMyBkSemesterOption,
} from "@/lib/mybk-timetable";
import type { NormalizedExamItem } from "@/lib/mybk-exams";
import {
  DAY_FULL_LABELS,
  WEEK_DAYS,
  formatCampus,
  getCurrentIsoWeek,
  getDateForDayInWeek,
  getTodayBkDayOfWeek,
  padTime,
} from "@/lib/format";
import { buildTimetableIcs, downloadIcs, isScheduledItem } from "@/lib/ics";
import { SUBJECT_COLOR_STYLES, buildSubjectColorMap } from "@/lib/subject-colors";
import { useMybkResource, type ResourcePayload } from "@/lib/use-mybk-resource";

type ViewMode = "WEEK" | "SUBJECTS";

interface TimetablePayload extends ResourcePayload {
  studentId?: string | null;
  currentSemesterCode?: string;
  selectedSemesterCode?: string;
  semesters?: RawMyBkSemesterOption[];
  items?: NormalizedTimetableItem[];
}

interface ExamsPayload extends ResourcePayload {
  items?: NormalizedExamItem[];
}

interface DayData {
  dayOfWeek: number;
  shortLabel: string;
  fullLabel: string;
  iso: string;
  short: string;
  full: string;
  isToday: boolean;
  classes: NormalizedTimetableItem[];
  exams: NormalizedExamItem[];
}

const roomOf = (item: NormalizedTimetableItem) =>
  item.roomCode && item.roomCode !== "------" ? item.roomCode : "";

/** Nút chọn tuần: bấm để mở lưới tuần của cả học kỳ */
function WeekPicker({
  weeks,
  selected,
  current,
  weeksWithClasses,
  weeksWithExams,
  labelFor,
  onSelect,
}: {
  weeks: number[];
  selected: number;
  current: number;
  weeksWithClasses: Set<number>;
  weeksWithExams: Set<number>;
  labelFor: (week: number) => string;
  onSelect: (week: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-2 rounded-lg px-3 transition-colors hover:bg-muted"
      >
        <span className="font-display text-[15px] font-semibold text-foreground">
          Tuần {selected}
        </span>
        <span className="font-mono text-[13px] text-muted-foreground">
          {labelFor(selected)}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-1/2 top-full z-30 mt-2 w-[19.5rem] -translate-x-1/2 rounded-2xl border bg-card p-3 shadow-xl animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-150"
        >
          <p className="px-1 pb-2 text-xs font-semibold text-muted-foreground">
            Chọn tuần trong học kỳ
          </p>
          <div className="grid grid-cols-6 gap-1.5">
            {weeks.map((wk) => (
              <button
                key={wk}
                type="button"
                role="option"
                aria-selected={wk === selected}
                title={`Tuần ${wk}: ${labelFor(wk)}`}
                onClick={() => {
                  onSelect(wk);
                  setOpen(false);
                }}
                className={cn(
                  "relative flex h-9 items-center justify-center rounded-lg border font-mono text-[13px] transition-colors",
                  wk === selected
                    ? "border-primary bg-primary font-semibold text-primary-foreground"
                    : wk === current
                    ? "border-success/50 bg-success/10 font-semibold text-success-fg"
                    : weeksWithClasses.has(wk)
                    ? "bg-background text-foreground hover:bg-accent"
                    : "border-dashed bg-muted/20 text-muted-foreground/60 hover:bg-accent"
                )}
              >
                {wk}
                {weeksWithExams.has(wk) && (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-danger" />
                )}
              </button>
            ))}
          </div>
          <p className="flex items-center gap-3 px-1 pt-2.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-success/60" /> Tuần này
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-danger" /> Có ca thi
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

export default function TimetablePage() {
  const [semester, setSemester] = useState<string | null>(null);
  const semParam = semester ? `?semesterYear=${semester}` : "";
  const timetable = useMybkResource<TimetablePayload>({
    url: `/api/mybk/timetable${semParam}`,
    isEmpty: (d) => !d.items || d.items.length === 0,
  });
  const examsRes = useMybkResource<ExamsPayload>({
    url: `/api/mybk/exams${semParam}`,
  });
  // Giữ dữ liệu cũ trong lúc đổi học kỳ để giao diện không nháy trắng
  const data = useRetained(timetable.data);
  const semesterExams = useMemo(
    () => examsRes.data?.items ?? [],
    [examsRes.data]
  );

  const [viewMode, setViewMode] = useState<ViewMode>("WEEK");
  const [selectedWeek, setSelectedWeek] = useState<number>(() =>
    getCurrentIsoWeek()
  );
  const [refreshing, setRefreshing] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [gcalModalOpen, setGcalModalOpen] = useState(false);
  const [activeDetailItem, setActiveDetailItem] =
    useState<NormalizedTimetableItem | null>(null);
  const [activeDetailSessionDate, setActiveDetailSessionDate] = useState<
    string | undefined
  >(undefined);

  // Hướng đổi tuần để chọn animation trượt (tuần sau: từ phải, tuần trước: từ trái)
  const prevWeekRef = useRef(selectedWeek);
  const weekDirRef = useRef<"next" | "prev">("next");
  if (selectedWeek > prevWeekRef.current) weekDirRef.current = "next";
  else if (selectedWeek < prevWeekRef.current) weekDirRef.current = "prev";
  useEffect(() => {
    prevWeekRef.current = selectedWeek;
  }, [selectedWeek]);

  const items = useMemo(() => data?.items ?? [], [data]);

  // Các tuần của học kỳ (suy ra từ dữ liệu các môn và ca thi)
  const semesterWeeks = useMemo(() => {
    let minW = 99;
    let maxW = 1;
    for (const item of items) {
      const startW = item.weeksCalendarBegin || 35;
      const tokens = item.weekSeriesDisplay
        .split("|")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const endW = startW + Math.max(0, tokens.length - 1);
      minW = Math.min(minW, startW);
      maxW = Math.max(maxW, endW);
      for (const w of item.activeWeeks) {
        minW = Math.min(minW, w);
        maxW = Math.max(maxW, w);
      }
    }
    for (const ex of semesterExams) {
      if (ex.weekNumber > 0) {
        minW = Math.min(minW, ex.weekNumber);
        maxW = Math.max(maxW, ex.weekNumber);
      }
    }
    if (minW > maxW) return Array.from({ length: 16 }, (_, i) => 35 + i);
    return Array.from({ length: maxW - minW + 1 }, (_, i) => minW + i);
  }, [items, semesterExams]);

  // Đưa tuần đang chọn về trong khoảng học kỳ
  useEffect(() => {
    if (semesterWeeks.length === 0 || semesterWeeks.includes(selectedWeek)) {
      return;
    }
    const currentIso = getCurrentIsoWeek();
    setSelectedWeek(
      semesterWeeks.includes(currentIso) ? currentIso : semesterWeeks[0]
    );
  }, [semesterWeeks, selectedWeek]);

  const subjectColorMap = useMemo(
    () => buildSubjectColorMap(items.map((i) => i.subjectCode)),
    [items]
  );

  const { scheduledItems, unscheduledItems, uniqueSubjects, totalCredits } =
    useMemo(() => {
      const scheduled: NormalizedTimetableItem[] = [];
      const unscheduled: NormalizedTimetableItem[] = [];
      const creditBySubject = new Map<string, number>();
      for (const item of items) {
        if (!creditBySubject.has(item.subjectCode)) {
          creditBySubject.set(item.subjectCode, item.numOfCredits);
        }
        (isScheduledItem(item) ? scheduled : unscheduled).push(item);
      }
      return {
        scheduledItems: scheduled,
        unscheduledItems: unscheduled,
        uniqueSubjects: creditBySubject.size,
        totalCredits: Array.from(creditBySubject.values()).reduce(
          (a, c) => a + c,
          0
        ),
      };
    }, [items]);

  const weeksWithClasses = useMemo(() => {
    const set = new Set<number>();
    for (const item of scheduledItems) item.activeWeeks.forEach((w) => set.add(w));
    return set;
  }, [scheduledItems]);

  const weeksWithExams = useMemo(
    () => new Set(semesterExams.map((e) => e.weekNumber).filter((w) => w > 0)),
    [semesterExams]
  );

  const calendarYear = items[0]?.calendarYear || new Date().getFullYear();
  const currentIsoWeek = getCurrentIsoWeek();
  const todayBkDay = getTodayBkDayOfWeek();

  // Dữ liệu 7 ngày của tuần đang chọn: dùng chung cho lưới (desktop) và danh sách (mobile)
  const days = useMemo<DayData[]>(() => {
    return WEEK_DAYS.map((d) => {
      const date = getDateForDayInWeek(calendarYear, selectedWeek, d.dayOfWeek);
      return {
        dayOfWeek: d.dayOfWeek,
        shortLabel: d.shortLabel,
        fullLabel: DAY_FULL_LABELS[d.dayOfWeek],
        iso: date.iso,
        short: date.displayShort,
        full: date.displayFull,
        isToday: selectedWeek === currentIsoWeek && d.dayOfWeek === todayBkDay,
        classes: scheduledItems
          .filter(
            (i) => i.dayOfWeek === d.dayOfWeek && i.activeWeeks.includes(selectedWeek)
          )
          .sort((a, b) => a.startLesson - b.startLesson),
        exams: semesterExams
          .filter(
            (ex) =>
              ex.examDate === date.iso ||
              (ex.weekNumber === selectedWeek && ex.dayOfWeek === d.dayOfWeek)
          )
          .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      };
    });
  }, [calendarYear, selectedWeek, scheduledItems, semesterExams, currentIsoWeek, todayBkDay]);

  const weekSessionCount = days.reduce((s, d) => s + d.classes.length, 0);
  const weekLessonCount = days.reduce(
    (s, d) => s + d.classes.reduce((a, c) => a + c.numOfLesson, 0),
    0
  );
  const weekExamCount = days.reduce((s, d) => s + d.exams.length, 0);

  const weekLabel = (wk: number) => {
    const a = getDateForDayInWeek(calendarYear, wk, 2).displayShort;
    const b = getDateForDayInWeek(calendarYear, wk, 8).displayShort;
    return `${a} – ${b}`;
  };

  const weekIdx = semesterWeeks.indexOf(selectedWeek);
  const selectedSemesterCode =
    data?.selectedSemesterCode ?? semester ?? "";
  const semesterName =
    items[0]?.semesterYearName ||
    data?.semesters?.find((s) => String(s.code) === selectedSemesterCode)
      ?.nameVi ||
    (selectedSemesterCode ? `Học kỳ ${selectedSemesterCode}` : "");

  const openDetail = (item: NormalizedTimetableItem, dateIso?: string) => {
    setActiveDetailItem(item);
    setActiveDetailSessionDate(dateIso);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const [ok] = await Promise.all([
        timetable.refresh(true),
        examsRes.refresh(true),
      ]);
      if (ok) toast.success("Đã cập nhật Thời khóa biểu");
      else toast.error("Không thể làm mới Thời khóa biểu");
    } finally {
      setRefreshing(false);
    }
  };

  const handleDownloadIcs = () => {
    if (scheduledItems.length === 0) return;
    downloadIcs(
      buildTimetableIcs(items, selectedSemesterCode),
      `TKB-BachKhoa-HK${selectedSemesterCode}.ics`
    );
    toast.success("Đã tải tệp Thời khóa biểu (.ics)");
  };

  // ===== Các trạng thái thay cho toàn trang =====
  if (!data && timetable.status === "loading") return <TimetableSkeleton />;

  if (
    timetable.status === "not-connected" ||
    timetable.status === "sso-expired" ||
    timetable.status === "error"
  ) {
    const expired = timetable.status === "sso-expired";
    return (
      <div className="mx-auto max-w-2xl pt-10">
        {timetable.status === "error" ? (
          <ErrorState
            title="Không tải được thời khóa biểu"
            message={timetable.error ?? undefined}
            onRetry={timetable.retry}
          />
        ) : (
          <ConnectPrompt
            expired={expired}
            title={
              expired
                ? "Phiên đăng nhập myBK đã hết hạn"
                : "Chưa kết nối myBK"
            }
            description={
              expired
                ? "Đăng nhập lại để cập nhật thời khóa biểu."
                : "Kết nối tài khoản để xem thời khóa biểu của bạn."
            }
            actionLabel={expired ? "Đăng nhập lại" : "Kết nối myBK"}
            onConnect={() => setConnectOpen(true)}
          />
        )}
        <MyBkConnectModal
          open={connectOpen}
          onClose={() => setConnectOpen(false)}
          connectedStudentId={data?.studentId ?? null}
          lastSyncedAt={data?.lastSyncedAt ?? null}
        />
      </div>
    );
  }

  const switching = timetable.status === "loading";
  const hasItems = items.length > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {timetable.isStale && (
        <StaleBanner
          lastSyncedAt={timetable.lastSyncedAt}
          message="Đang hiển thị thời khóa biểu đã lưu, chưa cập nhật được từ myBK"
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      )}

      {/* ===== Khối điều khiển: (1) chế độ xem · học kỳ · hành động, (2) điều hướng tuần ===== */}
      <div className="rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedTabs
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: "WEEK", label: "Tuần", icon: <CalendarDays className="h-3.5 w-3.5" /> },
                { value: "SUBJECTS", label: "Môn học", icon: <Layers className="h-3.5 w-3.5" /> },
              ]}
            />
            <div className="flex items-center gap-2.5">
              {data?.semesters && data.semesters.length > 0 && (
                <Select
                  value={selectedSemesterCode}
                  onChange={(e) => setSemester(e.target.value)}
                  aria-label="Học kỳ"
                  className="max-w-[16rem] truncate"
                >
                  {data.semesters.map((sem) => (
                    <option key={sem.id} value={String(sem.code)}>
                      {sem.code} — {sem.nameVi}
                    </option>
                  ))}
                </Select>
              )}
              {hasItems && (
                <span className="hidden whitespace-nowrap text-[13px] text-muted-foreground md:inline">
                  {uniqueSubjects} môn · {totalCredits} TC
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setGcalModalOpen(true)}
              disabled={scheduledItems.length === 0}
              title="Thêm vào Google Calendar hoặc tải tệp .ics"
            >
              <CalendarPlus className="h-4 w-4" />
              Xuất lịch
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label="Làm mới từ myBK"
              title="Làm mới từ myBK"
            >
              <RefreshCw
                className={cn("h-4 w-4", (refreshing || timetable.refreshing) && "animate-spin")}
              />
            </Button>
          </div>
        </div>

        {viewMode === "WEEK" && hasItems && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={weekIdx <= 0}
                onClick={() => setSelectedWeek(semesterWeeks[weekIdx - 1])}
                aria-label="Tuần trước"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <WeekPicker
                weeks={semesterWeeks}
                selected={selectedWeek}
                current={currentIsoWeek}
                weeksWithClasses={weeksWithClasses}
                weeksWithExams={weeksWithExams}
                labelFor={weekLabel}
                onSelect={setSelectedWeek}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={weekIdx < 0 || weekIdx >= semesterWeeks.length - 1}
                onClick={() => setSelectedWeek(semesterWeeks[weekIdx + 1])}
                aria-label="Tuần sau"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              {semesterWeeks.includes(currentIsoWeek) &&
                selectedWeek !== currentIsoWeek && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="ml-1"
                    onClick={() => setSelectedWeek(currentIsoWeek)}
                  >
                    Tuần này
                  </Button>
                )}
            </div>

            <p className="text-[13px] text-muted-foreground">
              <span className="font-mono font-semibold text-foreground">
                {weekSessionCount}
              </span>{" "}
              buổi ·{" "}
              <span className="font-mono font-semibold text-foreground">
                {weekLessonCount}
              </span>{" "}
              tiết
              {weekExamCount > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-danger-fg">
                    {weekExamCount} ca thi
                  </span>
                </>
              )}
            </p>
          </div>
        )}
      </div>

      <div className={cn("space-y-4 transition-opacity", switching && "pointer-events-none opacity-50")}>
        {!hasItems ? (
          <EmptyState
            icon={<CalendarDays />}
            title="Học kỳ này chưa có thời khóa biểu"
            description="Hãy chọn học kỳ khác hoặc làm mới từ myBK."
            action={
              <Button variant="secondary" size="sm" onClick={handleRefresh} loading={refreshing}>
                Làm mới
              </Button>
            }
          />
        ) : viewMode === "WEEK" ? (
          <>
            {/* ===== Lưới tuần (từ md trở lên) ===== */}
            <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
              <div className="grid grid-cols-7 divide-x border-b bg-muted/25">
                {days.map((d) => (
                  <div
                    key={d.dayOfWeek}
                    className={cn("px-3 py-2.5", d.isToday && "bg-primary/10")}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "font-display text-sm font-semibold",
                          d.isToday ? "text-primary" : "text-foreground"
                        )}
                      >
                        {d.shortLabel}
                      </span>
                      {d.isToday && (
                        <span className="rounded bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                          Hôm nay
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">{d.short}</p>
                  </div>
                ))}
              </div>

              <div
                key={selectedWeek}
                className={cn(
                  "grid min-h-[22rem] grid-cols-7 divide-x",
                  weekDirRef.current === "next" ? "mt-slide-next" : "mt-slide-prev"
                )}
              >
                {days.map((d) => (
                  <div
                    key={d.dayOfWeek}
                    className={cn("flex flex-col gap-2 p-2", d.isToday && "bg-primary/[0.04]")}
                  >
                    {d.exams.map((ex) => (
                      <Link
                        key={`exam-${ex.examId}`}
                        href="/exams"
                        className="relative block overflow-hidden rounded-xl border border-danger/40 bg-danger/10 p-2.5 transition-colors hover:border-danger/70"
                      >
                        <span className="absolute inset-y-0 left-0 w-1 bg-danger" />
                        <div className="space-y-1 pl-1.5">
                          <p className="font-mono text-xs font-semibold text-danger-fg">
                            Thi {ex.examType} · {padTime(ex.startTime)}
                          </p>
                          <p className="line-clamp-2 font-display text-[13px] font-semibold leading-snug text-foreground">
                            {ex.subjectName}
                          </p>
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate font-mono">
                              {ex.roomCode || "Chưa xếp phòng"}
                            </span>
                          </p>
                        </div>
                      </Link>
                    ))}

                    {d.classes.map((item) => {
                      const color =
                        subjectColorMap.get(item.subjectCode) ?? SUBJECT_COLOR_STYLES[0];
                      const room = roomOf(item);
                      return (
                        <button
                          key={item.scheduleId}
                          type="button"
                          onClick={() => openDetail(item, d.iso)}
                          className={cn(
                            "relative block w-full overflow-hidden rounded-xl border p-2.5 text-left transition-colors",
                            color.bg,
                            color.border
                          )}
                        >
                          <span className={cn("absolute inset-y-0 left-0 w-1", color.accent)} />
                          <div className="space-y-1 pl-1.5">
                            <p className={cn("font-mono text-xs font-semibold", color.text)}>
                              {padTime(item.startTime)} – {padTime(item.endTime)}
                            </p>
                            <p className="line-clamp-2 font-display text-[13px] font-semibold leading-snug text-foreground">
                              {item.subjectNameVi}
                            </p>
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className={cn("truncate font-mono", room && "text-foreground")}>
                                {room || "Chưa xếp phòng"}
                              </span>
                            </p>
                          </div>
                        </button>
                      );
                    })}

                    {d.classes.length === 0 && d.exams.length === 0 && (
                      <p className="m-auto text-xs text-muted-foreground/50">—</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ===== Danh sách theo ngày (dưới md) ===== */}
            <div className="mt-stagger space-y-3 md:hidden">
              {days.every((d) => d.classes.length === 0 && d.exams.length === 0) ? (
                <EmptyState
                  title="Tuần này không có lịch học"
                  description="Thử chọn tuần khác trong học kỳ."
                />
              ) : (
                days
                  .filter((d) => d.classes.length > 0 || d.exams.length > 0)
                  .map((d) => (
                    <section
                      key={d.dayOfWeek}
                      className="overflow-hidden rounded-2xl border bg-card"
                    >
                      <div
                        className={cn(
                          "flex items-center justify-between border-b px-4 py-2",
                          d.isToday ? "bg-primary/10" : "bg-muted/25"
                        )}
                      >
                        <span
                          className={cn(
                            "font-display text-sm font-semibold",
                            d.isToday ? "text-primary" : "text-foreground"
                          )}
                        >
                          {d.fullLabel}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {d.full}
                          {d.isToday && " · Hôm nay"}
                        </span>
                      </div>
                      <ul className="divide-y">
                        {d.exams.map((ex) => (
                          <li key={`exam-${ex.examId}`}>
                            <Link
                              href="/exams"
                              className="grid grid-cols-[3.75rem_1fr] gap-3 px-4 py-3"
                            >
                              <p className="font-mono text-sm font-semibold text-danger-fg">
                                {padTime(ex.startTime)}
                              </p>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-danger-fg">
                                  Thi {ex.examType === "CK" ? "cuối kỳ" : "giữa kỳ"}
                                </p>
                                <p className="font-display text-sm font-semibold text-foreground">
                                  {ex.subjectName}
                                </p>
                                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                                  {ex.roomCode || "Chưa xếp phòng"}
                                </p>
                              </div>
                            </Link>
                          </li>
                        ))}
                        {d.classes.map((item) => {
                          const color =
                            subjectColorMap.get(item.subjectCode) ?? SUBJECT_COLOR_STYLES[0];
                          const room = roomOf(item);
                          return (
                            <li key={item.scheduleId}>
                              <button
                                type="button"
                                onClick={() => openDetail(item, d.iso)}
                                className="grid w-full grid-cols-[3.75rem_1fr] gap-3 px-4 py-3 text-left"
                              >
                                <div className="font-mono leading-tight">
                                  <p className="text-sm font-semibold text-foreground">
                                    {padTime(item.startTime)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {padTime(item.endTime)}
                                  </p>
                                </div>
                                <div className="flex min-w-0 items-stretch gap-3">
                                  <span className={cn("w-1 shrink-0 rounded-full", color.accent)} />
                                  <div className="min-w-0">
                                    <p className="font-display text-sm font-semibold text-foreground">
                                      {item.subjectNameVi}
                                    </p>
                                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                                      <span className="inline-flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        <span className="font-mono">{room || "Chưa xếp phòng"}</span>
                                      </span>
                                      {item.employeeName && (
                                        <span className="inline-flex items-center gap-1">
                                          <User className="h-3 w-3" />
                                          {item.employeeName}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))
              )}
            </div>
          </>
        ) : (
          /* ===== Danh sách môn: Môn · Lịch · Phòng · Giảng viên ===== */
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b bg-muted/25 text-xs font-semibold text-muted-foreground">
                    <th className="px-5 py-3">Môn học</th>
                    <th className="px-4 py-3">Lịch học</th>
                    <th className="px-4 py-3">Phòng</th>
                    <th className="px-4 py-3">Giảng viên</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item) => {
                    const color =
                      subjectColorMap.get(item.subjectCode) ?? SUBJECT_COLOR_STYLES[0];
                    const scheduled = isScheduledItem(item);
                    const dayLabel = WEEK_DAYS.find(
                      (d) => d.dayOfWeek === item.dayOfWeek
                    )?.shortLabel;
                    const first = item.activeWeeks[0];
                    const last = item.activeWeeks[item.activeWeeks.length - 1];
                    const room = roomOf(item);
                    return (
                      <tr
                        key={item.scheduleId}
                        onClick={() => openDetail(item)}
                        className="cursor-pointer align-top transition-colors hover:bg-muted/30"
                      >
                        {/* Môn: tên, rồi mã · nhóm · tín chỉ */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-stretch gap-3">
                            <span className={cn("w-1 shrink-0 rounded-full", color.accent)} />
                            <div className="min-w-0">
                              <p className="font-display text-sm font-semibold text-foreground">
                                {item.subjectNameVi}
                              </p>
                              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                                {item.subjectCode}
                                {item.classGroup && ` · ${item.classGroup}`}
                                {` · ${item.numOfCredits} TC`}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Lịch: thứ + giờ, rồi các tuần học */}
                        <td className="px-4 py-3.5">
                          {scheduled ? (
                            <>
                              <p className="font-medium text-foreground">
                                {dayLabel}
                                <span className="font-mono">
                                  {" "}· {padTime(item.startTime)}–{padTime(item.endTime)}
                                </span>
                              </p>
                              {item.activeWeeks.length > 0 && (
                                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                                  {item.activeWeeks.length} buổi · tuần {first}–{last}
                                </p>
                              )}
                            </>
                          ) : (
                            <Badge tone="warning">Không xếp tiết</Badge>
                          )}
                        </td>

                        {/* Phòng: mã phòng, rồi cơ sở */}
                        <td className="px-4 py-3.5">
                          <p className={cn("font-mono font-medium", room ? "text-foreground" : "text-muted-foreground")}>
                            {room || "--"}
                          </p>
                          {item.campusNameVi && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {formatCampus(item.campusNameVi)}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-foreground">
                          {item.employeeName || (
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

        {/* Môn đồ án / sinh hoạt không xếp tiết */}
        {hasItems && viewMode === "WEEK" && unscheduledItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-dashed px-4 py-3">
            <span className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
              <FolderKanban className="h-4 w-4" />
              Không xếp tiết:
            </span>
            {unscheduledItems.map((item) => (
              <button
                key={item.scheduleId}
                type="button"
                onClick={() => openDetail(item)}
                className="rounded-lg border bg-card px-3 py-1 text-[13px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                {item.subjectNameVi}
              </button>
            ))}
          </div>
        )}
      </div>

      <ScheduleDetailModal
        open={Boolean(activeDetailItem)}
        onClose={() => setActiveDetailItem(null)}
        item={activeDetailItem}
        allSemesterItems={items}
        selectedWeek={selectedWeek}
        sessionDateIso={activeDetailSessionDate}
      />

      <GoogleCalendarSyncModal
        open={gcalModalOpen}
        onClose={() => setGcalModalOpen(false)}
        semesterYearCode={selectedSemesterCode}
        semesterYearName={semesterName}
        selectedWeek={selectedWeek}
        items={items}
        onDownloadIcs={handleDownloadIcs}
      />
    </div>
  );
}
