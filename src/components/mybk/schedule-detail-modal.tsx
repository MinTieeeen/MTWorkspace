"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Clock,
  MapPin,
  User,
  Mail,
  Copy,
  Check,
  CalendarPlus,
  CalendarDays,
  BookOpen,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NormalizedTimetableItem } from "@/lib/mybk-timetable";

interface ScheduleDetailModalProps {
  open: boolean;
  onClose: () => void;
  item: NormalizedTimetableItem | null;
  allSemesterItems?: NormalizedTimetableItem[];
  selectedWeek: number;
  sessionDateIso?: string;
}

const DAY_LABELS: Record<number, string> = {
  2: "Thứ 2",
  3: "Thứ 3",
  4: "Thứ 4",
  5: "Thứ 5",
  6: "Thứ 6",
  7: "Thứ 7",
  8: "Chủ Nhật",
  0: "Không xếp tiết",
};

const DAY_FULL_LABELS: Record<number, string> = {
  2: "Thứ Hai",
  3: "Thứ Ba",
  4: "Thứ Tư",
  5: "Thứ Năm",
  6: "Thứ Sáu",
  7: "Thứ Bảy",
  8: "Chủ Nhật",
  0: "Không xếp tiết cố định",
};

function getMondayOfIsoWeek(year: number, weekNumber: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);

  const targetMonday = new Date(week1Monday);
  targetMonday.setUTCDate(week1Monday.getUTCDate() + (weekNumber - 1) * 7);
  return targetMonday;
}

function getSessionDateInfo(
  year: number,
  weekNumber: number,
  dayOfWeek: number
): { iso: string; displayShort: string; displayDate: string } {
  const monday = getMondayOfIsoWeek(year, weekNumber);
  const offset = dayOfWeek >= 2 && dayOfWeek <= 8 ? dayOfWeek - 2 : 0;
  const d = new Date(monday);
  d.setUTCDate(monday.getUTCDate() + offset);
  const iso = d.toISOString().slice(0, 10);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();

  return {
    iso,
    displayShort: `${dd}/${mm}`,
    displayDate: `${dd}/${mm}/${yyyy}`,
  };
}

function formatCampusShort(campusNameVi: string | null): string {
  if (!campusNameVi) return "Cơ sở Bách Khoa";
  if (
    campusNameVi.includes("Cơ Sở 1") ||
    campusNameVi.includes("Lý Thường Kiệt")
  ) {
    return "Cơ sở 1 — Lý Thường Kiệt";
  }
  if (campusNameVi.includes("Cơ Sở 2") || campusNameVi.includes("Đông Hoà")) {
    return "Cơ sở 2 — Dĩ An";
  }
  return campusNameVi;
}

function buildGoogleCalendarTemplateUrl(
  item: NormalizedTimetableItem,
  sessionDateIso?: string
): string {
  const title = `[${item.subjectCode}] ${item.subjectNameVi}${
    item.classGroup ? ` (${item.classGroup})` : ""
  }`;
  const roomPart =
    item.roomCode && item.roomCode !== "------"
      ? item.roomCode
      : "Chưa xếp phòng";
  const campusPart = item.campusNameVi
    ? ` - ${formatCampusShort(item.campusNameVi)}`
    : "";
  const location = `${roomPart}${campusPart}`;

  const details = [
    `Môn học: ${item.subjectCode} - ${item.subjectNameVi}`,
    `Nhóm lớp: ${item.classGroup || "--"} • Số tín chỉ: ${item.numOfCredits} TC`,
    item.startLesson > 0
      ? `Tiết ${item.startLesson} - ${
          item.startLesson + item.numOfLesson - 1
        } (${item.startTime} - ${item.endTime})`
      : "Môn Đồ án / Không xếp tiết cố định",
    `Phòng học: ${roomPart}`,
    item.employeeName
      ? `Giảng viên: ${item.employeeName}${
          item.employeeEmail ? ` (${item.employeeEmail})` : ""
        }`
      : null,
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

  if (
    sessionDateIso &&
    item.dayOfWeek >= 2 &&
    item.startTime &&
    item.startTime !== "0:00" &&
    item.startTime !== "00:00"
  ) {
    const cleanDate = sessionDateIso.replace(/-/g, "");
    const startHHMM = item.startTime.replace(":", "").padStart(4, "0");
    const endHHMM = item.endTime.replace(":", "").padStart(4, "0");
    params.set("dates", `${cleanDate}T${startHHMM}00/${cleanDate}T${endHHMM}00`);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function ScheduleDetailModal({
  open,
  onClose,
  item,
  allSemesterItems,
  selectedWeek,
  sessionDateIso,
}: ScheduleDetailModalProps) {
  const [mounted, setMounted] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // All schedule items belonging to this same subjectCode in the semester
  // (e.g. if a subject has 2 sessions per week: Tuesday & Thursday, or multiple rooms/times)
  const subjectSchedules = useMemo(() => {
    if (!item) return [];
    const pool =
      allSemesterItems && allSemesterItems.length > 0
        ? allSemesterItems
        : [item];
    const matched = pool.filter((x) => x.subjectCode === item.subjectCode);
    if (matched.length === 0) return [item];
    return matched.sort((a, b) =>
      a.dayOfWeek !== b.dayOfWeek
        ? a.dayOfWeek - b.dayOfWeek
        : a.startLesson - b.startLesson
    );
  }, [item, allSemesterItems]);

  // Group concrete sessions by Week Number across ALL schedule slots of this subject
  const groupedWeeks = useMemo(() => {
    if (!item || subjectSchedules.length === 0) {
      return { weeks: [], totalSessions: 0 };
    }

    const weekMap = new Map<
      number,
      Array<{
        scheduleId: number;
        dayOfWeek: number;
        dayShort: string;
        displayShortDate: string;
        displayFullDate: string;
        iso: string;
        startTime: string;
        endTime: string;
        startLesson: number;
        endLesson: number;
        roomCode: string | null;
        isUnscheduled: boolean;
      }>
    >();

    for (const sched of subjectSchedules) {
      const isUnscheduled = sched.dayOfWeek === 0 || sched.startLesson === 0;
      const endLesson =
        sched.startLesson > 0 ? sched.startLesson + sched.numOfLesson - 1 : 0;

      for (const wk of sched.activeWeeks) {
        const dateInfo = getSessionDateInfo(
          sched.calendarYear,
          wk,
          sched.dayOfWeek
        );
        const list = weekMap.get(wk) || [];
        list.push({
          scheduleId: sched.scheduleId,
          dayOfWeek: sched.dayOfWeek,
          dayShort: DAY_LABELS[sched.dayOfWeek] || "Lịch",
          displayShortDate: dateInfo.displayShort,
          displayFullDate: dateInfo.displayDate,
          iso: dateInfo.iso,
          startTime: sched.startTime,
          endTime: sched.endTime,
          startLesson: sched.startLesson,
          endLesson,
          roomCode:
            sched.roomCode && sched.roomCode !== "------"
              ? sched.roomCode
              : null,
          isUnscheduled,
        });
        weekMap.set(wk, list);
      }
    }

    const sortedWeekNums = Array.from(weekMap.keys()).sort((a, b) => a - b);
    let totalSessions = 0;

    const weeks = sortedWeekNums.map((weekNum) => {
      const sessions = (weekMap.get(weekNum) || []).sort((a, b) =>
        a.dayOfWeek !== b.dayOfWeek
          ? a.dayOfWeek - b.dayOfWeek
          : a.startLesson - b.startLesson
      );
      totalSessions += sessions.length;
      const wkMon = getSessionDateInfo(item.calendarYear, weekNum, 2);
      const wkSun = getSessionDateInfo(item.calendarYear, weekNum, 8);

      return {
        weekNum,
        weekRangeShort: `${wkMon.displayShort} – ${wkSun.displayShort}`,
        isSelectedWeek: weekNum === selectedWeek,
        sessions,
      };
    });

    return { weeks, totalSessions };
  }, [item, subjectSchedules, selectedWeek]);

  // Distinct rooms & lecturers across all slots of this subject
  const uniqueRooms = useMemo(() => {
    const rooms = new Set<string>();
    for (const s of subjectSchedules) {
      if (s.roomCode && s.roomCode !== "------") {
        rooms.add(s.roomCode);
      }
    }
    return Array.from(rooms);
  }, [subjectSchedules]);

  if (!open || !mounted || !item) return null;

  const isUnscheduled = subjectSchedules.every(
    (s) => s.dayOfWeek === 0 || s.startLesson === 0
  );

  const handleCopyEmail = async () => {
    if (!item.employeeEmail) return;
    await navigator.clipboard.writeText(item.employeeEmail);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const targetSessionIso =
    sessionDateIso ||
    groupedWeeks.weeks.find((w) => w.weekNum === selectedWeek)?.sessions[0]
      ?.iso ||
    groupedWeeks.weeks[0]?.sessions[0]?.iso;

  const gcalUrl = buildGoogleCalendarTemplateUrl(item, targetSessionIso);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b bg-muted/20 px-6 py-4">
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-bold tracking-tight text-foreground">
              {item.subjectNameVi}
            </h2>
            {item.subjectNameEn &&
              item.subjectNameEn !== item.subjectNameVi && (
                <p className="text-xs text-muted-foreground">
                  {item.subjectNameEn}
                </p>
              )}
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 2-Column Split Body */}
        <div className="grid min-h-0 flex-1 divide-y overflow-y-auto md:grid-cols-12 md:divide-x md:divide-y-0 md:overflow-hidden">
          {/* LEFT HALF: Course & All Weekly Slots Overview (4 cols) */}
          <div className="flex flex-col space-y-3.5 p-5 md:col-span-4 md:overflow-y-auto">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              <span>Thông tin môn học</span>
            </h3>

            {/* Subject Code, Group & Credits Card */}
            <div className="grid grid-cols-3 divide-x rounded-xl border bg-muted/15">
              <div className="px-3 py-2.5">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Mã môn
                </p>
                <p className="mt-0.5 font-mono text-xs font-bold text-primary">
                  {item.subjectCode}
                </p>
              </div>
              <div className="px-3 py-2.5">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Nhóm lớp
                </p>
                <p className="mt-0.5 font-mono text-xs font-bold text-foreground">
                  {item.classGroup || "--"}
                </p>
              </div>
              <div className="px-3 py-2.5">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Số tín chỉ
                </p>
                <p className="mt-0.5 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {item.numOfCredits} TC
                </p>
              </div>
            </div>

            {/* All Fixed Weekly Time Slots of this Subject */}
            <div className="rounded-xl border bg-muted/15 p-3.5">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <span>Khung giờ trong tuần</span>
                </span>
                {!isUnscheduled && subjectSchedules.length > 1 && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                    {subjectSchedules.length} buổi/tuần
                  </span>
                )}
              </div>

              {isUnscheduled ? (
                <p className="mt-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  Môn Đồ án / Sinh hoạt (Không xếp tiết cố định)
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {subjectSchedules.map((slot) => {
                    const endLesson =
                      slot.startLesson + slot.numOfLesson - 1;
                    return (
                      <div
                        key={slot.scheduleId}
                        className="rounded-lg border bg-background/70 px-3 py-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-heading text-xs font-bold text-foreground">
                            {DAY_FULL_LABELS[slot.dayOfWeek]}
                          </span>
                          <span className="font-mono text-xs font-bold text-primary">
                            {slot.startTime} – {slot.endTime}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                          <span>
                            Tiết {slot.startLesson}–{endLesson}
                          </span>
                          <span>
                            {slot.roomCode && slot.roomCode !== "------"
                              ? slot.roomCode
                              : "Chưa xếp phòng"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Room & Campus Card */}
            <div className="rounded-xl border bg-muted/15 p-3.5">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                <span>Địa điểm học</span>
              </div>
              <p className="mt-1 font-mono text-xs font-bold text-foreground">
                {uniqueRooms.length > 0
                  ? `Phòng ${uniqueRooms.join(", ")}`
                  : "Chưa xếp phòng cố định"}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3 shrink-0" />
                <span>{formatCampusShort(item.campusNameVi)}</span>
              </div>
            </div>

            {/* Lecturer Card */}
            <div className="rounded-xl border bg-muted/15 p-3.5">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <User className="h-3.5 w-3.5 text-sky-500" />
                <span>Giảng viên phụ trách</span>
              </div>
              <p className="mt-1 font-heading text-xs font-bold text-foreground">
                {item.employeeName || "Khoa / Bộ môn phân công"}
              </p>
              {item.employeeEmail && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {item.employeeEmail}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleCopyEmail}
                      className="inline-flex items-center gap-1 rounded-lg border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      {copiedEmail ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" />
                          <span>Đã chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 text-muted-foreground" />
                          <span>Chép</span>
                        </>
                      )}
                    </button>
                    <a
                      href={`mailto:${item.employeeEmail}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20"
                    >
                      <Mail className="h-3 w-3" />
                      <span>Gửi mail</span>
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT HALF: Compact 2-Column Grid of Weeks (8 cols) */}
          <div className="flex min-h-0 flex-col p-5 md:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <CalendarDays className="h-3.5 w-3.5 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Lịch trình các buổi học theo tuần
                </h3>
                <span className="rounded-lg bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
                  {groupedWeeks.weeks.length} tuần •{" "}
                  {groupedWeeks.totalSessions} buổi
                </span>
              </div>

              {!isUnscheduled && (
                <a
                  href={gcalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <CalendarPlus className="h-3.5 w-3.5" />
                  <span>Thêm vào Google Calendar</span>
                </a>
              )}
            </div>

            {/* Compact Multi-Column Week Grid so all weeks fit cleanly at a glance */}
            <div className="flex-1 overflow-y-auto pr-1">
              {groupedWeeks.weeks.length === 0 ? (
                <div className="flex h-40 items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground">
                  Chưa có danh sách tuần học cụ thể
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {groupedWeeks.weeks.map((wk) => (
                    <div
                      key={wk.weekNum}
                      className={cn(
                        "flex flex-col justify-between rounded-xl border p-2.5 transition-colors",
                        wk.isSelectedWeek
                          ? "border-primary bg-primary/10"
                          : "bg-muted/10 hover:bg-muted/25"
                      )}
                    >
                      {/* Week Header Row */}
                      <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "rounded-md px-2 py-0.5 font-mono text-xs font-bold",
                              wk.isSelectedWeek
                                ? "bg-primary text-primary-foreground"
                                : "bg-background border text-foreground"
                            )}
                          >
                            Tuần {wk.weekNum}
                          </span>
                          {wk.isSelectedWeek && (
                            <span className="rounded bg-primary/20 px-1.5 py-0.2 text-[10px] font-semibold text-primary">
                              Đang xem
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {wk.weekRangeShort}
                        </span>
                      </div>

                      {/* All Sessions Inside This Week */}
                      <div className="mt-1.5 space-y-1">
                        {wk.sessions.map((sess, idx) => (
                          <div
                            key={`${sess.scheduleId}-${idx}`}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            {sess.isUnscheduled ? (
                              <span className="font-mono text-[11px] text-muted-foreground">
                                Tuần hoạt động đồ án / SHSV
                              </span>
                            ) : (
                              <>
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="font-heading font-bold text-foreground">
                                    {sess.dayShort}
                                  </span>
                                  <span className="font-mono text-[11px] text-muted-foreground">
                                    ({sess.displayShortDate})
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 font-mono text-[11px]">
                                  <span className="font-semibold text-primary">
                                    {sess.startTime}–{sess.endTime}
                                  </span>
                                  {sess.roomCode && (
                                    <span className="rounded bg-background/80 px-1.5 py-0.2 text-[10px] text-muted-foreground border">
                                      {sess.roomCode}
                                    </span>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Minimal Footer */}
        <div className="flex items-center justify-between border-t bg-muted/15 px-6 py-2.5 text-[11px] text-muted-foreground">
          <span>{item.semesterYearName}</span>
          {item.lastUpdatedTime && (
            <span className="font-mono">
              Cập nhật: {item.lastUpdatedTime.replace("T", " ")}
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
