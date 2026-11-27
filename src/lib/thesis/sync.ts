import { prisma } from "@/lib/prisma";
import { cseGet, getCseSession } from "./cse-client";
import { ThesisError, classifyThesisError } from "./errors";
import {
  contentHash,
  normalizeCommittee,
  normalizeProject,
  normalizeTimeline,
} from "./normalize";

/** Chỉ đồng bộ khi dữ liệu cũ hơn ngần này, trừ khi người dùng bấm làm mới */
const MIN_SYNC_INTERVAL_MS = 15 * 60 * 1000;
/** Chặn bấm làm mới liên tục */
const MIN_FORCE_INTERVAL_MS = 20 * 1000;
/** Sau lần thất bại không phải do đăng nhập, chờ ngần này mới tự thử lại */
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
/** Số lần đăng nhập thất bại liên tiếp trước khi dừng hẳn (tránh gửi token sai mãi) */
const MAX_AUTH_FAILS = 2;

export interface SyncResult {
  skipped: boolean;
  changed: boolean;
}

export function findHcmutAccount(userId: string) {
  return prisma.googleAccount.findFirst({
    where: { userId, accountType: "HCMUT" },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });
}

const json = (v: unknown) => JSON.stringify(v);

/**
 * Đồng bộ đồ án của người dùng từ hệ thống trường (CHỈ ĐỌC) vào database.
 * Không bao giờ lưu token, cookie hay nguyên văn phản hồi của trường.
 */
export async function syncThesis(
  userId: string,
  opts: { force?: boolean } = {}
): Promise<SyncResult> {
  const now = Date.now();
  const conn = await prisma.projectCseConnection.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  if (!opts.force) {
    if (conn.authState === "NEEDS_REAUTH" && conn.authFailCount >= MAX_AUTH_FAILS) {
      throw new ThesisError("SSO_EXPIRED");
    }
    if (conn.lastSyncedAt && now - conn.lastSyncedAt.getTime() < MIN_SYNC_INTERVAL_MS) {
      return { skipped: true, changed: false };
    }
    if (
      conn.lastError &&
      conn.lastAttemptAt &&
      now - conn.lastAttemptAt.getTime() < FAILURE_COOLDOWN_MS
    ) {
      return { skipped: true, changed: false };
    }
  } else if (
    conn.lastAttemptAt &&
    now - conn.lastAttemptAt.getTime() < MIN_FORCE_INTERVAL_MS
  ) {
    return { skipped: true, changed: false };
  }

  await prisma.projectCseConnection.update({
    where: { userId },
    data: { lastAttemptAt: new Date(now) },
  });

  try {
    const account = await findHcmutAccount(userId);
    if (!account) throw new ThesisError("NOT_CONNECTED");

    const session = await getCseSession(userId, account.id);

    const mine = await cseGet<unknown[]>(userId, session, "/projects/my-projects");
    const ids = (Array.isArray(mine) ? mine : [])
      .map((p) => (p as { id?: unknown } | null)?.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .slice(0, 10);

    let changedAny = false;
    let lastFailure: unknown = null;
    for (const remoteId of ids) {
      try {
        if (await syncOneProject(userId, session, remoteId)) changedAny = true;
      } catch (err) {
        // Lỗi đăng nhập thì dừng hẳn; lỗi riêng một đồ án thì vẫn đồng bộ các đồ án còn lại
        if (classifyThesisError(err) === "SSO_EXPIRED") throw err;
        lastFailure = err;
      }
    }
    // Không đồng bộ được đồ án nào thì báo lỗi, tránh đánh dấu thành công giả
    if (ids.length > 0 && lastFailure && !changedAny) {
      const stored = await prisma.thesisProject.count({ where: { userId, source: "REMOTE" } });
      if (stored === 0) throw lastFailure;
    }

    await markOk(userId, account.id);
    return { skipped: false, changed: changedAny };
  } catch (err) {
    const code = classifyThesisError(err);
    const failCount = code === "SSO_EXPIRED" ? conn.authFailCount + 1 : conn.authFailCount;
    await prisma.projectCseConnection.update({
      where: { userId },
      data: {
        authFailCount: failCount,
        authState:
          code === "SSO_EXPIRED" && failCount >= MAX_AUTH_FAILS
            ? "NEEDS_REAUTH"
            : code === "NOT_CONNECTED"
            ? "NEEDS_REAUTH"
            : "BACKOFF",
        lastError: code, // chỉ lưu mã lỗi, không lưu nội dung có thể chứa dữ liệu nhạy cảm
      },
    });
    throw err;
  }
}

type CseSession = Awaited<ReturnType<typeof getCseSession>>;

/** Đồng bộ một đồ án; trả về true nếu nội dung có thay đổi */
async function syncOneProject(
  userId: string,
  session: CseSession,
  remoteId: string
): Promise<boolean> {
    const detail = await cseGet<{ projectBatch?: { id?: string } }>(
      userId,
      session,
      `/projects/${remoteId}`
    );
    const batchId = detail?.projectBatch?.id;

    const [timeline, registered, committee] = await Promise.all([
      batchId
        ? cseGet(userId, session, `/project-batches/${batchId}/timeline`, { allowNotFound: true })
        : null,
      batchId
        ? cseGet(userId, session, `/project-batches/${batchId}/registered-students/me`, { allowNotFound: true })
        : null,
      cseGet(userId, session, `/project-committee/projects/${remoteId}/committee`, { allowNotFound: true }),
    ]);

    const project = normalizeProject(detail, registered);
    if (!project) throw new ThesisError("UPSTREAM");
    const milestones = normalizeTimeline(timeline);
    const normCommittee = normalizeCommittee(committee);
    const hash = contentHash({ project, milestones, committee: normCommittee });

    const existing = await prisma.thesisProject.findUnique({
      where: { userId_remoteId: { userId, remoteId: project.remoteId } },
      select: { id: true, contentHash: true },
    });
    // Đồ án nhập tay trước đó được chuyển thành đồ án đồng bộ, giữ nguyên id để không mất cuộc họp
    const manual = existing
      ? null
      : await prisma.thesisProject.findFirst({
          where: { userId, source: "MANUAL" },
          select: { id: true },
        });

    const fields = {
      source: "REMOTE",
      remoteId: project.remoteId,
      customId: project.customId,
      titleVi: project.titleVi,
      titleEn: project.titleEn,
      descriptionJson: json(project.description),
      requirementsJson: json(project.requirements),
      referencesJson: json(project.references),
      status: project.status,
      reviewerStatus: project.reviewerStatus,
      committeeStatus: project.committeeStatus,
      batchId: project.batchId,
      batchName: project.batchName,
      semesterName: project.semesterName,
      projectType: project.projectType,
      major: project.major,
      department: project.department,
      supervisorJson: json(project.supervisor),
      coSupervisorsJson: json(project.coSupervisors),
      membersJson: json(project.members),
      isRegistered: project.isRegistered,
      isDeferred: project.isDeferred,
      contentHash: hash,
      syncedAt: new Date(),
    };

    const saved = existing
      ? await prisma.thesisProject.update({ where: { id: existing.id }, data: fields })
      : manual
      ? await prisma.thesisProject.update({ where: { id: manual.id }, data: fields })
      : await prisma.thesisProject.create({ data: { userId, ...fields } });

    await prisma.$transaction([
      prisma.thesisMilestone.deleteMany({ where: { projectId: saved.id, source: "SCHOOL" } }),
      prisma.thesisMilestone.createMany({
        data: milestones.map((m) => ({
          projectId: saved.id,
          source: "SCHOOL",
          key: m.key,
          title: m.title,
          startAt: m.startAt,
          endAt: m.endAt,
          sortOrder: m.sortOrder,
        })),
      }),
    ]);

    if (normCommittee) {
      const cFields = {
        source: "REMOTE",
        remoteId: normCommittee.remoteId,
        name: normCommittee.name,
        status: normCommittee.status,
        startAt: normCommittee.startAt,
        campus: normCommittee.campus,
        room: normCommittee.room,
        language: normCommittee.language,
        chairJson: json(normCommittee.chair),
        secretaryJson: json(normCommittee.secretary),
        membersJson: json(normCommittee.members),
        projectCount: normCommittee.projectCount,
        contentHash: contentHash(normCommittee),
        syncedAt: new Date(),
      };
      await prisma.thesisCommittee.upsert({
        where: { projectId: saved.id },
        create: { projectId: saved.id, ...cFields },
        update: cFields,
      });
    } else {
      await prisma.thesisCommittee.deleteMany({
        where: { projectId: saved.id, source: "REMOTE" },
      });
    }

    return !existing || existing.contentHash !== hash;
}

async function markOk(userId: string, googleAccountId: string) {
  await prisma.projectCseConnection.update({
    where: { userId },
    data: {
      googleAccountId,
      authState: "OK",
      authFailCount: 0,
      lastError: null,
      lastSyncedAt: new Date(),
    },
  });
}
