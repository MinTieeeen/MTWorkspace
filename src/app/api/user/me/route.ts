import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSessionUserId,
  isGoogleOAuthConfigured,
} from "@/lib/google-auth";

export async function GET() {
  const isGoogleConfigured = isGoogleOAuthConfigured();

  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({
        user: null,
        isGoogleConfigured,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        googleAccounts: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
            accountType: true,
            isPrimary: true,
            lastSyncedAt: true,
          },
        },
      },
    });

    return NextResponse.json({
      user,
      isGoogleConfigured,
    });
  } catch {
    return NextResponse.json({
      user: null,
      isGoogleConfigured,
      dbOffline: true,
    });
  }
}

export async function DELETE(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = request.nextUrl.searchParams.get("accountId");
  if (!accountId) {
    return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
  }

  await prisma.googleAccount.deleteMany({
    where: {
      id: accountId,
      userId,
    },
  });

  return NextResponse.json({ success: true });
}
