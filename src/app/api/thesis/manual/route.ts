import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/google-auth";
import { unauthorizedResponse } from "@/lib/thesis/errors";
import {
  ManualInputError,
  parseManualInput,
  saveManualProject,
} from "@/lib/thesis/manual";
import { getThesisOverview } from "@/lib/thesis/overview";

export const dynamic = "force-dynamic";

/** PUT /api/thesis/manual: tạo hoặc cập nhật đồ án nhập tay */
export async function PUT(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();

  try {
    const body = await request.json().catch(() => null);
    await saveManualProject(userId, parseManualInput(body));
    return NextResponse.json(await getThesisOverview(userId));
  } catch (error) {
    if (error instanceof ManualInputError) {
      return NextResponse.json(
        { error: error.message, code: "UNKNOWN" },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { error: "Không lưu được đồ án, vui lòng thử lại", code: "UNKNOWN" },
      { status: 500 }
    );
  }
}
