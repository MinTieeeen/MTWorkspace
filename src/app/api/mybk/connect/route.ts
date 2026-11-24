import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  clearLocalCache,
  decodeMyBkJwt,
  loginMyBkCasSso,
  saveAndSyncMyBkTranscript,
} from "@/lib/mybk";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mode, username, password, jwtToken, studentId } = body as {
      mode: "sso" | "token";
      username?: string;
      password?: string;
      jwtToken?: string;
      studentId?: string;
    };

    if (mode === "sso") {
      if (!username || !password) {
        return NextResponse.json(
          { error: "Vui lòng nhập tài khoản và mật khẩu SSO HCMUT" },
          { status: 400 }
        );
      }

      const ssoResult = await loginMyBkCasSso(username, password);
      const resolvedStudentId = studentId?.trim() || ssoResult.studentId;

      const payload = await saveAndSyncMyBkTranscript({
        studentId: resolvedStudentId,
        jwtToken: ssoResult.jwtToken,
        ssoUsername: username.trim(),
        rawPassword: password,
      });

      return NextResponse.json(payload);
    }

    // Mode: direct JWT token
    if (!jwtToken || !jwtToken.trim()) {
      return NextResponse.json(
        { error: "Vui lòng nhập Authorization Token từ myBK" },
        { status: 400 }
      );
    }

    const cleanToken = jwtToken.replace(/^Bearer\s+/i, "").trim();
    const decoded = decodeMyBkJwt(cleanToken);
    const resolvedStudentId = studentId?.trim() || decoded.sub;

    if (!resolvedStudentId) {
      return NextResponse.json(
        { error: "Không nhận diện được MSSV từ Token, vui lòng nhập MSSV" },
        { status: 400 }
      );
    }

    const payload = await saveAndSyncMyBkTranscript({
      studentId: resolvedStudentId,
      jwtToken: cleanToken,
    });

    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Không thể kết nối với hệ thống myBK",
      },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  try {
    await clearLocalCache();
    await prisma.myBkAccount.deleteMany({});
  } catch {
    // ignore if db offline
  }
  return NextResponse.json({ success: true });
}
