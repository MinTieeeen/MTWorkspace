"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  Clock,
  ListChecks,
  MapPin,
  Plus,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import { useRetained } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { MEETINGS_EVENT, MeetingModal } from "@/components/thesis/meeting-modal";
import { buildMeetingIcs, downloadIcs } from "@/lib/ics";
import { calendarDaysUntil, relativeDayLabel } from "@/lib/format";
import { fmtVnDayMonth, fmtVnTime, vnDateKey, vnWeekdayShort } from "@/lib/thesis/format";
import { MEETING_KIND_LABEL, type MeetingsPayload, type MeetingView } from "@/lib/thesis/meeting-types";
import type { ProjectView } from "@/lib/thesis/types";
import { useMybkResource } from "@/lib/use-mybk-resource";

function MeetingRow({
  meeting,
  ordinal,
  gapDays,
  isNext,
  nowMs,
  onOpen,
}: {
  meeting: MeetingView;
  ordinal: number | null;
  gapDays: number | null;
  isNext: boolean;
  nowMs: number;
  onOpen: () => void;
}) {
  const cancelled = meeting.status === "CANCELLED";
  const past = meeting.status !== "PLANNED" || Date.parse(meeting.endAt ?? meeting.startAt) < nowMs;
  const days = calendarDaysUntil(vnDateKey(meeting.startAt), new Date(nowMs));
  const soon = !past && days <= 1;
  const openTasks = meeting.tasks.filter((t) => !t.done).length;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "grid w-full grid-cols-[3.5rem_1fr_auto] items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/40",
        past && "opacity-70 hover:opacity-100"
      )}
    >
      <div
        className={cn(
          "flex h-14 flex-col items-center justify-center rounded-xl border text-center",
          soon ? "border-warning/40 bg-warning/10" : "bg-muted/40"
        )}
      >
        <span className="text-xs font-medium text-muted-foreground">{vnWeekdayShort(meeting.startAt)}</span>
        <span className="font-mono text-sm font-semibold text-foreground">{fmtVnDayMonth(meeting.startAt)}</span>
      </div>

      <div className="min-w-0">
        <p className="text-xs font-medium text-primary">
          {MEETING_KIND_LABEL[meeting.kind]}
          {ordinal !== null && ` · Lần ${ordinal}`}
        </p>
        <p className={cn("line-clamp-2 font-display text-sm font-semibold leading-snug text-foreground", cancelled && "line-through")}>
          {meeting.title}
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span className="font-mono text-foreground">
            {fmtVnTime(meeting.startAt)}
            {meeting.endAt && `–${fmtVnTime(meeting.endAt)}`}
          </span>
          {gapDays !== null && gapDays > 0 && <span>· cách lần trước {gapDays} ngày</span>}
        </p>
        {(meeting.location || meeting.meetUrl) && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            {meeting.mode === "ONLINE" ? <Video className="h-3 w-3 shrink-0" /> : <MapPin className="h-3 w-3 shrink-0" />}
            <span className="truncate">{meeting.mode === "ONLINE" ? "Trực tuyến" : meeting.location}</span>
          </p>
        )}
        {openTasks > 0 && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ListChecks className="h-3 w-3 shrink-0" />
            {openTasks} việc chưa xong
          </p>
        )}
      </div>

      {cancelled ? (
        <Badge tone="danger">Đã hủy</Badge>
      ) : meeting.status === "DONE" ? (
        <Badge tone="success">Đã họp</Badge>
      ) : past ? (
        <Badge tone="warning">Chờ cập nhật</Badge>
      ) : isNext ? (
        <Badge tone="primary">Tiếp theo</Badge>
      ) : (
        <Badge tone={soon ? "warning" : "neutral"}>{relativeDayLabel(days)}</Badge>
      )}
    </button>
  );
}

function GroupHeader({ title, count, open, onToggle }: { title: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center justify-between border-b bg-muted/25 px-5 py-2.5 text-left transition-colors hover:bg-muted/40"
    >
      <span className="font-display text-[13px] font-semibold text-foreground">
        {title}
        <span className="ml-1.5 font-mono font-medium text-muted-foreground">({count})</span>
      </span>
      <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", !open && "-rotate-90")} />
    </button>
  );
}

export function MeetingsTab({ project, nowMs }: { project: ProjectView; nowMs: number }) {
  const res = useMybkResource<MeetingsPayload & { connected?: never }>({
    url: "/api/thesis/meetings",
    revalidate: false,
    refetchEvent: MEETINGS_EVENT,
  });
  const data = res.data;

  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(true);
  const [showPast, setShowPast] = useState(false);

  const mine = useMemo(
    () => (data?.meetings ?? []).filter((m) => m.projectId === project.id),
    [data, project.id]
  );

  // Số thứ tự "Lần N" và khoảng cách với lần trước (chỉ tính các buổi không bị hủy)
  const meta = useMemo(() => {
    const map = new Map<string, { ordinal: number | null; gap: number | null }>();
    let prev: MeetingView | null = null;
    let n = 0;
    for (const m of mine) {
      if (m.status === "CANCELLED") {
        map.set(m.id, { ordinal: null, gap: null });
        continue;
      }
      n += 1;
      const gap = prev
        ? Math.round((Date.parse(m.startAt) - Date.parse(prev.startAt)) / 86_400_000)
        : null;
      map.set(m.id, { ordinal: n, gap });
      prev = m;
    }
    return map;
  }, [mine]);

  const { upcoming, past } = useMemo(() => {
    const up: MeetingView[] = [];
    const done: MeetingView[] = [];
    for (const m of mine) {
      const over = Date.parse(m.endAt ?? m.startAt) < nowMs;
      (m.status === "PLANNED" && !over ? up : done).push(m);
    }
    return { upcoming: up, past: done.reverse() };
  }, [mine, nowMs]);

  const active = useRetained(mine.find((m) => m.id === activeId) ?? null);

  const openMeeting = (m: MeetingView) => {
    setCreating(false);
    setActiveId(m.id);
    setModalOpen(true);
  };
  const openNew = () => {
    setCreating(true);
    setActiveId(null);
    setModalOpen(true);
  };

  const exportUpcoming = () => {
    if (upcoming.length === 0) {
      toast.info("Chưa có cuộc họp sắp tới để xuất");
      return;
    }
    downloadIcs(buildMeetingIcs(upcoming, project.titleVi ?? "Đồ án"), "CuocHop-DoAn.ics");
    toast.success("Đã tải tệp lịch (.ics)");
  };

  if (!data && res.status === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (res.status === "error" && !data) {
    return <ErrorState title="Không tải được cuộc họp" message={res.error ?? undefined} onRetry={res.retry} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
        <p className="text-[13px] text-muted-foreground">
          <span className="font-mono font-semibold text-foreground">{mine.filter((m) => m.status === "DONE").length}</span>{" "}
          buổi đã họp ·{" "}
          <span className="font-mono font-semibold text-foreground">{upcoming.length}</span> buổi sắp tới
        </p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={exportUpcoming} title="Tải lịch các buổi sắp tới (.ics)">
            <CalendarPlus className="h-4 w-4" />
            Xuất lịch
          </Button>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            Thêm cuộc họp
          </Button>
        </div>
      </div>

      {mine.length === 0 ? (
        <EmptyState
          icon={<CalendarClock />}
          title="Chưa có cuộc họp nào"
          description="Ghi lại lịch họp với GVHD và nhóm, chuẩn bị chương trình, lưu biên bản và việc cần làm sau mỗi buổi."
          action={
            <Button size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" />
              Thêm cuộc họp đầu tiên
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {upcoming.length > 0 && (
            <section className="overflow-hidden rounded-2xl border bg-card">
              <GroupHeader title="Sắp tới" count={upcoming.length} open={showUpcoming} onToggle={() => setShowUpcoming((o) => !o)} />
              <Collapse open={showUpcoming}>
                <div className="mt-stagger divide-y">
                  {upcoming.map((m, i) => (
                    <MeetingRow
                      key={m.id}
                      meeting={m}
                      ordinal={meta.get(m.id)?.ordinal ?? null}
                      gapDays={meta.get(m.id)?.gap ?? null}
                      isNext={i === 0}
                      nowMs={nowMs}
                      onOpen={() => openMeeting(m)}
                    />
                  ))}
                </div>
              </Collapse>
            </section>
          )}
          {past.length > 0 && (
            <section className="overflow-hidden rounded-2xl border bg-card">
              <GroupHeader title="Đã họp" count={past.length} open={showPast} onToggle={() => setShowPast((o) => !o)} />
              <Collapse open={showPast}>
                <div className="divide-y">
                  {past.map((m) => (
                    <MeetingRow
                      key={m.id}
                      meeting={m}
                      ordinal={meta.get(m.id)?.ordinal ?? null}
                      gapDays={meta.get(m.id)?.gap ?? null}
                      isNext={false}
                      nowMs={nowMs}
                      onOpen={() => openMeeting(m)}
                    />
                  ))}
                </div>
              </Collapse>
            </section>
          )}
        </div>
      )}

      <MeetingModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        project={project}
        creating={creating}
        meeting={active}
        allMeetings={mine}
        doneTasks={data?.doneTasks ?? []}
      />
    </div>
  );
}
