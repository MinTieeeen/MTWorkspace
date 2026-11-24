import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  decryptCredential,
  getStoredMyBkTranscript,
  loginMyBkCasSso,
  saveAndSyncMyBkTranscript,
} from "@/lib/mybk";

export async function GET() {
  const payload = await getStoredMyBkTranscript();
  return NextResponse.json(payload);
}

export async function POST() {
  try {
    const account = await prisma.myBkAccount
      .findFirst({
        orderBy: { updatedAt: "desc" },
      })
      .catch(() => null);

    if (!account) {
      const cached = await getStoredMyBkTranscript();
      if (cached.connected) {
        return NextResponse.json(cached);
      }
      return NextResponse.json(
        { error: "Chưa kết nối tài khoản myBK" },
        { status: 400 }
      );
    }

    try {
      const payload = await saveAndSyncMyBkTranscript({
        studentId: account.studentId,
        jwtToken: account.jwtToken,
        ssoUsername: account.ssoUsername || undefined,
      });
      return NextResponse.json(payload);
    } catch (syncError) {
      // If token expired and we have stored encrypted SSO credentials, re-login via CAS automatically!
      if (account.ssoUsername && account.encryptedPassword) {
        const plainPassword = decryptCredential(account.encryptedPassword);
        if (plainPassword) {
          const freshSso = await loginMyBkCasSso(
            account.ssoUsername,
            plainPassword
          );
          const payload = await saveAndSyncMyBkTranscript({
            studentId: account.studentId,
            jwtToken: freshSso.jwtToken,
            ssoUsername: account.ssoUsername,
          });
          return NextResponse.json(payload);
        }
      }
      throw syncError;
    }
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Đồng bộ dữ liệu myBK thất bại",
      },
      { status: 400 }
    );
  }
}
