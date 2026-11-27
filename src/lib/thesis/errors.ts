import { NextResponse } from "next/server";

export type ThesisErrorCode =
  | "NOT_CONNECTED"
  | "SSO_EXPIRED"
  | "UPSTREAM"
  | "UNKNOWN";

const MESSAGES: Record<ThesisErrorCode, string> = {
  NOT_CONNECTED: "Chưa liên kết tài khoản Google @hcmut.edu.vn",
  SSO_EXPIRED:
    "Không đăng nhập được vào hệ thống đồ án, hãy đăng nhập lại Google",
  UPSTREAM:
    "Không kết nối được tới hệ thống đồ án của trường, vui lòng thử lại sau",
  UNKNOWN: "Đã có lỗi xảy ra, vui lòng thử lại",
};

const STATUS: Record<ThesisErrorCode, number> = {
  NOT_CONNECTED: 401,
  SSO_EXPIRED: 401,
  UPSTREAM: 502,
  UNKNOWN: 500,
};

export class ThesisError extends Error {
  constructor(
    public readonly code: ThesisErrorCode,
    detail?: string
  ) {
    super(detail ?? MESSAGES[code]);
    this.name = "ThesisError";
  }
}

export function classifyThesisError(err: unknown): ThesisErrorCode {
  if (err instanceof ThesisError) return err.code;
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (/fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|network|timeout|aborted/i.test(raw)) {
    return "UPSTREAM";
  }
  return "UNKNOWN";
}

/**
 * Phản hồi lỗi cho API đồ án, cùng định dạng với `errorResponse` của myBK:
 * còn dữ liệu đã lưu thì trả kèm `warning` + `errorCode`, nếu không thì `{ error, code }`.
 * Không bao giờ đưa chi tiết kỹ thuật (có thể chứa token) vào phản hồi.
 */
export function thesisErrorResponse<T extends object>(
  err: unknown,
  fallback?: T | null
) {
  const code = classifyThesisError(err);
  if (fallback) {
    return NextResponse.json({
      ...fallback,
      isStale: true,
      warning: MESSAGES[code],
      errorCode: code,
    });
  }
  return NextResponse.json(
    { error: MESSAGES[code], code },
    { status: STATUS[code] }
  );
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { error: MESSAGES.NOT_CONNECTED, code: "NOT_CONNECTED" },
    { status: 401 }
  );
}
