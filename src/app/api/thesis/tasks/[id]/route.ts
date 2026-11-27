import { NextRequest, NextResponse } from "next/server";
import { deleteTask } from "@/lib/thesis/meetings";
import { readJson, withUser } from "@/lib/thesis/route-helpers";
import { listTasks, parseTaskInput, updateTask } from "@/lib/thesis/workspace";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** PATCH: cập nhật một phần (title, status, priority, dueAt, descriptionMd, checklist); còn nhận { done } kiểu cũ */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withUser(async (userId) => {
    await updateTask(userId, id, parseTaskInput(await readJson(request), true));
    return NextResponse.json(await listTasks(userId));
  });
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return withUser(async (userId) => {
    await deleteTask(userId, id);
    return NextResponse.json(await listTasks(userId));
  });
}
