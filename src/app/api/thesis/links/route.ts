import { NextRequest, NextResponse } from "next/server";
import { readJson, withUser } from "@/lib/thesis/route-helpers";
import { createLink, listLinks, parseLinkInput } from "@/lib/thesis/workspace";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withUser(async (userId) =>
    NextResponse.json(await listLinks(userId, request.nextUrl.searchParams.get("projectId") ?? undefined))
  );
}

export async function POST(request: NextRequest) {
  return withUser(async (userId) => {
    await createLink(userId, parseLinkInput(await readJson(request), false));
    return NextResponse.json(await listLinks(userId));
  });
}
