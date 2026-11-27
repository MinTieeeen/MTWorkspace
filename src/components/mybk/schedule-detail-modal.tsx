"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  CalendarClock,
  CalendarPlus,
  Check,
  Copy,
  FolderKanban,
  Mail,
  MapPin,
  User,
  X,
} from "lucide-react";
import { Modal, useRetained } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { NormalizedTimetableItem } from "@/lib/mybk-timetable";
import {
  DAY_FULL_LABELS,
  DAY_SHORT,
  calendarDaysUntil,
  formatCampus,
  getCurrentIsoWeek,
  getDateForDayInWeek,
  padTime,
  relativeDayLabel,
  toVnMs,
} from "@/lib/format";
import { isScheduledItem } from "@/lib/ics";

interface ScheduleDetailModalProps {
  open: boolean;
  onClose: () => void;
  item: NormalizedTimetableItem | null;
  allSemesterItems?: NormalizedTimetableItem[];
  selectedWeek: number;
  sessionDateIso?: string;
}

interface SessionRef {
  week: number;
  iso: string;
  short: string;
  startMs: number;
  endMs: number;
}

interface SlotView {
  slot: NormalizedTimetableItem;
  room: string;
  sessions: SessionRef[];
}

const roomOf = (item: NormalizedTimetableItem) =>
  item.roomCode && item.roomCode !== "------" ? item.roomCode : "";

function buildGoogleCalendarTemplateUrl(
  item: NormalizedTimetableItem,
  sessionDateIso?: string
): string {
  const title = `[${item.subjectCode}] ${item.subjectNameVi}${
    item.classGroup ? ` (${item.classGroup})` : ""
  }`;
  const roomPart = roomOf(item) || "Chưa xếp phòng";
  const campusPart = item.campusNameVi
    ? ` - ${formatCampus(item.campusNameVi, "Cơ sở Bách Khoa")}`
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

  if (sessionDateIso && isScheduledItem(item)) {
    const cleanDate = sessionDateIso.replace(/-/g, "");
    const startHHMM = item.startTime.replace(":", "").padStart(4, "0");
    const endHHMM = item.endTime.replace(":", "").padStart(4, "0");
    params.set("dates", `${cleanDate}T${startHHMM}00/${cleanDate}T${endHHMM}00`);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Tiêu đề nhỏ của từng phần trong modal */
function SectionTitle({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <h3 className="text-[13px] font-semibold text-muted-foreground">
        {children}
      </h3>
      {right}
    </div>
  );
}

export function ScheduleDetailModal({
  open,
  onClose,
  item: itemProp,
  allSemesterItems,
  selectedWeek,
  sessionDateIso,
}: ScheduleDetailModalProps) {
  const item = useRetained(itemProp);
  const [copiedEmail, setCopiedEmail] = useState(false);

  // Mọi khung giờ của cùng một môn trong học kỳ (vd lý thuyết Thứ 3 + thực hành Thứ 5)
  const slots = useMemo<SlotView[]>(() => {
    if (!item) return [];
    const pool =
      allSemesterItems && allSemesterItems.length > 0
        ? allSemesterItems
        : [item];
    const matched = pool.filter((x) => x.subjectCode === item.subjectCode);
    return (matched.length > 0 ? matched : [item])
      .filter(isScheduledItem)
      .sort((a, b) =>
        a.dayOfWeek !== b.dayOfWeek
          ? a.dayOfWeek - b.dayOfWeek
          : a.startLesson - b.startLesson
      )
      .map((slot) => ({
        slot,
        room: roomOf(slot),
        sessions: slot.activeWeeks
          .slice()
          .sort((a, b) => a - b)
          .map((week) => {
            const d = getDateForDayInWeek(slot.calendarYear, week, slot.dayOfWeek);
            return {
              week,
              iso: d.iso,
              short: d.displayShort,
              startMs: toVnMs(d.iso, slot.startTime),
              endMs: toVnMs(d.iso, slot.endTime),
            };
          }),
      }));
  }, [item, allSemesterItems]);

  const totalSessions = slots.reduce((s, v) => s + v.sessions.length, 0);

  // Buổi học kế tiếp (chưa kết thúc) trong toàn bộ các khung giờ của môn
  const nextSession = useMemo(() => {
    const now = Date.now();
    let best: { view: SlotView; session: SessionRef } | null = null;
    for (const view of slots) {
      for (const session of view.sessions) {
        if (session.endMs > now && (!best || session.startMs < best.session.startMs)) {
          best = { view, session };
        }
      }
    }
    return best;
  }, [slots]);

  if (!item) return null;

  const hasSchedule = slots.length > 0;
  const currentWeek = getCurrentIsoWeek();
  const now = Date.now();

  const handleCopyEmail = async () => {
    if (!item.employeeEmail) return;
    try {
      await navigator.clipboard.writeText(item.employeeEmail);
      setCopiedEmail(true);
      toast.success(`Đã sao chép ${item.employeeEmail}`);
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      toast.error("Không sao chép được, hãy chép thủ công");
    }
  };

  const targetSessionIso =
    sessionDateIso ||
    nextSession?.session.iso ||
    slots[0]?.sessions.find((s) => s.week === selectedWeek)?.iso ||
    slots[0]?.sessions[0]?.iso;
  const gcalUrl = buildGoogleCalendarTemplateUrl(
    nextSession?.view.slot ?? slots[0]?.slot ?? item,
    targetSessionIso
  );

  return (
    <Modal
      open={open && Boolean(itemProp)}
      onClose={onClose}
      panelClassName="max-w-2xl"
      label={item.subjectNameVi}
    >
      {/* ===== 1. Nhận diện môn ===== */}
      <div className="flex items-start justify-between gap-4 border-b px-6 py-5">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold leading-snug tracking-tight text-foreground">
            {item.subjectNameVi}
          </h2>
          {item.subjectNameEn && item.subjectNameEn !== item.subjectNameVi && (
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {item.subjectNameEn}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="primary">{item.subjectCode}</Badge>
            {item.classGroup && <Badge>Nhóm {item.classGroup}</Badge>}
            <Badge>{item.numOfCredits} tín chỉ</Badge>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Đóng"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {!hasSchedule ? (
          /* Môn đồ án / sinh hoạt không xếp tiết */
          <div className="flex items-start gap-3 rounded-xl border border-dashed p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning-fg">
              <FolderKanban className="h-[18px] w-[18px]" />
            </span>
            <div>
              <p className="font-display text-sm font-semibold text-foreground">
                Môn đồ án / sinh hoạt, không xếp tiết cố định
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Môn này không có lịch học hằng tuần. Hãy theo dõi thông báo của
                giảng viên hoặc bộ môn.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ===== 2. Buổi học tiếp theo ===== */}
            <section>
              {nextSession ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <CalendarClock className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-primary">
                        Buổi học tiếp theo ·{" "}
                        {relativeDayLabel(
                          calendarDaysUntil(nextSession.session.iso)
                        )}
                      </p>
                      <p className="font-display text-[15px] font-semibold text-foreground">
                        {DAY_FULL_LABELS[nextSession.view.slot.dayOfWeek]},{" "}
                        {nextSession.session.short}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[15px] font-semibold text-foreground">
                      {padTime(nextSession.view.slot.startTime)} –{" "}
                      {padTime(nextSession.view.slot.endTime)}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {nextSession.view.room || "Chưa xếp phòng"}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed px-4 py-3 text-[13px] text-muted-foreground">
                  Môn này đã kết thúc tất cả các buổi học trong học kỳ.
                </p>
              )}
            </section>

            {/* ===== 3. Lịch học hằng tuần + các tuần học ===== */}
            <section>
              <SectionTitle
                right={
                  <span className="font-mono text-xs text-muted-foreground">
                    {totalSessions} buổi
                  </span>
                }
              >
                Lịch học hằng tuần
              </SectionTitle>

              <div className="space-y-3">
                {slots.map(({ slot, room, sessions }) => (
                  <div key={slot.scheduleId} className="rounded-xl border">
                    {/* Khung giờ: Thứ · giờ (tiết) · phòng */}
                    <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3">
                      <div>
                        <p className="font-display text-[15px] font-semibold text-foreground">
                          {DAY_FULL_LABELS[slot.dayOfWeek]}
                        </p>
                        <p className="mt-0.5 font-mono text-[13px] text-foreground">
                          {padTime(slot.startTime)} – {padTime(slot.endTime)}
                          <span className="text-muted-foreground">
                            {" "}
                            · Tiết {slot.startLesson}–
                            {slot.startLesson + slot.numOfLesson - 1}
                          </span>
                        </p>
                      </div>
                      <p className="inline-flex items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5 font-mono text-[13px] font-medium text-foreground">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {room || "Chưa xếp phòng"}
                      </p>
                    </div>

                    {/* Các tuần học của khung giờ này */}
                    <div className="border-t bg-muted/20 px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {sessions.map((s) => {
                          const isSelected = s.week === selectedWeek;
                          const past = s.endMs < now;
                          const isNext =
                            nextSession?.view.slot.scheduleId === slot.scheduleId &&
                            nextSession.session.week === s.week;
                          return (
                            <span
                              key={s.week}
                              title={`Tuần ${s.week} · ${DAY_SHORT[slot.dayOfWeek]} ${s.short}${
                                s.week === currentWeek ? " (tuần này)" : ""
                              }`}
                              className={cn(
                                "inline-flex h-7 min-w-9 items-center justify-center rounded-md border px-1.5 font-mono text-xs transition-colors",
                                isSelected
                                  ? "border-primary bg-primary font-semibold text-primary-foreground"
                                  : isNext
                                  ? "border-primary/60 bg-primary/10 font-semibold text-primary"
                                  : past
                                  ? "border-transparent bg-muted text-muted-foreground/70"
                                  : "bg-background text-foreground",
                                s.week === currentWeek &&
                                  !isSelected &&
                                  "ring-1 ring-success/60"
                              )}
                            >
                              {s.week}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Tuần đang
                  xem
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm border border-primary/60 bg-primary/10" />{" "}
                  Buổi tiếp theo
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-muted" /> Đã qua
                </span>
                <span className="text-muted-foreground/70">
                  · Rê chuột vào số tuần để xem ngày
                </span>
              </p>
            </section>
          </>
        )}

        {/* ===== 4. Cơ sở và giảng viên ===== */}
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border px-4 py-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              Cơ sở
            </p>
            <p className="mt-1.5 text-sm font-medium text-foreground">
              {formatCampus(item.campusNameVi, "Cơ sở Bách Khoa")}
            </p>
          </div>

          <div className="rounded-xl border px-4 py-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              Giảng viên
            </p>
            <p className="mt-1.5 text-sm font-medium text-foreground">
              {item.employeeName || "Khoa / Bộ môn phân công"}
            </p>
            {item.employeeEmail && (
              <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {item.employeeEmail}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    title="Sao chép email"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {copiedEmail ? (
                      <Check className="h-3.5 w-3.5 text-success-fg" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <a
                    href={`mailto:${item.employeeEmail}`}
                    title="Gửi email"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Mail className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ===== Chân modal: học kỳ · cập nhật · hành động chính ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-6 py-3">
        <p className="text-xs text-muted-foreground">
          {item.semesterYearName}
          {item.lastUpdatedTime && (
            <span className="font-mono">
              {" "}
              · cập nhật {item.lastUpdatedTime.replace("T", " ")}
            </span>
          )}
        </p>
        {hasSchedule && (
          <a
            href={gcalUrl}
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
