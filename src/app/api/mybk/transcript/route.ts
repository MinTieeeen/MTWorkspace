import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-error";
import {
  backgroundRevalidateMyBkTranscript,
  getStoredMyBkTranscript,
} from "@/lib/mybk";

export async function GET(request: NextRequest) {
  const revalidate = request.nextUrl.searchParams.get("revalidate") === "1";
  const force = request.nextUrl.searchParams.get("force") === "1";

  if (revalidate) {
    try {
      const fresh = await backgroundRevalidateMyBkTranscript(force);
      return NextResponse.json(fresh);
    } catch (error) {
      // Offline / bảo trì: trả dữ liệu đã lưu kèm cảnh báo + mã lỗi để giao diện báo đúng
      const fallback = await getStoredMyBkTranscript().catch(() => null);
      return errorResponse(error, fallback);
    }
  }

  const payload = await getStoredMyBkTranscript();
  return NextResponse.json(payload);
}

export async function POST() {
  try {
    const payload = await backgroundRevalidateMyBkTranscript(true);
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Đồng bộ dữ liệu myBK thất bại",
      },
      { status: 400 }
    );
  }
}
