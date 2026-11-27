"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock, FolderKanban, MapPin, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { calendarDaysUntil, relativeDayLabel } from "@/lib/format";
import { fmtVnDayMonth, fmtVnTime, vnDateKey, vnWeekdayShort } from "@/lib/thesis/format";
import { MEETING_KIND_LABEL, type MeetingsPayload, type MeetingView } from "@/lib/thesis/meeting-types";
import { THESIS_EVENT } from "@/lib/thesis/workspace-types";
import { useMybkResource } from "@/lib/use-mybk-resource";

/**
 * Một mục nhắc theo thời gian, độc lập với nguồn dữ liệu.
 * Khi làm tính năng Lịch hợp nhất, chỉ cần thêm hàm chuyển từ các nguồn khác (lịch học, lịch thi...)
 * sang kiểu này; thẻ hiển thị bên dưới có thể dùng lại nguyên.
 */
export interface ReminderItem {
  id: string;
  title: string;
  /** Nhãn phân loại, vd "Họp GVHD" */
  tag: string;
  startMs: number;
  endMs: number;
  startIso: string;
  endIso: string | null;
  place: string | null;
  online: boolean;
  joinUrl: string | null;
  href: string;
}

export function meetingToReminder(m: MeetingView): ReminderItem {
  const startMs = Date.parse(m.startAt);
  return {
    id: `thesis-meeting:${m.id}`,
    title: m.title,
    tag: MEETING_KIND_LABEL[m.kind],
    startMs,
    endMs: m.endAt ? Date.parse(m.endAt) : startMs + 3600_000,
    startIso: m.startAt,
    endIso: m.endAt,
    place: m.mode === "ONLINE" ? "Trực tuyến" : m.location,
    online: m.mode === "ONLINE",
    joinUrl: m.mode === "ONLINE" ? m.meetUrl : null,
    href: "/thesis",
  };
}

/** Chỉ nhắc những buổi trong khoảng này (mặc định 14 ngày tới) */
const HORIZON_MS = 14 * 86_400_000;
const MAX_ITEMS = 3;

/** Thẻ nhắc cuộc họp đồ án trên trang Tổng quan; tự ẩn khi không có gì để nhắc hoặc chưa có đồ án */
export function ThesisMeetingReminder() {
  const res = useMybkResource<MeetingsPayload & { connected?: never }>({
    url: "/api/thesis/meetings",
    revalidate: false,
    refetchEvent: THESIS_EVENT,
  });
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const items = useMemo(() => {
    if (now === null || !res.data) return [];
    return res.data.meetings
      .filter((m) => m.status === "PLANNED")
      .map(meetingToReminder)
      .filter((r) => r.endMs >= now && r.startMs - now <= HORIZON_MS)
      .sort((a, b) => a.startMs - b.startMs);
  }, [res.data, now]);

  if (now === null || items.length === 0) return null;

  return (
    <Card>
      <CardHeader
        icon={<FolderKanban />}
        title="Nhắc họp đồ án"
        action={
          <Link
            href="/thesis"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
          >
            Chi tiết
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <ul className="mt-stagger divide-y">
        {items.slice(0, MAX_ITEMS).map((r) => {
          const live = r.startMs <= now;
          const minutes = Math.round((r.startMs - now) / 60_000);
          const days = calendarDaysUntil(vnDateKey(r.startIso), new Date(now));
          const urgent = live || days <= 1;
          const label = live
            ? "Đang họp"
            : minutes < 60
            ? `Sau ${Math.max(minutes, 1)} phút`
            : relativeDayLabel(days);
          return (
            <li key={r.id}>
              <Link
                href={r.href}
                className="grid grid-cols-[3.5rem_1fr_auto] items-start gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40"
              >
                <div
                  className={cn(
                    "flex h-14 flex-col items-center justify-center rounded-xl border text-center",
                    urgent ? "border-warning/40 bg-warning/10" : "bg-muted/40"
                  )}
                >
                  <span className="text-xs font-medium text-muted-foreground">{vnWeekdayShort(r.startIso)}</span>
                  <span className="font-mono text-sm font-semibold text-foreground">{fmtVnDayMonth(r.startIso)}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-primary">{r.tag}</p>
                  <p className="line-clamp-2 font-display text-sm font-semibold leading-snug text-foreground">
                    {r.title}
                  </p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span className="font-mono text-foreground">
                      {fmtVnTime(r.startIso)}
                      {r.endIso && `–${fmtVnTime(r.endIso)}`}
                    </span>
                  </p>
                  {r.place && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {r.online ? <Video className="h-3 w-3 shrink-0" /> : <MapPin className="h-3 w-3 shrink-0" />}
                      <span className="truncate">{r.place}</span>
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Badge tone={live ? "danger" : urgent ? "warning" : "neutral"}>{label}</Badge>
                  {r.joinUrl && (
                    // Nằm trong thẻ Link nên dùng button (tránh lồng thẻ a) và chặn chuyển trang
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        window.open(r.joinUrl!, "_blank", "noopener,noreferrer");
                      }}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Vào họp
                    </button>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {items.length > MAX_ITEMS && (
        <p className="border-t px-5 py-2 text-center text-xs text-muted-foreground">
          và {items.length - MAX_ITEMS} buổi họp khác trong 14 ngày tới
        </p>
      )}
    </Card>
  );
}
