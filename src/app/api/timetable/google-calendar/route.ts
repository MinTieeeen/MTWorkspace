import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/google-auth";
import {
  getExactSessionDateIso,
  getStoredTimetable,
  NormalizedTimetableItem,
} from "@/lib/mybk-timetable";

const GOOGLE_CALENDAR_EVENTS_API =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface SyncRequestBody {
  accountId: string;
  semesterYearCode?: string;
  mode?: "SEMESTER" | "WEEK" | "ITEM";
  weekNumber?: number;
  scheduleId?: number;
}

function buildCalendarEventPayload(
  item: NormalizedTimetableItem,
  weekNumber: number
) {
  const sessionDateIso = getExactSessionDateIso(
    item.calendarYear,
    weekNumber,
    item.dayOfWeek
  );
  const startTime =
    item.startTime.length === 4 ? `0${item.startTime}` : item.startTime;
  const endTime =
    item.endTime.length === 4 ? `0${item.endTime}` : item.endTime;

  // Deterministic valid base32hex event ID (lowercase a-v and 0-9, length >= 5)
  const deterministicId = `mtbk${item.semesterYearCode}s${item.scheduleId}w${weekNumber}`
    .toLowerCase()
    .replace(/[^a-v0-9]/g, "0");

  const roomPart =
    item.roomCode && item.roomCode !== "------" ? item.roomCode : "Chưa xếp phòng";
  const campusPart = item.campusNameVi ? ` (${item.campusNameVi})` : "";
  const location = `${roomPart}${campusPart}`;

  const descriptionLines = [
    `Môn học: ${item.subjectCode} - ${item.subjectNameVi}${
      item.subjectNameEn ? ` (${item.subjectNameEn})` : ""
    }`,
    `Nhóm lớp: ${item.classGroup || "--"} • Tín chỉ: ${item.numOfCredits} TC`,
    `Tiết học: Tiết ${item.startLesson} - ${
      item.startLesson + item.numOfLesson - 1
    } (${startTime} - ${endTime})`,
    `Tuần học Bách Khoa: Tuần ${weekNumber} (${item.semesterYearName})`,
    `Phòng học: ${roomPart}${
      item.buildingNote ? ` - ${item.buildingNote}` : ""
    }`,
    item.employeeName
      ? `Giảng viên: ${item.employeeName}${
          item.employeeEmail ? ` (${item.employeeEmail})` : ""
        }`
      : null,
    item.courseNote ? `Ghi chú cá nhân: ${item.courseNote}` : null,
    "---",
    "Đồng bộ tự động từ MTWorkspace (myBK HCMUT)",
  ].filter(Boolean);

  return {
    id: deterministicId,
    summary: `[${item.subjectCode}] ${item.subjectNameVi}${
      item.classGroup ? ` (${item.classGroup})` : ""
    }`,
    location,
    description: descriptionLines.join("\n"),
    start: {
      dateTime: `${sessionDateIso}T${startTime}:00+07:00`,
      timeZone: "Asia/Ho_Chi_Minh",
    },
    end: {
      dateTime: `${sessionDateIso}T${endTime}:00+07:00`,
      timeZone: "Asia/Ho_Chi_Minh",
    },
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: 30 }],
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SyncRequestBody;
    const {
      accountId,
      semesterYearCode = "20261",
      mode = "SEMESTER",
      weekNumber,
      scheduleId,
    } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: "Vui lòng chọn tài khoản Google để đồng bộ" },
        { status: 400 }
      );
    }

    const accessToken = await getValidAccessToken(accountId);
    const timetable = await getStoredTimetable(semesterYearCode);

    // Filter out unscheduled / project courses without fixed day/time
    let scheduledItems = timetable.items.filter(
      (item) =>
        item.dayOfWeek >= 2 &&
        item.dayOfWeek <= 8 &&
        item.startLesson > 0 &&
        item.startTime !== "0:00" &&
        item.startTime !== "00:00"
    );

    if (mode === "ITEM" && scheduleId) {
      scheduledItems = scheduledItems.filter(
        (item) => item.scheduleId === Number(scheduleId)
      );
    }

    const eventsToSync: Array<ReturnType<typeof buildCalendarEventPayload>> =
      [];

    for (const item of scheduledItems) {
      const targetWeeks =
        mode === "WEEK" && weekNumber
          ? item.activeWeeks.filter((w) => w === Number(weekNumber))
          : item.activeWeeks;

      for (const wk of targetWeeks) {
        eventsToSync.push(buildCalendarEventPayload(item, wk));
      }
    }

    if (eventsToSync.length === 0) {
      return NextResponse.json(
        {
          error:
            "Không có buổi học cố định nào trong phạm vi đã chọn để thêm vào Google Calendar.",
        },
        { status: 400 }
      );
    }

    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    // Process in batches of 8 concurrent requests so Google Calendar rate limit is respected
    const BATCH_SIZE = 8;
    for (let i = 0; i < eventsToSync.length; i += BATCH_SIZE) {
      const batch = eventsToSync.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (eventPayload) => {
          const insertRes = await fetch(GOOGLE_CALENDAR_EVENTS_API, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(eventPayload),
          });

          if (insertRes.status === 403 || insertRes.status === 401) {
            const errJson = await insertRes.json().catch(() => ({}));
            const errMessage =
              errJson?.error?.message || "Thiếu quyền truy cập Google Calendar";
            return { status: "FORBIDDEN" as const, message: errMessage };
          }

          if (insertRes.status === 409) {
            // Event with this deterministic ID already exists -> PUT update
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
            if (updateRes.ok) {
              return { status: "UPDATED" as const };
            }
            return { status: "FAILED" as const };
          }

          if (insertRes.ok) {
            return { status: "CREATED" as const };
          }

          return { status: "FAILED" as const };
        })
      );

      const forbidden = results.find((r) => r.status === "FORBIDDEN");
      if (forbidden) {
        return NextResponse.json(
          {
            error:
              "Tài khoản Google này cần cấp thêm quyền Google Calendar. Vui lòng bấm 'Cấp quyền Calendar' để tiếp tục.",
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
    }

    return NextResponse.json({
      success: true,
      totalProcessed: eventsToSync.length,
      createdCount,
      updatedCount,
      failedCount,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Không thể đồng bộ với Google Calendar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
