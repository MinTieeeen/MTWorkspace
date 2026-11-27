import { NextRequest, NextResponse } from "next/server";
import { readJson, withUser } from "@/lib/thesis/route-helpers";
import { deleteLink, listLinks, parseLinkInput, updateLink } from "@/lib/thesis/workspace";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withUser(async (userId) => {
    await updateLink(userId, id, parseLinkInput(await readJson(request), true));
    return NextResponse.json(await listLinks(userId));
  });
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withUser(async (userId) => {
    await deleteLink(userId, id);
    return NextResponse.json(await listLinks(userId));
  });
}
