import { prisma } from "@/lib/prisma";
import { ThesisError } from "./errors";

/**
 * Bộ gọi hệ thống quản lý đồ án của trường (project-cse.hcmut.edu.vn). CHỈ GỌI GET.
 *
 * Luồng đăng nhập (đã khảo sát, xem THESIS_PLAN.md mục 0.5, 0.6):
 *   access token Google (scope hẹp) -> POST /auth/google/validate -> JWT 24 giờ (cookie auth_token)
 *   -> gửi lại bằng `Authorization: Bearer <jwt>`.
 *
 * BẢO MẬT: chỉ gửi cho trường token chỉ có scope `openid email profile`. Token của workspace còn có
 * quyền Gmail / Lịch nên TUYỆT ĐỐI không được gửi đi. JWT chỉ nằm trong bộ nhớ, không lưu database.
 */

const CSE_API = (
  process.env.PROJECT_CSE_API_URL || "https://project-cse.hcmut.edu.vn/api"
).replace(/\/$/, "");
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const NARROW_SCOPE = "openid email profile";
const FORBIDDEN_SCOPE = /gmail|calendar|drive|mail\.google/i;
const REQUEST_TIMEOUT_MS = 20_000;
/** Đăng nhập lại khi phiên còn dưới ngần này */
const SESSION_RENEW_BUFFER_MS = 10 * 60 * 1000;
const DEFAULT_SESSION_MS = 23 * 60 * 60 * 1000;

export interface CseSession {
  jwt: string;
  expMs: number;
}

interface GlobalCache {
  sessions: Map<string, CseSession>;
  inflight: Map<string, Promise<CseSession>>;
}

// Giữ qua các lần nạp lại module khi chạy dev (HMR)
const globalForCse = globalThis as unknown as { __cseCache?: GlobalCache };
const cache: GlobalCache =
  globalForCse.__cseCache ??
  (globalForCse.__cseCache = { sessions: new Map(), inflight: new Map() });

/** Xin access token Google CHỈ CÓ scope cơ bản, bằng refresh token của tài khoản HCMUT. Không lưu token. */
export async function getNarrowGoogleToken(accountId: string): Promise<string> {
  const account = await prisma.googleAccount.findUnique({
    where: { id: accountId },
    select: { refreshToken: true },
  });
  if (!account?.refreshToken) throw new ThesisError("NOT_CONNECTED");

  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        refresh_token: account.refreshToken,
        grant_type: "refresh_token",
        scope: NARROW_SCOPE,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ThesisError("UPSTREAM");
  }

  // invalid_grant: người dùng đã thu hồi quyền hoặc refresh token hết hiệu lực
  if (res.status === 400 || res.status === 401) throw new ThesisError("SSO_EXPIRED");
  if (!res.ok) throw new ThesisError("UPSTREAM");

  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    scope?: string;
  } | null;
  if (!json?.access_token) throw new ThesisError("UPSTREAM");

  // Chốt chặn: nếu Google trả token có quyền ngoài phạm vi thì KHÔNG gửi đi
  if (!json.scope || FORBIDDEN_SCOPE.test(json.scope)) {
    throw new ThesisError(
      "UNKNOWN",
      "Token có quyền ngoài phạm vi cho phép, từ chối gửi tới hệ thống đồ án"
    );
  }
  return json.access_token;
}

function decodeJwtExpMs(jwt: string): number | null {
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")
    ) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Đăng nhập: đổi access token Google lấy JWT của hệ thống đồ án */
export async function loginProjectCse(accessToken: string): Promise<CseSession> {
  let res: Response;
  try {
    res = await fetch(`${CSE_API}/auth/google/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ access_token: accessToken }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ThesisError("UPSTREAM");
  }
  if (res.status === 401 || res.status === 403) throw new ThesisError("SSO_EXPIRED");
  if (!res.ok) throw new ThesisError("UPSTREAM");

  const cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith("auth_token="));
  if (!cookie) throw new ThesisError("UPSTREAM");
  const jwt = cookie.slice("auth_token=".length);
  return { jwt, expMs: decodeJwtExpMs(jwt) ?? Date.now() + DEFAULT_SESSION_MS };
}

/** Lấy phiên còn hạn của người dùng; các lời gọi song song dùng chung một lần đăng nhập */
export async function getCseSession(
  userId: string,
  googleAccountId: string
): Promise<CseSession> {
  const cached = cache.sessions.get(userId);
  if (cached && cached.expMs - SESSION_RENEW_BUFFER_MS > Date.now()) return cached;

  const running = cache.inflight.get(userId);
  if (running) return running;

  const job = (async () => {
    const accessToken = await getNarrowGoogleToken(googleAccountId);
    const session = await loginProjectCse(accessToken);
    cache.sessions.set(userId, session);
    return session;
  })().finally(() => cache.inflight.delete(userId));

  cache.inflight.set(userId, job);
  return job;
}

export function clearCseSession(userId: string) {
  cache.sessions.delete(userId);
}

/** GET có xác thực. `allowNotFound` cho phép trả null khi 404 (vd đồ án chưa có hội đồng). */
export async function cseGet<T>(
  userId: string,
  session: CseSession,
  path: string,
  opts: { allowNotFound?: boolean } = {}
): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${CSE_API}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${session.jwt}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ThesisError("UPSTREAM");
  }
  if (res.status === 401 || res.status === 403) {
    clearCseSession(userId);
    throw new ThesisError("SSO_EXPIRED");
  }
  if (res.status === 404 && opts.allowNotFound) return null;
  if (!res.ok) throw new ThesisError("UPSTREAM");
  return (await res.json().catch(() => null)) as T | null;
}
