import { prisma } from "@/lib/prisma";
import { parseVnDateTime } from "./normalize";

/** Nguồn nhập tay: dùng khi chưa liên kết tài khoản hoặc muốn ghi chú riêng. Chỉ có một đồ án nhập tay mỗi người. */

export interface ManualProjectInput {
  titleVi: string;
  supervisorName?: string;
  supervisorEmail?: string;
  members?: string[];
  batchName?: string;
  /** `YYYY-MM-DDTHH:mm` (giờ Việt Nam) */
  defenseAt?: string;
  defenseCampus?: string;
  defenseRoom?: string;
}

export class ManualInputError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "ManualInputError";
  }
}

const clean = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
};

export function parseManualInput(body: unknown): ManualProjectInput {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const titleVi = clean(b.titleVi, 300);
  if (!titleVi) throw new ManualInputError("Cần nhập tên đề tài");

  const email = clean(b.supervisorEmail, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ManualInputError("Email giảng viên không hợp lệ");
  }
  const defenseAt = clean(b.defenseAt, 32);
  if (defenseAt && !parseVnDateTime(defenseAt)) {
    throw new ManualInputError("Ngày giờ bảo vệ không hợp lệ");
  }
  const members = Array.isArray(b.members)
    ? b.members
        .map((m) => clean(m, 120))
        .filter((m): m is string => Boolean(m))
        .slice(0, 10)
    : [];

  return {
    titleVi,
    supervisorName: clean(b.supervisorName, 120),
    supervisorEmail: email,
    members,
    batchName: clean(b.batchName, 200),
    defenseAt,
    defenseCampus: clean(b.defenseCampus, 40),
    defenseRoom: clean(b.defenseRoom, 60),
  };
}

export async function saveManualProject(userId: string, input: ManualProjectInput) {
  // Đã có đồ án đồng bộ từ trường thì không cho nhập tay (tránh hai nguồn chồng nhau)
  const remote = await prisma.thesisProject.findFirst({
    where: { userId, source: "REMOTE" },
    select: { id: true },
  });
  if (remote) {
    throw new ManualInputError(
      "Đồ án đã được đồng bộ từ hệ thống trường, không cần nhập tay",
      409
    );
  }

  const fields = {
    source: "MANUAL",
    titleVi: input.titleVi,
    batchName: input.batchName ?? null,
    supervisorJson: input.supervisorName
      ? JSON.stringify({ name: input.supervisorName, email: input.supervisorEmail ?? null })
      : null,
    membersJson: JSON.stringify(
      (input.members ?? []).map((name) => ({ studentId: null, name, email: null }))
    ),
    syncedAt: new Date(),
  };

  const existing = await prisma.thesisProject.findFirst({
    where: { userId, source: "MANUAL" },
    select: { id: true },
  });
  const project = existing
    ? await prisma.thesisProject.update({ where: { id: existing.id }, data: fields })
    : await prisma.thesisProject.create({ data: { userId, ...fields } });

  const startAt = input.defenseAt ? parseVnDateTime(input.defenseAt) : null;
  if (startAt || input.defenseCampus || input.defenseRoom) {
    const cFields = {
      source: "MANUAL",
      name: "Hội đồng bảo vệ",
      startAt,
      campus: input.defenseCampus ?? null,
      room: input.defenseRoom ?? null,
      syncedAt: new Date(),
    };
    await prisma.thesisCommittee.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id, ...cFields },
      update: cFields,
    });
  } else {
    await prisma.thesisCommittee.deleteMany({
      where: { projectId: project.id, source: "MANUAL" },
    });
  }
  return project.id;
}
