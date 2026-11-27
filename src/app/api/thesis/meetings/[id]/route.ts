import { NextRequest, NextResponse } from "next/server";
import { deleteMeeting, listMeetings, parseMeetingInput, updateMeeting } from "@/lib/thesis/meetings";
import { readJson, withUser } from "@/lib/thesis/route-helpers";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withUser(async (userId) => {
    await updateMeeting(userId, id, parseMeetingInput(await readJson(request), true));
    return NextResponse.json(await listMeetings(userId));
  });
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withUser(async (userId) => {
    await deleteMeeting(userId, id);
    return NextResponse.json(await listMeetings(userId));
  });
}
