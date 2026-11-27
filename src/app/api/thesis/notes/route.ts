import { NextRequest, NextResponse } from "next/server";
import { readJson, withUser } from "@/lib/thesis/route-helpers";
import { createNote, listNotes, parseNoteInput } from "@/lib/thesis/workspace";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withUser(async (userId) =>
    NextResponse.json(await listNotes(userId, request.nextUrl.searchParams.get("projectId") ?? undefined))
  );
}

export async function POST(request: NextRequest) {
  return withUser(async (userId) => {
    await createNote(userId, parseNoteInput(await readJson(request), false));
    return NextResponse.json(await listNotes(userId));
  });
}
