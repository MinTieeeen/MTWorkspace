"use client";

import { useMemo } from "react";
import { CalendarPlus, CheckCircle2, Info, X } from "lucide-react";
import { Modal, useRetained } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { ExamCountdown } from "@/components/mybk/exam-countdown";
import { cn } from "@/lib/utils";
import type { ExamPrepStatus, NormalizedExamItem } from "@/lib/mybk-exams";
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

interface ExamDetailModalProps {
  open: boolean;
  onClose: () => void;
  item: NormalizedExamItem | null;
  allSemesterExams?: NormalizedExamItem[];
  onPrepUpdated?: (
    examId: number,
    prepStatus: ExamPrepStatus,
    personalNote?: string
  ) => void;
}

const typeLabel = (t: string) =>
  t === "CK" ? "Cuối kỳ" : t === "GK" ? "Giữa kỳ" : t;

function buildGoogleCalendarExamUrl(item: NormalizedExamItem): string {
  const label =
    item.examType === "GK"
      ? "Thi Giữa kỳ"
      : item.examType === "CK"
      ? "Thi Cuối kỳ"
      : `Thi ${item.examType}`;

  const roomPart = item.roomCode || "Chưa xếp phòng";
  const details = [
    `Kỳ thi: ${label} — ${item.semesterYearName}`,
    `Môn thi: ${item.subjectCode} - ${item.subjectName} (${item.numOfCredits} TC)`,
    `Nhóm thi: ${item.classGroup || "--"}`,
    `Thời gian làm bài: ${item.durationMinutes} phút (${item.startTime} - ${item.endTime})`,
    `Phòng thi: ${roomPart}`,
    item.gradeDeadline ? `Hạn công bố điểm: ${item.gradeDeadline}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `[${label}] ${item.subjectCode} - ${item.subjectName}`,
    details,
    location: `${roomPart} (${formatCampus(item.campusCode)})`,
    ctz: "Asia/Ho_Chi_Minh",
  });

  if (item.examDate && item.startTime && item.endTime) {
    const d = item.examDate.replace(/-/g, "");
    const s = item.startTime.replace(":", "").padStart(4, "0");
    const e = item.endTime.replace(":", "").padStart(4, "0");
    params.set("dates", `${d}T${s}00/${d}T${e}00`);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Một hàng "nhãn · giá trị" trong thẻ thông tin */
function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-[13px] text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground">
        {children}
      </dd>
    </div>
  );
}

export function ExamDetailModal({
  open,
  onClose,
  item: itemProp,
  allSemesterExams,
}: ExamDetailModalProps) {
  const item = useRetained(itemProp);

  // Các đợt thi của cùng môn trong học kỳ (vd giữa kỳ + cuối kỳ)
  const rounds = useMemo(() => {
    if (!item) return [];
    const pool =
      allSemesterExams && allSemesterExams.length > 0
        ? allSemesterExams
        : [item];
    return pool
      .filter((x) => x.subjectCode === item.subjectCode)
      .sort((a, b) => a.examDate.localeCompare(b.examDate));
  }, [item, allSemesterExams]);

  if (!item) return null;

  const now = Date.now();
  const startMs = getExamTimestampMs(item.examDate, item.startTime);
  const endMs = getExamTimestampMs(item.examDate, item.endTime);
  const done = endMs < now;
  const live = !done && startMs <= now;
  const days = calendarDaysUntil(item.examDate, new Date(now));
  const isFinal = item.examType === "CK";

  return (
    <Modal
      open={open && Boolean(itemProp)}
      onClose={onClose}
      panelClassName="max-w-xl"
      label={item.subjectName}
    >
      {/* ===== 1. Nhận diện: loại kỳ, tên môn, mã · tín chỉ · nhóm ===== */}
      <div className="flex items-start justify-between gap-4 border-b px-6 py-5">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={isFinal ? "danger" : "warning"}>
              {typeLabel(item.examType)}
            </Badge>
            {done ? (
              <Badge tone="success">Đã thi</Badge>
            ) : live ? (
              <Badge tone="danger">Đang thi</Badge>
            ) : (
              <Badge tone={days <= 3 ? "warning" : "neutral"}>
                {relativeDayLabel(days)}
              </Badge>
            )}
          </div>
          <h2 className="font-display text-xl font-bold leading-snug tracking-tight text-foreground">
            {item.subjectName}
          </h2>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {item.subjectCode} · {item.numOfCredits} TC
            {item.classGroup && ` · Nhóm ${item.classGroup}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        {/* ===== 2. Trạng thái: đếm ngược / đang thi / đã thi ===== */}
        {done ? (
          <div className="flex items-center gap-2.5 rounded-xl bg-success/10 px-4 py-3 text-[13px] font-medium text-success-fg">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Ca thi này đã kết thúc.
          </div>
        ) : live ? (
          <div className="rounded-xl bg-danger/10 px-4 py-3 text-[13px] font-medium text-danger-fg">
            Ca thi đang diễn ra, kết thúc lúc {padTime(item.endTime)}.
          </div>
        ) : (
          <ExamCountdown targetMs={startMs} />
        )}

        {/* ===== 3. Thông tin ca thi: ngày, giờ, phòng, hạn điểm ===== */}
        <dl className="divide-y rounded-xl border">
          <InfoRow label="Ngày thi">
            {DAY_FULL_LABELS[item.dayOfWeek]},{" "}
            <span className="font-mono">{formatDateVi(item.examDate).full}</span>
          </InfoRow>
          <InfoRow label="Giờ làm bài">
            <span className="font-mono">
              {padTime(item.startTime)} – {padTime(item.endTime)}
            </span>
            <span className="block text-xs font-normal text-muted-foreground">
              {item.durationMinutes} phút · Tiết {item.startLesson}–
              {item.endLesson}
            </span>
          </InfoRow>
          <InfoRow label="Phòng thi">
            <span className="font-mono">
              {item.roomCode || "Chưa xếp phòng"}
            </span>
            <span className="block text-xs font-normal text-muted-foreground">
              {formatCampus(item.campusCode)}
            </span>
          </InfoRow>
          <InfoRow label="Công bố điểm">
            <span className="font-mono">
              {item.gradeDeadline || "Theo kế hoạch Phòng Đào tạo"}
            </span>
          </InfoRow>
        </dl>

        {/* ===== 4. Ghi chú của phòng đào tạo (nếu có) ===== */}
        {item.examNote && (
          <div className="flex items-start gap-2.5 rounded-xl border border-info/30 bg-info/10 px-4 py-3 text-[13px] text-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-info-fg" />
            <p>{item.examNote}</p>
          </div>
        )}

        {/* ===== 5. Các đợt thi khác của môn (chỉ khi có hơn 1 đợt) ===== */}
        {rounds.length > 1 && (
          <section>
            <h3 className="mb-2.5 text-[13px] font-semibold text-muted-foreground">
              Các đợt thi của môn này
            </h3>
            <ul className="space-y-2">
              {rounds.map((round) => {
                const active = round.examId === item.examId;
                const roundDone =
                  getExamTimestampMs(round.examDate, round.endTime) < now;
                return (
                  <li
                    key={round.examId}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5",
                      active ? "border-primary/50 bg-primary/5" : "bg-muted/10",
                      roundDone && !active && "opacity-60"
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-foreground">
                        {typeLabel(round.examType)}
                        <span className="ml-2 font-mono font-medium text-muted-foreground">
                          {DAY_SHORT[round.dayOfWeek]},{" "}
                          {formatDateVi(round.examDate).short}
                        </span>
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {padTime(round.startTime)}–{padTime(round.endTime)} ·{" "}
                        {round.roomCode || "Chưa xếp phòng"}
                      </p>
                    </div>
                    {active ? (
                      <Badge tone="primary">Đang xem</Badge>
                    ) : roundDone ? (
                      <Badge tone="success">Đã thi</Badge>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {/* ===== Chân modal: học kỳ · cập nhật · hành động chính ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-6 py-3">
        <p className="text-xs text-muted-foreground">
          {item.semesterYearName}
          {item.lastUpdatedTime && (
            <span className="font-mono">
              {" "}
              · cập nhật {item.lastUpdatedTime.slice(0, 16).replace("T", " ")}
            </span>
          )}
        </p>
        {!done && (
          <a
            href={buildGoogleCalendarExamUrl(item)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <CalendarPlus className="h-4 w-4" />
            Thêm vào Google Calendar
          </a>
        )}
      </div>
    </Modal>
  );
}
