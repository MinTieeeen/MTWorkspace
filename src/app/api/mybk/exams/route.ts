import { NextResponse } from "next/server";
import {
  ExamPrepStatus,
  getStoredExams,
  revalidateExamsFromMyBk,
  updateExamPrepAndNote,
} from "@/lib/mybk-exams";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const semesterYear = searchParams.get("semesterYear") || undefined;
  const revalidate = searchParams.get("revalidate") === "1";
  const force = searchParams.get("force") === "1";

  try {
    if (revalidate || force) {
      const targetSem =
        semesterYear ||
        (await getStoredExams()).selectedSemesterCode ||
        "20261";
      const data = await revalidateExamsFromMyBk(targetSem, force);
      return NextResponse.json(data);
    }

    const data = await getStoredExams(semesterYear);
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Không thể tải dữ liệu Lịch thi";
    const fallback = await getStoredExams(semesterYear).catch(() => null);
    if (fallback && fallback.items.length > 0) {
      return NextResponse.json({
        ...fallback,
        warning: message,
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body?.action === "UPDATE_PREP") {
      const examId = Number(body.examId);
      if (!examId) {
        return NextResponse.json(
          { error: "Thiếu mã ca thi" },
          { status: 400 }
        );
      }
      const prepStatus = body.prepStatus as ExamPrepStatus | undefined;
      const personalNote =
        body.personalNote !== undefined ? String(body.personalNote) : undefined;

      await updateExamPrepAndNote({
        examId,
        prepStatus,
        personalNote,
      });

      return NextResponse.json({
        success: true,
        examId,
        prepStatus,
        personalNote,
      });
    }

    const semesterYear = String(body?.semesterYear || "20261").trim();
    const data = await revalidateExamsFromMyBk(semesterYear, true);
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Đồng bộ Lịch thi từ myBK thất bại";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
