"use client";

import {
  BookOpenText,
  ChevronRight,
  Copy,
  Gavel,
  MapPin,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ExamCountdown } from "@/components/mybk/exam-countdown";
import { approvalStepState, type StepState } from "@/lib/thesis/milestones";
import { fmtVnDate, fmtVnDateLong, fmtVnTime } from "@/lib/thesis/format";
import type { CommitteeView, PersonView, ProjectView } from "@/lib/thesis/types";

export function copyText(text: string, what: string) {
  navigator.clipboard
    ?.writeText(text)
    .then(() => toast.success(`Đã chép ${what}`))
    .catch(() => toast.error("Không chép được"));
}

/** Một người (GVHD, thành viên, hội đồng): tên + email (chép được). `compact` gọn một dòng */
function PersonLine({
  person,
  hint,
  compact = false,
}: {
  person: PersonView;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", compact ? "py-1.5" : "py-2")}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground" title={person.email ?? undefined}>
          {person.name}
          {hint && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">{hint}</span>
          )}
        </p>
        {!compact && person.email && (
          <p className="truncate font-mono text-xs text-muted-foreground">{person.email}</p>
        )}
      </div>
      {person.email && (
        <button
          type="button"
          onClick={() => copyText(person.email!, "email")}
          aria-label={`Chép email ${person.name}`}
          title={compact ? `Chép ${person.email}` : "Chép email"}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

const DOT: Record<StepState, string> = {
  done: "bg-success",
  pending: "bg-warning",
  rejected: "bg-danger",
  unknown: "bg-muted-foreground/40",
};

/** Thẻ hồ sơ đồ án (gọn): đề tài, người hướng dẫn, nhóm; trạng thái xét duyệt mở ở modal riêng */
export function ProjectCard({
  project,
  onOpenDetail,
  onOpenStatus,
}: {
  project: ProjectView;
  onOpenDetail: () => void;
  onOpenStatus: () => void;
}) {
  const steps = [project.status, project.reviewerStatus, project.committeeStatus];
  const meta = [project.semesterName, project.major].filter(Boolean).join(" · ");

  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={<BookOpenText />}
        title="Hồ sơ đồ án"
        action={
          <button
            type="button"
            onClick={onOpenDetail}
            className="text-[13px] font-semibold text-primary hover:underline"
          >
            Nội dung đề tài
          </button>
        }
      />
      <div className="space-y-3.5 p-5">
        <div>
          <h2 className="font-display text-base font-bold leading-snug text-foreground">
            {project.titleVi || project.titleEn || "Chưa có tên đề tài"}
          </h2>
          {project.titleEn && project.titleVi && (
            <p className="mt-1 line-clamp-1 text-xs italic text-muted-foreground" title={project.titleEn}>
              {project.titleEn}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {project.customId && <Badge>{project.customId}</Badge>}
            {project.isRegistered === true && <Badge tone="success">Đã đăng ký</Badge>}
            {project.isDeferred === true && <Badge tone="warning">Hoãn</Badge>}
            {project.source === "MANUAL" && <Badge>Nhập tay</Badge>}
            {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
          </div>
        </div>

        {(project.supervisor || project.coSupervisors.length > 0) && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Giảng viên hướng dẫn</p>
            <div className="divide-y">
              {project.supervisor && <PersonLine person={project.supervisor} compact />}
              {project.coSupervisors.map((p, i) => (
                <PersonLine
                  key={`${p.email ?? p.name}-${i}`}
                  person={p}
                  hint="đồng hướng dẫn"
                  compact
                />
              ))}
            </div>
          </div>
        )}

        {project.members.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Thành viên ({project.members.length})
            </p>
            <div className="divide-y">
              {project.members.map((m, i) => (
                <PersonLine
                  key={`${m.studentId ?? m.name}-${i}`}
                  person={{ name: m.name, email: m.email }}
                  hint={m.studentId ?? undefined}
                  compact
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Chân thẻ: tóm tắt trạng thái, bấm mở modal chi tiết */}
      <button
        type="button"
        onClick={onOpenStatus}
        className="flex items-center justify-between gap-3 border-t bg-muted/25 px-5 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <span className="flex items-center gap-2.5">
          <span className="flex items-center gap-1" aria-hidden>
            {steps.map((s, i) => (
              <span key={i} className={cn("h-2 w-2 rounded-full", DOT[approvalStepState(s)])} />
            ))}
          </span>
          <span className="text-[13px] font-semibold text-foreground">Trạng thái xét duyệt</span>
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>
    </Card>
  );
}

/** Thẻ hội đồng bảo vệ (nháp / chính thức) */
export function CommitteeCard({
  committee,
  nowMs,
}: {
  committee: CommitteeView;
  nowMs: number;
}) {
  const official = /published|finalized|official/i.test(committee.status ?? "");
  const when = committee.startAt;
  const past = when ? Date.parse(when) < nowMs : false;
  const people: { p: PersonView; role: string }[] = [
    ...(committee.chair ? [{ p: committee.chair, role: "Chủ tịch" }] : []),
    ...(committee.secretary ? [{ p: committee.secretary, role: "Thư ký" }] : []),
    ...committee.members.map((p) => ({ p, role: "Ủy viên" })),
  ];

  return (
    <Card>
      <CardHeader
        icon={<Gavel />}
        title="Hội đồng bảo vệ"
        action={
          committee.source === "REMOTE" ? (
            <Badge tone={official ? "success" : "warning"}>
              {official ? "Chính thức" : "Dự kiến"}
            </Badge>
          ) : (
            <Badge>Nhập tay</Badge>
          )
        }
      />
      <div className="space-y-3 p-5">
        {when ? (
          <div className="rounded-xl border bg-muted/30 px-4 py-3">
            <p className="font-display text-sm font-semibold text-foreground">
              {fmtVnDateLong(when)}
              <span className="font-mono"> · {fmtVnTime(when)}</span>
            </p>
            {(committee.room || committee.campus) && (
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {[committee.room, committee.campus].filter(Boolean).join(" · ")}
              </p>
            )}
            {!past && (
              <div className="mt-3">
                <ExamCountdown targetMs={Date.parse(when)} />
              </div>
            )}
            {past && (
              <p className="mt-2 text-xs text-muted-foreground">
                Đã diễn ra ngày {fmtVnDate(when)}
              </p>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">Chưa có lịch bảo vệ.</p>
        )}

        {committee.name && <p className="text-xs text-muted-foreground">{committee.name}</p>}

        {people.length > 0 && (
          <div className="divide-y">
            {people.map(({ p, role }, i) => (
              <PersonLine key={`${p.email ?? p.name}-${i}`} person={p} hint={role} compact />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
