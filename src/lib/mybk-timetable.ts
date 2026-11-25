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

const MYBK_SEMESTER_SHORT_API =
  "https://mybk.hcmut.edu.vn/api/v1/semester-year/short?null";
const MYBK_STUDENT_SCHEDULE_API =
  "https://mybk.hcmut.edu.vn/api/v1/student/schedule";

const TIMETABLE_CACHE_PATH = path.join(
  process.cwd(),
  ".mybk-timetable-cache.json"
);

export interface RawMyBkSemesterOption {
  id: number;
  isCurrent: boolean;
  code: number;
  nameVi: string;
  nameEn: string;
}

export interface RawMyBkScheduleItem {
  id: number;
  mssv: string;
  subject: {
    id: number;
    code: string;
    nameVi: string;
    nameEn: string | null;
    numOfCredits: number;
    numOfCourseCredits: number;
  };
  academicYear: number;
  semester: number;
  semesterYearCode: string;
  semesterYearName: string;
  employee?: {
    id: number;
    code: string;
    firstName: string;
    lastName: string;
    email: string | null;
  } | null;
  subjectClassGroup?: {
    id: number;
    subjectClassGroupCode: string;
    classGroup: string | null;
    subjectGroup: string | null;
  } | null;
  room?: {
    id: number;
    code: string;
    building?: {
      id: number;
      code: string;
      campus?: {
        id: number;
        code: string;
        nameVi: string;
        nameEn: string;
      } | null;
      totalRoom?: number | null;
      note?: string | null;
    } | null;
  } | null;
  calendarYear: number;
  weeksCalendarBegin: number;
  dayOfWeek: number; // 2=Mon .. 7=Sat, 8=Sun, 0=Unscheduled/Project
  startLesson: number;
  numOfLesson: number;
  startTime: string;
  endTime: string;
  weekSeriesDisplay: string;
  lastUpdatedTime: string | null;
}

export interface NormalizedTimetableItem {
  scheduleId: number;
  studentId: string;
  semesterYearCode: string;
  semesterYearName: string;
  subjectCode: string;
  subjectNameVi: string;
  subjectNameEn: string | null;
  numOfCredits: number;
  classGroup: string | null;
  employeeName: string | null;
  employeeEmail: string | null;
  roomCode: string | null;
  buildingCode: string | null;
  buildingNote: string | null;
  campusCode: string | null;
  campusNameVi: string | null;
  calendarYear: number;
  weeksCalendarBegin: number;
  dayOfWeek: number;
  startLesson: number;
  numOfLesson: number;
  startTime: string;
  endTime: string;
  weekSeriesDisplay: string;
  activeWeeks: number[];
  lastUpdatedTime: string | null;
  courseNote: string | null;
}

interface TimetableCacheFile {
  connected: boolean;
  studentId: string;
  sinhVienId: number;
  currentSemesterCode: string;
  lastSyncedAt: string;
  semesters: RawMyBkSemesterOption[];
  schedulesBySemester: Record<string, RawMyBkScheduleItem[]>;
  courseNotes?: Record<string, string>;
}

/**
 * Parses Bách Khoa's weekSeriesDisplay (e.g. "35|--|37|38|39|40|41|--|43|...")
 * into an array of active calendar week numbers (e.g. [35, 37, 38, 39, 40, 41, 43, ...]).
 */
export function parseActiveWeeks(
  weekSeriesDisplay: string,
  weeksCalendarBegin = 35
): number[] {
  if (!weekSeriesDisplay) return [];
  const tokens = weekSeriesDisplay
    .split("|")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const active: number[] = [];
  tokens.forEach((token, idx) => {
    if (token !== "--") {
      const parsed = Number(token);
      if (!Number.isNaN(parsed) && parsed > 0) {
        active.push(parsed);
      } else {
        active.push(weeksCalendarBegin + idx);
      }
    }
  });
  return active;
}

/**
 * Deduplicates raw schedule items returned by myBK API.
 * In past semesters (e.g. 20252, 20251, 20253), myBK returns two records for the exact
 * same class session: the main class record (e.g. "20252_CO3011_L02") and a redundant
 * sub-group/evaluation record (e.g. "20252_CO3011_L02_A_ND" with subjectGroup="A"/"B")
 * sharing the exact same subjectCode, dayOfWeek, startLesson, numOfLesson, and weekSeriesDisplay.
 */
export function deduplicateScheduleItems<
  T extends {
    subjectCode?: string;
    subject?: { code?: string };
    classGroup?: string | null;
    subjectClassGroup?: {
      classGroup?: string | null;
      subjectClassGroupCode?: string | null;
    } | null;
    dayOfWeek: number;
    startLesson: number;
    numOfLesson: number;
    roomCode?: string | null;
    room?: { code?: string | null } | null;
    weekSeriesDisplay: string;
    lastUpdatedTime?: string | null;
  }
>(items: T[]): T[] {
  const map = new Map<string, T>();

  for (const item of items) {
    const code = item.subjectCode || item.subject?.code || "";
    const group =
      item.classGroup ?? item.subjectClassGroup?.classGroup ?? "";
    const room = item.roomCode ?? item.room?.code ?? "";
    const key = [
      code,
      group,
      item.dayOfWeek,
      item.startLesson,
      item.numOfLesson,
      room,
      item.weekSeriesDisplay,
    ].join("|");

    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      continue;
    }

    // Prefer the main group record (without _ND suffix) or the latest updated record
    const existingGroupCode =
      existing.subjectClassGroup?.subjectClassGroupCode || "";
    const currentGroupCode =
      item.subjectClassGroup?.subjectClassGroupCode || "";
    if (existingGroupCode.endsWith("_ND") && !currentGroupCode.endsWith("_ND")) {
      map.set(key, item);
    } else if (
      (item.lastUpdatedTime || "") > (existing.lastUpdatedTime || "")
    ) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}

export function normalizeRawScheduleItem(
  raw: RawMyBkScheduleItem,
  courseNote?: string | null
): NormalizedTimetableItem {
  const emp = raw.employee;
  const employeeName = emp
    ? `${emp.lastName || ""} ${emp.firstName || ""}`.trim()
    : null;
  const startTime =
    raw.startTime && raw.startTime.length === 4
      ? `0${raw.startTime}`
      : raw.startTime || "00:00";
  const endTime =
    raw.endTime && raw.endTime.length === 4
      ? `0${raw.endTime}`
      : raw.endTime || "00:00";

  return {
    scheduleId: Number(raw.id),
    studentId: String(raw.mssv || "2313425"),
    semesterYearCode: String(raw.semesterYearCode || "20261"),
    semesterYearName: String(
      raw.semesterYearName || "Học kỳ 1 Năm học 2026 - 2027"
    ),
    subjectCode: String(raw.subject?.code || ""),
    subjectNameVi: String(raw.subject?.nameVi || ""),
    subjectNameEn: raw.subject?.nameEn || null,
    numOfCredits: Number(raw.subject?.numOfCredits ?? 0),
    classGroup: raw.subjectClassGroup?.classGroup || null,
    employeeName: employeeName || null,
    employeeEmail: emp?.email || null,
    roomCode: raw.room?.code || null,
    buildingCode: raw.room?.building?.code || null,
    buildingNote: raw.room?.building?.note || null,
    campusCode: raw.room?.building?.campus?.code || null,
    campusNameVi: raw.room?.building?.campus?.nameVi || null,
    calendarYear: Number(raw.calendarYear || 2026),
    weeksCalendarBegin: Number(raw.weeksCalendarBegin || 35),
    dayOfWeek: Number(raw.dayOfWeek ?? 0),
    startLesson: Number(raw.startLesson ?? 0),
    numOfLesson: Number(raw.numOfLesson ?? 0),
    startTime,
    endTime,
    weekSeriesDisplay: String(raw.weekSeriesDisplay || ""),
    activeWeeks: parseActiveWeeks(
      raw.weekSeriesDisplay || "",
      Number(raw.weeksCalendarBegin || 35)
    ),
    lastUpdatedTime: raw.lastUpdatedTime || null,
    courseNote: courseNote || null,
  };
}

/**
 * Computes the Monday Date of an ISO calendar week in a given year.
 * Week 35 of 2026 starts on Monday 2026-08-24.
 * Week 48 of 2026 starts on Monday 2026-11-23 (so 2026-11-25 is Wednesday of Week 48).
 */
export function getMondayOfIsoWeek(year: number, weekNumber: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 1=Mon..7=Sun
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);

  const targetMonday = new Date(week1Monday);
  targetMonday.setUTCDate(week1Monday.getUTCDate() + (weekNumber - 1) * 7);
  return targetMonday;
}

/**
 * Returns the exact YYYY-MM-DD date string for a Bách Khoa schedule session
 * given calendarYear, weekNumber, and dayOfWeek (2=Mon .. 8=Sun).
 */
export function getExactSessionDateIso(
  calendarYear: number,
  weekNumber: number,
  dayOfWeek: number
): string {
  const monday = getMondayOfIsoWeek(calendarYear, weekNumber);
  const offsetDays = Math.max(0, Math.min(6, dayOfWeek - 2));
  const sessionDate = new Date(monday);
  sessionDate.setUTCDate(monday.getUTCDate() + offsetDays);
  return sessionDate.toISOString().slice(0, 10);
}

export function getIsoWeekOfDate(date: Date = new Date()): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function generateTraceparent(): string {
  const traceId = crypto.randomBytes(16).toString("hex");
  const spanId = crypto.randomBytes(8).toString("hex");
  return `01-${traceId}-${spanId}-01`;
}

export async function readTimetableCache(): Promise<TimetableCacheFile | null> {
  try {
    const raw = await fs.readFile(TIMETABLE_CACHE_PATH, "utf8");
    return JSON.parse(raw) as TimetableCacheFile;
  } catch {
    return null;
  }
}

export async function writeTimetableCache(data: TimetableCacheFile) {
  try {
    await fs.writeFile(
      TIMETABLE_CACHE_PATH,
      JSON.stringify(data, null, 2),
      "utf8"
    );
  } catch {
    // ignore
  }
}

export function filterRelevantSemesters(
  allSemesters: RawMyBkSemesterOption[]
): RawMyBkSemesterOption[] {
  return allSemesters
    .filter((s) => s.code >= 20231 && s.code <= 20263)
    .sort((a, b) => b.code - a.code);
}

/**
 * Fetches semester list and schedule for a given semesterYear from mybk.hcmut.edu.vn
 */
export async function fetchMyBkTimetableFromApi(options: {
  jwtToken: string;
  sinhVienId: number;
  semesterYear: string;
}): Promise<{
  semesters: RawMyBkSemesterOption[];
  items: RawMyBkScheduleItem[];
}> {
  const { jwtToken, sinhVienId, semesterYear } = options;
  const cleanToken = jwtToken.replace(/^Bearer\s+/i, "").trim();
  const makeHeaders = () => ({
    accept: "application/json",
    "accept-language": "vi",
    authorization: cleanToken,
    "content-type": "application/json",
    traceparent: generateTraceparent(),
    Referer: "https://mybk.hcmut.edu.vn/app/he-thong-quan-ly/sinh-vien/tkb",
  });

  const [semRes, schedRes] = await Promise.all([
    fetch(MYBK_SEMESTER_SHORT_API, {
      method: "GET",
      headers: makeHeaders(),
      cache: "no-store",
    }).catch(() => null),
    fetch(
      `${MYBK_STUDENT_SCHEDULE_API}?studentId=${encodeURIComponent(
        String(sinhVienId)
      )}&semesterYear=${encodeURIComponent(semesterYear)}&null`,
      {
        method: "GET",
        headers: makeHeaders(),
        cache: "no-store",
      }
    ),
  ]);

  if (!schedRes.ok) {
    throw new Error(`TIMETABLE_API_REJECTED:${schedRes.status}`);
  }

  const schedJson = await schedRes.json();
  if (String(schedJson.code) !== "200" || !Array.isArray(schedJson.data)) {
    throw new Error(schedJson.msg || "Không lấy được dữ liệu Thời khóa biểu");
  }

  let semesters: RawMyBkSemesterOption[] = [];
  if (semRes && semRes.ok) {
    const semJson = await semRes.json().catch(() => null);
    if (Array.isArray(semJson?.data)) {
      semesters = filterRelevantSemesters(semJson.data);
    }
  }

  return {
    semesters,
    items: schedJson.data as RawMyBkScheduleItem[],
  };
}

/**
 * Upserts timetable items into PostgreSQL and updates local cache
 */
export async function upsertTimetableItemsToPostgres(
  studentId: string,
  semesterYear: string,
  rawItems: RawMyBkScheduleItem[],
  semesters?: RawMyBkSemesterOption[]
): Promise<NormalizedTimetableItem[]> {
  const cached = await readTimetableCache();
  const notesMap = new Map<string, string>(
    Object.entries(cached?.courseNotes || {})
  );

  try {
    const existingDbItems = await prisma.academicTimetableItem.findMany({
      where: { studentId, semesterYearCode: semesterYear },
    });
    for (const row of existingDbItems) {
      if (row.courseNote) {
        notesMap.set(row.subjectCode, row.courseNote);
      }
    }
  } catch {
    // ignore if db offline
  }

  const dedupedRaw = deduplicateScheduleItems(rawItems);
  const normalized = dedupedRaw.map((raw) =>
    normalizeRawScheduleItem(
      raw,
      notesMap.get(String(raw.subject?.code || "")) || null
    )
  );

  // Update local cache
  const nextCache: TimetableCacheFile = {
    connected: true,
    studentId,
    sinhVienId: cached?.sinhVienId || 211441,
    currentSemesterCode:
      semesters?.find((s) => s.isCurrent)?.code.toString() ||
      cached?.currentSemesterCode ||
      "20261",
    lastSyncedAt: new Date().toISOString(),
    semesters:
      semesters && semesters.length > 0
        ? semesters
        : cached?.semesters || [],
    schedulesBySemester: {
      ...(cached?.schedulesBySemester || {}),
      [semesterYear]: dedupedRaw,
    },
    courseNotes: Object.fromEntries(notesMap.entries()),
  };
  await writeTimetableCache(nextCache);

  // Clean up any stale duplicate rows in PostgreSQL for this semester before upserting
  try {
    const validIds = normalized.map((item) => item.scheduleId);
    if (validIds.length > 0) {
      await prisma.academicTimetableItem.deleteMany({
        where: {
          studentId,
          semesterYearCode: semesterYear,
          scheduleId: { notIn: validIds },
        },
      });
    }
  } catch {
    // ignore
  }

  // Upsert into PostgreSQL
  try {
    await Promise.all(
      normalized.map((item) =>
        prisma.academicTimetableItem.upsert({
          where: {
            studentId_scheduleId: {
              studentId: item.studentId,
              scheduleId: item.scheduleId,
            },
          },
          update: {
            semesterYearCode: item.semesterYearCode,
            semesterYearName: item.semesterYearName,
            subjectCode: item.subjectCode,
            subjectNameVi: item.subjectNameVi,
            subjectNameEn: item.subjectNameEn,
            numOfCredits: item.numOfCredits,
            classGroup: item.classGroup,
            employeeName: item.employeeName,
            employeeEmail: item.employeeEmail,
            roomCode: item.roomCode,
            buildingCode: item.buildingCode,
            buildingNote: item.buildingNote,
            campusCode: item.campusCode,
            campusNameVi: item.campusNameVi,
            calendarYear: item.calendarYear,
            weeksCalendarBegin: item.weeksCalendarBegin,
            dayOfWeek: item.dayOfWeek,
            startLesson: item.startLesson,
            numOfLesson: item.numOfLesson,
            startTime: item.startTime,
            endTime: item.endTime,
            weekSeriesDisplay: item.weekSeriesDisplay,
            lastUpdatedTime: item.lastUpdatedTime,
            ...(item.courseNote ? { courseNote: item.courseNote } : {}),
          },
          create: {
            studentId: item.studentId,
            scheduleId: item.scheduleId,
            semesterYearCode: item.semesterYearCode,
            semesterYearName: item.semesterYearName,
            subjectCode: item.subjectCode,
            subjectNameVi: item.subjectNameVi,
            subjectNameEn: item.subjectNameEn,
            numOfCredits: item.numOfCredits,
            classGroup: item.classGroup,
            employeeName: item.employeeName,
            employeeEmail: item.employeeEmail,
            roomCode: item.roomCode,
            buildingCode: item.buildingCode,
            buildingNote: item.buildingNote,
            campusCode: item.campusCode,
            campusNameVi: item.campusNameVi,
            calendarYear: item.calendarYear,
            weeksCalendarBegin: item.weeksCalendarBegin,
            dayOfWeek: item.dayOfWeek,
            startLesson: item.startLesson,
            numOfLesson: item.numOfLesson,
            startTime: item.startTime,
            endTime: item.endTime,
            weekSeriesDisplay: item.weekSeriesDisplay,
            lastUpdatedTime: item.lastUpdatedTime,
            courseNote: item.courseNote,
          },
        })
      )
    );
  } catch {
    // fallback already written to cache
  }

  return normalized;
}

export async function getStoredTimetable(semesterYear?: string): Promise<{
  connected: boolean;
  studentId: string | null;
  hasAutoSso: boolean;
  isStale: boolean;
  lastSyncedAt: string | null;
  currentSemesterCode: string;
  selectedSemesterCode: string;
  semesters: RawMyBkSemesterOption[];
  items: NormalizedTimetableItem[];
}> {
  const cached = await readTimetableCache();
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
      let dbItems = await prisma.academicTimetableItem.findMany({
        where: {
          studentId: account.studentId,
          semesterYearCode: targetSemester,
        },
        orderBy: [{ dayOfWeek: "asc" }, { startLesson: "asc" }],
      });

      // Seed PostgreSQL from local cache if this semester hasn't been seeded yet
      const cachedRaw = cached?.schedulesBySemester?.[targetSemester];
      if (dbItems.length === 0 && cachedRaw && cachedRaw.length > 0) {
        await upsertTimetableItemsToPostgres(
          account.studentId,
          targetSemester,
          cachedRaw,
          cached?.semesters
        );
        dbItems = await prisma.academicTimetableItem.findMany({
          where: {
            studentId: account.studentId,
            semesterYearCode: targetSemester,
          },
          orderBy: [{ dayOfWeek: "asc" }, { startLesson: "asc" }],
        });
      }

      if (dbItems.length > 0) {
        const lastSyncedMs = account.lastSyncedAt
          ? account.lastSyncedAt.getTime()
          : 0;
        const mappedItems = dbItems.map((row) => ({
          scheduleId: row.scheduleId,
          studentId: row.studentId,
          semesterYearCode: row.semesterYearCode,
          semesterYearName: row.semesterYearName,
          subjectCode: row.subjectCode,
          subjectNameVi: row.subjectNameVi,
          subjectNameEn: row.subjectNameEn,
          numOfCredits: row.numOfCredits,
          classGroup: row.classGroup,
          employeeName: row.employeeName,
          employeeEmail: row.employeeEmail,
          roomCode: row.roomCode,
          buildingCode: row.buildingCode,
          buildingNote: row.buildingNote,
          campusCode: row.campusCode,
          campusNameVi: row.campusNameVi,
          calendarYear: row.calendarYear,
          weeksCalendarBegin: row.weeksCalendarBegin,
          dayOfWeek: row.dayOfWeek,
          startLesson: row.startLesson,
          numOfLesson: row.numOfLesson,
          startTime: row.startTime,
          endTime: row.endTime,
          weekSeriesDisplay: row.weekSeriesDisplay,
          activeWeeks: parseActiveWeeks(
            row.weekSeriesDisplay,
            row.weeksCalendarBegin
          ),
          lastUpdatedTime: row.lastUpdatedTime,
          courseNote: row.courseNote,
        }));
        const dedupedItems = deduplicateScheduleItems(mappedItems);

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
          items: dedupedItems,
        };
      }
    }
  } catch {
    // fallback to cache
  }

  const cachedList = deduplicateScheduleItems(
    cached?.schedulesBySemester?.[targetSemester] || []
  );
  const notes = cached?.courseNotes || {};
  return {
    connected: Boolean(cached?.connected),
    studentId: cached?.studentId || "2313425",
    hasAutoSso: false,
    isStale: false,
    lastSyncedAt: cached?.lastSyncedAt || null,
    currentSemesterCode,
    selectedSemesterCode: targetSemester,
    semesters: cached?.semesters || [],
    items: cachedList.map((raw) =>
      normalizeRawScheduleItem(
        raw,
        notes[String(raw.subject?.code || "")] || null
      )
    ),
  };
}

export async function revalidateTimetableFromMyBk(
  semesterYear: string,
  force = false
) {
  const account = await prisma.myBkAccount
    .findFirst({ orderBy: { updatedAt: "desc" } })
    .catch(() => null);

  if (!account) {
    return getStoredTimetable(semesterYear);
  }

  const sinhVienId = account.sinhVienId || 211441;
  const { jwtToken } = await ensureValidMyBkJwt(account);

  try {
    const { semesters, items } = await fetchMyBkTimetableFromApi({
      jwtToken,
      sinhVienId,
      semesterYear,
    });
    if (items.length > 0 || force) {
      await upsertTimetableItemsToPostgres(
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
        const { semesters, items } = await fetchMyBkTimetableFromApi({
          jwtToken: freshSso.jwtToken,
          sinhVienId,
          semesterYear,
        });
        await upsertTimetableItemsToPostgres(
          account.studentId,
          semesterYear,
          items,
          semesters
        );
      }
    }
  }

  return getStoredTimetable(semesterYear);
}

export async function saveCourseQuickNote(
  subjectCode: string,
  courseNote: string
) {
  const cached = await readTimetableCache();
  if (cached) {
    cached.courseNotes = {
      ...(cached.courseNotes || {}),
      [subjectCode]: courseNote,
    };
    await writeTimetableCache(cached);
  }

  try {
    await prisma.academicTimetableItem.updateMany({
      where: { subjectCode },
      data: { courseNote },
    });
  } catch {
    // ignore if db offline
  }
}
