"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  DAY_SHORT,
  calendarDaysUntil,
  formatDateVi,
  getCurrentIsoWeek,
  getDateForDayInWeek,
  padTime,
  toVnMs,
} from "@/lib/format";
import { isScheduledItem } from "@/lib/ics";
import { useMybkResource, type ResourcePayload } from "@/lib/use-mybk-resource";
import type { NormalizedTimetableItem } from "@/lib/mybk-timetable";
import type { NormalizedExamItem } from "@/lib/mybk-exams";

interface NextUpEvent {
  kind: "class" | "exam";
  startMs: number;
  endMs: number;
  dateIso: string;
  dayOfWeek: number;
  start: string;
  end: string;
  name: string;
  room: string;
  href: string;
  examType?: string;
}

const LOOKAHEAD_MS = 7 * 86400000;

function bkDayFromIso(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 ? 8 : d + 1;
}

/** Hôm nay / Ngày mai / Thứ 5 (27/11) */
function dayLabel(ev: NextUpEvent, now: number): string {
  const days = calendarDaysUntil(ev.dateIso, new Date(now));
  if (days === 0) return "Hôm nay";
  if (days === 1) return "Ngày mai";
  return `${DAY_SHORT[ev.dayOfWeek]} (${formatDateVi(ev.dateIso).short})`;
}

function relative(ev: NextUpEvent, now: number): string {
  if (ev.startMs <= now) {
    const left = Math.max(1, Math.round((ev.endMs - now) / 60000));
    return left < 60 ? `còn ${left} phút` : `còn ${Math.round(left / 60)} giờ`;
  }
  const mins = Math.round((ev.startMs - now) / 60000);
  if (mins < 60) return `sau ${mins} phút`;
  if (mins < 24 * 60) return `sau ${Math.round(mins / 60)} giờ`;
  return `sau ${Math.round(mins / 1440)} ngày`;
}

type TimetablePayload = ResourcePayload & { items?: NormalizedTimetableItem[] };
type ExamsPayload = ResourcePayload & { items?: NormalizedExamItem[] };

/**
 * Chip ở header: buổi học / ca thi đang diễn ra hoặc gần nhất trong 7 ngày tới.
 * Mặc định gọn (ngày, giờ, tên môn); rà chuột hoặc focus thì mở rộng đủ thông tin.
 */
export function NextUpChip() {
  const timetable = useMybkResource<TimetablePayload>({
    url: "/api/mybk/timetable",
    revalidate: false,
  });
  const exams = useMybkResource<ExamsPayload>({
    url: "/api/mybk/exams",
    revalidate: false,
  });
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const next = useMemo<NextUpEvent | null>(() => {
    if (now === null) return null;
    const events: NextUpEvent[] = [];
    const week = getCurrentIsoWeek(new Date(now));

    for (const item of timetable.data?.items ?? []) {
      if (!isScheduledItem(item)) continue;
      for (const wk of [week, week + 1]) {
        if (!item.activeWeeks.includes(wk)) continue;
        const { iso } = getDateForDayInWeek(item.calendarYear, wk, item.dayOfWeek);
        events.push({
          kind: "class",
          startMs: toVnMs(iso, item.startTime),
          endMs: toVnMs(iso, item.endTime),
          dateIso: iso,
          dayOfWeek: item.dayOfWeek,
          start: padTime(item.startTime),
          end: padTime(item.endTime),
          name: item.subjectNameVi,
          room: item.roomCode && item.roomCode !== "------" ? item.roomCode : "",
          href: "/timetable",
        });
      }
    }

    for (const ex of exams.data?.items ?? []) {
      if (!ex.examDate) continue;
      events.push({
        kind: "exam",
        startMs: toVnMs(ex.examDate, ex.startTime),
        endMs: toVnMs(ex.examDate, ex.endTime),
        dateIso: ex.examDate,
        dayOfWeek: bkDayFromIso(ex.examDate),
        start: padTime(ex.startTime),
        end: padTime(ex.endTime),
        name: ex.subjectName,
        room: ex.roomCode || "",
        href: "/exams",
        examType: ex.examType,
      });
    }

    return (
      events
        .filter(
          (e) => e.startMs > 0 && e.endMs > now && e.startMs - now < LOOKAHEAD_MS
        )
        .sort((a, b) => a.startMs - b.startMs)[0] ?? null
    );
  }, [timetable.data, exams.data, now]);

  if (!next || now === null) return null;

  const live = next.startMs <= now;
  const isExam = next.kind === "exam";
  const when = live ? (isExam ? "Đang thi" : "Đang học") : dayLabel(next, now);

  return (
    <Link
      href={next.href}
      aria-label={`${when} ${next.start}–${next.end}: ${next.name}${
        next.room ? `, phòng ${next.room}` : ""
      }`}
      className={cn(
        "group hidden h-9 max-w-[min(34rem,46vw)] items-center gap-2 overflow-hidden rounded-full border bg-card px-3 text-[13px] outline-none transition-[background-color,border-color,box-shadow] duration-200 animate-in fade-in slide-in-from-top-1 focus-visible:ring-2 focus-visible:ring-ring/50 md:inline-flex",
        isExam
          ? "border-warning/40 hover:bg-warning/10"
          : "hover:border-primary/40 hover:bg-muted/60 hover:shadow-sm"
      )}
    >
      {/* Chấm trạng thái: nhấp nháy khi đang diễn ra */}
      <span className="relative flex h-2 w-2 shrink-0">
        {live && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 motion-reduce:animate-none",
              isExam ? "bg-warning" : "bg-success"
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            isExam ? "bg-warning" : live ? "bg-success" : "bg-primary"
          )}
        />
      </span>

      {isExam && (
        <span className="shrink-0 rounded bg-warning/15 px-1.5 text-xs font-semibold text-warning-fg">
          Thi {next.examType}
        </span>
      )}

      {/* Luôn hiện: ngày + giờ bắt đầu + tên môn (cắt bớt nếu dài) */}
      <span className="shrink-0 font-semibold text-foreground">{when}</span>
      <span className="shrink-0 font-mono text-foreground">
        {next.start}
        {/* Giờ kết thúc chỉ hiện khi mở rộng */}
        <span className="inline-block max-w-0 overflow-hidden whitespace-nowrap align-bottom text-muted-foreground transition-[max-width] duration-300 ease-out group-hover:max-w-[4rem] group-focus-visible:max-w-[4rem]">
          –{next.end}
        </span>
      </span>
      <span className="min-w-0 max-w-[9rem] truncate font-medium text-foreground transition-[max-width] duration-300 ease-out group-hover:max-w-[18rem] group-focus-visible:max-w-[18rem]">
        {next.name}
      </span>

      {/* Chi tiết mở rộng khi hover: phòng, thời gian còn lại */}
      <span className="flex max-w-0 shrink-0 items-center gap-2 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-300 ease-out group-hover:max-w-[16rem] group-hover:opacity-100 group-focus-visible:max-w-[16rem] group-focus-visible:opacity-100">
        <span className="text-border">|</span>
        {next.room && (
          <span className="font-mono text-xs font-semibold text-foreground">
            {next.room}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{relative(next, now)}</span>
      </span>
    </Link>
  );
}
