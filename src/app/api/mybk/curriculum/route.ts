import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-error";
import {
  getStoredCurriculumProgress,
  revalidateCurriculumFromMyBk,
} from "@/lib/mybk-curriculum";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const revalidate = searchParams.get("revalidate") === "1";
  const force = searchParams.get("force") === "1";

  try {
    if (revalidate || force) {
      const data = await revalidateCurriculumFromMyBk(force);
      return NextResponse.json(data);
    }

    const data = await getStoredCurriculumProgress();
    return NextResponse.json(data);
  } catch (error) {
    const fallback = await getStoredCurriculumProgress().catch(() => null);
    return errorResponse(
      error,
      fallback && fallback.blocks.length > 0
        ? fallback
        : null
    );
  }
}

export async function POST() {
  try {
    const data = await revalidateCurriculumFromMyBk(true);
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Đồng bộ Tiến độ học tập thất bại";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
