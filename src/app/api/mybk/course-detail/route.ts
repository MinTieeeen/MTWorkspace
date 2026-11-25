import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ComponentScoreItem,
  getStoredMyBkTranscript,
  readLocalCache,
  writeLocalCache,
} from "@/lib/mybk";

export async function GET(request: NextRequest) {
  const maHocKy = request.nextUrl.searchParams.get("maHocKy") || "";
  const maMonHoc = request.nextUrl.searchParams.get("maMonHoc") || "";

  const transcript = await getStoredMyBkTranscript();

  const course = transcript.courses.find(
    (c) =>
      String(c.maHocKy) === maHocKy &&
      String(c.maMonHoc).toUpperCase() === maMonHoc.toUpperCase()
  );

  const semester = transcript.semesters.find(
    (s) => String(s.maNamHocHocKy) === maHocKy
  );

  // All attempts of this course across all semesters
  const allAttempts = transcript.courses.filter(
    (c) => String(c.maMonHoc).toUpperCase() === maMonHoc.toUpperCase()
  );

  // Matching records in danh-sach-diem-mon-hoc-khac/v2
  const relatedOtherRecords = (transcript.otherCourses || []).filter(
    (o) =>
      String(o.maMonHoc).toUpperCase() === maMonHoc.toUpperCase() ||
      (String(o.maHocKy) === maHocKy &&
        String(o.maMonHoc).toUpperCase() === maMonHoc.toUpperCase())
  );

  return NextResponse.json({
    course: course || null,
    semester: semester || null,
    allAttempts,
    relatedOtherRecords,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { maHocKy, maMonHoc, componentScores } = body as {
      maHocKy: string;
      maMonHoc: string;
      componentScores: ComponentScoreItem[];
    };

    if (!maHocKy || !maMonHoc) {
      return NextResponse.json(
        { error: "Thiếu mã học kỳ hoặc mã môn học" },
        { status: 400 }
      );
    }

    const cached = await readLocalCache();
    if (cached) {
      cached.courses = cached.courses.map((c) => {
        if (
          String(c.maHocKy) === String(maHocKy) &&
          String(c.maMonHoc).toUpperCase() === String(maMonHoc).toUpperCase()
        ) {
          return { ...c, componentScores };
        }
        return c;
      });
      await writeLocalCache(cached);
    }

    try {
      await prisma.academicCourseGrade.updateMany({
        where: {
          maHocKy: String(maHocKy),
          maMonHoc: String(maMonHoc),
        },
        data: {
          componentScoresJson: JSON.stringify(componentScores),
        },
      });
    } catch {
      // ignore if db offline
    }

    return NextResponse.json({ success: true, componentScores });
  } catch {
    return NextResponse.json(
      { error: "Không thể lưu điểm thành phần" },
      { status: 500 }
    );
  }
}
