import { NextRequest, NextResponse } from "next/server";
import { addMeetingTasks, listMeetings } from "@/lib/thesis/meetings";
import { parseVnDateTime } from "@/lib/thesis/normalize";
import { readJson, withUser } from "@/lib/thesis/route-helpers";

export const dynamic = "force-dynamic";

/** POST body: { items: [{ title, dueAt?: "YYYY-MM-DD" }] } */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (userId) => {
    const body = (await readJson(request)) as { items?: unknown } | null;
    const items = Array.isArray(body?.items) ? body!.items : [];
    const parsed = items
      .map((i) => {
        const r = (i && typeof i === "object" ? i : {}) as Record<string, unknown>;
        const title = typeof r.title === "string" ? r.title : "";
        const due = typeof r.dueAt === "string" && r.dueAt ? parseVnDateTime(`${r.dueAt.slice(0, 10)}T23:59`) : null;
        return { title, dueAt: due };
      })
      .filter((i) => i.title.trim());
    await addMeetingTasks(userId, id, parsed);
    return NextResponse.json(await listMeetings(userId));
  });
}
