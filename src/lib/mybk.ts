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

const LOCAL_CACHE_PATH = path.join(
  process.cwd(),
  ".mybk-transcript-cache.json"
);

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
}

export interface MyBkTranscriptPayload {
  connected: boolean;
  studentId: string | null;
  ssoUsername: string | null;
  lastSyncedAt: string | null;
  semesters: RawMyBkSemester[];
  courses: RawMyBkCourse[];
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
 * Authenticates directly against sso.hcmut.edu.vn CAS and exchanges the service ticket
 * at mybk.hcmut.edu.vn/app/login/cas to obtain the #hid_Token JWT.
 */
export async function loginMyBkCasSso(
  username: string,
  password: string
): Promise<{ jwtToken: string; studentId: string }> {
  // Step 1: Fetch CAS login form
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

  // Step 2: Submit credentials to CAS
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

  // Step 3: Follow ticket redirect to mybk.hcmut.edu.vn/app/login/cas?ticket=ST-...
  const mybkSessionCookies: string[] = [];
  let nextUrl: string | null = ticketLocation;

  for (let hop = 0; hop < 5 && nextUrl; hop++) {
    const hopUrl: string = nextUrl.startsWith("http")
      ? nextUrl.replace(/^http:\/\/mybk\.hcmut\.edu\.vn/i, "https://mybk.hcmut.edu.vn")
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

  // Step 4: Fetch /app/ with the collected SESSION cookie to extract #hid_Token
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
    throw new Error("Đăng nhập SSO thành công nhưng không tìm thấy hid_Token trên myBK");
  }

  const jwtToken = tokenMatch[1].trim();
  const decoded = decodeMyBkJwt(jwtToken);
  if (!decoded.sub || decoded.sub === "UGUEST") {
    throw new Error("Token nhận được không phải tài khoản sinh viên");
  }

  return { jwtToken, studentId: decoded.sub };
}

/**
 * Fetches both BANGDIEM_HOCKY and BANGDIEM_MONHOC from mybk.hcmut.edu.vn
 */
export async function fetchMyBkAcademicTranscript(
  jwtToken: string,
  studentId: string
): Promise<{
  semesters: RawMyBkSemester[];
  courses: RawMyBkCourse[];
}> {
  const cleanToken = jwtToken.replace(/^Bearer\s+/i, "").trim();
  const commonHeaders = {
    accept: "application/json",
    "accept-language": "vi",
    authorization: cleanToken,
    "content-type": "application/json",
    traceparent: generateTraceparent(),
    Referer:
      "https://mybk.hcmut.edu.vn/app/sinh-vien/ket-qua-hoc-tap/bang-diem-mon-hoc",
  };

  const [semRes, courseRes] = await Promise.all([
    fetch(`${MYBK_TRANSCRIPT_API}?tuychon=BANGDIEM_HOCKY`, {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify(studentId),
      cache: "no-store",
    }),
    fetch(`${MYBK_TRANSCRIPT_API}?tuychon=BANGDIEM_MONHOC`, {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify(studentId),
      cache: "no-store",
    }),
  ]);

  if (!semRes.ok || !courseRes.ok) {
    throw new Error(
      `myBK API từ chối kết nối (HTTP ${semRes.status}/${courseRes.status}). Token có thể đã hết hạn.`
    );
  }

  const semJson = await semRes.json();
  const courseJson = await courseRes.json();

  if (
    String(semJson.code) !== "200" ||
    !Array.isArray(semJson.data)
  ) {
    throw new Error(
      semJson.msg || "Không lấy được danh sách học kỳ từ myBK API"
    );
  }

  const semesters: RawMyBkSemester[] = semJson.data;
  const courses: RawMyBkCourse[] = Array.isArray(courseJson.data)
    ? courseJson.data
    : [];

  return { semesters, courses };
}

async function writeLocalCache(payload: MyBkTranscriptPayload) {
  try {
    await fs.writeFile(
      LOCAL_CACHE_PATH,
      JSON.stringify(payload, null, 2),
      "utf8"
    );
  } catch {
    // ignore file cache errors
  }
}

async function readLocalCache(): Promise<MyBkTranscriptPayload | null> {
  try {
    const raw = await fs.readFile(LOCAL_CACHE_PATH, "utf8");
    return JSON.parse(raw) as MyBkTranscriptPayload;
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

export async function saveAndSyncMyBkTranscript(options: {
  studentId: string;
  jwtToken: string;
  ssoUsername?: string;
  rawPassword?: string;
}): Promise<MyBkTranscriptPayload> {
  const { studentId, jwtToken, ssoUsername, rawPassword } = options;
  const { semesters, courses } = await fetchMyBkAcademicTranscript(
    jwtToken,
    studentId
  );

  const nowIso = new Date().toISOString();
  const decoded = decodeMyBkJwt(jwtToken);
  const sinhVienId =
    semesters[0]?.sinhVienId ?? courses[0]?.sinhVienId ?? undefined;

  const payload: MyBkTranscriptPayload = {
    connected: true,
    studentId,
    ssoUsername: ssoUsername || null,
    lastSyncedAt: nowIso,
    semesters,
    courses,
  };

  // Always write local cache so data is immediately available even if Docker DB is asleep
  await writeLocalCache(payload);

  // Persist into PostgreSQL if online
  try {
    const encryptedPassword = rawPassword
      ? encryptCredential(rawPassword)
      : undefined;

    await prisma.myBkAccount.upsert({
      where: { studentId },
      update: {
        sinhVienId,
        ...(ssoUsername ? { ssoUsername } : {}),
        ...(encryptedPassword ? { encryptedPassword } : {}),
        jwtToken,
        tokenExpiresAt: decoded.exp ? BigInt(decoded.exp) : null,
        lastSyncedAt: new Date(nowIso),
      },
      create: {
        studentId,
        sinhVienId,
        ssoUsername: ssoUsername || null,
        encryptedPassword: encryptedPassword || null,
        jwtToken,
        tokenExpiresAt: decoded.exp ? BigInt(decoded.exp) : null,
        lastSyncedAt: new Date(nowIso),
      },
    });

    await prisma.academicSemester.deleteMany({ where: { studentId } });
    if (semesters.length > 0) {
      await prisma.academicSemester.createMany({
        data: semesters.map((s, idx) => ({
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
        })),
      });
    }

    await prisma.academicCourseGrade.deleteMany({ where: { studentId } });
    if (courses.length > 0) {
      await prisma.academicCourseGrade.createMany({
        data: courses.map((c) => ({
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
        })),
      });
    }
  } catch {
    // PostgreSQL might not be running or migrated yet; local cache already saved
  }

  return payload;
}

export async function getStoredMyBkTranscript(): Promise<MyBkTranscriptPayload> {
  try {
    const account = await prisma.myBkAccount.findFirst({
      orderBy: { updatedAt: "desc" },
      include: {
        semesters: { orderBy: { sortOrder: "asc" } },
        courses: true,
      },
    });

    if (account && account.semesters.length > 0) {
      return {
        connected: true,
        studentId: account.studentId,
        ssoUsername: account.ssoUsername,
        lastSyncedAt: account.lastSyncedAt
          ? account.lastSyncedAt.toISOString()
          : null,
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
        })),
      };
    }
  } catch {
    // fallback to local cache
  }

  const cached = await readLocalCache();
  if (cached) return cached;

  return {
    connected: false,
    studentId: null,
    ssoUsername: null,
    lastSyncedAt: null,
    semesters: [],
    courses: [],
  };
}
