import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSessionUserId,
  getValidAccessToken,
} from "@/lib/google-auth";

export interface GmailSummaryItem {
  id: string;
  threadId: string;
  accountId: string;
  accountEmail: string;
  accountType: "HCMUT" | "PERSONAL";
  subject: string;
  fromName: string;
  fromEmail: string;
  snippet: string;
  date: string;
  unread: boolean;
  starred: boolean;
}

function parseFromHeader(rawFrom: string): { name: string; email: string } {
  const match = rawFrom.match(/^(.*?)\s*<(.+?)>$/);
  if (match) {
    return {
      name: match[1].replace(/^"|"$/g, "").trim() || match[2],
      email: match[2].trim(),
    };
  }
  return { name: rawFrom.trim(), email: rawFrom.trim() };
}

function buildGmailQuery(folder: string, search: string): string {
  const parts: string[] = [];
  switch (folder) {
    case "UNREAD":
      parts.push("in:inbox is:unread");
      break;
    case "STARRED":
      parts.push("is:starred");
      break;
    case "IMPORTANT":
      parts.push("is:important");
      break;
    case "SENT":
      parts.push("in:sent");
      break;
    case "ALL_MAIL":
      parts.push("-in:trash -in:spam");
      break;
    case "INBOX":
    default:
      parts.push("in:inbox");
      break;
  }
  if (search.trim()) {
    parts.push(search.trim());
  }
  return parts.join(" ");
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({
        messages: [],
        accounts: [],
        authenticated: false,
      });
    }

    const folder = request.nextUrl.searchParams.get("folder") || "INBOX";
    const accountFilter = request.nextUrl.searchParams.get("account") || "ALL";
    const search = request.nextUrl.searchParams.get("q") || "";
    const limit = Math.min(
      Number(request.nextUrl.searchParams.get("limit") || "15"),
      30
    );

    const accounts = await prisma.googleAccount.findMany({
      where: { userId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });

    if (accounts.length === 0) {
      return NextResponse.json({
        messages: [],
        accounts: [],
        authenticated: true,
      });
    }

    const targetAccounts = accounts.filter((acc) => {
      if (accountFilter === "ALL") return true;
      if (accountFilter === "HCMUT") return acc.accountType === "HCMUT";
      if (accountFilter === "PERSONAL") return acc.accountType === "PERSONAL";
      return acc.id === accountFilter || acc.email === accountFilter;
    });

    const query = buildGmailQuery(folder, search);
    const apiErrors: string[] = [];

    const perAccountMessages = await Promise.all(
      targetAccounts.map(async (account) => {
        try {
          const accessToken = await getValidAccessToken(account.id);
          const listUrl = new URL(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages"
          );
          listUrl.searchParams.set("maxResults", String(limit));
          if (query) {
            listUrl.searchParams.set("q", query);
          }

          const listRes = await fetch(listUrl.toString(), {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: "no-store",
          });

          if (!listRes.ok) {
            const errJson = await listRes.json().catch(() => null);
            const errMsg =
              errJson?.error?.message ||
              `Lỗi kết nối Gmail API (${listRes.status}) cho ${account.email}`;
            apiErrors.push(`${account.email}: ${errMsg}`);
            return [];
          }

          const listData = await listRes.json();
          const rawList: Array<{ id: string; threadId: string }> =
            listData.messages || [];

          const details = await Promise.all(
            rawList.map(async (item) => {
              const msgRes = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
                {
                  headers: { Authorization: `Bearer ${accessToken}` },
                  cache: "no-store",
                }
              );
              if (!msgRes.ok) return null;
              const msgData = await msgRes.json();
              const headers: Array<{ name: string; value: string }> =
                msgData.payload?.headers || [];

              const getHeader = (name: string) =>
                headers.find(
                  (h) => h.name.toLowerCase() === name.toLowerCase()
                )?.value || "";

              const subject = getHeader("Subject") || "(Không có tiêu đề)";
              const fromParsed = parseFromHeader(getHeader("From"));
              const labelIds: string[] = msgData.labelIds || [];

              const summary: GmailSummaryItem = {
                id: msgData.id,
                threadId: msgData.threadId,
                accountId: account.id,
                accountEmail: account.email,
                accountType:
                  account.accountType === "HCMUT" ? "HCMUT" : "PERSONAL",
                subject,
                fromName: fromParsed.name,
                fromEmail: fromParsed.email,
                snippet: msgData.snippet || "",
                date: new Date(
                  Number(msgData.internalDate || Date.now())
                ).toISOString(),
                unread: labelIds.includes("UNREAD"),
                starred: labelIds.includes("STARRED"),
              };
              return summary;
            })
          );

          await prisma.googleAccount.update({
            where: { id: account.id },
            data: { lastSyncedAt: new Date() },
          });

          return details.filter(Boolean) as GmailSummaryItem[];
        } catch (e) {
          apiErrors.push(
            `${account.email}: ${e instanceof Error ? e.message : "Lỗi đồng bộ"}`
          );
          return [];
        }
      })
    );

    const merged = perAccountMessages
      .flat()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);

    return NextResponse.json({
      messages: merged,
      accounts: accounts.map((a) => ({
        id: a.id,
        email: a.email,
        accountType: a.accountType,
      })),
      authenticated: true,
      apiErrors: apiErrors.length > 0 ? apiErrors : undefined,
    });
  } catch {
    return NextResponse.json({
      messages: [],
      accounts: [],
      authenticated: false,
    });
  }
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { accountId, messageId, action } = body as {
    accountId: string;
    messageId: string;
    action: "MARK_READ" | "MARK_UNREAD" | "STAR" | "UNSTAR" | "ARCHIVE";
  };

  const account = await prisma.googleAccount.findFirst({
    where: { id: accountId, userId },
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const accessToken = await getValidAccessToken(account.id);

  let addLabelIds: string[] = [];
  let removeLabelIds: string[] = [];

  switch (action) {
    case "MARK_READ":
      removeLabelIds = ["UNREAD"];
      break;
    case "MARK_UNREAD":
      addLabelIds = ["UNREAD"];
      break;
    case "STAR":
      addLabelIds = ["STARRED"];
      break;
    case "UNSTAR":
      removeLabelIds = ["STARRED"];
      break;
    case "ARCHIVE":
      removeLabelIds = ["INBOX", "UNREAD"];
      break;
  }

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    }
  );

  return NextResponse.json({ success: res.ok });
}
