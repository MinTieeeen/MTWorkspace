import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-error";
import {
  getStoredTimetable,
  revalidateTimetableFromMyBk,
  saveCourseQuickNote,
} from "@/lib/mybk-timetable";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const semesterYear = searchParams.get("semesterYear") || undefined;
  const revalidate = searchParams.get("revalidate") === "1";
  const force = searchParams.get("force") === "1";

  try {
    if (revalidate || force) {
      const targetSem =
        semesterYear ||
        (await getStoredTimetable()).selectedSemesterCode ||
        "20261";
      const data = await revalidateTimetableFromMyBk(targetSem, force);
      return NextResponse.json(data);
    }

    const data = await getStoredTimetable(semesterYear);
    return NextResponse.json(data);
  } catch (error) {
    const fallback = await getStoredTimetable(semesterYear).catch(() => null);
    return errorResponse(
      error,
      fallback && fallback.items.length > 0
        ? fallback
        : null
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body?.action === "SAVE_NOTE") {
      const subjectCode = String(body.subjectCode || "").trim();
      const courseNote = String(body.courseNote ?? "");
      if (!subjectCode) {
        return NextResponse.json(
          { error: "Thiếu mã môn học" },
          { status: 400 }
        );
      }
      await saveCourseQuickNote(subjectCode, courseNote);
      return NextResponse.json({
        success: true,
        subjectCode,
        courseNote,
      });
    }

    const semesterYear = String(body?.semesterYear || "20261").trim();
    const data = await revalidateTimetableFromMyBk(semesterYear, true);
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Đồng bộ Thời khóa biểu thất bại";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
