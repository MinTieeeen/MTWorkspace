"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarPlus,
  ChevronDown,
  Clock,
  FileCheck2,
  MapPin,
  PartyPopper,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import { Select } from "@/components/ui/select";
import { useRetained } from "@/components/ui/modal";
import { ExamScheduleSkeleton } from "@/components/ui/skeleton";
import {
  ConnectPrompt,
  EmptyState,
  ErrorState,
  StaleBanner,
} from "@/components/ui/state";
import { ExamCountdown } from "@/components/mybk/exam-countdown";
import { ExamDetailModal } from "@/components/mybk/exam-detail-modal";
import { ExamGoogleCalendarModal } from "@/components/mybk/exam-google-calendar-modal";
import { MyBkConnectModal } from "@/components/mybk/mybk-connect-modal";
import type { NormalizedExamItem } from "@/lib/mybk-exams";
import type { RawMyBkSemesterOption } from "@/lib/mybk-timetable";
import {
  DAY_FULL_LABELS,
  DAY_SHORT,
  calendarDaysUntil,
  formatCampus,
  formatDateVi,
  getExamTimestampMs,
  padTime,
  relativeDayLabel,
} from "@/lib/format";
import { buildExamIcs, downloadIcs } from "@/lib/ics";
import { useMybkResource, type ResourcePayload } from "@/lib/use-mybk-resource";

type ExamTypeFilter = "ALL" | "CK" | "GK";

interface ExamsPayload extends ResourcePayload {
  studentId?: string | null;
  currentSemesterCode?: string;
  selectedSemesterCode?: string;
  semesters?: RawMyBkSemesterOption[];
  items?: NormalizedExamItem[];
}

const typeLabel = (t: string) => (t === "CK" ? "Cuối kỳ" : "Giữa kỳ");

/** Một dòng ca thi trong danh sách: ngày · môn · giờ + phòng · nhãn thời gian */
function ExamRow({
  exam,
  nowMs,
  isNext,
  done,
  onOpen,
}: {
  exam: NormalizedExamItem;
  nowMs: number;
  isNext: boolean;
  done: boolean;
  onOpen: () => void;
}) {
  const days = calendarDaysUntil(exam.examDate, new Date(nowMs));
  const live =
    !done && getExamTimestampMs(exam.examDate, exam.startTime) <= nowMs;
  const soon = !done && days <= 3;
  const date = formatDateVi(exam.examDate);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "grid w-full grid-cols-[3.5rem_1fr_auto] items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/40",
        done && "opacity-60 hover:opacity-100"
      )}
    >
      {/* Khối ngày */}
      <div
        className={cn(
          "flex h-14 flex-col items-center justify-center rounded-xl border text-center",
          soon ? "border-warning/40 bg-warning/10" : "bg-muted/40"
        )}
      >
        <span className="text-xs font-medium text-muted-foreground">
          {DAY_SHORT[exam.dayOfWeek] ?? "Thi"}
        </span>
        <span className="font-mono text-sm font-semibold text-foreground">
          {date.short}
        </span>
      </div>

      {/* Môn, giờ thi, phòng thi: mỗi thông tin một dòng */}
      <div className="min-w-0">
        <p
          className={cn(
            "text-xs font-medium",
            exam.examType === "CK" ? "text-danger-fg" : "text-warning-fg"
          )}
        >
          {typeLabel(exam.examType)}
        </p>
        <p className="line-clamp-2 font-display text-sm font-semibold leading-snug text-foreground">
          {exam.subjectName}
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span className="font-mono text-foreground">
            {padTime(exam.startTime)}–{padTime(exam.endTime)}
          </span>
          <span>· {exam.durationMinutes} phút</span>
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className={cn("font-mono", exam.roomCode && "text-foreground")}>
            {exam.roomCode || "Chưa xếp phòng"}
          </span>
        </p>
      </div>

      {/* Nhãn trạng thái */}
      {done ? (
        <Badge tone="success">Đã thi</Badge>
      ) : live ? (
        <Badge tone="danger">Đang thi</Badge>
      ) : isNext ? (
        <Badge tone="primary">Tiếp theo</Badge>
      ) : (
        <Badge tone={soon ? "warning" : "neutral"}>
          {relativeDayLabel(days)}
        </Badge>
      )}
    </button>
  );
}

/** Tiêu đề nhóm có thể thu gọn: "Sắp thi (3)" / "Đã thi (5)" */
function GroupHeader({
  title,
  count,
  open,
  onToggle,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center justify-between border-b bg-muted/25 px-5 py-2.5 text-left transition-colors hover:bg-muted/40"
    >
      <span className="font-display text-[13px] font-semibold text-foreground">
        {title}
        <span className="ml-1.5 font-mono font-medium text-muted-foreground">
          ({count})
        </span>
      </span>
      <ChevronDown
        className={cn(
          "h-4 w-4 text-muted-foreground transition-transform duration-200",
          !open && "-rotate-90"
        )}
      />
    </button>
  );
}

export default function ExamSchedulePage() {
  const [semester, setSemester] = useState<string | null>(null);
  const exams = useMybkResource<ExamsPayload>({
    url: `/api/mybk/exams${semester ? `?semesterYear=${semester}` : ""}`,
    isEmpty: (d) => !d.items || d.items.length === 0,
  });
  // Giữ dữ liệu cũ trong lúc đổi học kỳ để giao diện không nháy trắng
  const data = useRetained(exams.data);

  const [typeFilter, setTypeFilter] = useState<ExamTypeFilter>("ALL");
  const [showDone, setShowDone] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [gcalOpen, setGcalOpen] = useState(false);
  const [activeExam, setActiveExam] = useState<NormalizedExamItem | null>(null);
  // Cập nhật mỗi 30 giây để chuyển ca thi từ "Sắp thi" sang "Đã thi" đúng lúc
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const allItems = useMemo(
    () =>
      [...(data?.items ?? [])].sort(
        (a, b) =>
          getExamTimestampMs(a.examDate, a.startTime) -
          getExamTimestampMs(b.examDate, b.startTime)
      ),
    [data]
  );

  const counts = useMemo(
    () => ({
      ALL: allItems.length,
      CK: allItems.filter((i) => i.examType === "CK").length,
      GK: allItems.filter((i) => i.examType === "GK").length,
    }),
    [allItems]
  );

  const filtered = useMemo(
    () =>
      typeFilter === "ALL"
        ? allItems
        : allItems.filter((i) => i.examType === typeFilter),
    [allItems, typeFilter]
  );

  // Chia thành sắp thi (chưa kết thúc) và đã thi
  const { upcoming, finished } = useMemo(() => {
    const now = nowMs ?? 0;
    const up: NormalizedExamItem[] = [];
    const done: NormalizedExamItem[] = [];
    for (const e of filtered) {
      (getExamTimestampMs(e.examDate, e.endTime) >= now ? up : done).push(e);
    }
    return { upcoming: up, finished: done.reverse() };
  }, [filtered, nowMs]);

  const nextExam = upcoming[0] ?? null;
  const selectedSemesterCode = data?.selectedSemesterCode ?? semester ?? "";
  const semesterName =
    allItems[0]?.semesterYearName ||
    data?.semesters?.find((s) => String(s.code) === selectedSemesterCode)
      ?.nameVi ||
    (selectedSemesterCode ? `Học kỳ ${selectedSemesterCode}` : "");

  const finishedCredits = useMemo(
    () =>
      Array.from(
        new Map(finished.map((x) => [x.subjectCode, x.numOfCredits])).values()
      ).reduce((a, b) => a + b, 0),
    [finished]
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const ok = await exams.refresh(true);
      if (ok) toast.success("Đã cập nhật Lịch thi");
      else toast.error("Không thể làm mới Lịch thi");
    } finally {
      setRefreshing(false);
    }
  };

  const handleDownloadIcs = () => {
    if (allItems.length === 0) return;
    downloadIcs(
      buildExamIcs(allItems, selectedSemesterCode),
      `LichThi-BachKhoa-HK${selectedSemesterCode}.ics`
    );
    toast.success("Đã tải tệp Lịch thi (.ics)");
  };

  // ===== Trạng thái thay cho toàn trang =====
  if ((!data && exams.status === "loading") || nowMs === null) {
    return <ExamScheduleSkeleton />;
  }

  if (
    exams.status === "not-connected" ||
    exams.status === "sso-expired" ||
    exams.status === "error"
  ) {
    const expired = exams.status === "sso-expired";
    return (
      <div className="mx-auto max-w-2xl pt-10">
        {exams.status === "error" ? (
          <ErrorState
            title="Không tải được lịch thi"
            message={exams.error ?? undefined}
            onRetry={exams.retry}
          />
        ) : (
          <ConnectPrompt
            expired={expired}
            title={
              expired ? "Phiên đăng nhập myBK đã hết hạn" : "Chưa kết nối myBK"
            }
            description={
              expired
                ? "Đăng nhập lại để cập nhật lịch thi."
                : "Kết nối tài khoản để xem lịch thi của bạn."
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

  const switching = exams.status === "loading";
  const hasItems = allItems.length > 0;
  const nextDays = nextExam
    ? calendarDaysUntil(nextExam.examDate, new Date(nowMs))
    : 0;
  const nextLive =
    nextExam !== null &&
    getExamTimestampMs(nextExam.examDate, nextExam.startTime) <= nowMs;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {exams.isStale && (
        <StaleBanner
          lastSyncedAt={exams.lastSyncedAt}
          message="Đang hiển thị lịch thi đã lưu, chưa cập nhật được từ myBK"
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      )}

      {/* ===== Điều khiển: học kỳ · lọc loại kỳ · xuất lịch · làm mới ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
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

          <div
            role="radiogroup"
            aria-label="Loại kỳ thi"
            className="inline-flex items-center gap-1 rounded-xl bg-muted/60 p-1"
          >
            {(
              [
                ["ALL", "Tất cả"],
                ["CK", "Cuối kỳ"],
                ["GK", "Giữa kỳ"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={typeFilter === value}
                onClick={() => setTypeFilter(value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors",
                  typeFilter === value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
                <span className="ml-1.5 font-mono text-xs font-medium opacity-70">
                  {counts[value]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setGcalOpen(true)}
            disabled={!hasItems}
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
              className={cn(
                "h-4 w-4",
                (refreshing || exams.refreshing) && "animate-spin"
              )}
            />
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "transition-opacity",
          switching && "pointer-events-none opacity-50"
        )}
      >
        {!hasItems ? (
          <EmptyState
            icon={<FileCheck2 />}
            title="Học kỳ này chưa có lịch thi"
            description="Hãy chọn học kỳ khác hoặc làm mới từ myBK."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRefresh}
                loading={refreshing}
              >
                Làm mới
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileCheck2 />}
            title={`Không có ca thi ${
              typeFilter === "CK" ? "cuối kỳ" : "giữa kỳ"
            }`}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setTypeFilter("ALL")}
              >
                Xem tất cả
              </Button>
            }
          />
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-12">
            {/* ===== Cột trái: ca thi tiếp theo (cố định khi cuộn) ===== */}
            <div className="lg:sticky lg:top-0 lg:col-span-5">
              {nextExam ? (
                <section className="overflow-hidden rounded-2xl border bg-card">
                  <button
                    type="button"
                    onClick={() => setActiveExam(nextExam)}
                    className="block w-full space-y-5 p-5 text-left transition-colors hover:bg-muted/20"
                  >
                    {/* 1. Nhãn: loại kỳ + thời điểm */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-primary">
                        Ca thi tiếp theo
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          tone={nextExam.examType === "CK" ? "danger" : "warning"}
                        >
                          {typeLabel(nextExam.examType)}
                        </Badge>
                        <Badge tone={nextLive ? "danger" : "neutral"}>
                          {nextLive ? "Đang thi" : relativeDayLabel(nextDays)}
                        </Badge>
                      </div>
                    </div>

                    {/* 2. Tên môn + định danh */}
                    <div>
                      <h2 className="font-display text-xl font-bold leading-snug text-foreground">
                        {nextExam.subjectName}
                      </h2>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {nextExam.subjectCode} · {nextExam.numOfCredits} TC
                        {nextExam.classGroup && ` · Nhóm ${nextExam.classGroup}`}
                      </p>
                    </div>

                    {/* 3. Đếm ngược */}
                    {!nextLive && (
                      <ExamCountdown
                        targetMs={getExamTimestampMs(
                          nextExam.examDate,
                          nextExam.startTime
                        )}
                      />
                    )}

                    {/* 4. Ba hàng thông tin: ngày, giờ, phòng */}
                    <dl className="divide-y rounded-xl border">
                      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <dt className="text-[13px] text-muted-foreground">
                          Ngày thi
                        </dt>
                        <dd className="text-right text-sm font-medium text-foreground">
                          {DAY_FULL_LABELS[nextExam.dayOfWeek]},{" "}
                          <span className="font-mono">
                            {formatDateVi(nextExam.examDate).full}
                          </span>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <dt className="text-[13px] text-muted-foreground">
                          Giờ làm bài
                        </dt>
                        <dd className="text-right text-sm font-medium text-foreground">
                          <span className="font-mono">
                            {padTime(nextExam.startTime)} –{" "}
                            {padTime(nextExam.endTime)}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}
                            · {nextExam.durationMinutes} phút
                          </span>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <dt className="text-[13px] text-muted-foreground">
                          Phòng thi
                        </dt>
                        <dd className="text-right text-sm font-medium text-foreground">
                          <span className="font-mono">
                            {nextExam.roomCode || "Chưa xếp phòng"}
                          </span>
                          <span className="block text-xs font-normal text-muted-foreground">
                            {formatCampus(nextExam.campusCode)}
                          </span>
                        </dd>
                      </div>
                    </dl>
                  </button>
                </section>
              ) : (
                /* Đã thi hết */
                <section className="rounded-2xl border bg-card p-6 text-center">
                  <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-success/15 text-success-fg">
                    <PartyPopper className="h-5 w-5" />
                  </span>
                  <h2 className="mt-3 font-display text-base font-semibold text-foreground">
                    Đã hoàn thành kỳ thi
                  </h2>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    <span className="font-mono font-semibold text-foreground">
                      {finished.length}
                    </span>{" "}
                    ca thi ·{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {finishedCredits}
                    </span>{" "}
                    tín chỉ · {semesterName}
                  </p>
                </section>
              )}
            </div>

            {/* ===== Cột phải: danh sách theo nhóm ===== */}
            <div className="space-y-4 lg:col-span-7">
              {upcoming.length > 0 && (
                <section className="overflow-hidden rounded-2xl border bg-card">
                  <GroupHeader
                    title="Sắp thi"
                    count={upcoming.length}
                    open={showUpcoming}
                    onToggle={() => setShowUpcoming((o) => !o)}
                  />
                  <Collapse open={showUpcoming}>
                    <div className="mt-stagger divide-y">
                      {upcoming.map((exam, idx) => (
                        <ExamRow
                          key={exam.examId}
                          exam={exam}
                          nowMs={nowMs}
                          isNext={idx === 0}
                          done={false}
                          onOpen={() => setActiveExam(exam)}
                        />
                      ))}
                    </div>
                  </Collapse>
                </section>
              )}

              {finished.length > 0 && (
                <section className="overflow-hidden rounded-2xl border bg-card">
                  <GroupHeader
                    title="Đã thi"
                    count={finished.length}
                    open={showDone}
                    onToggle={() => setShowDone((o) => !o)}
                  />
                  <Collapse open={showDone}>
                    <div className="divide-y">
                      {finished.map((exam) => (
                        <ExamRow
                          key={exam.examId}
                          exam={exam}
                          nowMs={nowMs}
                          isNext={false}
                          done
                          onOpen={() => setActiveExam(exam)}
                        />
                      ))}
                    </div>
                  </Collapse>
                </section>
              )}
            </div>
          </div>
        )}
      </div>

      <ExamDetailModal
        open={Boolean(activeExam)}
        onClose={() => setActiveExam(null)}
        item={activeExam}
        allSemesterExams={allItems}
      />
      <ExamGoogleCalendarModal
        open={gcalOpen}
        onClose={() => setGcalOpen(false)}
        semesterYearCode={selectedSemesterCode}
        semesterYearName={semesterName}
        items={allItems}
        onDownloadIcs={handleDownloadIcs}
      />
    </div>
  );
}
