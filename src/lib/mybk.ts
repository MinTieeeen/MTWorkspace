import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { prisma } from "./prisma";

const MYBK_CAS_SERVICE = "https://mybk.hcmut.edu.vn/app/login/cas";
const MYBK_SSO_LOGIN_URL = `https://sso.hcmut.edu.vn/cas/login?service=${encodeURIComponent(
  MYBK_CAS_SERVICE
)}`;
const MYBK_TRANSCRIPT_API =
  "https://mybk.hcmut.edu.vn/api/share/ket-qua-hoc-tap/danh-sach-diem-hoc-ky-mon-hoc/v2";
const MYBK_OTHER_COURSES_API =
  "https://mybk.hcmut.edu.vn/api/share/ket-qua-hoc-tap/danh-sach-diem-mon-hoc-khac/v2";
const MYBK_COMPONENT_SCORES_API =
  "https://mybk.hcmut.edu.vn/api/share/ket-qua-hoc-tap/thong-tin-tinh-trang-diem-thanh-phan-mon-hoc/v2";
const MYBK_STUDENT_OVERVIEW_API =
  "https://mybk.hcmut.edu.vn/api/share/ket-qua-hoc-tap/thong-tin-mo-ta-bang-diem/v2?tuychon=VIEWONLINE";

const LOCAL_CACHE_PATH = path.join(
  process.cwd(),
  ".mybk-transcript-cache.json"
);

/**
 * Stale threshold for SWR background revalidation (5 minutes)
 */
export const SWR_STALE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Token safety buffer before expiration (5 minutes)
 */
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * Singleton lock to prevent concurrent SSO/myBK requests from triggering HTTP 429
 */
let activeSyncPromise: Promise<MyBkTranscriptPayload> | null = null;

export interface RawMyBkComponentScore {
  ma: string;
  ten: string;
  tyle: number;
  diem: number | null;
}

export interface ComponentScoreItem {
  key: string;
  label: string;
  weight: number;
  score: number | null;
}

export interface MyBkStudentOverview {
  masv: string;
  malop: string;
  hovaten: string;
  namHocHocKyTen: string;
}

export interface RawMyBkSemester {
  sinhVienId: number;
  namHocHocKyId: number;
  maNamHocHocKy: string;
  namHocHocKyTen: string;
  soTCTLHocKy: number;
  diemTBTLHocKy: string;
  soTCTLChung: string;
  diemTBTLChung: string;
  capNhatCuoi: string | null;
}

export interface RawMyBkCourse {
  sinhVienId: number;
  namHocHocKyId: number;
  maHocKy: string;
  monHocId: number;
  maMonHoc: string;
  tenMonHoc: string;
  soTinChi: number;
  diemChu: string | null;
  diemSo: number | null;
  diemDat: string | null;
  tinhTrangDiem: string | null;
  diemKhongIn: string | null;
  nhomTo: string | null;
  ghiChu: string | null;
  componentScores?: ComponentScoreItem[];
  isNewUpdate?: boolean;
}

export interface RawMyBkOtherCourse {
  maHocKy: string;
  maMonHoc: string;
  tenMonHoc: string;
  diemSo: string | null;
  diemdat: string | null;
  ghiChu: string | null;
  capNhatCuoi: string | null;
}

export interface SyncChangeNotification {
  id?: string;
  semesterCode: string;
  courseCode: string;
  title: string;
  message: string;
  createdAt: string;
}

export interface MyBkTranscriptPayload {
  connected: boolean;
  studentId: string | null;
  ssoUsername: string | null;
  hasAutoSso?: boolean;
  isStale?: boolean;
  tokenRefreshed?: boolean;
  lastSyncedAt: string | null;
  studentInfo?: MyBkStudentOverview | null;
  semesters: RawMyBkSemester[];
  courses: RawMyBkCourse[];
  otherCourses: RawMyBkOtherCourse[];
  recentChanges?: SyncChangeNotification[];
}

const COMPONENT_FULL_NAMES: Record<string, string> = {
  kiemTra: "Kiểm tra giữa kỳ (K.Tra)",
  baiTapThucHanh: "Bài tập / Thực hành (B.Tập)",
  thiNghiem: "Thí nghiệm (TNg)",
  baiTapLon_TieuLuan: "Bài tập lớn / Đồ án (BTL/ĐA)",
  thi: "Thi cuối kỳ (Thi)",
};

export function parseDiemThanhPhanJson(
  rawJson: string | null | undefined
): ComponentScoreItem[] {
  if (!rawJson) return [];
  try {
    const arr: RawMyBkComponentScore[] = JSON.parse(rawJson);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((item) => item.ma !== "tket" && item.ma !== "tkethp")
      .map((item) => ({
        key: item.ma,
        label: COMPONENT_FULL_NAMES[item.ma] || item.ten || item.ma,
        weight: Number(item.tyle || 0),
        score:
          item.diem !== null && item.diem !== undefined
            ? Number(item.diem)
            : null,
      }));
  } catch {
    return [];
  }
}

function getEncryptionKey(): Buffer {
  const secret =
    process.env.SESSION_SECRET || "mt-workspace-local-secret-key-2026";
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptCredential(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${authTag.toString(
    "base64url"
  )}.${encrypted.toString("base64url")}`;
}

export function decryptCredential(cipherText: string): string | null {
  try {
    const [ivB64, tagB64, dataB64] = cipherText.split(".");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      Buffer.from(ivB64, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export function decodeMyBkJwt(token: string): {
  sub?: string;
  exp?: number;
} {
  try {
    const clean = token.replace(/^Bearer\s+/i, "").trim();
    const parts = clean.split(".");
    if (parts.length < 2) return {};
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
    return {
      sub: payload.sub ? String(payload.sub) : undefined,
      exp: payload.exp ? Number(payload.exp) * 1000 : undefined,
    };
  } catch {
    return {};
  }
}

function generateTraceparent(): string {
  const traceId = crypto.randomBytes(16).toString("hex");
  const spanId = crypto.randomBytes(8).toString("hex");
  return `01-${traceId}-${spanId}-01`;
}

function extractCookies(res: Response): string[] {
  const anyHeaders = res.headers as unknown as {
    getSetCookie?: () => string[];
  };
  if (typeof anyHeaders.getSetCookie === "function") {
    return anyHeaders.getSetCookie().map((c) => c.split(";")[0]);
  }
  const raw = res.headers.get("set-cookie");
  return raw ? [raw.split(";")[0]] : [];
}

/**
 * Pure HTTP CAS login to sso.hcmut.edu.vn -> mybk.hcmut.edu.vn/app/login/cas -> #hid_Token
 */
export async function loginMyBkCasSso(
  username: string,
  password: string
): Promise<{ jwtToken: string; studentId: string }> {
  const casPageRes = await fetch(MYBK_SSO_LOGIN_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    cache: "no-store",
  });

  const casCookies = extractCookies(casPageRes);
  const casHtml = await casPageRes.text();

  const ltMatch = casHtml.match(/name="lt"\s+value="([^"]+)"/i);
  const execMatch = casHtml.match(/name="execution"\s+value="([^"]+)"/i);
  const actionMatch = casHtml.match(/<form[^>]*id="fm1"[^>]*action="([^"]+)"/i);

  if (!ltMatch || !execMatch) {
    throw new Error("Không thể khởi tạo phiên đăng nhập với sso.hcmut.edu.vn");
  }

  const lt = ltMatch[1];
  const execution = execMatch[1];
  const formAction = actionMatch
    ? actionMatch[1].replace(/&amp;/g, "&")
    : `/cas/login?service=${encodeURIComponent(MYBK_CAS_SERVICE)}`;

  const postUrl = formAction.startsWith("http")
    ? formAction
    : `https://sso.hcmut.edu.vn${formAction}`;

  const loginRes = await fetch(postUrl, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: casCookies.join("; "),
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    body: new URLSearchParams({
      username: username.trim(),
      password,
      lt,
      execution,
      _eventId: "submit",
      submit: "Login",
    }),
  });

  const ticketLocation = loginRes.headers.get("location");
  if (!ticketLocation || !ticketLocation.includes("ticket=")) {
    throw new Error(
      "Sai tên đăng nhập hoặc mật khẩu SSO HCMUT (hoặc tài khoản yêu cầu xác thực bổ sung)"
    );
  }

  const mybkSessionCookies: string[] = [];
  let nextUrl: string | null = ticketLocation;

  for (let hop = 0; hop < 5 && nextUrl; hop++) {
    const hopUrl: string = nextUrl.startsWith("http")
      ? nextUrl.replace(
          /^http:\/\/mybk\.hcmut\.edu\.vn/i,
          "https://mybk.hcmut.edu.vn"
        )
      : `https://mybk.hcmut.edu.vn${nextUrl}`;

    const hopRes: Response = await fetch(hopUrl, {
      redirect: "manual",
      headers: {
        Cookie: mybkSessionCookies.join("; "),
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    for (const c of extractCookies(hopRes)) {
      const cookieName = c.split("=")[0];
      const existingIdx = mybkSessionCookies.findIndex((x) =>
        x.startsWith(`${cookieName}=`)
      );
      if (existingIdx >= 0) {
        mybkSessionCookies[existingIdx] = c;
      } else {
        mybkSessionCookies.push(c);
      }
    }

    if (hopRes.status >= 300 && hopRes.status < 400) {
      nextUrl = hopRes.headers.get("location");
    } else {
      const html = await hopRes.text();
      const tokenMatch = html.match(/id="hid_Token"\s+value="([^"]+)"/i);
      if (tokenMatch && tokenMatch[1]) {
        const jwtToken = tokenMatch[1].trim();
        const decoded = decodeMyBkJwt(jwtToken);
        if (!decoded.sub || decoded.sub === "UGUEST") {
          throw new Error("Không lấy được Token sinh viên từ myBK");
        }
        return { jwtToken, studentId: decoded.sub };
      }
      nextUrl = null;
    }
  }

  const appRes = await fetch("https://mybk.hcmut.edu.vn/app/", {
    headers: {
      Cookie: mybkSessionCookies.join("; "),
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    cache: "no-store",
  });

  const appHtml = await appRes.text();
  const tokenMatch = appHtml.match(/id="hid_Token"\s+value="([^"]+)"/i);
  if (!tokenMatch || !tokenMatch[1]) {
    throw new Error(
      "Đăng nhập SSO thành công nhưng không tìm thấy hid_Token trên myBK"
    );
  }

  const jwtToken = tokenMatch[1].trim();
  const decoded = decodeMyBkJwt(jwtToken);
  if (!decoded.sub || decoded.sub === "UGUEST") {
    throw new Error("Token nhận được không phải tài khoản sinh viên");
  }

  return { jwtToken, studentId: decoded.sub };
}

/**
 * Auto-SSO Token Manager:
 * Returns a valid myBK JWT token. If the stored JWT is expired (or within 5 minutes of expiry)
 * and encrypted SSO credentials exist, it automatically logs into CAS SSO in the background
 * and updates PostgreSQL with the fresh token.
 */
export async function ensureValidMyBkJwt(account: {
  studentId: string;
  jwtToken: string;
  tokenExpiresAt: bigint | null;
  ssoUsername: string | null;
  encryptedPassword: string | null;
}): Promise<{ jwtToken: string; refreshed: boolean }> {
  const now = Date.now();
  const decoded = decodeMyBkJwt(account.jwtToken);
  const expMs = account.tokenExpiresAt
    ? Number(account.tokenExpiresAt)
    : decoded.exp || 0;

  if (account.jwtToken && expMs - TOKEN_EXPIRY_BUFFER_MS > now) {
    return { jwtToken: account.jwtToken, refreshed: false };
  }

  // Token expired or about to expire -> Auto-refresh via stored SSO credentials!
  if (account.ssoUsername && account.encryptedPassword) {
    const plainPassword = decryptCredential(account.encryptedPassword);
    if (plainPassword) {
      const fresh = await loginMyBkCasSso(account.ssoUsername, plainPassword);
      const freshDecoded = decodeMyBkJwt(fresh.jwtToken);
      try {
        await prisma.myBkAccount.update({
          where: { studentId: account.studentId },
          data: {
            jwtToken: fresh.jwtToken,
            tokenExpiresAt: freshDecoded.exp ? BigInt(freshDecoded.exp) : null,
          },
        });
      } catch {
        // ignore if db offline
      }
      return { jwtToken: fresh.jwtToken, refreshed: true };
    }
  }

  return { jwtToken: account.jwtToken, refreshed: false };
}

export async function fetchMyBkAcademicTranscript(
  jwtToken: string,
  studentId: string
): Promise<{
  studentInfo: MyBkStudentOverview | null;
  semesters: RawMyBkSemester[];
  courses: RawMyBkCourse[];
  otherCourses: RawMyBkOtherCourse[];
}> {
  const cleanToken = jwtToken.replace(/^Bearer\s+/i, "").trim();
  const makeHeaders = () => ({
    accept: "application/json",
    "accept-language": "vi",
    authorization: cleanToken,
    "content-type": "application/json",
    traceparent: generateTraceparent(),
    Referer:
      "https://mybk.hcmut.edu.vn/app/sinh-vien/ket-qua-hoc-tap/bang-diem-mon-hoc",
  });

  const [infoRes, semRes, courseRes, otherRes] = await Promise.all([
    fetch(MYBK_STUDENT_OVERVIEW_API, {
      method: "POST",
      headers: makeHeaders(),
      body: JSON.stringify(studentId),
      cache: "no-store",
    }).catch(() => null),
    fetch(`${MYBK_TRANSCRIPT_API}?tuychon=BANGDIEM_HOCKY`, {
      method: "POST",
      headers: makeHeaders(),
      body: JSON.stringify(studentId),
      cache: "no-store",
    }),
    fetch(`${MYBK_TRANSCRIPT_API}?tuychon=BANGDIEM_MONHOC`, {
      method: "POST",
      headers: makeHeaders(),
      body: JSON.stringify(studentId),
      cache: "no-store",
    }),
    fetch(`${MYBK_OTHER_COURSES_API}?tuychon=BANGDIEM_MONHOC`, {
      method: "POST",
      headers: makeHeaders(),
      body: JSON.stringify(studentId),
      cache: "no-store",
    }).catch(() => null),
  ]);

  if (!semRes.ok || !courseRes.ok) {
    throw new Error(
      `TOKEN_EXPIRED_OR_REJECTED:${semRes.status}/${courseRes.status}`
    );
  }

  const infoJson =
    infoRes && infoRes.ok ? await infoRes.json().catch(() => null) : null;
  const semJson = await semRes.json();
  const courseJson = await courseRes.json();
  const otherJson =
    otherRes && otherRes.ok ? await otherRes.json().catch(() => null) : null;

  if (
    String(semJson.code) !== "200" ||
    !Array.isArray(semJson.data) ||
    semJson.data.length === 0
  ) {
    throw new Error("TOKEN_EXPIRED_EMPTY_DATA");
  }

  const studentInfo: MyBkStudentOverview | null = infoJson?.data
    ? {
        masv: String(infoJson.data.masv || studentId),
        malop: String(infoJson.data.malop || ""),
        hovaten: String(infoJson.data.hovaten || ""),
        namHocHocKyTen: String(infoJson.data.namHocHocKyTen || ""),
      }
    : null;

  const semesters: RawMyBkSemester[] = semJson.data;
  const rawCourses: RawMyBkCourse[] = Array.isArray(courseJson.data)
    ? courseJson.data
    : [];
  const otherCourses: RawMyBkOtherCourse[] = Array.isArray(otherJson?.data)
    ? otherJson.data
    : [];

  const sinhVienId =
    semesters[0]?.sinhVienId ?? rawCourses[0]?.sinhVienId ?? null;

  const compMap = new Map<
    string,
    { tenTinhTrang?: string; components: ComponentScoreItem[] }
  >();

  if (sinhVienId) {
    try {
      const compRes = await fetch(MYBK_COMPONENT_SCORES_API, {
        method: "POST",
        headers: makeHeaders(),
        body: String(sinhVienId),
        cache: "no-store",
      });
      if (compRes.ok) {
        const compJson = await compRes.json();
        const compList: Array<{
          namHocHocKyId: number;
          monHocId: number;
          tenTinhTrang?: string;
          diemThanhPhanJson?: string;
        }> = Array.isArray(compJson.data) ? compJson.data : [];

        for (const item of compList) {
          const key = `${item.namHocHocKyId}_${item.monHocId}`;
          compMap.set(key, {
            tenTinhTrang: item.tenTinhTrang,
            components: parseDiemThanhPhanJson(item.diemThanhPhanJson),
          });
        }
      }
    } catch {
      // ignore
    }
  }

  const courses: RawMyBkCourse[] = rawCourses.map((c) => {
    const found = compMap.get(`${c.namHocHocKyId}_${c.monHocId}`);
    return {
      ...c,
      tinhTrangDiem: found?.tenTinhTrang || c.tinhTrangDiem || null,
      componentScores: found?.components || [],
    };
  });

  return { studentInfo, semesters, courses, otherCourses };
}

export async function writeLocalCache(payload: MyBkTranscriptPayload) {
  try {
    await fs.writeFile(
      LOCAL_CACHE_PATH,
      JSON.stringify(payload, null, 2),
      "utf8"
    );
  } catch {
    // ignore
  }
}

export async function readLocalCache(): Promise<MyBkTranscriptPayload | null> {
  try {
    const raw = await fs.readFile(LOCAL_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as MyBkTranscriptPayload;
    return {
      ...parsed,
      otherCourses: parsed.otherCourses || [],
    };
  } catch {
    return null;
  }
}

export async function clearLocalCache() {
  try {
    await fs.unlink(LOCAL_CACHE_PATH);
  } catch {
    // ignore
  }
}

/**
 * Diff Engine + Smart PostgreSQL Upsert:
 * Compares incoming myBK data against existing PostgreSQL rows, detects newly updated grades/components,
 * logs notifications, and performs true composite-key UPSERT into PostgreSQL.
 */
export async function saveAndSyncMyBkTranscript(options: {
  studentId: string;
  jwtToken: string;
  ssoUsername?: string;
  rawPassword?: string;
  tokenRefreshed?: boolean;
}): Promise<MyBkTranscriptPayload> {
  const { studentId, jwtToken, ssoUsername, rawPassword, tokenRefreshed } =
    options;
  const { studentInfo, semesters, courses, otherCourses } =
    await fetchMyBkAcademicTranscript(jwtToken, studentId);

  const existingCache = await readLocalCache();
  const nowIso = new Date().toISOString();
  const decoded = decodeMyBkJwt(jwtToken);
  const sinhVienId =
    semesters[0]?.sinhVienId ?? courses[0]?.sinhVienId ?? undefined;
  const resolvedStudentInfo = studentInfo || existingCache?.studentInfo || null;
  const resolvedSsoUsername =
    ssoUsername || existingCache?.ssoUsername || null;

  const detectedChanges: SyncChangeNotification[] = [];

  try {
    const encryptedPassword = rawPassword
      ? encryptCredential(rawPassword)
      : undefined;

    // 1. Upsert MyBkAccount
    const upsertedAccount = await prisma.myBkAccount.upsert({
      where: { studentId },
      update: {
        sinhVienId,
        ...(ssoUsername ? { ssoUsername } : {}),
        ...(encryptedPassword ? { encryptedPassword } : {}),
        jwtToken,
        tokenExpiresAt: decoded.exp ? BigInt(decoded.exp) : null,
        studentInfoJson: resolvedStudentInfo
          ? JSON.stringify(resolvedStudentInfo)
          : undefined,
        lastSyncedAt: new Date(nowIso),
      },
      create: {
        studentId,
        sinhVienId,
        ssoUsername: resolvedSsoUsername,
        encryptedPassword: encryptedPassword || null,
        jwtToken,
        tokenExpiresAt: decoded.exp ? BigInt(decoded.exp) : null,
        studentInfoJson: resolvedStudentInfo
          ? JSON.stringify(resolvedStudentInfo)
          : null,
        lastSyncedAt: new Date(nowIso),
      },
    });

    // 2. Read existing courses from PostgreSQL to run Diff Engine before Upserting
    const existingDbCourses = await prisma.academicCourseGrade.findMany({
      where: { studentId },
    });
    const isInitialImport = existingDbCourses.length === 0;
    const existingCourseMap = new Map(
      existingDbCourses.map((c) => [
        `${c.maHocKy}_${c.maMonHoc}_${c.monHocId}`,
        c,
      ])
    );

    // 3. Upsert each AcademicSemester by composite key [studentId, maNamHocHocKy]
    await Promise.all(
      semesters.map((s, idx) =>
        prisma.academicSemester.upsert({
          where: {
            studentId_maNamHocHocKy: {
              studentId,
              maNamHocHocKy: String(s.maNamHocHocKy),
            },
          },
          update: {
            namHocHocKyId: Number(s.namHocHocKyId),
            namHocHocKyTen: String(s.namHocHocKyTen),
            soTCTLHocKy: Number(s.soTCTLHocKy || 0),
            diemTBTLHocKy: String(s.diemTBTLHocKy ?? "0.0"),
            soTCTLChung: String(s.soTCTLChung ?? "0"),
            diemTBTLChung: String(s.diemTBTLChung ?? "0.0"),
            capNhatCuoi: s.capNhatCuoi ? String(s.capNhatCuoi) : null,
            sortOrder: idx,
          },
          create: {
            studentId,
            namHocHocKyId: Number(s.namHocHocKyId),
            maNamHocHocKy: String(s.maNamHocHocKy),
            namHocHocKyTen: String(s.namHocHocKyTen),
            soTCTLHocKy: Number(s.soTCTLHocKy || 0),
            diemTBTLHocKy: String(s.diemTBTLHocKy ?? "0.0"),
            soTCTLChung: String(s.soTCTLChung ?? "0"),
            diemTBTLChung: String(s.diemTBTLChung ?? "0.0"),
            capNhatCuoi: s.capNhatCuoi ? String(s.capNhatCuoi) : null,
            sortOrder: idx,
          },
        })
      )
    );

    // 4. Diff & Upsert each AcademicCourseGrade by composite key [studentId, maHocKy, maMonHoc, monHocId]
    await Promise.all(
      courses.map(async (c) => {
        const compKey = `${c.maHocKy}_${c.maMonHoc}_${c.monHocId}`;
        const oldCourse = existingCourseMap.get(compKey);
        const newCompJson =
          c.componentScores && c.componentScores.length > 0
            ? JSON.stringify(c.componentScores)
            : null;

        let isNewUpdate = oldCourse?.isNewUpdate || false;

        if (!isInitialImport) {
          if (!oldCourse) {
            isNewUpdate = true;
            detectedChanges.push({
              semesterCode: c.maHocKy,
              courseCode: c.maMonHoc,
              title: `Môn mới [${c.maMonHoc}] ${c.tenMonHoc}`,
              message: `Đã thêm vào bảng điểm HK ${c.maHocKy}${
                c.diemChu ? ` • Điểm: ${c.diemSo ?? ""} (${c.diemChu})` : ""
              }`,
              createdAt: nowIso,
            });
          } else {
            const scoreChanged =
              oldCourse.diemSo !== c.diemSo || oldCourse.diemChu !== c.diemChu;
            const compChanged =
              (oldCourse.componentScoresJson || null) !== newCompJson;

            if (scoreChanged || compChanged) {
              isNewUpdate = true;
              detectedChanges.push({
                semesterCode: c.maHocKy,
                courseCode: c.maMonHoc,
                title: `Cập nhật điểm [${c.maMonHoc}] ${c.tenMonHoc}`,
                message: scoreChanged
                  ? `Điểm tổng kết mới: ${c.diemSo ?? "--"} (${
                      c.diemChu ?? "--"
                    })`
                  : `Đã cập nhật điểm thành phần mới trong HK ${c.maHocKy}`,
                createdAt: nowIso,
              });
            }
          }
        }

        c.isNewUpdate = isNewUpdate;

        await prisma.academicCourseGrade.upsert({
          where: {
            studentId_maHocKy_maMonHoc_monHocId: {
              studentId,
              maHocKy: String(c.maHocKy),
              maMonHoc: String(c.maMonHoc),
              monHocId: Number(c.monHocId),
            },
          },
          update: {
            namHocHocKyId: Number(c.namHocHocKyId),
            tenMonHoc: String(c.tenMonHoc),
            soTinChi: Number(c.soTinChi || 0),
            diemChu: c.diemChu ? String(c.diemChu) : null,
            diemSo:
              c.diemSo !== null && c.diemSo !== undefined
                ? Number(c.diemSo)
                : null,
            diemDat: c.diemDat !== null ? String(c.diemDat) : null,
            tinhTrangDiem: c.tinhTrangDiem ? String(c.tinhTrangDiem) : null,
            diemKhongIn: c.diemKhongIn ? String(c.diemKhongIn) : null,
            nhomTo: c.nhomTo ? String(c.nhomTo) : null,
            ghiChu: c.ghiChu ? String(c.ghiChu) : null,
            componentScoresJson: newCompJson,
            isNewUpdate,
          },
          create: {
            studentId,
            namHocHocKyId: Number(c.namHocHocKyId),
            maHocKy: String(c.maHocKy),
            monHocId: Number(c.monHocId),
            maMonHoc: String(c.maMonHoc),
            tenMonHoc: String(c.tenMonHoc),
            soTinChi: Number(c.soTinChi || 0),
            diemChu: c.diemChu ? String(c.diemChu) : null,
            diemSo:
              c.diemSo !== null && c.diemSo !== undefined
                ? Number(c.diemSo)
                : null,
            diemDat: c.diemDat !== null ? String(c.diemDat) : null,
            tinhTrangDiem: c.tinhTrangDiem ? String(c.tinhTrangDiem) : null,
            diemKhongIn: c.diemKhongIn ? String(c.diemKhongIn) : null,
            nhomTo: c.nhomTo ? String(c.nhomTo) : null,
            ghiChu: c.ghiChu ? String(c.ghiChu) : null,
            componentScoresJson: newCompJson,
            isNewUpdate,
          },
        });
      })
    );

    // 5. Upsert each AcademicOtherGrade by composite key [studentId, maHocKy, maMonHoc]
    await Promise.all(
      otherCourses.map((o) =>
        prisma.academicOtherGrade.upsert({
          where: {
            studentId_maHocKy_maMonHoc: {
              studentId,
              maHocKy: String(o.maHocKy || ""),
              maMonHoc: String(o.maMonHoc || ""),
            },
          },
          update: {
            tenMonHoc: String(o.tenMonHoc || ""),
            diemSo: o.diemSo !== null ? String(o.diemSo) : null,
            diemDat: o.diemdat !== null ? String(o.diemdat) : null,
            ghiChu: o.ghiChu ? String(o.ghiChu) : null,
            capNhatCuoi: o.capNhatCuoi ? String(o.capNhatCuoi) : null,
          },
          create: {
            studentId,
            maHocKy: String(o.maHocKy || ""),
            maMonHoc: String(o.maMonHoc || ""),
            tenMonHoc: String(o.tenMonHoc || ""),
            diemSo: o.diemSo !== null ? String(o.diemSo) : null,
            diemDat: o.diemdat !== null ? String(o.diemdat) : null,
            ghiChu: o.ghiChu ? String(o.ghiChu) : null,
            capNhatCuoi: o.capNhatCuoi ? String(o.capNhatCuoi) : null,
          },
        })
      )
    );

    // 6. Save detected changes into AcademicSyncNotification table
    if (detectedChanges.length > 0) {
      await prisma.academicSyncNotification.createMany({
        data: detectedChanges.map((ch) => ({
          studentId,
          category: "GRADE",
          semesterCode: ch.semesterCode,
          courseCode: ch.courseCode,
          title: ch.title,
          message: ch.message,
        })),
      });
    }

    const payload: MyBkTranscriptPayload = {
      connected: true,
      studentId,
      ssoUsername: upsertedAccount.ssoUsername,
      hasAutoSso: Boolean(
        upsertedAccount.ssoUsername && upsertedAccount.encryptedPassword
      ),
      isStale: false,
      tokenRefreshed: Boolean(tokenRefreshed),
      lastSyncedAt: nowIso,
      studentInfo: resolvedStudentInfo,
      semesters,
      courses,
      otherCourses,
      recentChanges: detectedChanges,
    };

    await writeLocalCache(payload);
    return payload;
  } catch {
    const payload: MyBkTranscriptPayload = {
      connected: true,
      studentId,
      ssoUsername: resolvedSsoUsername,
      hasAutoSso: false,
      isStale: false,
      tokenRefreshed: Boolean(tokenRefreshed),
      lastSyncedAt: nowIso,
      studentInfo: resolvedStudentInfo,
      semesters,
      courses,
      otherCourses,
      recentChanges: detectedChanges,
    };
    await writeLocalCache(payload);
    return payload;
  }
}

/**
 * Background SWR Revalidation Engine:
 * Safely deduplicates concurrent sync requests, auto-refreshes expired JWT tokens via SSO,
 * and falls back gracefully to PostgreSQL data if myBK is offline.
 */
export async function backgroundRevalidateMyBkTranscript(
  force = false
): Promise<MyBkTranscriptPayload> {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    try {
      const account = await prisma.myBkAccount
        .findFirst({ orderBy: { updatedAt: "desc" } })
        .catch(() => null);

      if (!account) {
        return getStoredMyBkTranscript();
      }

      const lastSyncedMs = account.lastSyncedAt
        ? account.lastSyncedAt.getTime()
        : 0;
      const isStale = Date.now() - lastSyncedMs > SWR_STALE_THRESHOLD_MS;

      if (!force && !isStale) {
        return getStoredMyBkTranscript();
      }

      // Step 1: Ensure valid token (auto-login via SSO if token expired)
      const { jwtToken, refreshed } = await ensureValidMyBkJwt(account);

      try {
        return await saveAndSyncMyBkTranscript({
          studentId: account.studentId,
          jwtToken,
          ssoUsername: account.ssoUsername || undefined,
          tokenRefreshed: refreshed,
        });
      } catch (apiErr) {
        // Step 2: If myBK rejected the token before its exp timestamp, force a fresh SSO login and retry once!
        if (account.ssoUsername && account.encryptedPassword) {
          const plainPassword = decryptCredential(account.encryptedPassword);
          if (plainPassword) {
            const freshSso = await loginMyBkCasSso(
              account.ssoUsername,
              plainPassword
            );
            return await saveAndSyncMyBkTranscript({
              studentId: account.studentId,
              jwtToken: freshSso.jwtToken,
              ssoUsername: account.ssoUsername,
              tokenRefreshed: true,
            });
          }
        }
        throw apiErr;
      }
    } finally {
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}

/**
 * Fast <20ms Reader from PostgreSQL (with local cache fallback & auto-seed if DB is empty)
 */
export async function getStoredMyBkTranscript(): Promise<MyBkTranscriptPayload> {
  const cached = await readLocalCache();

  try {
    let account = await prisma.myBkAccount.findFirst({
      orderBy: { updatedAt: "desc" },
      include: {
        semesters: { orderBy: { sortOrder: "asc" } },
        courses: true,
        otherCourses: true,
        notifications: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });

    // If PostgreSQL is empty but we have local cached data, seed PostgreSQL automatically via upsert!
    if (!account && cached && cached.studentId && cached.semesters.length > 0) {
      await prisma.myBkAccount.upsert({
        where: { studentId: cached.studentId },
        update: {
          sinhVienId: cached.semesters[0]?.sinhVienId || 211441,
          ssoUsername: cached.ssoUsername,
          studentInfoJson: cached.studentInfo
            ? JSON.stringify(cached.studentInfo)
            : null,
          lastSyncedAt: cached.lastSyncedAt
            ? new Date(cached.lastSyncedAt)
            : new Date(),
        },
        create: {
          studentId: cached.studentId,
          sinhVienId: cached.semesters[0]?.sinhVienId || 211441,
          ssoUsername: cached.ssoUsername,
          jwtToken: "",
          studentInfoJson: cached.studentInfo
            ? JSON.stringify(cached.studentInfo)
            : null,
          lastSyncedAt: cached.lastSyncedAt
            ? new Date(cached.lastSyncedAt)
            : new Date(),
        },
      });

      await Promise.all(
        cached.semesters.map((s, idx) =>
          prisma.academicSemester.upsert({
            where: {
              studentId_maNamHocHocKy: {
                studentId: cached.studentId!,
                maNamHocHocKy: String(s.maNamHocHocKy),
              },
            },
            update: { sortOrder: idx },
            create: {
              studentId: cached.studentId!,
              namHocHocKyId: Number(s.namHocHocKyId),
              maNamHocHocKy: String(s.maNamHocHocKy),
              namHocHocKyTen: String(s.namHocHocKyTen),
              soTCTLHocKy: Number(s.soTCTLHocKy || 0),
              diemTBTLHocKy: String(s.diemTBTLHocKy ?? "0.0"),
              soTCTLChung: String(s.soTCTLChung ?? "0"),
              diemTBTLChung: String(s.diemTBTLChung ?? "0.0"),
              capNhatCuoi: s.capNhatCuoi ? String(s.capNhatCuoi) : null,
              sortOrder: idx,
            },
          })
        )
      );

      await Promise.all(
        cached.courses.map((c) =>
          prisma.academicCourseGrade.upsert({
            where: {
              studentId_maHocKy_maMonHoc_monHocId: {
                studentId: cached.studentId!,
                maHocKy: String(c.maHocKy),
                maMonHoc: String(c.maMonHoc),
                monHocId: Number(c.monHocId),
              },
            },
            update: {},
            create: {
              studentId: cached.studentId!,
              namHocHocKyId: Number(c.namHocHocKyId),
              maHocKy: String(c.maHocKy),
              monHocId: Number(c.monHocId),
              maMonHoc: String(c.maMonHoc),
              tenMonHoc: String(c.tenMonHoc),
              soTinChi: Number(c.soTinChi || 0),
              diemChu: c.diemChu ? String(c.diemChu) : null,
              diemSo:
                c.diemSo !== null && c.diemSo !== undefined
                  ? Number(c.diemSo)
                  : null,
              diemDat: c.diemDat !== null ? String(c.diemDat) : null,
              tinhTrangDiem: c.tinhTrangDiem ? String(c.tinhTrangDiem) : null,
              diemKhongIn: c.diemKhongIn ? String(c.diemKhongIn) : null,
              nhomTo: c.nhomTo ? String(c.nhomTo) : null,
              ghiChu: c.ghiChu ? String(c.ghiChu) : null,
              componentScoresJson:
                c.componentScores && c.componentScores.length > 0
                  ? JSON.stringify(c.componentScores)
                  : null,
            },
          })
        )
      );

      await Promise.all(
        (cached.otherCourses || []).map((o) =>
          prisma.academicOtherGrade.upsert({
            where: {
              studentId_maHocKy_maMonHoc: {
                studentId: cached.studentId!,
                maHocKy: String(o.maHocKy || ""),
                maMonHoc: String(o.maMonHoc || ""),
              },
            },
            update: {},
            create: {
              studentId: cached.studentId!,
              maHocKy: String(o.maHocKy || ""),
              maMonHoc: String(o.maMonHoc || ""),
              tenMonHoc: String(o.tenMonHoc || ""),
              diemSo: o.diemSo !== null ? String(o.diemSo) : null,
              diemDat: o.diemdat !== null ? String(o.diemdat) : null,
              ghiChu: o.ghiChu ? String(o.ghiChu) : null,
              capNhatCuoi: o.capNhatCuoi ? String(o.capNhatCuoi) : null,
            },
          })
        )
      );

      account = await prisma.myBkAccount.findFirst({
        orderBy: { updatedAt: "desc" },
        include: {
          semesters: { orderBy: { sortOrder: "asc" } },
          courses: true,
          otherCourses: true,
          notifications: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
      });
    }

    if (account && account.semesters.length > 0) {
      const lastSyncedMs = account.lastSyncedAt
        ? account.lastSyncedAt.getTime()
        : 0;
      const hasAutoSso = Boolean(
        account.ssoUsername && account.encryptedPassword
      );
      const isStale = Date.now() - lastSyncedMs > SWR_STALE_THRESHOLD_MS;

      return {
        connected: true,
        studentId: account.studentId,
        ssoUsername: account.ssoUsername,
        hasAutoSso,
        isStale,
        lastSyncedAt: account.lastSyncedAt
          ? account.lastSyncedAt.toISOString()
          : null,
        studentInfo: account.studentInfoJson
          ? JSON.parse(account.studentInfoJson)
          : cached?.studentInfo || null,
        semesters: account.semesters.map((s) => ({
          sinhVienId: account.sinhVienId || 0,
          namHocHocKyId: s.namHocHocKyId,
          maNamHocHocKy: s.maNamHocHocKy,
          namHocHocKyTen: s.namHocHocKyTen,
          soTCTLHocKy: s.soTCTLHocKy,
          diemTBTLHocKy: s.diemTBTLHocKy,
          soTCTLChung: s.soTCTLChung,
          diemTBTLChung: s.diemTBTLChung,
          capNhatCuoi: s.capNhatCuoi,
        })),
        courses: account.courses.map((c) => ({
          sinhVienId: account.sinhVienId || 0,
          namHocHocKyId: c.namHocHocKyId,
          maHocKy: c.maHocKy,
          monHocId: c.monHocId,
          maMonHoc: c.maMonHoc,
          tenMonHoc: c.tenMonHoc,
          soTinChi: c.soTinChi,
          diemChu: c.diemChu,
          diemSo: c.diemSo,
          diemDat: c.diemDat,
          tinhTrangDiem: c.tinhTrangDiem,
          diemKhongIn: c.diemKhongIn,
          nhomTo: c.nhomTo,
          ghiChu: c.ghiChu,
          isNewUpdate: c.isNewUpdate,
          componentScores: c.componentScoresJson
            ? JSON.parse(c.componentScoresJson)
            : undefined,
        })),
        otherCourses: account.otherCourses.map((o) => ({
          maHocKy: o.maHocKy,
          maMonHoc: o.maMonHoc,
          tenMonHoc: o.tenMonHoc,
          diemSo: o.diemSo,
          diemdat: o.diemDat,
          ghiChu: o.ghiChu,
          capNhatCuoi: o.capNhatCuoi,
        })),
        recentChanges: account.notifications.map((n) => ({
          id: n.id,
          semesterCode: n.semesterCode || "",
          courseCode: n.courseCode || "",
          title: n.title,
          message: n.message,
          createdAt: n.createdAt.toISOString(),
        })),
      };
    }
  } catch {
    // fallback to local cache
  }

  if (cached) return cached;

  return {
    connected: false,
    studentId: null,
    ssoUsername: null,
    hasAutoSso: false,
    isStale: false,
    lastSyncedAt: null,
    studentInfo: null,
    semesters: [],
    courses: [],
    otherCourses: [],
    recentChanges: [],
  };
}
