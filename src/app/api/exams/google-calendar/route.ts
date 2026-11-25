import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/google-auth";
import { getStoredExams, NormalizedExamItem } from "@/lib/mybk-exams";

const GOOGLE_CALENDAR_EVENTS_API =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface SyncExamsRequestBody {
  accountId: string;
  semesterYearCode?: string;
  scope?: "UPCOMING" | "ALL" | "SINGLE";
  examId?: number;
}

function formatCampusName(campusCode: string | null): string {
  if (!campusCode) return "ĐH Bách Khoa TP.HCM";
  if (campusCode.includes("CS1")) return "Cơ sở 1 - Lý Thường Kiệt";
  if (campusCode.includes("CS2")) return "Cơ sở 2 - Dĩ An";
  return campusCode;
}

function buildExamCalendarEvent(item: NormalizedExamItem) {
  const examTypeLabel =
    item.examType === "GK"
      ? "Thi Giữa kỳ"
      : item.examType === "CK"
      ? "Thi Cuối kỳ"
      : `Thi ${item.examType}`;

  const deterministicId = `mtbkexam${item.semesterYearCode}e${item.examId}`
    .toLowerCase()
    .replace(/[^a-v0-9]/g, "0");

  const roomPart = item.roomCode || "Chưa xếp phòng";
  const location = `${roomPart} (${formatCampusName(item.campusCode)})`;

  const descriptionLines = [
    `Kỳ thi: ${examTypeLabel} — ${item.semesterYearName}`,
    `Môn thi: ${item.subjectCode} - ${item.subjectName} (${item.numOfCredits} TC)`,
    `Nhóm thi: ${item.classGroup || "--"}`,
    item.seatOrder ? `Số thứ tự danh sách phòng thi (STT): ${item.seatOrder}` : null,
    `Thời gian làm bài: ${item.durationMinutes} phút (${item.startTime} - ${item.endTime}, Tiết ${item.startLesson}-${item.endLesson})`,
    `Phòng thi: ${roomPart} • Tòa ${item.buildingCode || "--"}`,
    item.gradeDeadline ? `Hạn công bố/nhập điểm dự kiến: ${item.gradeDeadline}` : null,
    item.examNote ? `Ghi chú phòng ĐT: ${item.examNote}` : null,
    item.personalNote ? `Ghi chú ôn tập: ${item.personalNote}` : null,
    "---",
    "Đồng bộ tự động từ MTWorkspace (myBK HCMUT)",
  ].filter(Boolean);

  return {
    id: deterministicId,
    summary: `[${examTypeLabel}] ${item.subjectCode} - ${item.subjectName}`,
    location,
    description: descriptionLines.join("\n"),
    start: {
      dateTime: `${item.examDate}T${item.startTime}:00+07:00`,
      timeZone: "Asia/Ho_Chi_Minh",
    },
    end: {
      dateTime: `${item.examDate}T${item.endTime}:00+07:00`,
      timeZone: "Asia/Ho_Chi_Minh",
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 1440 }, // Nhắc trước 1 ngày (24h)
        { method: "popup", minutes: 60 },   // Nhắc trước 60 phút để vào phòng thi
      ],
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SyncExamsRequestBody;
    const {
      accountId,
      semesterYearCode = "20261",
      scope = "UPCOMING",
      examId,
    } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: "Vui lòng chọn tài khoản Google để đồng bộ Lịch thi" },
        { status: 400 }
      );
    }

    const accessToken = await getValidAccessToken(accountId);
    const examData = await getStoredExams(semesterYearCode);
    const todayIso = new Date().toISOString().slice(0, 10);

    let targetItems = examData.items.filter((i) => Boolean(i.examDate));

    if (scope === "SINGLE" && examId) {
      targetItems = targetItems.filter((i) => i.examId === Number(examId));
    } else if (scope === "UPCOMING") {
      targetItems = targetItems.filter((i) => i.examDate >= todayIso);
    }

    if (targetItems.length === 0) {
      return NextResponse.json(
        { error: "Không có ca thi nào trong phạm vi đã chọn để đồng bộ." },
        { status: 400 }
      );
    }

    const events = targetItems.map((item) => buildExamCalendarEvent(item));

    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    const results = await Promise.all(
      events.map(async (eventPayload) => {
        const insertRes = await fetch(GOOGLE_CALENDAR_EVENTS_API, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(eventPayload),
        });

        if (insertRes.status === 403 || insertRes.status === 401) {
          return { status: "FORBIDDEN" as const };
        }

        if (insertRes.status === 409) {
          const updateRes = await fetch(
            `${GOOGLE_CALENDAR_EVENTS_API}/${encodeURIComponent(
              eventPayload.id
            )}`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(eventPayload),
            }
          );
          return updateRes.ok
            ? { status: "UPDATED" as const }
            : { status: "FAILED" as const };
        }

        return insertRes.ok
          ? { status: "CREATED" as const }
          : { status: "FAILED" as const };
      })
    );

    if (results.some((r) => r.status === "FORBIDDEN")) {
      return NextResponse.json(
        {
          error:
            "Tài khoản Google này cần cấp quyền Google Calendar để thêm Lịch thi.",
          needsReauth: true,
          authUrl: "/api/auth/google?mode=link",
        },
        { status: 403 }
      );
    }

    for (const r of results) {
      if (r.status === "CREATED") createdCount++;
      else if (r.status === "UPDATED") updatedCount++;
      else failedCount++;
    }

    return NextResponse.json({
      success: true,
      totalProcessed: events.length,
      createdCount,
      updatedCount,
      failedCount,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Không thể đồng bộ Lịch thi lên Google Calendar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
