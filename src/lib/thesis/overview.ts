import { prisma } from "@/lib/prisma";
import { findHcmutAccount } from "./sync";
import type {
  BilingualText,
  CommitteeView,
  MemberView,
  MilestoneView,
  PersonView,
  ProjectOption,
  ProjectView,
  ThesisPayload,
} from "./types";

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const emptyText: BilingualText = { vi: null, en: null };

/** Mốc thời gian muộn nhất của đồ án, dùng để biết đồ án nào thuộc đợt mới nhất */
function latestTime(p: {
  createdAt: Date;
  milestones: { startAt: Date | null; endAt: Date | null }[];
  committee: { startAt: Date | null } | null;
}): number {
  let t = p.createdAt.getTime();
  for (const m of p.milestones) {
    t = Math.max(t, m.endAt?.getTime() ?? 0, m.startAt?.getTime() ?? 0);
  }
  return Math.max(t, p.committee?.startAt?.getTime() ?? 0);
}

/**
 * Đọc đồ án đã lưu của người dùng (không gọi hệ thống trường).
 * `projectId` chọn đồ án cần xem; không có hoặc không hợp lệ thì lấy đồ án thuộc đợt mới nhất.
 */
export async function getThesisOverview(
  userId: string,
  projectId?: string | null
): Promise<ThesisPayload> {
  const [account, conn, all] = await Promise.all([
    findHcmutAccount(userId),
    prisma.projectCseConnection.findUnique({ where: { userId } }),
    prisma.thesisProject.findMany({
      where: { userId },
      include: {
        milestones: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        committee: true,
      },
    }),
  ]);

  // Mới nhất trước; đồ án đồng bộ từ trường ưu tiên hơn nhập tay khi ngang nhau
  const sorted = [...all].sort(
    (a, b) =>
      latestTime(b) - latestTime(a) ||
      (a.source === "REMOTE" ? -1 : 1) - (b.source === "REMOTE" ? -1 : 1)
  );
  const project =
    sorted.find((p) => p.id === projectId) ?? sorted[0] ?? null;

  const projects: ProjectOption[] = sorted.map((p) => ({
    id: p.id,
    source: p.source === "MANUAL" ? "MANUAL" : "REMOTE",
    title: p.titleVi || p.titleEn || "Đồ án chưa đặt tên",
    label: p.customId || p.batchName || (p.source === "MANUAL" ? "Nhập tay" : "Đồ án"),
    semesterName: p.semesterName,
  }));

  const view: ProjectView | null = project
    ? {
        id: project.id,
        source: project.source === "MANUAL" ? "MANUAL" : "REMOTE",
        customId: project.customId,
        titleVi: project.titleVi,
        titleEn: project.titleEn,
        description: parseJson(project.descriptionJson, emptyText),
        requirements: parseJson(project.requirementsJson, emptyText),
        references: parseJson(project.referencesJson, emptyText),
        status: project.status,
        reviewerStatus: project.reviewerStatus,
        committeeStatus: project.committeeStatus,
        batchName: project.batchName,
        semesterName: project.semesterName,
        projectType: project.projectType,
        major: project.major,
        department: project.department,
        supervisor: parseJson<PersonView | null>(project.supervisorJson, null),
        coSupervisors: parseJson<PersonView[]>(project.coSupervisorsJson, []),
        members: parseJson<MemberView[]>(project.membersJson, []),
        isRegistered: project.isRegistered,
        isDeferred: project.isDeferred,
        syncedAt: iso(project.syncedAt),
      }
    : null;

  const milestones: MilestoneView[] = (project?.milestones ?? []).map((m) => ({
    id: m.id,
    source: m.source === "PERSONAL" ? "PERSONAL" : "SCHOOL",
    key: m.key,
    title: m.title,
    startAt: iso(m.startAt),
    endAt: iso(m.endAt),
    doneAt: iso(m.doneAt),
  }));

  const c = project?.committee;
  const committee: CommitteeView | null = c
    ? {
        source: c.source === "MANUAL" ? "MANUAL" : "REMOTE",
        name: c.name,
        status: c.status,
        startAt: iso(c.startAt),
        campus: c.campus,
        room: c.room,
        chair: parseJson<PersonView | null>(c.chairJson, null),
        secretary: parseJson<PersonView | null>(c.secretaryJson, null),
        members: parseJson<PersonView[]>(c.membersJson, []),
        projectCount: c.projectCount,
      }
    : null;

  return {
    linked: Boolean(account),
    projects,
    project: view,
    milestones,
    committee,
    lastSyncedAt: iso(conn?.lastSyncedAt) ?? view?.syncedAt ?? null,
    authState: conn?.authState ?? null,
  };
}
