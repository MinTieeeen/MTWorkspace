import { NextRequest, NextResponse } from "next/server";
import {
  buildGoogleAuthUrl,
  isGoogleOAuthConfigured,
} from "@/lib/google-auth";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode") || "login";

  if (!isGoogleOAuthConfigured()) {
    const redirectUrl = new URL("/?auth_error=missing_google_config", request.url);
    return NextResponse.redirect(redirectUrl);
  }

  const authUrl = buildGoogleAuthUrl(mode);
  return NextResponse.redirect(authUrl);
}
