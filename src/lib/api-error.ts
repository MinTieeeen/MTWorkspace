import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "NOT_CONNECTED"
  | "SSO_EXPIRED"
  | "UPSTREAM"
  | "UNKNOWN";

export interface ClassifiedError {
  code: ApiErrorCode;
  message: string;
  status: number;
}

const MESSAGES: Record<ApiErrorCode, string> = {
  NOT_CONNECTED: "Chưa kết nối tài khoản myBK",
  SSO_EXPIRED: "Phiên đăng nhập myBK đã hết hạn, hãy đăng nhập lại",
  UPSTREAM: "Không kết nối được tới myBK, vui lòng thử lại sau",
  UNKNOWN: "Đã có lỗi xảy ra, vui lòng thử lại",
};

const STATUS: Record<ApiErrorCode, number> = {
  NOT_CONNECTED: 401,
  SSO_EXPIRED: 401,
  UPSTREAM: 502,
  UNKNOWN: 500,
};

/** Phân loại lỗi từ các hàm đồng bộ myBK thành mã lỗi + thông điệp thân thiện. */
export function classifyError(err: unknown): ClassifiedError {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  let code: ApiErrorCode = "UNKNOWN";

  if (/NOT_CONNECTED|chưa kết nối/i.test(raw)) {
    code = "NOT_CONNECTED";
  } else if (
    /TOKEN_EXPIRED|Sai tên đăng nhập|hid_Token|Token sinh viên|\b(401|403)\b/i.test(
      raw
    )
  ) {
    code = "SSO_EXPIRED";
  } else if (
    /_API_REJECTED|EMPTY_DATA|fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|network|sso\.hcmut/i.test(
      raw
    )
  ) {
    code = "UPSTREAM";
  }

  return { code, message: MESSAGES[code], status: STATUS[code] };
}

/**
 * Phản hồi lỗi thống nhất cho API đồng bộ.
 * Nếu còn dữ liệu đã lưu thì vẫn trả dữ liệu đó kèm `isStale` + cảnh báo.
 */
export function errorResponse<T extends object>(
  err: unknown,
  fallback?: T | null
) {
  const c = classifyError(err);
  if (fallback) {
    return NextResponse.json({
      ...fallback,
      isStale: true,
      warning: c.message,
      errorCode: c.code,
    });
  }
  return NextResponse.json(
    { error: c.message, code: c.code },
    { status: c.status }
  );
}
