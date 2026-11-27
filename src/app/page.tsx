"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckSquare,
  Clock,
  FileCheck2,
  MapPin,
  StickyNote,
  User,
} from "lucide-react";
import { ThesisMeetingReminder } from "@/components/dashboard/thesis-meeting-reminder";
import { GmailInboxWidget } from "@/components/dashboard/gmail-inbox-widget";
import { MyBkConnectModal } from "@/components/mybk/mybk-connect-modal";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { ConnectPrompt, ErrorState, StaleBanner } from "@/components/ui/state";
import {
  DAY_SHORT,
  calendarDaysUntil,
  formatDateVi,
  getCurrentIsoWeek,
  getDateForDayInWeek,
  getTodayBkDayOfWeek,
  relativeDayLabel,
  toVnMs,
  padTime,
} from "@/lib/format";
import { isScheduledItem } from "@/lib/ics";
import { buildSubjectColorMap } from "@/lib/subject-colors";
import {
  useMybkResource,
  type ResourcePayload,
  type ResourceState,
} from "@/lib/use-mybk-resource";
import type { NormalizedTimetableItem } from "@/lib/mybk-timetable";
import type { NormalizedExamItem } from "@/lib/mybk-exams";
import { cn } from "@/lib/utils";

type TimetablePayload = ResourcePayload & { items?: NormalizedTimetableItem[] };
type ExamsPayload = ResourcePayload & { items?: NormalizedExamItem[] };

const MAX_EXAMS = 3;

interface ClassSession {
  item: NormalizedTimetableItem;
  dateIso: string;
  startMs: number;
  endMs: number;
}

interface DayGroup {
  dayOfWeek: number;
  dateIso: string;
  sessions: ClassSession[];
}

/** Nhãn nhóm ngày: Hôm nay · Thứ 5 (26/11) / Ngày mai · ... / Thứ 7 (28/11) */
function groupLabel(g: DayGroup, now: number): string {
  const days = calendarDaysUntil(g.dateIso, new Date(now));
  const base = `${DAY_SHORT[g.dayOfWeek]} (${formatDateVi(g.dateIso).short})`;
  if (days === 0) return `Hôm nay · ${base}`;
  if (days === 1) return `Ngày mai · ${base}`;
  return base;
}

/** Hiển thị trạng thái tải thay cho nội dung card (chưa kết nối, hết hạn, lỗi) */
function ResourceFallback({
  res,
  onConnect,
  what,
}: {
  res: ResourceState<ResourcePayload>;
  onConnect: () => void;
  what: string;
}) {
  const inner = "rounded-none border-0 py-10";
  if (res.status === "not-connected") {
    return (
      <ConnectPrompt
        className={inner}
        title="Chưa kết nối myBK"
        description={`Kết nối tài khoản để xem ${what}.`}
        actionLabel="Kết nối myBK"
        onConnect={onConnect}
      />
    );
  }
  if (res.status === "sso-expired") {
    return (
      <ConnectPrompt
        expired
        className={inner}
        title="Phiên đăng nhập myBK đã hết hạn"
        description="Đăng nhập lại để cập nhật dữ liệu mới."
        actionLabel="Đăng nhập lại"
        onConnect={onConnect}
      />
    );
  }
  return (
    <ErrorState
      className={inner}
      title={`Không tải được ${what}`}
      message={res.error ?? undefined}
      onRetry={res.retry}
    />
  );
}

const isFallbackStatus = (s: string) =>
  s === "not-connected" || s === "sso-expired" || s === "error";

export default function HomePage() {
  const timetable = useMybkResource<TimetablePayload>({
    url: "/api/mybk/timetable",
    revalidate: false,
    isEmpty: (d) => !d.items || d.items.length === 0,
  });
  const exams = useMybkResource<ExamsPayload>({
    url: "/api/mybk/exams",
    revalidate: false,
    isEmpty: (d) => !d.items || d.items.length === 0,
  });
  const [connectOpen, setConnectOpen] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Lịch học từ hôm nay đến hết tuần, gom theo ngày
  const { groups, weekNum, weekTotal } = useMemo(() => {
    const empty = { groups: [] as DayGroup[], weekNum: 0, weekTotal: 0 };
    if (now === null) return empty;
    const week = getCurrentIsoWeek(new Date(now));
    const todayDow = getTodayBkDayOfWeek(new Date(now));
    const byDay = new Map<number, DayGroup>();
    let total = 0;

    const items = (timetable.data?.items ?? [])
      .filter((i) => isScheduledItem(i) && i.activeWeeks.includes(week))
      .sort((a, b) =>
        a.dayOfWeek !== b.dayOfWeek
          ? a.dayOfWeek - b.dayOfWeek
          : a.startLesson - b.startLesson
      );

    for (const item of items) {
      total += 1;
      if (item.dayOfWeek < todayDow) continue;
      const { iso } = getDateForDayInWeek(item.calendarYear, week, item.dayOfWeek);
      const group =
        byDay.get(item.dayOfWeek) ??
        { dayOfWeek: item.dayOfWeek, dateIso: iso, sessions: [] };
      group.sessions.push({
        item,
        dateIso: iso,
        startMs: toVnMs(iso, item.startTime),
        endMs: toVnMs(iso, item.endTime),
      });
      byDay.set(item.dayOfWeek, group);
    }
    return { groups: Array.from(byDay.values()), weekNum: week, weekTotal: total };
  }, [timetable.data, now]);

  const colorMap = useMemo(
    () =>
      buildSubjectColorMap(
        (timetable.data?.items ?? []).map((i) => i.subjectCode)
      ),
    [timetable.data]
  );

  // Ca thi chưa kết thúc, gần nhất trước
  const upcomingExams = useMemo(() => {
    if (now === null) return [];
    return (exams.data?.items ?? [])
      .filter((e) => toVnMs(e.examDate, e.endTime) >= now)
      .sort(
        (a, b) =>
          toVnMs(a.examDate, a.startTime) - toVnMs(b.examDate, b.startTime)
      );
  }, [exams.data, now]);

  if (
    now === null ||
    (timetable.status === "loading" && exams.status === "loading")
  ) {
    return <DashboardSkeleton />;
  }

  const stale = timetable.isStale || exams.isStale;
  // Buổi học kế tiếp chưa diễn ra: đánh dấu "Tiếp theo"
  const nextSession = groups
    .flatMap((g) => g.sessions)
    .find((s) => s.startMs > now);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {stale && (
        <StaleBanner
          lastSyncedAt={timetable.lastSyncedAt ?? exams.lastSyncedAt}
          message="Đang hiển thị dữ liệu đã lưu, chưa cập nhật được từ myBK"
          refreshing={timetable.refreshing || exams.refreshing}
          onRefresh={() => {
            timetable.refresh(true);
            exams.refresh(true);
          }}
        />
      )}

      <div className="grid items-start gap-5 lg:grid-cols-12">
        {/* ===== Cột trái: lịch học ===== */}
        <Card className="lg:col-span-7">
          <CardHeader
            icon={<CalendarClock />}
            title={weekNum ? `Lịch học · Tuần ${weekNum}` : "Lịch học"}
            action={
              <Link
                href="/timetable"
                className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
              >
                Thời khóa biểu
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />

          {isFallbackStatus(timetable.status) ? (
            <ResourceFallback
              res={timetable as ResourceState<ResourcePayload>}
              onConnect={() => setConnectOpen(true)}
              what="thời khóa biểu"
            />
          ) : groups.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="font-display text-sm font-semibold text-foreground">
                {weekTotal > 0
                  ? "Tuần này đã hết lịch học"
                  : "Tuần này không có buổi học cố định"}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {weekTotal > 0
                  ? `Bạn đã học ${weekTotal} buổi trong tuần.`
                  : "Đồ án, sinh hoạt không xếp tiết sẽ không hiện ở đây."}
              </p>
            </div>
          ) : (
            <div className="mt-stagger divide-y">
              {groups.map((g) => {
                const isToday =
                  calendarDaysUntil(g.dateIso, new Date(now)) === 0;
                return (
                  <section key={g.dayOfWeek}>
                    <h3
                      className={cn(
                        "flex items-center gap-2 px-5 pb-1 pt-3 text-xs font-semibold",
                        isToday ? "text-primary" : "text-muted-foreground"
                      )}
                    >
                      {isToday && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                      {groupLabel(g, now)}
                    </h3>
                    <ul className="pb-2">
                      {g.sessions.map((s) => {
                        const live = s.startMs <= now && now < s.endMs;
                        const done = s.endMs <= now;
                        const isNext = s === nextSession;
                        const color = colorMap.get(s.item.subjectCode);
                        const room =
                          s.item.roomCode && s.item.roomCode !== "------"
                            ? s.item.roomCode
                            : "";
                        return (
                          <li key={s.item.scheduleId}>
                            <Link
                              href="/timetable"
                              className={cn(
                                "grid grid-cols-[3.75rem_1fr_auto] items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/40",
                                done && "opacity-55"
                              )}
                            >
                              {/* Giờ: bắt đầu đậm, kết thúc mờ */}
                              <div className="font-mono leading-tight">
                                <p className="text-sm font-semibold text-foreground">
                                  {padTime(s.item.startTime)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {padTime(s.item.endTime)}
                                </p>
                              </div>

                              {/* Môn + phòng/giảng viên, có vạch màu theo môn */}
                              <div className="flex min-w-0 items-stretch gap-3">
                                <span
                                  className={cn(
                                    "w-1 shrink-0 rounded-full",
                                    color?.accent ?? "bg-primary"
                                  )}
                                />
                                <div className="min-w-0">
                                  <p className="truncate font-display text-sm font-semibold text-foreground">
                                    {s.item.subjectNameVi}
                                  </p>
                                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                                    <span className="inline-flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      <span
                                        className={cn(
                                          "font-mono",
                                          room && "font-semibold text-foreground"
                                        )}
                                      >
                                        {room || "Chưa xếp phòng"}
                                      </span>
                                    </span>
                                    {s.item.employeeName && (
                                      <span className="inline-flex min-w-0 items-center gap-1">
                                        <User className="h-3 w-3 shrink-0" />
                                        <span className="truncate">
                                          {s.item.employeeName}
                                        </span>
                                      </span>
                                    )}
                                  </p>
                                </div>
                              </div>

                              {/* Trạng thái */}
                              <div className="w-20 text-right">
                                {live ? (
                                  <Badge tone="success">Đang học</Badge>
                                ) : isNext ? (
                                  <Badge tone="primary">Tiếp theo</Badge>
                                ) : done ? (
                                  <Badge>Đã xong</Badge>
                                ) : null}
                              </div>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </Card>

        {/* ===== Cột phải: lịch thi + hộp thư ===== */}
        <div className="space-y-5 lg:col-span-5">
          <Card>
            <CardHeader
              icon={<FileCheck2 />}
              title="Lịch thi"
              action={
                <Link
                  href="/exams"
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
                >
                  {upcomingExams.length > MAX_EXAMS
                    ? `Xem tất cả (${upcomingExams.length})`
                    : "Chi tiết"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />

            {isFallbackStatus(exams.status) ? (
              <ResourceFallback
                res={exams as ResourceState<ResourcePayload>}
                onConnect={() => setConnectOpen(true)}
                what="lịch thi"
              />
            ) : upcomingExams.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">
                Không có ca thi nào sắp tới
              </p>
            ) : (
              <ul className="mt-stagger divide-y">
                {upcomingExams.slice(0, MAX_EXAMS).map((exam) => {
                  const days = calendarDaysUntil(exam.examDate, new Date(now));
                  const live =
                    toVnMs(exam.examDate, exam.startTime) <= now;
                  const soon = days <= 3;
                  return (
                    <li key={exam.examId}>
                      <Link
                        href="/exams"
                        className="grid grid-cols-[3.5rem_1fr_auto] items-start gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40"
                      >
                        {/* Khối ngày */}
                        <div
                          className={cn(
                            "flex h-14 flex-col items-center justify-center rounded-xl border text-center",
                            soon
                              ? "border-warning/40 bg-warning/10"
                              : "bg-muted/40"
                          )}
                        >
                          <span className="text-xs font-medium text-muted-foreground">
                            {DAY_SHORT[exam.dayOfWeek] ?? "Thi"}
                          </span>
                          <span className="font-mono text-sm font-semibold text-foreground">
                            {formatDateVi(exam.examDate).short}
                          </span>
                        </div>

                        {/* Tên môn, giờ thi, phòng thi: mỗi thông tin một dòng */}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-warning-fg">
                            {exam.examType === "CK" ? "Cuối kỳ" : "Giữa kỳ"}
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
                            <span
                              className={cn(
                                "font-mono",
                                exam.roomCode && "text-foreground"
                              )}
                            >
                              {exam.roomCode || "Chưa xếp phòng"}
                            </span>
                          </p>
                        </div>

                        {/* Đếm ngược */}
                        <Badge tone={live ? "danger" : soon ? "warning" : "neutral"}>
                          {live ? "Đang thi" : relativeDayLabel(days)}
                        </Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <ThesisMeetingReminder />

          <GmailInboxWidget />
        </div>
      </div>

      {/* ===== Tính năng sắp có: gọn trong một dòng ===== */}
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { icon: CheckSquare, title: "Công việc" },
          { icon: StickyNote, title: "Ghi chú nhanh" },
        ].map(({ icon: Icon, title }) => (
          <div
            key={title}
            className="flex items-center gap-3 rounded-2xl border border-dashed px-5 py-3.5 text-muted-foreground"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="text-sm font-medium">{title}</span>
            <Badge className="ml-auto">Sắp có</Badge>
          </div>
        ))}
      </div>

      <MyBkConnectModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        connectedStudentId={null}
        lastSyncedAt={null}
      />
    </div>
  );
}
