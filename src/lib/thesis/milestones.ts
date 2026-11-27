// Logic hiển thị mốc thời gian đồ án (thuần, dùng được cả ở client).

import type { CommitteeView, MilestoneView } from "./types";

export type MilestoneState = "unannounced" | "done" | "active" | "upcoming";

export function milestoneState(m: MilestoneView, nowMs: number): MilestoneState {
  const start = m.startAt ? Date.parse(m.startAt) : null;
  const end = m.endAt ? Date.parse(m.endAt) : null;
  if (m.doneAt) return "done";
  if (start === null && end === null) return "unannounced";
  if (end !== null && end < nowMs) return "done";
  if (start !== null && start > nowMs) return "upcoming";
  // Có ngày kết thúc chưa tới, và đã qua ngày bắt đầu (hoặc không có ngày bắt đầu)
  return end !== null || (start !== null && start <= nowMs) ? "active" : "upcoming";
}

export interface NextThesisEvent {
  kind: "milestone" | "committee";
  title: string;
  /** Mốc đếm ngược */
  atMs: number;
  /** "Hạn" khi đang trong khoảng thời gian, "Bắt đầu" khi chưa tới */
  phase: "deadline" | "start" | "defense";
}

/** Sự kiện sắp tới gần nhất: hạn của mốc đang diễn ra, ngày bắt đầu mốc sắp tới, hoặc buổi bảo vệ */
export function nextThesisEvent(
  milestones: MilestoneView[],
  committee: CommitteeView | null,
  nowMs: number
): NextThesisEvent | null {
  const candidates: NextThesisEvent[] = [];

  for (const m of milestones) {
    const state = milestoneState(m, nowMs);
    if (state === "active" && m.endAt) {
      candidates.push({
        kind: "milestone",
        title: m.title,
        atMs: Date.parse(m.endAt),
        phase: "deadline",
      });
    } else if (state === "upcoming") {
      const at = m.startAt ?? m.endAt;
      if (at) {
        candidates.push({
          kind: "milestone",
          title: m.title,
          atMs: Date.parse(at),
          phase: "start",
        });
      }
    }
  }

  if (committee?.startAt) {
    const at = Date.parse(committee.startAt);
    if (at > nowMs) {
      candidates.push({
        kind: "committee",
        title: "Bảo vệ trước hội đồng",
        atMs: at,
        phase: "defense",
      });
    }
  }

  candidates.sort((a, b) => a.atMs - b.atMs);
  return candidates[0] ?? null;
}

/** Nhãn tiếng Việt cho trạng thái đồ án / hội đồng; giá trị lạ hiển thị nguyên văn */
const STATUS_LABELS: Record<string, string> = {
  department_approved: "Đã duyệt cấp TCM",
  approved: "Đã duyệt",
  pending: "Chờ duyệt",
  rejected: "Bị từ chối",
  draft: "Nháp",
  published: "Chính thức",
  finalized: "Chính thức",
};

export function thesisStatusLabel(status: string | null | undefined): string {
  if (!status) return "Chưa có";
  return STATUS_LABELS[status] ?? status;
}

export type StepState = "done" | "pending" | "rejected" | "unknown";

export function approvalStepState(status: string | null | undefined): StepState {
  if (!status) return "unknown";
  if (/reject/i.test(status)) return "rejected";
  if (/^(approved|department_approved|published|finalized)$/i.test(status)) return "done";
  if (/pending|draft/i.test(status)) return "pending";
  return "unknown";
}
