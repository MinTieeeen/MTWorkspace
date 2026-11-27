import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/google-auth";
import { thesisErrorResponse, unauthorizedResponse } from "@/lib/thesis/errors";
import { getThesisOverview } from "@/lib/thesis/overview";
import { findHcmutAccount, syncThesis } from "@/lib/thesis/sync";

export const dynamic = "force-dynamic";

/**
 * GET /api/thesis                  đọc dữ liệu đã lưu
 * GET /api/thesis?revalidate=1     đồng bộ từ trường nếu dữ liệu đã cũ (tối thiểu 15 phút)
 * GET /api/thesis?force=1          đồng bộ ngay (chặn bấm liên tục, tối thiểu 20 giây)
 *
 * Luôn yêu cầu đăng nhập workspace (phiên Google), không phụ thuộc lớp chặn truy cập chung.
 */
export async function GET(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();

  const revalidate = request.nextUrl.searchParams.get("revalidate") === "1";
  const force = request.nextUrl.searchParams.get("force") === "1";
  const projectId = request.nextUrl.searchParams.get("project");

  try {
    if (revalidate || force) {
      // Chưa liên kết tài khoản HCMUT thì không có gì để đồng bộ (không phải lỗi)
      const account = await findHcmutAccount(userId);
      if (account) await syncThesis(userId, { force });
    }
    return NextResponse.json(await getThesisOverview(userId, projectId));
  } catch (error) {
    const fallback = await getThesisOverview(userId, projectId).catch(() => null);
    return thesisErrorResponse(error, fallback?.project ? fallback : null);
  }
}
