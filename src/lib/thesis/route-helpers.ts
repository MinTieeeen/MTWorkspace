import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/google-auth";
import { unauthorizedResponse } from "./errors";
import { MeetingInputError } from "./meetings";

/** Bọc handler: bắt buộc đăng nhập, lỗi nhập liệu trả đúng mã, lỗi khác không lộ chi tiết */
export async function withUser(
  fn: (userId: string) => Promise<NextResponse>
): Promise<NextResponse> {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();
  try {
    return await fn(userId);
  } catch (error) {
    if (error instanceof MeetingInputError) {
      return NextResponse.json({ error: error.message, code: "UNKNOWN" }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Đã có lỗi xảy ra, vui lòng thử lại", code: "UNKNOWN" },
      { status: 500 }
    );
  }
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}
