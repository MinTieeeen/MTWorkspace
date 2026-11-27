import { NextRequest, NextResponse } from "next/server";
import { readJson, withUser } from "@/lib/thesis/route-helpers";
import { createTasks, listTasks, parseTaskInput } from "@/lib/thesis/workspace";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withUser(async (userId) =>
    NextResponse.json(await listTasks(userId, request.nextUrl.searchParams.get("projectId") ?? undefined))
  );
}

/** POST: { projectId, title, ... } hoặc { projectId, items: [{ title }] } để tạo nhiều việc */
export async function POST(request: NextRequest) {
  return withUser(async (userId) => {
    const body = (await readJson(request)) as Record<string, unknown> | null;
    if (Array.isArray(body?.items)) {
      const items = (body!.items as unknown[])
        .map((i) => parseTaskInput({ ...(i as object) }, false))
        .map((i) => ({ title: i.title!, dueAt: i.dueAt ?? null }));
      await createTasks(userId, body!.projectId, items);
    } else {
      const input = parseTaskInput(body, false);
      await createTasks(userId, input.projectId, [
        {
          title: input.title!,
          dueAt: input.dueAt,
          priority: input.priority,
          descriptionMd: input.descriptionMd,
          checklist: input.checklist,
        },
      ]);
    }
    return NextResponse.json(await listTasks(userId));
  });
}
