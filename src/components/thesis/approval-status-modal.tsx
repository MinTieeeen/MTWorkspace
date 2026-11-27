"use client";

import { AlertCircle, Check, CircleDashed, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import {
  approvalStepState,
  thesisStatusLabel,
  type StepState,
} from "@/lib/thesis/milestones";
import type { ProjectView } from "@/lib/thesis/types";

const STYLE: Record<StepState, { ring: string; icon: React.ReactNode; text: string }> = {
  done: {
    ring: "border-success/40 bg-success/10 text-success-fg",
    icon: <Check className="h-4 w-4" />,
    text: "Hoàn tất",
  },
  pending: {
    ring: "border-warning/40 bg-warning/10 text-warning-fg",
    icon: <Clock className="h-4 w-4" />,
    text: "Đang chờ",
  },
  rejected: {
    ring: "border-danger/40 bg-danger/10 text-danger-fg",
    icon: <AlertCircle className="h-4 w-4" />,
    text: "Bị từ chối",
  },
  unknown: {
    ring: "bg-muted text-muted-foreground",
    icon: <CircleDashed className="h-4 w-4" />,
    text: "Chưa có thông tin",
  },
};

export function ApprovalStatusModal({
  open,
  onClose,
  project,
}: {
  open: boolean;
  onClose: () => void;
  project: ProjectView | null;
}) {
  const steps = [
    { label: "Duyệt đề tài", desc: "Bộ môn và ngành duyệt đề tài", status: project?.status },
    { label: "Phản biện", desc: "Giảng viên phản biện nhận xét", status: project?.reviewerStatus },
    { label: "Hội đồng", desc: "Hội đồng bảo vệ đánh giá", status: project?.committeeStatus },
  ];

  return (
    <Modal open={open} onClose={onClose} size="sm" label="Trạng thái xét duyệt">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <p className="text-xs font-semibold text-primary">Đồ án</p>
          <h2 className="mt-0.5 font-display text-base font-bold text-foreground">
            Trạng thái xét duyệt
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ol className="space-y-0 overflow-y-auto px-5 py-4">
        {steps.map((s, i) => {
          const st = approvalStepState(s.status);
          const style = STYLE[st];
          return (
            <li key={s.label} className="relative flex gap-3 pb-5 last:pb-0">
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5",
                    st === "done" ? "bg-success/50" : "bg-border"
                  )}
                />
              )}
              <span
                className={cn(
                  "z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
                  style.ring
                )}
              >
                {style.icon}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="font-display text-sm font-semibold text-foreground">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
                <p className={cn("mt-1 text-[13px] font-semibold", style.ring.split(" ").pop())}>
                  {s.status ? thesisStatusLabel(s.status) : style.text}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}
