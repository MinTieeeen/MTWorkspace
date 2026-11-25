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
import {
  filterRelevantSemesters,
  RawMyBkSemesterOption,
} from "./mybk-timetable";

const MYBK_SEMESTER_SHORT_API =
  "https://mybk.hcmut.edu.vn/api/v1/semester-year/short?null";
const MYBK_STUDENT_EXAM_API =
  "https://mybk.hcmut.edu.vn/api/thoi-khoa-bieu/lich-thi-sinh-vien/v1";

const EXAMS_CACHE_PATH = path.join(process.cwd(), ".mybk-exams-cache.json");

export type ExamPrepStatus = "NOT_STARTED" | "STUDYING" | "READY";

export interface RawMyBkExamItem {
  ID: number;
  TKBTUANID: number | null;
  NAMHOC: number;
  HOCKY: number;
  MANAMHOCHOCKY: string;
  TENNAMHOCHOCKY: string;
  CANBOID: number | null;
  MACANBO: string | null;
  TENCANBO: string | null;
  NHOMLOPMONHOCID: number | null;
  MANHOMLOPMONHOC: string | null;
  MONHOCID: number | null;
  MAMONHOC: string;
  TENMONHOC: string;
  SOTC: number;
  SOTCHP: number;
  NHOMLOP: string | null;
  COSOID: number | null;
  MACOSO: string | null;
  DAYID: number | null;
  MADAY: string | null;
  PHONGID: number | null;
  MAPHONG: string | null;
  NAMDL: number;
  TUANDLBD: number;
  THU: number;
  TIETBD: number;
  SOTIET: number;
  TIETKT: number;
  GIOBD: string; // e.g. "07g00", "09g30", "13g00"
  GIO_SOPHUT: string | number; // e.g. "60", "70", "90"
  NGAYTHI: string; // "YYYY-MM-DD"
  LOAITHI: string; // "CK" | "GK"
  MSSV: string;
  LASTUPDATED_TIME: string | null;
  HOLOT?: string | null;
  TEN?: string | null;
  NHAPDIEM_DEADLINE: string | null; // e.g. "07/01/2027"
  NLMHSV_GHICHU: string | null;
  NLMHSV_STT: number | null; // Seat / Roster number in exam room
  HIDDEN_FLAG: string | number | null;
}

export interface NormalizedExamItem {
  examId: number;
  studentId: string;
  semesterYearCode: string;
  semesterYearName: string;
  academicYear: number;
  semester: number;
  subjectId: number | null;
  subjectCode: string;
  subjectName: string;
  numOfCredits: number;
  classGroup: string | null;
  examType: string; // "GK" | "CK"
  examDate: string; // "YYYY-MM-DD"
  dayOfWeek: number;
  weekNumber: number;
  startLesson: number;
  numOfLesson: number;
  endLesson: number;
  startTimeRaw: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  durationMinutes: number;
  campusCode: string | null;
  buildingCode: string | null;
  roomCode: string | null;
  seatOrder: number | null;
  gradeDeadline: string | null;
  examNote: string | null;
  personalNote: string | null;
  prepStatus: ExamPrepStatus;
  lastUpdatedTime: string | null;
}

interface ExamsCacheFile {
  connected: boolean;
  studentId: string;
  currentSemesterCode: string;
  lastSyncedAt: string;
  semesters: RawMyBkSemesterOption[];
  examsBySemester: Record<string, RawMyBkExamItem[]>;
  prepStatuses?: Record<string, ExamPrepStatus>;
  personalNotes?: Record<string, string>;
}

/**
 * Parses Bách Khoa exam start time ("07g00", "09g30", "13:00", "7g30") into "HH:MM"
 * and computes endTime ("HH:MM") by adding durationMinutes.
 */
export function parseMyBkExamTime(
  gioBdRaw: string | null | undefined,
  soPhutRaw: string | number | null | undefined
): {
  startTimeRaw: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
} {
  const raw = String(gioBdRaw || "07g00").trim();
  const durationMinutes = Math.max(15, Number(soPhutRaw) || 60);

  const match = raw.match(/(\d{1,2})\s*[gG:]\s*(\d{1,2})?/);
  const hours = match ? Math.min(23, Math.max(0, Number(match[1]))) : 7;
  const mins = match && match[2] ? Math.min(59, Math.max(0, Number(match[2]))) : 0;

  const startTime = `${String(hours).padStart(2, "0")}:${String(mins).padStart(
    2,
    "0"
  )}`;

  const totalEndMins = hours * 60 + mins + durationMinutes;
  const endHours = Math.floor(totalEndMins / 60) % 24;
  const endMins = totalEndMins % 60;
  const endTime = `${String(endHours).padStart(2, "0")}:${String(
    endMins
  ).padStart(2, "0")}`;

  return {
    startTimeRaw: raw,
    startTime,
    endTime,
    durationMinutes,
  };
}

export function parseSemesterCodeToYearAndTerm(semesterYearCode: string): {
  namhoc: number;
  hocky: number;
} {
  if (semesterYearCode === "ALL" || semesterYearCode === "-1") {
    return { namhoc: -1, hocky: -1 };
  }
  const clean = String(semesterYearCode || "20261").trim();
  if (clean.length >= 5) {
    const namhoc = Number(clean.slice(0, 4)) || 2026;
    const hocky = Number(clean.slice(4)) || 1;
    return { namhoc, hocky };
  }
  return { namhoc: 2026, hocky: 1 };
}

export function normalizeRawExamItem(
  raw: RawMyBkExamItem,
  prepStatus: ExamPrepStatus = "NOT_STARTED",
  personalNote: string | null = null
): NormalizedExamItem {
  const { startTimeRaw, startTime, endTime, durationMinutes } =
    parseMyBkExamTime(raw.GIOBD, raw.GIO_SOPHUT);

  return {
    examId: Number(raw.ID),
    studentId: String(raw.MSSV || "2313425"),
    semesterYearCode: String(raw.MANAMHOCHOCKY || "20261"),
    semesterYearName: String(
      raw.TENNAMHOCHOCKY || "Học kỳ 1 Năm học 2026 - 2027"
    ),
    academicYear: Number(raw.NAMHOC || 2026),
    semester: Number(raw.HOCKY || 1),
    subjectId: raw.MONHOCID ? Number(raw.MONHOCID) : null,
    subjectCode: String(raw.MAMONHOC || ""),
    subjectName: String(raw.TENMONHOC || ""),
    numOfCredits: Number(raw.SOTC ?? 0),
    classGroup: raw.NHOMLOP || null,
    examType: String(raw.LOAITHI || "CK").toUpperCase(),
    examDate: String(raw.NGAYTHI || ""),
    dayOfWeek: Number(raw.THU ?? 0),
    weekNumber: Number(raw.TUANDLBD ?? 0),
    startLesson: Number(raw.TIETBD ?? 0),
    numOfLesson: Number(raw.SOTIET ?? 0),
    endLesson: Number(raw.TIETKT ?? 0),
    startTimeRaw,
    startTime,
    endTime,
    durationMinutes,
    campusCode: raw.MACOSO || null,
    buildingCode: raw.MADAY || null,
    roomCode: raw.MAPHONG || null,
    seatOrder:
      raw.NLMHSV_STT !== null && raw.NLMHSV_STT !== undefined
        ? Number(raw.NLMHSV_STT)
        : null,
    gradeDeadline: raw.NHAPDIEM_DEADLINE || null,
    examNote: raw.NLMHSV_GHICHU || null,
    personalNote,
    prepStatus,
    lastUpdatedTime: raw.LASTUPDATED_TIME || null,
  };
}

export function deduplicateExamItems<
  T extends {
    examId?: number;
    ID?: number;
    subjectCode?: string;
    MAMONHOC?: string;
    examType?: string;
    LOAITHI?: string;
    examDate?: string;
    NGAYTHI?: string;
    startTime?: string;
    GIOBD?: string;
    roomCode?: string | null;
    MAPHONG?: string | null;
    HIDDEN_FLAG?: string | number | null;
  }
>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    if (
      item.HIDDEN_FLAG !== undefined &&
      item.HIDDEN_FLAG !== null &&
      String(item.HIDDEN_FLAG) === "1"
    ) {
      continue;
    }
    const code = item.subjectCode || item.MAMONHOC || "";
    const type = item.examType || item.LOAITHI || "";
    const date = item.examDate || item.NGAYTHI || "";
    const time = item.startTime || item.GIOBD || "";
    const room = item.roomCode ?? item.MAPHONG ?? "";
    const key = `${code}|${type}|${date}|${time}|${room}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

function generateTraceparent(): string {
  const traceId = crypto.randomBytes(16).toString("hex");
  const spanId = crypto.randomBytes(8).toString("hex");
  return `01-${traceId}-${spanId}-01`;
}

export async function readExamsCache(): Promise<ExamsCacheFile | null> {
  try {
    const raw = await fs.readFile(EXAMS_CACHE_PATH, "utf8");
    return JSON.parse(raw) as ExamsCacheFile;
  } catch {
    return null;
  }
}

export async function writeExamsCache(data: ExamsCacheFile) {
  try {
    await fs.writeFile(EXAMS_CACHE_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch {
    // ignore
  }
}

export async function fetchMyBkExamsFromApi(options: {
  jwtToken: string;
  studentId: string;
  semesterYear: string;
}): Promise<{
  semesters: RawMyBkSemesterOption[];
  items: RawMyBkExamItem[];
}> {
  const { jwtToken, studentId, semesterYear } = options;
  const cleanToken = jwtToken.replace(/^Bearer\s+/i, "").trim();
  const { namhoc, hocky } = parseSemesterCodeToYearAndTerm(semesterYear);

  const makeHeaders = () => ({
    accept: "application/json",
    "accept-language": "vi",
    authorization: cleanToken,
    "content-type": "application/json",
    traceparent: generateTraceparent(),
    Referer: "https://mybk.hcmut.edu.vn/app/he-thong-quan-ly/sinh-vien/lich-thi",
  });

  const [semRes, examRes] = await Promise.all([
    fetch(MYBK_SEMESTER_SHORT_API, {
      method: "GET",
      headers: makeHeaders(),
      cache: "no-store",
    }).catch(() => null),
    fetch(
      `${MYBK_STUDENT_EXAM_API}?masv=${encodeURIComponent(
        studentId
      )}&namhoc=${namhoc}&hocky=${hocky}&null`,
      {
        method: "GET",
        headers: makeHeaders(),
        cache: "no-store",
      }
    ),
  ]);

  if (!examRes.ok) {
    throw new Error(`EXAM_API_REJECTED:${examRes.status}`);
  }

  const examJson = await examRes.json();
  const rawList: RawMyBkExamItem[] = Array.isArray(examJson?.data?.data)
    ? examJson.data.data
    : Array.isArray(examJson?.data)
    ? examJson.data
    : [];

  let semesters: RawMyBkSemesterOption[] = [];
  if (semRes && semRes.ok) {
    const semJson = await semRes.json().catch(() => null);
    if (Array.isArray(semJson?.data)) {
      semesters = filterRelevantSemesters(semJson.data);
    }
  }

  return {
    semesters,
    items: deduplicateExamItems(rawList),
  };
}

export async function upsertExamItemsToPostgres(
  studentId: string,
  semesterYear: string,
  rawItems: RawMyBkExamItem[],
  semesters?: RawMyBkSemesterOption[]
): Promise<NormalizedExamItem[]> {
  const cached = await readExamsCache();
  const prepMap = new Map<string, ExamPrepStatus>(
    Object.entries(cached?.prepStatuses || {}) as Array<[string, ExamPrepStatus]>
  );
  const notesMap = new Map<string, string>(
    Object.entries(cached?.personalNotes || {})
  );

  try {
    const existingRows = await prisma.academicExamItem.findMany({
      where: { studentId, semesterYearCode: semesterYear },
    });
    for (const r of existingRows) {
      prepMap.set(String(r.examId), r.prepStatus as ExamPrepStatus);
      if (r.personalNote) {
        notesMap.set(String(r.examId), r.personalNote);
      }
    }
  } catch {
    // ignore if db offline
  }

  const dedupedRaw = deduplicateExamItems(rawItems);
  const normalized = dedupedRaw.map((raw) =>
    normalizeRawExamItem(
      raw,
      prepMap.get(String(raw.ID)) || "NOT_STARTED",
      notesMap.get(String(raw.ID)) || null
    )
  );

  const nextCache: ExamsCacheFile = {
    connected: true,
    studentId,
    currentSemesterCode:
      semesters?.find((s) => s.isCurrent)?.code.toString() ||
      cached?.currentSemesterCode ||
      "20261",
    lastSyncedAt: new Date().toISOString(),
    semesters:
      semesters && semesters.length > 0 ? semesters : cached?.semesters || [],
    examsBySemester: {
      ...(cached?.examsBySemester || {}),
      [semesterYear]: dedupedRaw,
    },
    prepStatuses: Object.fromEntries(prepMap.entries()),
    personalNotes: Object.fromEntries(notesMap.entries()),
  };
  await writeExamsCache(nextCache);

  try {
    const validExamIds = normalized.map((i) => i.examId);
    if (validExamIds.length > 0 && semesterYear !== "ALL") {
      await prisma.academicExamItem.deleteMany({
        where: {
          studentId,
          semesterYearCode: semesterYear,
          examId: { notIn: validExamIds },
        },
      });
    }

    await Promise.all(
      normalized.map((item) =>
        prisma.academicExamItem.upsert({
          where: {
            studentId_examId: {
              studentId: item.studentId,
              examId: item.examId,
            },
          },
          update: {
            semesterYearCode: item.semesterYearCode,
            semesterYearName: item.semesterYearName,
            academicYear: item.academicYear,
            semester: item.semester,
            subjectId: item.subjectId,
            subjectCode: item.subjectCode,
            subjectName: item.subjectName,
            numOfCredits: item.numOfCredits,
            classGroup: item.classGroup,
            examType: item.examType,
            examDate: item.examDate,
            dayOfWeek: item.dayOfWeek,
            weekNumber: item.weekNumber,
            startLesson: item.startLesson,
            numOfLesson: item.numOfLesson,
            endLesson: item.endLesson,
            startTimeRaw: item.startTimeRaw,
            startTime: item.startTime,
            endTime: item.endTime,
            durationMinutes: item.durationMinutes,
            campusCode: item.campusCode,
            buildingCode: item.buildingCode,
            roomCode: item.roomCode,
            seatOrder: item.seatOrder,
            gradeDeadline: item.gradeDeadline,
            examNote: item.examNote,
            lastUpdatedTime: item.lastUpdatedTime,
          },
          create: {
            studentId: item.studentId,
            examId: item.examId,
            semesterYearCode: item.semesterYearCode,
            semesterYearName: item.semesterYearName,
            academicYear: item.academicYear,
            semester: item.semester,
            subjectId: item.subjectId,
            subjectCode: item.subjectCode,
            subjectName: item.subjectName,
            numOfCredits: item.numOfCredits,
            classGroup: item.classGroup,
            examType: item.examType,
            examDate: item.examDate,
            dayOfWeek: item.dayOfWeek,
            weekNumber: item.weekNumber,
            startLesson: item.startLesson,
            numOfLesson: item.numOfLesson,
            endLesson: item.endLesson,
            startTimeRaw: item.startTimeRaw,
            startTime: item.startTime,
            endTime: item.endTime,
            durationMinutes: item.durationMinutes,
            campusCode: item.campusCode,
            buildingCode: item.buildingCode,
            roomCode: item.roomCode,
            seatOrder: item.seatOrder,
            gradeDeadline: item.gradeDeadline,
            examNote: item.examNote,
            personalNote: item.personalNote,
            prepStatus: item.prepStatus,
            lastUpdatedTime: item.lastUpdatedTime,
          },
        })
      )
    );
  } catch {
    // fallback already written to cache
  }

  return normalized;
}

export async function getStoredExams(semesterYear?: string): Promise<{
  connected: boolean;
  studentId: string | null;
  hasAutoSso: boolean;
  isStale: boolean;
  lastSyncedAt: string | null;
  currentSemesterCode: string;
  selectedSemesterCode: string;
  semesters: RawMyBkSemesterOption[];
  items: NormalizedExamItem[];
}> {
  const cached = await readExamsCache();
  const currentSemesterCode =
    cached?.semesters?.find((s) => s.isCurrent)?.code.toString() ||
    cached?.currentSemesterCode ||
    "20261";
  const targetSemester = semesterYear || currentSemesterCode;

  try {
    const account = await prisma.myBkAccount.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    if (account) {
      const whereClause =
        targetSemester === "ALL"
          ? { studentId: account.studentId }
          : { studentId: account.studentId, semesterYearCode: targetSemester };

      let dbItems = await prisma.academicExamItem.findMany({
        where: whereClause,
        orderBy: [{ examDate: "asc" }, { startTime: "asc" }],
      });

      const cachedRaw = cached?.examsBySemester?.[targetSemester];
      if (dbItems.length === 0 && cachedRaw && cachedRaw.length > 0) {
        await upsertExamItemsToPostgres(
          account.studentId,
          targetSemester,
          cachedRaw,
          cached?.semesters
        );
        dbItems = await prisma.academicExamItem.findMany({
          where: whereClause,
          orderBy: [{ examDate: "asc" }, { startTime: "asc" }],
        });
      }

      if (dbItems.length > 0) {
        const lastSyncedMs = account.lastSyncedAt
          ? account.lastSyncedAt.getTime()
          : 0;
        const mapped: NormalizedExamItem[] = dbItems.map((row) => ({
          examId: row.examId,
          studentId: row.studentId,
          semesterYearCode: row.semesterYearCode,
          semesterYearName: row.semesterYearName,
          academicYear: row.academicYear,
          semester: row.semester,
          subjectId: row.subjectId,
          subjectCode: row.subjectCode,
          subjectName: row.subjectName,
          numOfCredits: row.numOfCredits,
          classGroup: row.classGroup,
          examType: row.examType,
          examDate: row.examDate,
          dayOfWeek: row.dayOfWeek,
          weekNumber: row.weekNumber,
          startLesson: row.startLesson,
          numOfLesson: row.numOfLesson,
          endLesson: row.endLesson,
          startTimeRaw: row.startTimeRaw,
          startTime: row.startTime,
          endTime: row.endTime,
          durationMinutes: row.durationMinutes,
          campusCode: row.campusCode,
          buildingCode: row.buildingCode,
          roomCode: row.roomCode,
          seatOrder: row.seatOrder,
          gradeDeadline: row.gradeDeadline,
          examNote: row.examNote,
          personalNote: row.personalNote,
          prepStatus: (row.prepStatus as ExamPrepStatus) || "NOT_STARTED",
          lastUpdatedTime: row.lastUpdatedTime,
        }));

        return {
          connected: true,
          studentId: account.studentId,
          hasAutoSso: Boolean(
            account.ssoUsername && account.encryptedPassword
          ),
          isStale: Date.now() - lastSyncedMs > SWR_STALE_THRESHOLD_MS,
          lastSyncedAt:
            cached?.lastSyncedAt ||
            (account.lastSyncedAt ? account.lastSyncedAt.toISOString() : null),
          currentSemesterCode,
          selectedSemesterCode: targetSemester,
          semesters: cached?.semesters || [],
          items: deduplicateExamItems(mapped),
        };
      }
    }
  } catch {
    // fallback to cache
  }

  const cachedList = deduplicateExamItems(
    cached?.examsBySemester?.[targetSemester] || []
  );
  const prepMap = cached?.prepStatuses || {};
  const notesMap = cached?.personalNotes || {};

  return {
    connected: Boolean(cached?.connected),
    studentId: cached?.studentId || "2313425",
    hasAutoSso: false,
    isStale: false,
    lastSyncedAt: cached?.lastSyncedAt || null,
    currentSemesterCode,
    selectedSemesterCode: targetSemester,
    semesters: cached?.semesters || [],
    items: cachedList
      .map((raw) =>
        normalizeRawExamItem(
          raw,
          (prepMap[String(raw.ID)] as ExamPrepStatus) || "NOT_STARTED",
          notesMap[String(raw.ID)] || null
        )
      )
      .sort((a, b) =>
        a.examDate !== b.examDate
          ? a.examDate.localeCompare(b.examDate)
          : a.startTime.localeCompare(b.startTime)
      ),
  };
}

export async function revalidateExamsFromMyBk(
  semesterYear: string,
  force = false
) {
  const account = await prisma.myBkAccount
    .findFirst({ orderBy: { updatedAt: "desc" } })
    .catch(() => null);

  if (!account) {
    return getStoredExams(semesterYear);
  }

  const { jwtToken } = await ensureValidMyBkJwt(account);

  try {
    const { semesters, items } = await fetchMyBkExamsFromApi({
      jwtToken,
      studentId: account.studentId,
      semesterYear,
    });
    if (items.length > 0 || force) {
      await upsertExamItemsToPostgres(
        account.studentId,
        semesterYear,
        items,
        semesters
      );
    }
  } catch {
    if (account.ssoUsername && account.encryptedPassword) {
      const plainPassword = decryptCredential(account.encryptedPassword);
      if (plainPassword) {
        const freshSso = await loginMyBkCasSso(
          account.ssoUsername,
          plainPassword
        );
        const { semesters, items } = await fetchMyBkExamsFromApi({
          jwtToken: freshSso.jwtToken,
          studentId: account.studentId,
          semesterYear,
        });
        await upsertExamItemsToPostgres(
          account.studentId,
          semesterYear,
          items,
          semesters
        );
      }
    }
  }

  return getStoredExams(semesterYear);
}

export async function updateExamPrepAndNote(options: {
  examId: number;
  prepStatus?: ExamPrepStatus;
  personalNote?: string;
}) {
  const { examId, prepStatus, personalNote } = options;
  const cached = await readExamsCache();
  if (cached) {
    if (prepStatus) {
      cached.prepStatuses = {
        ...(cached.prepStatuses || {}),
        [String(examId)]: prepStatus,
      };
    }
    if (personalNote !== undefined) {
      cached.personalNotes = {
        ...(cached.personalNotes || {}),
        [String(examId)]: personalNote,
      };
    }
    await writeExamsCache(cached);
  }

  try {
    await prisma.academicExamItem.updateMany({
      where: { examId },
      data: {
        ...(prepStatus ? { prepStatus } : {}),
        ...(personalNote !== undefined ? { personalNote } : {}),
      },
    });
  } catch {
    // ignore if db offline
  }
}
