import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createSessionToken,
  detectAccountType,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  getSessionUserId,
  SESSION_COOKIE_NAME,
} from "@/lib/google-auth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/?auth_error=oauth_denied", request.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const profile = await fetchGoogleUserInfo(tokens.access_token);
    const accountType = detectAccountType(profile.email);
    const expiresAt = BigInt(Date.now() + tokens.expires_in * 1000);

    // Check if user is already logged in (Multi-Account Linking flow)
    const activeUserId = await getSessionUserId();
    let targetUserId = activeUserId;

    if (targetUserId) {
      const existingUser = await prisma.user.findUnique({
        where: { id: targetUserId },
      });
      if (!existingUser) {
        targetUserId = null;
      }
    }

    if (!targetUserId) {
      // Check if this Google account is already linked to an existing User
      const existingGoogleAccount = await prisma.googleAccount.findUnique({
        where: { googleSub: profile.sub },
      });

      if (existingGoogleAccount) {
        targetUserId = existingGoogleAccount.userId;
      } else {
        // Find or create User by primaryEmail
        const user = await prisma.user.upsert({
          where: { primaryEmail: profile.email },
          update: {
            name: profile.name || profile.email.split("@")[0],
            avatarUrl: profile.picture,
          },
          create: {
            name: profile.name || profile.email.split("@")[0],
            primaryEmail: profile.email,
            avatarUrl: profile.picture,
          },
        });
        targetUserId = user.id;
      }
    }

    // Check if user already has a primary GoogleAccount
    const existingAccountsCount = await prisma.googleAccount.count({
      where: { userId: targetUserId },
    });

    await prisma.googleAccount.upsert({
      where: { googleSub: profile.sub },
      update: {
        userId: targetUserId,
        email: profile.email,
        displayName: profile.name,
        avatarUrl: profile.picture,
        accountType,
        accessToken: tokens.access_token,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        expiresAt,
        scope: tokens.scope,
        lastSyncedAt: new Date(),
      },
      create: {
        userId: targetUserId,
        googleSub: profile.sub,
        email: profile.email,
        displayName: profile.name,
        avatarUrl: profile.picture,
        accountType,
        isPrimary: existingAccountsCount === 0,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        scope: tokens.scope,
        lastSyncedAt: new Date(),
      },
    });

    const sessionToken = createSessionToken(targetUserId);
    const response = NextResponse.redirect(new URL("/", request.url));

    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/?auth_error=callback_failed", request.url)
    );
  }
}
