"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Clock,
  MapPin,
  CalendarPlus,
  CalendarDays,
  Building2,
  Hash,
  FileCheck2,
  Calendar,
  Users,
  CheckCircle2,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExamPrepStatus, NormalizedExamItem } from "@/lib/mybk-exams";

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

const DAY_FULL_LABELS: Record<number, string> = {
  2: "Thứ Hai",
  3: "Thứ Ba",
  4: "Thứ Tư",
  5: "Thứ Năm",
  6: "Thứ Sáu",
  7: "Thứ Bảy",
  8: "Chủ Nhật",
};

function formatDateVi(isoDate: string): string {
  if (!isoDate || !isoDate.includes("-")) return isoDate || "--";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

function formatCampusShort(campusCode: string | null): string {
  if (!campusCode) return "ĐH Bách Khoa TP.HCM";
  if (campusCode.includes("CS1")) return "Cơ sở 1 — Lý Thường Kiệt";
  if (campusCode.includes("CS2")) return "Cơ sở 2 — Dĩ An";
  return campusCode;
}

function buildGoogleCalendarExamUrl(item: NormalizedExamItem): string {
  const typeLabel =
    item.examType === "GK"
      ? "Thi Giữa kỳ"
      : item.examType === "CK"
      ? "Thi Cuối kỳ"
      : `Thi ${item.examType}`;

  const title = `[${typeLabel}] ${item.subjectCode} - ${item.subjectName}`;
  const roomPart = item.roomCode || "Chưa xếp phòng";
  const location = `${roomPart} (${formatCampusShort(item.campusCode)})`;

  const details = [
    `Kỳ thi: ${typeLabel} — ${item.semesterYearName}`,
    `Môn thi: ${item.subjectCode} - ${item.subjectName} (${item.numOfCredits} TC)`,
    `Nhóm thi: ${item.classGroup || "--"}`,
    item.seatOrder ? `Số thứ tự phòng thi (STT): ${item.seatOrder}` : null,
    `Thời gian làm bài: ${item.durationMinutes} phút (${item.startTime} - ${item.endTime})`,
    `Phòng thi: ${roomPart}`,
    item.gradeDeadline ? `Hạn công bố điểm: ${item.gradeDeadline}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    details,
    location,
    ctz: "Asia/Ho_Chi_Minh",
  });

  if (item.examDate && item.startTime && item.endTime) {
    const cleanDate = item.examDate.replace(/-/g, "");
    const startHHMM = item.startTime.replace(":", "").padStart(4, "0");
    const endHHMM = item.endTime.replace(":", "").padStart(4, "0");
    params.set("dates", `${cleanDate}T${startHHMM}00/${cleanDate}T${endHHMM}00`);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function ExamDetailModal({
  open,
  onClose,
  item,
  allSemesterExams,
}: ExamDetailModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // All exam rounds of this same subject in the semester (e.g., GK & CK)
  const subjectExamRounds = useMemo(() => {
    if (!item) return [];
    const pool =
      allSemesterExams && allSemesterExams.length > 0
        ? allSemesterExams
        : [item];
    return pool
      .filter((x) => x.subjectCode === item.subjectCode)
      .sort((a, b) => a.examDate.localeCompare(b.examDate));
  }, [item, allSemesterExams]);

  if (!open || !mounted || !item) return null;

  const gcalUrl = buildGoogleCalendarExamUrl(item);
  const isFinal = item.examType === "CK";

  const endMs = new Date(`${item.examDate}T${item.endTime}:00+07:00`).getTime();
  const startMs = new Date(
    `${item.examDate}T${item.startTime}:00+07:00`
  ).getTime();
  const nowMs = Date.now();
  const isDone = endMs < nowMs;
  const daysLeft = Math.max(0, Math.floor((startMs - nowMs) / 86400000));

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Course Title + Compact Countdown / Status + Google Calendar Button */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b bg-muted/20 px-6 py-4">
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-extrabold tracking-tight text-foreground">
              {item.subjectName}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {item.semesterYearName}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isDone ? (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Đã hoàn thành
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 font-mono text-xs font-bold text-primary">
                <Timer className="h-3.5 w-3.5" />
                {daysLeft > 0 ? `Còn ${daysLeft} ngày` : "Thi hôm nay"}
              </span>
            )}

            <a
              href={gcalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              <span>Thêm Google Calendar</span>
            </a>

            <button
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body: Distributed Bento Grid of Individual Attribute Tiles */}
        <div className="space-y-5 overflow-y-auto p-6">
          {/* Top Identity Strip: 4 Compact Attribute Pills */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border bg-muted/15 p-3">
              <p className="text-[11px] font-medium text-muted-foreground">
                Mã môn học
              </p>
              <p className="mt-1 font-mono text-sm font-bold text-primary">
                {item.subjectCode}
              </p>
            </div>

            <div className="rounded-xl border bg-muted/15 p-3">
              <p className="text-[11px] font-medium text-muted-foreground">
                Đợt thi
              </p>
              <p
                className={cn(
                  "mt-1 font-mono text-sm font-bold",
                  isFinal
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-amber-600 dark:text-amber-400"
                )}
              >
                {isFinal ? "Cuối kỳ (CK)" : "Giữa kỳ (GK)"}
              </p>
            </div>

            <div className="rounded-xl border bg-muted/15 p-3">
              <p className="text-[11px] font-medium text-muted-foreground">
                Số tín chỉ
              </p>
              <p className="mt-1 font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {item.numOfCredits} TC
              </p>
            </div>

            <div className="rounded-xl border bg-muted/15 p-3">
              <p className="text-[11px] font-medium text-muted-foreground">
                Nhóm thi
              </p>
              <p className="mt-1 flex items-center gap-1 font-mono text-sm font-bold text-foreground">
                <Users className="h-3.5 w-3.5 text-sky-500" />
                {item.classGroup || "--"}
              </p>
            </div>
          </div>

          {/* Core Exam Details Distributed Across Separate Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Date Card */}
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span>Ngày thi</span>
              </div>
              <p className="mt-1.5 font-heading text-sm font-bold text-foreground">
                {DAY_FULL_LABELS[item.dayOfWeek] || "Ngày thi"}
              </p>
              <p className="mt-0.5 font-mono text-xs font-semibold text-primary">
                {formatDateVi(item.examDate)} • Tuần {item.weekNumber}
              </p>
            </div>

            {/* Time & Duration Card */}
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                <span>Giờ & Thời lượng</span>
              </div>
              <p className="mt-1.5 font-mono text-sm font-bold text-foreground">
                {item.startTime} – {item.endTime}
              </p>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                {item.durationMinutes} phút (Tiết {item.startLesson}–
                {item.endLesson})
              </p>
            </div>

            {/* Room & Campus Card */}
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                <span>Phòng thi</span>
              </div>
              <p className="mt-1.5 font-mono text-sm font-bold text-foreground">
                {item.roomCode || "Chưa xếp phòng"}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {formatCampusShort(item.campusCode)}
                </span>
              </p>
            </div>
          </div>

          {/* Secondary Distributed Row: Seat Order (STT) & Grade Deadline */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border bg-muted/10 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <Hash className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Số thứ tự danh sách phòng thi
                  </p>
                  <p className="font-mono text-xs font-bold text-foreground">
                    {item.seatOrder !== null
                      ? `Vị trí STT: ${item.seatOrder}`
                      : "Chưa cập nhật STT"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border bg-muted/10 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <FileCheck2 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Hạn nhập / công bố điểm dự kiến
                  </p>
                  <p className="font-mono text-xs font-bold text-foreground">
                    {item.gradeDeadline || "Theo kế hoạch Phòng Đào tạo"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Other Exam Rounds of the Same Subject (Only shown when subject has >1 exam round e.g. GK + CK) */}
          {subjectExamRounds.length > 1 && (
            <div className="space-y-2.5 pt-1">
              <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5 text-primary" />
                <span>Các đợt thi của môn {item.subjectCode}</span>
              </h3>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {subjectExamRounds.map((round) => {
                  const active = round.examId === item.examId;
                  const roundIsFinal = round.examType === "CK";

                  return (
                    <div
                      key={round.examId}
                      className={cn(
                        "flex items-center justify-between rounded-xl border px-3.5 py-2.5",
                        active
                          ? "border-primary bg-primary/10"
                          : "bg-muted/10"
                      )}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.2 font-mono text-[10px] font-bold",
                              roundIsFinal
                                ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            )}
                          >
                            {roundIsFinal ? "Cuối kỳ" : "Giữa kỳ"}
                          </span>
                          <span className="font-mono text-xs font-bold text-foreground">
                            {formatDateVi(round.examDate)}
                          </span>
                        </div>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {round.startTime}–{round.endTime} •{" "}
                          {round.roomCode || "--"}
                        </p>
                      </div>

                      {round.seatOrder !== null && (
                        <span className="rounded-lg bg-background px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-600 border dark:text-emerald-400">
                          STT {round.seatOrder}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Minimal Footer */}
        <div className="flex items-center justify-between border-t bg-muted/15 px-6 py-2.5 text-[11px] text-muted-foreground">
          <span>MSSV: {item.studentId}</span>
          {item.lastUpdatedTime && (
            <span className="font-mono">
              Cập nhật: {item.lastUpdatedTime.slice(0, 19).replace("T", " ")}
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
