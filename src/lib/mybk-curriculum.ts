import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { prisma } from "./prisma";
import {
  decryptCredential,
  ensureValidMyBkJwt,
  loginMyBkCasSso,
  SWR_STALE_THRESHOLD_MS,
} from "./mybk";

const MYBK_CTDT_OVERVIEW_API =
  "https://mybk.hcmut.edu.vn/api/share/ket-qua-hoc-tap/thong-tin-mo-ta-ctdt/v2?tuychon=VIEWONLINE";
const MYBK_CTDT_COURSES_API =
  "https://mybk.hcmut.edu.vn/api/share/ket-qua-hoc-tap/danh-sach-mon-hoc-ctdt/v2";
const MYBK_CTDT_OUTSIDE_API =
  "https://mybk.hcmut.edu.vn/api/share/ket-qua-hoc-tap/danh-sach-mon-hoc-ngoai-/v2?tuychon=VIEW_CTDT_SINHVIEN";

const CURRICULUM_CACHE_PATH = path.join(
  process.cwd(),
  ".mybk-curriculum-cache.json"
);

export interface CurriculumOverview {
  masv: string;
  malop: string;
  hovaten: string;
  sotctl: string;      // e.g. "116/128"
  tbtlhe10: string;    // e.g. "8.38/10"
  tbtlhe4: string;     // e.g. "3.5/4.0"
  capnhatcuoi: string; // e.g. "18/09/2026 05:24"
  mactdt: string;      // e.g. "DH_CQ_MT_KHM_2023"
  namapdung: string;   // e.g. "2023"
  tenctdt: string;     // e.g. "Khoa học Máy tính"
  tenctdtmorong: string;
  tenkhoa: string;     // e.g. "Khoa Khoa học và Kỹ thuật Máy tính"
}

export interface RawMyBkCurriculumItem {
  stt: number;
  tcyeucau: number;
  mhyeucau: number;
  tcdat: number;
  mhdat: number;
  loainhomkhoikienthuc: string;
  khoikienthucid: number;
  tenkhoikienthuc: string;
  loaikhoikienthuc: string;
  hoanthanh: string;
  khoikienthucbatbuoc: string;
  uniqueid: string;
  monhocid: number | null;
  mamonhoc: string | null;
  tenmonhoc: string | null;
  sotc: number | null;
  diemso: number | null;
  diemchu: string | null;
  diemdat: string | null;
  douutien: number | null;
  hieuluc: string | null;
  tamdat: string | null;
  xetchontctd: string | number | null;
  ghichu: string | null;
  monhoctuongduongid: number | null;
}

export interface RawMyBkOutsideCourse {
  maMonHoc: string;
  tenMonHoc: string;
  soTinChi: number;
  diemSo: number | null;
  diemChu: string | null;
  ghiChu: string | null;
}

export interface NormalizedCurriculumCourse {
  uniqueKey: string;
  subjectId: number | null;
  subjectCode: string;
  subjectName: string;
  credits: number;
  numericScore: number | null;
  letterGrade: string | null;
  isPassed: boolean;
  isEffective: boolean;
  freeElectiveRef: string | null;
  note: string | null;
  inCurrentTimetable?: boolean;
  isRetakeInCurrentSem?: boolean;
}

export interface NormalizedCurriculumBlock {
  blockId: number;
  blockCode: string;
  blockName: string;
  subLabel?: string;
  blockTypeLabel: string; // "Bắt buộc" | "Tự chọn"
  isRequiredBlock: boolean;
  isBlockCompleted: boolean;
  stt: number;
  requiredCredits: number;
  earnedCredits: number;
  requiredSubjects: number;
  earnedSubjects: number;
  courses: NormalizedCurriculumCourse[];
}

export interface NormalizedOutsideCourse {
  maMonHoc: string;
  tenMonHoc: string;
  soTinChi: number;
  diemSo: number | null;
  diemChu: string | null;
  ghiChu: string | null;
  countedAsFreeElective: boolean;
}

export interface CurriculumProgressPayload {
  connected: boolean;
  studentId: string | null;
  isStale: boolean;
  lastSyncedAt: string | null;
  currentSemesterCode: string;
  inProgressNewCredits: number;
  inProgressCourseCodes: string[];
  retakeCourseCodes: string[];
  overview: CurriculumOverview | null;
  blocks: NormalizedCurriculumBlock[];
  outsideCourses: NormalizedOutsideCourse[];
}

interface CurriculumCacheFile {
  connected: boolean;
  studentId: string;
  lastSyncedAt: string;
  overview: CurriculumOverview | null;
  rawItems: RawMyBkCurriculumItem[];
  outsideCourses: RawMyBkOutsideCourse[];
}

function stripHtmlTags(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/<[^>]*>/g, "").trim();
}

function normalizeLetterAndScore(
  diemso: number | null,
  diemchu: string | null
): { numericScore: number | null; letterGrade: string | null } {
  const l = (diemchu || "").trim().toUpperCase();
  if (diemso === 12 || l === "MT") {
    return { numericScore: 12, letterGrade: "MT" };
  }
  if (diemso === 21 || l === "DT") {
    return { numericScore: 21, letterGrade: "DT" };
  }
  if (diemso === 17 || l === "RT") {
    return { numericScore: 17, letterGrade: "RT" };
  }
  return {
    numericScore: diemso !== null && diemso !== undefined ? Number(diemso) : null,
    letterGrade: l && l !== "--" ? l : null,
  };
}

/**
 * Groups flat danh-sach-mon-hoc-ctdt/v2 rows into structured knowledge blocks by `khoikienthucid`,
 * resolves sub-block names when multiple blocks share "Chuyên ngành",
 * links `xetchontctd` free elective courses into block `90241` ("Tự chọn tự do"),
 * and overlays current semester timetable registrations.
 */
export function buildStructuredCurriculum(options: {
  rawItems: RawMyBkCurriculumItem[];
  outsideCourses: RawMyBkOutsideCourse[];
  currentSemCourseCodes: Set<string>;
}): {
  blocks: NormalizedCurriculumBlock[];
  outsideCourses: NormalizedOutsideCourse[];
  inProgressNewCredits: number;
  inProgressCourseCodes: string[];
  retakeCourseCodes: string[];
} {
  const { rawItems, outsideCourses, currentSemCourseCodes } = options;

  const freeElectiveApprovedCodes = new Set<string>();
  const freeElectiveCoursesFromOutside: NormalizedCurriculumCourse[] = [];

  for (const r of rawItems) {
    if (
      r.loainhomkhoikienthuc === "NGOAICTDT" &&
      r.xetchontctd !== null &&
      r.xetchontctd !== undefined &&
      r.mamonhoc
    ) {
      const codeUpper = r.mamonhoc.toUpperCase();
      freeElectiveApprovedCodes.add(codeUpper);
      const { numericScore, letterGrade } = normalizeLetterAndScore(
        r.diemso,
        r.diemchu
      );
      freeElectiveCoursesFromOutside.push({
        uniqueKey: `free_${r.uniqueid}`,
        subjectId: r.monhocid,
        subjectCode: r.mamonhoc,
        subjectName: r.tenmonhoc || r.mamonhoc,
        credits: Number(r.sotc ?? 0),
        numericScore,
        letterGrade,
        isPassed: String(r.diemdat) === "1",
        isEffective: String(r.hieuluc) === "1",
        freeElectiveRef: String(r.xetchontctd),
        note: r.ghichu,
        inCurrentTimetable: currentSemCourseCodes.has(codeUpper),
      });
    }
  }

  const blockMap = new Map<number, NormalizedCurriculumBlock>();
  const passedCodesSet = new Set<string>();

  for (const r of rawItems) {
    if (r.loainhomkhoikienthuc === "NGOAICTDT" || r.khoikienthucid === 0) {
      if (r.mamonhoc && String(r.diemdat) === "1") {
        passedCodesSet.add(r.mamonhoc.toUpperCase());
      }
      continue;
    }

    const blockId = Number(r.khoikienthucid);
    const isReq = String(r.khoikienthucbatbuoc) === "1";
    const cleanType = stripHtmlTags(r.loaikhoikienthuc);
    const blockTypeLabel = isReq
      ? "Bắt buộc"
      : cleanType.toLowerCase().includes("tự chọn")
      ? "Tự chọn"
      : "Bắt buộc";

    let block = blockMap.get(blockId);
    if (!block) {
      // Differentiate the 4 "Chuyên ngành" blocks clearly
      let subLabel: string | undefined;
      if (r.loainhomkhoikienthuc === "CHUYENNGANH") {
        if (isReq) {
          subLabel = "Cốt lõi bắt buộc";
        } else if (Number(r.tcyeucau) === 1 && (r.mamonhoc || "").startsWith("CO310")) {
          subLabel =
            r.tenmonhoc && r.tenmonhoc.includes("Đa ngành")
              ? "Đồ án Đa ngành"
              : "Đồ án Tổng hợp";
        } else {
          subLabel = `Tự chọn chuyên ngành (${r.tcyeucau} TC)`;
        }
      }

      block = {
        blockId,
        blockCode: String(r.loainhomkhoikienthuc || ""),
        blockName: String(r.tenkhoikienthuc || ""),
        subLabel,
        blockTypeLabel,
        isRequiredBlock: isReq,
        isBlockCompleted: String(r.hoanthanh) === "1",
        stt: Number(r.stt || 0),
        requiredCredits: Number(r.tcyeucau || 0),
        earnedCredits: Number(r.tcdat || 0),
        requiredSubjects: Number(r.mhyeucau || 0),
        earnedSubjects: Number(r.mhdat || 0),
        courses: [],
      };
      blockMap.set(blockId, block);
    }

    if (r.mamonhoc) {
      const codeUpper = r.mamonhoc.toUpperCase();
      const isPassed = String(r.diemdat) === "1";
      if (isPassed) {
        passedCodesSet.add(codeUpper);
      }
      const inCurrent = currentSemCourseCodes.has(codeUpper);
      const { numericScore, letterGrade } = normalizeLetterAndScore(
        r.diemso,
        r.diemchu
      );

      block.courses.push({
        uniqueKey: String(r.uniqueid || `${r.mamonhoc}_${blockId}`),
        subjectId: r.monhocid,
        subjectCode: r.mamonhoc,
        subjectName: r.tenmonhoc || r.mamonhoc,
        credits: Number(r.sotc ?? 0),
        numericScore,
        letterGrade,
        isPassed,
        isEffective: String(r.hieuluc) === "1",
        freeElectiveRef:
          r.xetchontctd !== null && r.xetchontctd !== undefined
            ? String(r.xetchontctd)
            : null,
        note: r.ghichu,
        inCurrentTimetable: inCurrent && !isPassed,
        isRetakeInCurrentSem: inCurrent && isPassed,
      });
    }
  }

  // Inject approved free-elective courses (xetchontctd) into TUCHON_TUDO block (90241)
  for (const blk of blockMap.values()) {
    if (blk.blockCode === "TUCHON_TUDO" && blk.courses.length === 0) {
      blk.courses.push(...freeElectiveCoursesFromOutside);
    }
    // Refine subLabel for CO3107/CO3109/CO3111 block
    if (
      blk.blockCode === "CHUYENNGANH" &&
      !blk.isRequiredBlock &&
      blk.requiredCredits === 1
    ) {
      const hasMulti = blk.courses.some((c) =>
        c.subjectName.toLowerCase().includes("đa ngành")
      );
      blk.subLabel = hasMulti ? "Đồ án Đa ngành" : "Đồ án Tổng hợp";
    }
  }

  // Sort courses inside each block: Passed first -> In Current Timetable -> Remaining by code
  for (const blk of blockMap.values()) {
    blk.courses.sort((a, b) => {
      const rankA = a.isPassed ? 0 : a.inCurrentTimetable ? 1 : 2;
      const rankB = b.isPassed ? 0 : b.inCurrentTimetable ? 1 : 2;
      if (rankA !== rankB) return rankA - rankB;
      return a.subjectCode.localeCompare(b.subjectCode);
    });
  }

  const blocks = Array.from(blockMap.values()).sort((a, b) =>
    a.stt !== b.stt ? a.stt - b.stt : a.blockId - b.blockId
  );

  // Calculate in-progress new credits vs retake courses from current semester timetable
  const inProgressCourseCodes: string[] = [];
  const retakeCourseCodes: string[] = [];
  for (const code of currentSemCourseCodes) {
    if (passedCodesSet.has(code)) {
      retakeCourseCodes.push(code);
    } else {
      inProgressCourseCodes.push(code);
    }
  }

  // Map outside courses
  const normalizedOutside: NormalizedOutsideCourse[] = outsideCourses.map(
    (o) => ({
      maMonHoc: o.maMonHoc,
      tenMonHoc: o.tenMonHoc,
      soTinChi: Number(o.soTinChi ?? 0),
      diemSo: o.diemSo !== null && o.diemSo !== undefined ? Number(o.diemSo) : null,
      diemChu: o.diemChu && o.diemChu !== "--" ? o.diemChu : null,
      ghiChu: o.ghiChu,
      countedAsFreeElective: freeElectiveApprovedCodes.has(
        o.maMonHoc.toUpperCase()
      ),
    })
  );

  return {
    blocks,
    outsideCourses: normalizedOutside,
    inProgressNewCredits: 0, // filled with exact timetable credits in caller
    inProgressCourseCodes,
    retakeCourseCodes,
  };
}

function generateTraceparent(): string {
  const traceId = crypto.randomBytes(16).toString("hex");
  const spanId = crypto.randomBytes(8).toString("hex");
  return `01-${traceId}-${spanId}-01`;
}

export async function readCurriculumCache(): Promise<CurriculumCacheFile | null> {
  try {
    const raw = await fs.readFile(CURRICULUM_CACHE_PATH, "utf8");
    return JSON.parse(raw) as CurriculumCacheFile;
  } catch {
    return null;
  }
}

export async function writeCurriculumCache(data: CurriculumCacheFile) {
  try {
    await fs.writeFile(
      CURRICULUM_CACHE_PATH,
      JSON.stringify(data, null, 2),
      "utf8"
    );
  } catch {
    // ignore
  }
}

export async function fetchMyBkCurriculumFromApi(
  jwtToken: string,
  studentId: string
): Promise<{
  overview: CurriculumOverview | null;
  rawItems: RawMyBkCurriculumItem[];
  outsideCourses: RawMyBkOutsideCourse[];
}> {
  const cleanToken = jwtToken.replace(/^Bearer\s+/i, "").trim();
  const makeHeaders = () => ({
    accept: "application/json",
    "accept-language": "vi",
    authorization: cleanToken,
    "content-type": "application/json",
    traceparent: generateTraceparent(),
    Referer:
      "https://mybk.hcmut.edu.vn/app/sinh-vien/ket-qua-hoc-tap/chuong-trinh-dao-tao",
  });

  const [ovRes, listRes, outRes] = await Promise.all([
    fetch(MYBK_CTDT_OVERVIEW_API, {
      method: "POST",
      headers: makeHeaders(),
      body: JSON.stringify("MYSEF"),
      cache: "no-store",
    }),
    fetch(MYBK_CTDT_COURSES_API, {
      method: "POST",
      headers: makeHeaders(),
      body: JSON.stringify(studentId),
      cache: "no-store",
    }),
    fetch(MYBK_CTDT_OUTSIDE_API, {
      method: "POST",
      headers: makeHeaders(),
      body: JSON.stringify(studentId),
      cache: "no-store",
    }).catch(() => null),
  ]);

  if (!ovRes.ok || !listRes.ok) {
    throw new Error(
      `CURRICULUM_API_REJECTED:${ovRes.status}/${listRes.status}`
    );
  }

  const ovJson = await ovRes.json();
  const listJson = await listRes.json();
  const outJson =
    outRes && outRes.ok ? await outRes.json().catch(() => null) : null;

  if (!Array.isArray(listJson?.data) || listJson.data.length === 0) {
    throw new Error("CURRICULUM_EMPTY_DATA");
  }

  return {
    overview: (ovJson?.data as CurriculumOverview) || null,
    rawItems: listJson.data as RawMyBkCurriculumItem[],
    outsideCourses: Array.isArray(outJson?.data)
      ? (outJson.data as RawMyBkOutsideCourse[])
      : [],
  };
}

async function getCurrentTimetableCreditMap(
  studentId: string
): Promise<{ semesterCode: string; creditByCode: Map<string, number> }> {
  const creditByCode = new Map<string, number>();
  let semesterCode = "20261";

  try {
    const tkbItems = await prisma.academicTimetableItem.findMany({
      where: { studentId, semesterYearCode: "20261" },
    });
    for (const item of tkbItems) {
      creditByCode.set(item.subjectCode.toUpperCase(), item.numOfCredits);
      semesterCode = item.semesterYearCode;
    }
  } catch {
    // ignore
  }

  if (creditByCode.size === 0) {
    try {
      const tkbCacheRaw = await fs.readFile(
        path.join(process.cwd(), ".mybk-timetable-cache.json"),
        "utf8"
      );
      const tkbCache = JSON.parse(tkbCacheRaw);
      semesterCode = tkbCache.currentSemesterCode || "20261";
      const list = tkbCache?.schedulesBySemester?.[semesterCode] || [];
      for (const raw of list) {
        const code = String(raw?.subject?.code || "").toUpperCase();
        const tc = Number(raw?.subject?.numOfCredits ?? 0);
        if (code) creditByCode.set(code, tc);
      }
    } catch {
      // ignore
    }
  }

  return { semesterCode, creditByCode };
}

export async function upsertCurriculumToPostgres(
  studentId: string,
  overview: CurriculumOverview | null,
  rawItems: RawMyBkCurriculumItem[],
  outsideCourses: RawMyBkOutsideCourse[]
) {
  const nowIso = new Date().toISOString();
  await writeCurriculumCache({
    connected: true,
    studentId,
    lastSyncedAt: nowIso,
    overview,
    rawItems,
    outsideCourses,
  });

  try {
    if (overview) {
      await prisma.myBkAccount.update({
        where: { studentId },
        data: {
          curriculumInfoJson: JSON.stringify(overview),
        },
      });
    }

    await Promise.all(
      rawItems.map((r) => {
        const uniqueKey = String(
          r.uniqueid || `${r.mamonhoc || "EMPTY"}_${r.khoikienthucid}`
        );
        const isReq = String(r.khoikienthucbatbuoc) === "1";
        const cleanType = stripHtmlTags(r.loaikhoikienthuc);
        const blockTypeLabel = isReq
          ? "Bắt buộc"
          : cleanType.toLowerCase().includes("tự chọn")
          ? "Tự chọn"
          : "Bắt buộc";

        return prisma.academicCurriculumItem.upsert({
          where: {
            studentId_uniqueKey: {
              studentId,
              uniqueKey,
            },
          },
          update: {
            stt: Number(r.stt || 0),
            blockId: Number(r.khoikienthucid || 0),
            blockCode: String(r.loainhomkhoikienthuc || ""),
            blockName: String(r.tenkhoikienthuc || ""),
            blockTypeLabel,
            isRequiredBlock: isReq,
            isBlockCompleted: String(r.hoanthanh) === "1",
            requiredCredits: Number(r.tcyeucau || 0),
            earnedCredits: Number(r.tcdat || 0),
            requiredSubjects: Number(r.mhyeucau || 0),
            earnedSubjects: Number(r.mhdat || 0),
            subjectId: r.monhocid,
            subjectCode: r.mamonhoc,
            subjectName: r.tenmonhoc,
            credits: r.sotc,
            numericScore:
              r.diemso !== null && r.diemso !== undefined
                ? Number(r.diemso)
                : null,
            letterGrade: r.diemchu,
            isPassed: String(r.diemdat) === "1",
            isEffective: String(r.hieuluc) === "1",
            freeElectiveRef:
              r.xetchontctd !== null && r.xetchontctd !== undefined
                ? String(r.xetchontctd)
                : null,
            note: r.ghichu,
          },
          create: {
            studentId,
            uniqueKey,
            stt: Number(r.stt || 0),
            blockId: Number(r.khoikienthucid || 0),
            blockCode: String(r.loainhomkhoikienthuc || ""),
            blockName: String(r.tenkhoikienthuc || ""),
            blockTypeLabel,
            isRequiredBlock: isReq,
            isBlockCompleted: String(r.hoanthanh) === "1",
            requiredCredits: Number(r.tcyeucau || 0),
            earnedCredits: Number(r.tcdat || 0),
            requiredSubjects: Number(r.mhyeucau || 0),
            earnedSubjects: Number(r.mhdat || 0),
            subjectId: r.monhocid,
            subjectCode: r.mamonhoc,
            subjectName: r.tenmonhoc,
            credits: r.sotc,
            numericScore:
              r.diemso !== null && r.diemso !== undefined
                ? Number(r.diemso)
                : null,
            letterGrade: r.diemchu,
            isPassed: String(r.diemdat) === "1",
            isEffective: String(r.hieuluc) === "1",
            freeElectiveRef:
              r.xetchontctd !== null && r.xetchontctd !== undefined
                ? String(r.xetchontctd)
                : null,
            note: r.ghichu,
          },
        });
      })
    );
  } catch {
    // fallback already written to cache
  }
}

export async function getStoredCurriculumProgress(): Promise<CurriculumProgressPayload> {
  const cached = await readCurriculumCache();
  const studentId = cached?.studentId || "2313425";
  const { semesterCode, creditByCode } =
    await getCurrentTimetableCreditMap(studentId);
  const currentSemCodes = new Set<string>(creditByCode.keys());

  let overview: CurriculumOverview | null = cached?.overview || null;
  let rawItems: RawMyBkCurriculumItem[] = cached?.rawItems || [];
  const outsideRaw: RawMyBkOutsideCourse[] = cached?.outsideCourses || [];
  let isStale = false;
  let lastSyncedAt = cached?.lastSyncedAt || null;

  try {
    const account = await prisma.myBkAccount.findFirst({
      orderBy: { updatedAt: "desc" },
      include: { curriculumItems: true },
    });

    if (account) {
      if (account.curriculumItems.length === 0 && rawItems.length > 0) {
        await upsertCurriculumToPostgres(
          account.studentId,
          overview,
          rawItems,
          outsideRaw
        );
      } else if (account.curriculumItems.length > 0) {
        if (account.curriculumInfoJson) {
          overview = JSON.parse(account.curriculumInfoJson);
        }
        rawItems = account.curriculumItems.map((row) => ({
          stt: row.stt,
          tcyeucau: row.requiredCredits,
          mhyeucau: row.requiredSubjects,
          tcdat: row.earnedCredits,
          mhdat: row.earnedSubjects,
          loainhomkhoikienthuc: row.blockCode,
          khoikienthucid: row.blockId,
          tenkhoikienthuc: row.blockName,
          loaikhoikienthuc: row.blockTypeLabel,
          hoanthanh: row.isBlockCompleted ? "1" : "0",
          khoikienthucbatbuoc: row.isRequiredBlock ? "1" : "0",
          uniqueid: row.uniqueKey,
          monhocid: row.subjectId,
          mamonhoc: row.subjectCode,
          tenmonhoc: row.subjectName,
          sotc: row.credits,
          diemso: row.numericScore,
          diemchu: row.letterGrade,
          diemdat: row.isPassed ? "1" : "0",
          douutien: null,
          hieuluc: row.isEffective ? "1" : "0",
          tamdat: "0",
          xetchontctd: row.freeElectiveRef,
          ghichu: row.note,
          monhoctuongduongid: null,
        }));
      }

      const syncedMs = cached?.lastSyncedAt
        ? new Date(cached.lastSyncedAt).getTime()
        : 0;
      isStale = Date.now() - syncedMs > SWR_STALE_THRESHOLD_MS;
      lastSyncedAt =
        cached?.lastSyncedAt ||
        (account.lastSyncedAt ? account.lastSyncedAt.toISOString() : null);
    }
  } catch {
    // fallback to cache
  }

  const structured = buildStructuredCurriculum({
    rawItems,
    outsideCourses: outsideRaw,
    currentSemCourseCodes: currentSemCodes,
  });

  let inProgressNewCredits = 0;
  for (const code of structured.inProgressCourseCodes) {
    inProgressNewCredits += creditByCode.get(code) || 0;
  }

  return {
    connected: Boolean(overview || rawItems.length > 0),
    studentId,
    isStale,
    lastSyncedAt,
    currentSemesterCode: semesterCode,
    inProgressNewCredits,
    inProgressCourseCodes: structured.inProgressCourseCodes,
    retakeCourseCodes: structured.retakeCourseCodes,
    overview,
    blocks: structured.blocks,
    outsideCourses: structured.outsideCourses,
  };
}

export async function revalidateCurriculumFromMyBk(force = false) {
  const account = await prisma.myBkAccount
    .findFirst({ orderBy: { updatedAt: "desc" } })
    .catch(() => null);

  if (!account) {
    return getStoredCurriculumProgress();
  }

  const cached = await readCurriculumCache();
  const syncedMs = cached?.lastSyncedAt
    ? new Date(cached.lastSyncedAt).getTime()
    : 0;
  if (!force && Date.now() - syncedMs <= SWR_STALE_THRESHOLD_MS && cached) {
    return getStoredCurriculumProgress();
  }

  const { jwtToken } = await ensureValidMyBkJwt(account);

  try {
    const fresh = await fetchMyBkCurriculumFromApi(jwtToken, account.studentId);
    await upsertCurriculumToPostgres(
      account.studentId,
      fresh.overview,
      fresh.rawItems,
      fresh.outsideCourses
    );
  } catch {
    if (account.ssoUsername && account.encryptedPassword) {
      const plainPassword = decryptCredential(account.encryptedPassword);
      if (plainPassword) {
        const freshSso = await loginMyBkCasSso(
          account.ssoUsername,
          plainPassword
        );
        const fresh = await fetchMyBkCurriculumFromApi(
          freshSso.jwtToken,
          account.studentId
        );
        await upsertCurriculumToPostgres(
          account.studentId,
          fresh.overview,
          fresh.rawItems,
          fresh.outsideCourses
        );
      }
    }
  }

  return getStoredCurriculumProgress();
}
