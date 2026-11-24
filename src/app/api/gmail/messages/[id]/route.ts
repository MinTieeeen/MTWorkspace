import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSessionUserId,
  getValidAccessToken,
} from "@/lib/google-auth";

interface GmailPart {
  mimeType?: string;
  filename?: string;
  body?: {
    data?: string;
    size?: number;
    attachmentId?: string;
  };
  parts?: GmailPart[];
}

function decodeBase64Url(data: string): string {
  try {
    return Buffer.from(data, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

function extractBodyContent(payload?: GmailPart): {
  html: string;
  text: string;
} {
  let html = "";
  let text = "";

  function traverse(part?: GmailPart) {
    if (!part) return;
    if (part.mimeType === "text/html" && part.body?.data && !html) {
      html = decodeBase64Url(part.body.data);
    } else if (part.mimeType === "text/plain" && part.body?.data && !text) {
      text = decodeBase64Url(part.body.data);
    }
    if (part.parts && part.parts.length > 0) {
      for (const child of part.parts) {
        traverse(child);
      }
    }
  }

  traverse(payload);

  if (!html && !text && payload?.body?.data) {
    const raw = decodeBase64Url(payload.body.data);
    if (payload.mimeType === "text/html") {
      html = raw;
    } else {
      text = raw;
    }
  }

  return { html, text };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const accountId = request.nextUrl.searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json(
        { error: "Missing accountId" },
        { status: 400 }
      );
    }

    const account = await prisma.googleAccount.findFirst({
      where: { id: accountId, userId },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const accessToken = await getValidAccessToken(account.id);
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch message detail" },
        { status: res.status }
      );
    }

    const data = await res.json();
    const headers: Array<{ name: string; value: string }> =
      data.payload?.headers || [];

    const getHeader = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
      "";

    const { html, text } = extractBodyContent(data.payload);
    const labelIds: string[] = data.labelIds || [];

    return NextResponse.json({
      id: data.id,
      threadId: data.threadId,
      accountId: account.id,
      accountEmail: account.email,
      accountType: account.accountType,
      subject: getHeader("Subject") || "(Không có tiêu đề)",
      from: getHeader("From"),
      to: getHeader("To"),
      date: new Date(Number(data.internalDate || Date.now())).toISOString(),
      snippet: data.snippet || "",
      html,
      text,
      unread: labelIds.includes("UNREAD"),
      starred: labelIds.includes("STARRED"),
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
