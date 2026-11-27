import { NextRequest, NextResponse } from "next/server";
import { readJson, withUser } from "@/lib/thesis/route-helpers";
import { deleteNote, listNotes, parseNoteInput, updateNote } from "@/lib/thesis/workspace";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withUser(async (userId) => {
    await updateNote(userId, id, parseNoteInput(await readJson(request), true));
    return NextResponse.json(await listNotes(userId));
  });
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withUser(async (userId) => {
    await deleteNote(userId, id);
    return NextResponse.json(await listNotes(userId));
  });
}
