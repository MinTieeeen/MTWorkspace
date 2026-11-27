"use client";

import { Check, CircleDashed, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { fmtVnRange } from "@/lib/thesis/format";
import { milestoneState, type MilestoneState } from "@/lib/thesis/milestones";
import type { MilestoneView } from "@/lib/thesis/types";

/** Các chặng của đồ án, mỗi chặng gom những mốc liên quan của trường */
const PHASES: { name: string; hint: string; keys: string[] }[] = [
  {
    name: "Đề cương",
    hint: "Nộp, duyệt, đăng ký",
    keys: ["proposalSubmission", "departmentReview", "majorReview", "studentRegistration"],
  },
  { name: "Giữa kỳ", hint: "Đánh giá tiến độ", keys: ["midtermEvaluation"] },
  {
    name: "Chấm điểm",
    hint: "GVHD và phản biện",
    keys: ["supervisorGradingAssignment", "reviewerGrading"],
  },
  { name: "Báo cáo", hint: "Nộp và duyệt", keys: ["reportSubmission", "reportReview"] },
  {
    name: "Hoàn thiện",
    hint: "Bản chỉnh sửa",
    keys: ["revisedReportSubmission", "revisedReportReview"],
  },
];

interface Phase {
  name: string;
  hint: string;
  items: { m: MilestoneView; state: MilestoneState }[];
  status: "done" | "current" | "upcoming";
}

function buildPhases(milestones: MilestoneView[], nowMs: number): Phase[] {
  const known = new Set(PHASES.flatMap((p) => p.keys));
  const groups = PHASES.map((p) => ({
    name: p.name,
    hint: p.hint,
    list: milestones.filter((m) => p.keys.includes(m.key)),
  }));
  const others = milestones.filter((m) => !known.has(m.key));
  if (others.length > 0) groups.push({ name: "Khác", hint: "Mốc bổ sung", list: others });

  const withState = groups
    .filter((g) => g.list.length > 0)
    .map((g) => ({
      ...g,
      items: g.list.map((m) => ({ m, state: milestoneState(m, nowMs) })),
    }));

  // Chặng hiện tại = chặng đầu tiên còn mốc chưa xong
  const currentIdx = withState.findIndex((g) => g.items.some((i) => i.state !== "done"));
  return withState.map((g, i) => ({
    name: g.name,
    hint: g.hint,
    items: g.items,
    status: currentIdx === -1 || i < currentIdx ? "done" : i === currentIdx ? "current" : "upcoming",
  }));
}

function remainingLabel(endAt: string | null, nowMs: number): string | null {
  if (!endAt) return null;
  const days = Math.ceil((Date.parse(endAt) - nowMs) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return "hôm nay";
  return `còn ${days} ngày`;
}

function StateIcon({ state }: { state: MilestoneState }) {
  if (state === "done") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success/20 text-success-fg">
        <Check className="h-3 w-3" />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      </span>
    );
  }
  return <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground/60" />;
}

export function MilestoneRoadmap({
  milestones,
  nowMs,
}: {
  milestones: MilestoneView[];
  nowMs: number;
}) {
  const phases = buildPhases(milestones, nowMs);
  const total = milestones.length;
  const doneCount = milestones.filter((m) => milestoneState(m, nowMs) === "done").length;

  return (
    <Card>
      <CardHeader
        icon={<Flag />}
        title="Lộ trình đồ án"
        action={
          total > 0 && (
            <Badge tone={doneCount === total ? "success" : "primary"}>
              {doneCount}/{total} mốc
            </Badge>
          )
        }
      />

      {phases.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
          Chưa có mốc nào. Làm mới để lấy lịch của đợt đồ án từ trường.
        </p>
      ) : (
        <ol className="mt-stagger grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[repeat(var(--phases),minmax(0,1fr))]" style={{ ["--phases" as string]: phases.length }}>
          {phases.map((phase, i) => {
            const doneInPhase = phase.items.filter((it) => it.state === "done").length;
            return (
              <li key={phase.name} className="relative flex flex-col">
                {/* Thanh nối các chặng (chỉ hiện ở màn hình rộng) */}
                <div className="mb-3 hidden items-center lg:flex">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 font-display text-sm font-bold",
                      phase.status === "done" && "border-success bg-success text-white",
                      phase.status === "current" && "border-primary bg-primary text-primary-foreground shadow-sm",
                      phase.status === "upcoming" && "border-border bg-card text-muted-foreground"
                    )}
                  >
                    {phase.status === "done" ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  {i < phases.length - 1 && (
                    <span
                      className={cn(
                        "ml-2 h-0.5 flex-1 rounded-full",
                        phase.status === "done" ? "bg-success/60" : "bg-border"
                      )}
                    />
                  )}
                </div>

                <div
                  className={cn(
                    "flex-1 rounded-xl border p-3.5 transition-colors",
                    phase.status === "current" && "border-primary/40 bg-primary/5",
                    phase.status === "done" && "bg-muted/20",
                    phase.status === "upcoming" && "bg-card"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-display text-sm font-semibold text-foreground">
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold lg:hidden",
                            phase.status === "done" && "bg-success text-white",
                            phase.status === "current" && "bg-primary text-primary-foreground",
                            phase.status === "upcoming" && "bg-muted text-muted-foreground"
                          )}
                        >
                          {i + 1}
                        </span>
                        {phase.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{phase.hint}</p>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {doneInPhase}/{phase.items.length}
                    </span>
                  </div>

                  <ul className="mt-3 space-y-2.5">
                    {phase.items.map(({ m, state }) => {
                      const range = fmtVnRange(m.startAt, m.endAt);
                      const left = state === "active" ? remainingLabel(m.endAt, nowMs) : null;
                      return (
                        <li key={m.id} className={cn("flex items-start gap-2", state === "done" && "opacity-60")}>
                          <span className="mt-0.5">
                            <StateIcon state={state} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium leading-snug text-foreground">
                              {m.title}
                              {m.source === "PERSONAL" && (
                                <Badge className="ml-1.5 align-middle">Cá nhân</Badge>
                              )}
                            </p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {state === "unannounced" ? (
                                <span className="font-sans italic">Chưa công bố</span>
                              ) : (
                                range
                              )}
                              {left && <span className="ml-1.5 font-sans font-semibold text-primary">· {left}</span>}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
