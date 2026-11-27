import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { prisma } from "./prisma";

const MYBK_CAS_SERVICE = "https://mybk.hcmut.edu.vn/app/login/cas";
const MYBK_SSO_LOGIN_URL = `https://sso.hcmut.edu.vn/cas/login?service=${encodeURIComponent(
  MYBK_CAS_SERVICE
)}`;

// New Official v1 Student Academic Results APIs
const MYBK_V1_STUDENT_INFO_API =
  "https://mybk.hcmut.edu.vn/api/v1/student/get-student-info?null";
const MYBK_V1_SEMESTER_GRADE_API =
  "https://mybk.hcmut.edu.vn/api/v1/student/semester-year-grade";
const MYBK_V1_SUBJECT_GRADE_API =
  "https://mybk.hcmut.edu.vn/api/v1/student/subject-grade";
const MYBK_V1_SUBJECT_GRADE_DETAIL_API =
  "https://mybk.hcmut.edu.vn/api/v1/student/subject-grade/detail";
const MYBK_V1_SEMESTER_SHORT_API =
  "https://mybk.hcmut.edu.vn/api/v1/semester-year/short?null";

// Supplemental APIs for Class Name (MT23KHM5) and Certificates (GDTC, CNTTCB, CTXH)
const MYBK_STUDENT_OVERVIEW_API =
  "https://mybk.hcmut.edu.vn/api/share/ket-qua-hoc-tap/thong-tin-mo-ta-bang-diem/v2?tuychon=VIEWONLINE";
const MYBK_OTHER_COURSES_API =
  "https://mybk.hcmut.edu.vn/api/share/ket-qua-hoc-tap/danh-sach-diem-mon-hoc-khac/v2";

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
  codeEn?: string;
  label: string;
  weight: number;
  score: number | null;
  rawGrade?: string | null;
  lastUpdatedAt?: string | null;
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
  diemTBTLHocKy: string;       // GPA Hệ 4.0 học kỳ (fourPointScale)
  diemTBHocKyHe10?: string | null;   // GPA Hệ 10 học kỳ (grade)
  diemChuHocKy?: string | null;      // Điểm chữ học kỳ (letterGrade)
  soTCTLChung: string;         // Tín chỉ tích lũy chung
  diemTBTLChung: string;       // CPA Hệ 4.0 chung
  diemTBTLChungHe10?: string | null; // CPA Hệ 10 chung (tenPointScaleCommonCumulativeGPA)
  capNhatCuoi: string | null;
}

export interface RawMyBkCourse {
  sinhVienId: number;
  namHocHocKyId: number;
  maHocKy: string;
  monHocId: number;
  maMonHoc: string;
  tenMonHoc: string;
  tenMonHocEn?: string | null;
  soTinChi: number;
  soTinChiHocPhan?: number | null;
  diemChu: string | null;
  diemSo: number | null;
  diemDat: string | null;
  tinhTrangDiem: string | null;
  diemKhongIn: string | null;
  nhomTo: string | null;
  nhomThucHanh?: string | null;
  ghiChu: string | null;
  ngayCongBoDiem?: string | null;
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

// Raw interfaces for v1 endpoints
interface V1SemesterGradeItem {
  id: string;
  semesterYear: {
    id: number;
    isCurrent: boolean;
    code: number;
    nameVi: string;
    nameEn: string;
  };
  student: {
    id: number;
    code: string;
    firstName: string;
    lastName: string;
  };
  numOfCredits: number;
  grade: number | null;
  letterGrade: string | null;
  fourPointScale: number | null;
  fourPointScaleCumulativeGPA: number | null;
  tenPointScaleCumulativeGPA: number | null;
  fourPointScaleCommonCumulativeGPA: number | null;
  tenPointScaleCommonCumulativeGPA: number | null;
  cumulativeCourseCredits: number | null;
  commonCumulativeCredits: number | null;
  note: string | null;
  lastUpdatedAt: string | null;
}

interface V1SubjectGradeItem {
  id: string;
  semesterYear: {
    id: number;
    isCurrent: boolean;
    code: number;
    nameVi: string;
    nameEn: string;
  };
  subject: {
    id: number;
    code: string;
    nameVi: string;
    nameEn: string | null;
    numOfCredits: number;
    numOfCourseCredits: number | null;
  };
  student: {
    id: number;
    code: string;
    firstName: string;
    lastName: string;
  };
  grade: string | null;
  letterGrade: string | null;
  passingGrade: number | null;
  note: string | null;
  createdAt: string | null;
}

interface V1SubjectGradeDetailItem {
  id: number;
  subject: {
    id: number;
    code: string;
    nameVi: string;
    nameEn: string | null;
    numOfCredits: number;
    numOfCourseCredits: number | null;
  };
  semesterYear: {
    id: number;
    isCurrent: boolean;
    code: number;
    nameVi: string;
    nameEn: string;
  };
  studentSubjectGradeDetails: Array<{
    id: number;
    grade: string | null;
    percentage: number;
    gradeColumnDictionary: {
      id: number;
      code: string;
      nameVi: string;
      nameEn: string;
    };
    isInvalid: boolean;
    lastUpdatedAt: string | null;
  }>;
  subjectClassGroup?: {
    id: number;
    subjectClassGroupCode: string;
    classGroup: string | null;
    subjectGroup: string | null;
  } | null;
  note: string | null;
  invalidFlag: number;
  lastUpdatedAt: string | null;
}

const COMPONENT_FULL_NAMES: Record<string, string> = {
  kiemTra: "Kiểm tra giữa kỳ (KTR)",
  baiTapThucHanh: "Bài tập / Thực hành (BTP)",
  thiNghiem: "Thí nghiệm (TNG)",
  baiTapLon_TieuLuan: "Bài tập lớn / Đồ án (BTL)",
  thi: "Thi cuối kỳ (THI)",
};

function formatIsoToViDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  if (iso.includes("/")) return iso;
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}`;
  }
  return iso;
}

function normalizeSemesterCode(code: number | string): string {
  const s = String(code).trim();
  if (s === "99991" || s.toUpperCase() === "BL") return "BL";
  return s;
}

function parseV1SubjectGradeTokens(
  rawGrade: string | null | undefined,
  rawLetter: string | null | undefined
): { diemSo: number | null; diemChu: string | null } {
  const g = (rawGrade || "").trim().toUpperCase();
  const l = (rawLetter || "").trim().toUpperCase();

  if (g === "MT" || l === "MT") {
    return { diemSo: 12, diemChu: "MT" };
  }
  if (g === "DT" || l === "DT") {
    return { diemSo: 21, diemChu: "DT" };
  }
  if (g === "RT" || l === "RT" || g === "VT") {
    return { diemSo: 17, diemChu: "RT" };
  }

  const parsedNum = g !== "" && g !== "--" ? Number(g) : NaN;
  const diemSo = !Number.isNaN(parsedNum) ? parsedNum : null;
  const diemChu = l && l !== "--" ? l : null;
  return { diemSo, diemChu };
}

export function parseV1GradeDetailsList(
  details: V1SubjectGradeDetailItem["studentSubjectGradeDetails"] | undefined
): {
  components: ComponentScoreItem[];
  tketScore: number | null;
} {
  if (!Array.isArray(details)) return { components: [], tketScore: null };

  let tketScore: number | null = null;
  const components: ComponentScoreItem[] = [];

  for (const d of details) {
    const code = d.gradeColumnDictionary?.code || "";
    const rawStr = d.grade !== null && d.grade !== undefined ? String(d.grade).trim() : "";
    const numVal = rawStr !== "" && rawStr !== "--" ? Number(rawStr) : NaN;
    const numericScore = !Number.isNaN(numVal) ? numVal : null;

    if (code === "tket" || code === "tkethp") {
      if (numericScore !== null && tketScore === null) {
        tketScore = numericScore;
      }
      continue;
    }

    const codeEn = d.gradeColumnDictionary?.nameEn || "";
    const nameVi = d.gradeColumnDictionary?.nameVi || code;
    const label =
      COMPONENT_FULL_NAMES[code] ||
      (codeEn ? `${nameVi} (${codeEn})` : nameVi);

    components.push({
      key: code,
      codeEn: codeEn || undefined,
      label,
      weight: Number(d.percentage || 0),
      score: numericScore,
      rawGrade: rawStr || null,
      lastUpdatedAt: formatIsoToViDateTime(d.lastUpdatedAt),
    });
  }

  return { components, tketScore };
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
 * Auto-SSO Token Manager
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

/**
 * Resolves internal numeric sinhVienId (e.g. 211441) from DB, cache, or v1/student/get-student-info
 */
async function resolveNumericSinhVienId(
  cleanToken: string,
  studentId: string
): Promise<number> {
  try {
    const acc = await prisma.myBkAccount.findUnique({ where: { studentId } });
    if (acc?.sinhVienId) return acc.sinhVienId;
  } catch {
    // ignore
  }

  const cached = await readLocalCache();
  if (cached?.semesters?.[0]?.sinhVienId) {
    return cached.semesters[0].sinhVienId;
  }

  try {
    const res = await fetch(MYBK_V1_STUDENT_INFO_API, {
      method: "GET",
      headers: {
        accept: "application/json",
        "accept-language": "vi",
        authorization: cleanToken,
        "content-type": "application/json",
        traceparent: generateTraceparent(),
        Referer:
          "https://mybk.hcmut.edu.vn/app/he-thong-quan-ly/sinh-vien/ket-qua-hoc-tap",
      },
      cache: "no-store",
    });
    if (res.ok) {
      const json = await res.json();
      const id = Number(json?.data?.id || json?.data?.sinhVienId);
      if (id > 0) return id;
    }
  } catch {
    // ignore
  }

  return 211441;
}

/**
 * Fetches full academic transcript using the official v1 APIs:
 * 1. GET /api/v1/student/semester-year-grade?studentId=211441&semesterYear=-1&null
 * 2. GET /api/v1/student/subject-grade?studentId=211441&semesterYear=-1&null
 * 3. GET /api/v1/student/subject-grade/detail?studentId=211441&semesterYear=<code>&null
 * Plus VIEWONLINE student overview (for class code MT23KHM5) & otherCourses (certificates).
 */
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
  const sinhVienId = await resolveNumericSinhVienId(cleanToken, studentId);

  const makeV1Headers = () => ({
    accept: "application/json",
    "accept-language": "vi",
    authorization: cleanToken,
    "content-type": "application/json",
    traceparent: generateTraceparent(),
    Referer:
      "https://mybk.hcmut.edu.vn/app/he-thong-quan-ly/sinh-vien/ket-qua-hoc-tap",
  });

  const makeShareHeaders = () => ({
    accept: "application/json",
    "accept-language": "vi",
    authorization: cleanToken,
    "content-type": "application/json",
    traceparent: generateTraceparent(),
    Referer:
      "https://mybk.hcmut.edu.vn/app/sinh-vien/ket-qua-hoc-tap/bang-diem-mon-hoc",
  });

  const [semRes, subjRes, semShortRes, infoRes, otherRes] = await Promise.all([
    fetch(
      `${MYBK_V1_SEMESTER_GRADE_API}?studentId=${sinhVienId}&semesterYear=-1&null`,
      {
        method: "GET",
        headers: makeV1Headers(),
        cache: "no-store",
      }
    ),
    fetch(
      `${MYBK_V1_SUBJECT_GRADE_API}?studentId=${sinhVienId}&semesterYear=-1&null`,
      {
        method: "GET",
        headers: makeV1Headers(),
        cache: "no-store",
      }
    ),
    fetch(MYBK_V1_SEMESTER_SHORT_API, {
      method: "GET",
      headers: makeV1Headers(),
      cache: "no-store",
    }).catch(() => null),
    fetch(MYBK_STUDENT_OVERVIEW_API, {
      method: "POST",
      headers: makeShareHeaders(),
      body: JSON.stringify(studentId),
      cache: "no-store",
    }).catch(() => null),
    fetch(`${MYBK_OTHER_COURSES_API}?tuychon=BANGDIEM_MONHOC`, {
      method: "POST",
      headers: makeShareHeaders(),
      body: JSON.stringify(studentId),
      cache: "no-store",
    }).catch(() => null),
  ]);

  if (!semRes.ok || !subjRes.ok) {
    throw new Error(
      `TOKEN_EXPIRED_OR_REJECTED:${semRes.status}/${subjRes.status}`
    );
  }

  const semJson = await semRes.json();
  const subjJson = await subjRes.json();
  const semShortJson =
    semShortRes && semShortRes.ok
      ? await semShortRes.json().catch(() => null)
      : null;
  const infoJson =
    infoRes && infoRes.ok ? await infoRes.json().catch(() => null) : null;
  const otherJson =
    otherRes && otherRes.ok ? await otherRes.json().catch(() => null) : null;

  if (
    String(semJson.code) !== "200" ||
    !Array.isArray(semJson.data) ||
    semJson.data.length === 0
  ) {
    throw new Error("TOKEN_EXPIRED_EMPTY_DATA");
  }

  const rawV1Semesters: V1SemesterGradeItem[] = semJson.data;
  const rawV1Subjects: V1SubjectGradeItem[] = Array.isArray(subjJson.data)
    ? subjJson.data
    : [];

  // Determine current semester code (e.g. 20261) so we also fetch in-progress component scores
  const currentSemObj = Array.isArray(semShortJson?.data)
    ? semShortJson.data.find((s: { isCurrent?: boolean; code?: number }) => s.isCurrent)
    : null;

  // Map v1 Semester Grades
  const semestersMap = new Map<string, RawMyBkSemester>();
  for (const s of rawV1Semesters) {
    const rawCode = s.semesterYear?.code ?? 0;
    const maNamHocHocKy = normalizeSemesterCode(rawCode);
    const isTransfer = maNamHocHocKy === "BL";

    semestersMap.set(maNamHocHocKy, {
      sinhVienId: Number(s.student?.id || sinhVienId),
      namHocHocKyId: Number(s.semesterYear?.id || 0),
      maNamHocHocKy,
      namHocHocKyTen: String(s.semesterYear?.nameVi || `Học kỳ ${maNamHocHocKy}`),
      soTCTLHocKy: Number(s.numOfCredits ?? 0),
      diemTBTLHocKy:
        isTransfer || s.fourPointScale === null || s.fourPointScale === undefined
          ? "0.0"
          : Number(s.fourPointScale).toFixed(1),
      diemTBHocKyHe10:
        isTransfer || s.grade === null || s.grade === undefined
          ? null
          : Number(s.grade).toFixed(1),
      diemChuHocKy:
        isTransfer || !s.letterGrade || s.letterGrade === "--"
          ? null
          : String(s.letterGrade),
      soTCTLChung: String(
        s.commonCumulativeCredits ?? s.cumulativeCourseCredits ?? 0
      ),
      diemTBTLChung:
        s.fourPointScaleCommonCumulativeGPA !== null &&
        s.fourPointScaleCommonCumulativeGPA !== undefined
          ? Number(s.fourPointScaleCommonCumulativeGPA).toFixed(1)
          : "0.0",
      diemTBTLChungHe10:
        s.tenPointScaleCommonCumulativeGPA !== null &&
        s.tenPointScaleCommonCumulativeGPA !== undefined
          ? Number(s.tenPointScaleCommonCumulativeGPA).toFixed(2)
          : null,
      capNhatCuoi: formatIsoToViDateTime(s.lastUpdatedAt),
    });
  }

  // Collect all numeric semester codes (excluding 99991) + current semester to fetch subject-grade/detail
  const detailSemesterCodes = new Set<number>();
  for (const s of rawV1Semesters) {
    const codeNum = Number(s.semesterYear?.code || 0);
    if (codeNum >= 20200 && codeNum < 90000) {
      detailSemesterCodes.add(codeNum);
    }
  }
  if (currentSemObj?.code) {
    detailSemesterCodes.add(Number(currentSemObj.code));
  }

  const detailItemsByKey = new Map<string, V1SubjectGradeDetailItem>();
  const allDetailRecords: V1SubjectGradeDetailItem[] = [];

  // Try fetching all details or per-semester in parallel
  const detailResults = await Promise.all(
    Array.from(detailSemesterCodes).map(async (semCode) => {
      try {
        const dRes = await fetch(
          `${MYBK_V1_SUBJECT_GRADE_DETAIL_API}?studentId=${sinhVienId}&semesterYear=${semCode}&null`,
          {
            method: "GET",
            headers: makeV1Headers(),
            cache: "no-store",
          }
        );
        if (!dRes.ok) return [];
        const dJson = await dRes.json();
        return Array.isArray(dJson?.data)
          ? (dJson.data as V1SubjectGradeDetailItem[])
          : [];
      } catch {
        return [];
      }
    })
  );

  for (const list of detailResults) {
    for (const dItem of list) {
      if (dItem.invalidFlag === 1) continue;
      const semCodeStr = normalizeSemesterCode(dItem.semesterYear?.code ?? "");
      const subjCodeStr = String(dItem.subject?.code || "").toUpperCase();
      const key = `${semCodeStr}_${subjCodeStr}`;
      detailItemsByKey.set(key, dItem);
      allDetailRecords.push(dItem);
    }
  }

  // Build unified courses list from v1/student/subject-grade + enrich with v1/student/subject-grade/detail
  const coursesByKey = new Map<string, RawMyBkCourse>();

  for (const item of rawV1Subjects) {
    const maHocKy = normalizeSemesterCode(
      item.id?.startsWith("BL.") ? "BL" : item.semesterYear?.code ?? ""
    );
    const maMonHoc = String(item.subject?.code || "");
    const key = `${maHocKy}_${maMonHoc.toUpperCase()}`;
    const detail = detailItemsByKey.get(key);
    const parsedDetail = parseV1GradeDetailsList(
      detail?.studentSubjectGradeDetails
    );
    const { diemSo, diemChu } = parseV1SubjectGradeTokens(
      item.grade,
      item.letterGrade
    );

    coursesByKey.set(key, {
      sinhVienId: Number(item.student?.id || sinhVienId),
      namHocHocKyId: Number(item.semesterYear?.id || 0),
      maHocKy,
      monHocId: Number(item.subject?.id || 0),
      maMonHoc,
      tenMonHoc: String(item.subject?.nameVi || ""),
      tenMonHocEn: item.subject?.nameEn || null,
      soTinChi: Number(item.subject?.numOfCredits ?? 0),
      soTinChiHocPhan:
        item.subject?.numOfCourseCredits !== null &&
        item.subject?.numOfCourseCredits !== undefined
          ? Number(item.subject.numOfCourseCredits)
          : null,
      diemChu,
      diemSo,
      diemDat:
        item.passingGrade !== null && item.passingGrade !== undefined
          ? String(item.passingGrade)
          : null,
      tinhTrangDiem: "Chính thức",
      diemKhongIn: "0",
      nhomTo: detail?.subjectClassGroup?.classGroup || null,
      nhomThucHanh: detail?.subjectClassGroup?.subjectGroup || null,
      ghiChu: item.note || detail?.note || null,
      ngayCongBoDiem: formatIsoToViDateTime(
        item.createdAt || detail?.lastUpdatedAt
      ),
      componentScores: parsedDetail.components,
    });
  }

  // Merge subjects that appear in v1/student/subject-grade/detail (e.g. SA0002 or in-progress current semester courses)
  // but aren't finalized in v1/student/subject-grade yet!
  for (const dItem of allDetailRecords) {
    const maHocKy = normalizeSemesterCode(dItem.semesterYear?.code ?? "");
    const maMonHoc = String(dItem.subject?.code || "");
    const key = `${maHocKy}_${maMonHoc.toUpperCase()}`;
    if (coursesByKey.has(key)) continue;

    const parsedDetail = parseV1GradeDetailsList(
      dItem.studentSubjectGradeDetails
    );
    const hasTket = parsedDetail.tketScore !== null;

    // Ensure the semester exists in semestersMap (e.g. current semester 20261 with partial grades)
    if (!semestersMap.has(maHocKy) && dItem.semesterYear) {
      semestersMap.set(maHocKy, {
        sinhVienId,
        namHocHocKyId: Number(dItem.semesterYear.id),
        maNamHocHocKy: maHocKy,
        namHocHocKyTen: String(dItem.semesterYear.nameVi),
        soTCTLHocKy: 0,
        diemTBTLHocKy: "0.0",
        diemTBHocKyHe10: null,
        diemChuHocKy: null,
        soTCTLChung: "0",
        diemTBTLChung: "0.0",
        diemTBTLChungHe10: null,
        capNhatCuoi: formatIsoToViDateTime(dItem.lastUpdatedAt),
      });
    }

    coursesByKey.set(key, {
      sinhVienId,
      namHocHocKyId: Number(dItem.semesterYear?.id || 0),
      maHocKy,
      monHocId: Number(dItem.subject?.id || 0),
      maMonHoc,
      tenMonHoc: String(dItem.subject?.nameVi || ""),
      tenMonHocEn: dItem.subject?.nameEn || null,
      soTinChi: Number(dItem.subject?.numOfCredits ?? 0),
      soTinChiHocPhan:
        dItem.subject?.numOfCourseCredits !== null &&
        dItem.subject?.numOfCourseCredits !== undefined
          ? Number(dItem.subject.numOfCourseCredits)
          : null,
      diemChu:
        hasTket && Number(dItem.subject?.numOfCredits ?? 0) === 0 ? "DT" : null,
      diemSo: parsedDetail.tketScore,
      diemDat: hasTket ? "1" : null,
      tinhTrangDiem: hasTket ? "Chính thức" : "Đang cập nhật",
      diemKhongIn: "0",
      nhomTo: dItem.subjectClassGroup?.classGroup || null,
      nhomThucHanh: dItem.subjectClassGroup?.subjectGroup || null,
      ghiChu: dItem.note || null,
      ngayCongBoDiem: formatIsoToViDateTime(dItem.lastUpdatedAt),
      componentScores: parsedDetail.components,
    });
  }

  // Sort semesters descending (20261 -> 20253 -> 20252 ... -> BL at end)
  const semesters = Array.from(semestersMap.values()).sort((a, b) => {
    if (a.maNamHocHocKy === "BL") return 1;
    if (b.maNamHocHocKy === "BL") return -1;
    return b.maNamHocHocKy.localeCompare(a.maNamHocHocKy);
  });

  const courses = Array.from(coursesByKey.values());

  const firstStudent = rawV1Semesters[0]?.student || rawV1Subjects[0]?.student;
  const fullNameFromV1 = firstStudent
    ? `${firstStudent.lastName || ""} ${firstStudent.firstName || ""}`.trim()
    : "";

  const studentInfo: MyBkStudentOverview | null = infoJson?.data
    ? {
        masv: String(infoJson.data.masv || studentId),
        malop: String(infoJson.data.malop || ""),
        hovaten: String(infoJson.data.hovaten || fullNameFromV1),
        namHocHocKyTen: String(
          infoJson.data.namHocHocKyTen || currentSemObj?.nameVi || ""
        ),
      }
    : fullNameFromV1
    ? {
        masv: String(firstStudent?.code || studentId),
        malop: "",
        hovaten: fullNameFromV1,
        namHocHocKyTen: String(currentSemObj?.nameVi || ""),
      }
    : null;

  const otherCourses: RawMyBkOtherCourse[] = Array.isArray(otherJson?.data)
    ? otherJson.data
    : [];

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
 * Diff Engine + Smart PostgreSQL Upsert
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
    semesters[0]?.sinhVienId ?? courses[0]?.sinhVienId ?? 211441;
  const resolvedStudentInfo: MyBkStudentOverview | null = studentInfo
    ? {
        ...studentInfo,
        malop: studentInfo.malop || existingCache?.studentInfo?.malop || "",
      }
    : existingCache?.studentInfo || null;
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

    // 3. Upsert each AcademicSemester
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
            diemTBHocKyHe10: s.diemTBHocKyHe10 ?? null,
            diemChuHocKy: s.diemChuHocKy ?? null,
            soTCTLChung: String(s.soTCTLChung ?? "0"),
            diemTBTLChung: String(s.diemTBTLChung ?? "0.0"),
            diemTBTLChungHe10: s.diemTBTLChungHe10 ?? null,
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
            diemTBHocKyHe10: s.diemTBHocKyHe10 ?? null,
            diemChuHocKy: s.diemChuHocKy ?? null,
            soTCTLChung: String(s.soTCTLChung ?? "0"),
            diemTBTLChung: String(s.diemTBTLChung ?? "0.0"),
            diemTBTLChungHe10: s.diemTBTLChungHe10 ?? null,
            capNhatCuoi: s.capNhatCuoi ? String(s.capNhatCuoi) : null,
            sortOrder: idx,
          },
        })
      )
    );

    // 4. Diff & Upsert each AcademicCourseGrade
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
            tenMonHocEn: c.tenMonHocEn ?? null,
            soTinChi: Number(c.soTinChi || 0),
            soTinChiHocPhan: c.soTinChiHocPhan ?? null,
            diemChu: c.diemChu ? String(c.diemChu) : null,
            diemSo:
              c.diemSo !== null && c.diemSo !== undefined
                ? Number(c.diemSo)
                : null,
            diemDat: c.diemDat !== null ? String(c.diemDat) : null,
            tinhTrangDiem: c.tinhTrangDiem ? String(c.tinhTrangDiem) : null,
            diemKhongIn: c.diemKhongIn ? String(c.diemKhongIn) : null,
            nhomTo: c.nhomTo ? String(c.nhomTo) : null,
            nhomThucHanh: c.nhomThucHanh ?? null,
            ghiChu: c.ghiChu ? String(c.ghiChu) : null,
            ngayCongBoDiem: c.ngayCongBoDiem ?? null,
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
            tenMonHocEn: c.tenMonHocEn ?? null,
            soTinChi: Number(c.soTinChi || 0),
            soTinChiHocPhan: c.soTinChiHocPhan ?? null,
            diemChu: c.diemChu ? String(c.diemChu) : null,
            diemSo:
              c.diemSo !== null && c.diemSo !== undefined
                ? Number(c.diemSo)
                : null,
            diemDat: c.diemDat !== null ? String(c.diemDat) : null,
            tinhTrangDiem: c.tinhTrangDiem ? String(c.tinhTrangDiem) : null,
            diemKhongIn: c.diemKhongIn ? String(c.diemKhongIn) : null,
            nhomTo: c.nhomTo ? String(c.nhomTo) : null,
            nhomThucHanh: c.nhomThucHanh ?? null,
            ghiChu: c.ghiChu ? String(c.ghiChu) : null,
            ngayCongBoDiem: c.ngayCongBoDiem ?? null,
            componentScoresJson: newCompJson,
            isNewUpdate,
          },
        });
      })
    );

    // 5. Upsert each AcademicOtherGrade
    if (otherCourses.length > 0) {
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
    }

    // 6. Save detected changes
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
      otherCourses:
        otherCourses.length > 0
          ? otherCourses
          : existingCache?.otherCourses || [],
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
      otherCourses:
        otherCourses.length > 0
          ? otherCourses
          : existingCache?.otherCourses || [],
      recentChanges: detectedChanges,
    };
    await writeLocalCache(payload);
    return payload;
  }
}

/**
 * Background SWR Revalidation Engine
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
      const missingV1Fields = await prisma.academicSemester
        .findFirst({
          where: {
            studentId: account.studentId,
            maNamHocHocKy: { not: "BL" },
            diemTBTLChungHe10: { not: null },
          },
        })
        .then((row) => !row)
        .catch(() => false);

      if (!force && !isStale && !missingV1Fields) {
        return getStoredMyBkTranscript();
      }

      const { jwtToken, refreshed } = await ensureValidMyBkJwt(account);

      try {
        return await saveAndSyncMyBkTranscript({
          studentId: account.studentId,
          jwtToken,
          ssoUsername: account.ssoUsername || undefined,
          tokenRefreshed: refreshed,
        });
      } catch (apiErr) {
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
 * Fast <20ms Reader from PostgreSQL (with local cache fallback)
 */
export async function getStoredMyBkTranscript(): Promise<MyBkTranscriptPayload> {
  const cached = await readLocalCache();

  try {
    const account = await prisma.myBkAccount.findFirst({
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

    if (account && account.semesters.length > 0) {
      const lastSyncedMs = account.lastSyncedAt
        ? account.lastSyncedAt.getTime()
        : 0;
      const hasAutoSso = Boolean(
        account.ssoUsername && account.encryptedPassword
      );
      const hasV1He10 = account.semesters.some((s) => Boolean(s.diemTBTLChungHe10));
      const isStale =
        !hasV1He10 || Date.now() - lastSyncedMs > SWR_STALE_THRESHOLD_MS;

      // Enrich from cached v1 fields if DB hasn't synced v1 yet
      const cachedSemMap = new Map(
        (cached?.semesters || []).map((cs) => [cs.maNamHocHocKy, cs])
      );
      const cachedCourseMap = new Map(
        (cached?.courses || []).map((cc) => [
          `${cc.maHocKy}_${cc.maMonHoc.toUpperCase()}`,
          cc,
        ])
      );

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
        semesters: account.semesters.map((s) => {
          const cs = cachedSemMap.get(s.maNamHocHocKy);
          return {
            sinhVienId: account.sinhVienId || 211441,
            namHocHocKyId: s.namHocHocKyId,
            maNamHocHocKy: s.maNamHocHocKy,
            namHocHocKyTen: s.namHocHocKyTen,
            soTCTLHocKy: s.soTCTLHocKy,
            diemTBTLHocKy: s.diemTBTLHocKy,
            diemTBHocKyHe10: s.diemTBHocKyHe10 ?? cs?.diemTBHocKyHe10 ?? null,
            diemChuHocKy: s.diemChuHocKy ?? cs?.diemChuHocKy ?? null,
            soTCTLChung: s.soTCTLChung,
            diemTBTLChung: s.diemTBTLChung,
            diemTBTLChungHe10:
              s.diemTBTLChungHe10 ?? cs?.diemTBTLChungHe10 ?? null,
            capNhatCuoi: s.capNhatCuoi,
          };
        }),
        courses: account.courses.map((c) => {
          const cc = cachedCourseMap.get(
            `${c.maHocKy}_${c.maMonHoc.toUpperCase()}`
          );
          return {
            sinhVienId: account.sinhVienId || 211441,
            namHocHocKyId: c.namHocHocKyId,
            maHocKy: c.maHocKy,
            monHocId: c.monHocId,
            maMonHoc: c.maMonHoc,
            tenMonHoc: c.tenMonHoc,
            tenMonHocEn: c.tenMonHocEn ?? cc?.tenMonHocEn ?? null,
            soTinChi: c.soTinChi,
            soTinChiHocPhan: c.soTinChiHocPhan ?? cc?.soTinChiHocPhan ?? null,
            diemChu: c.diemChu,
            diemSo: c.diemSo,
            diemDat: c.diemDat,
            tinhTrangDiem: c.tinhTrangDiem,
            diemKhongIn: c.diemKhongIn,
            nhomTo: c.nhomTo ?? cc?.nhomTo ?? null,
            nhomThucHanh: c.nhomThucHanh ?? cc?.nhomThucHanh ?? null,
            ghiChu: c.ghiChu,
            ngayCongBoDiem: c.ngayCongBoDiem ?? cc?.ngayCongBoDiem ?? null,
            isNewUpdate: c.isNewUpdate,
            componentScores: c.componentScoresJson
              ? JSON.parse(c.componentScoresJson)
              : cc?.componentScores,
          };
        }),
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
