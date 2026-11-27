import { NextRequest, NextResponse } from "next/server";
import { createMeetings, listMeetings, parseMeetingInput } from "@/lib/thesis/meetings";
import { readJson, withUser } from "@/lib/thesis/route-helpers";

export const dynamic = "force-dynamic";

/** GET /api/thesis/meetings[?projectId=] */
export async function GET(request: NextRequest) {
  return withUser(async (userId) =>
    NextResponse.json(await listMeetings(userId, request.nextUrl.searchParams.get("projectId") ?? undefined))
  );
}

/** POST /api/thesis/meetings: tạo cuộc họp (kèm repeatWeeks để tạo chuỗi họp hằng tuần) */
export async function POST(request: NextRequest) {
  return withUser(async (userId) => {
    const input = parseMeetingInput(await readJson(request));
    await createMeetings(userId, input);
    return NextResponse.json(await listMeetings(userId));
  });
}
