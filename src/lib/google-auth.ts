import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

export const SESSION_COOKIE_NAME = "mt_session";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify",
].join(" ");

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || "mt-workspace-local-secret-key-2026";
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
}

export function createSessionToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, iat: Date.now() })
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string): { userId: string } | null {
  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expectedSig = crypto
      .createHmac("sha256", getSessionSecret())
      .update(payload)
      .digest("base64url");
    if (signature !== expectedSig) return null;
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );
    return parsed?.userId ? { userId: parsed.userId } : null;
  } catch {
    return null;
  }
}

export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const verified = verifySessionToken(token);
  return verified?.userId ?? null;
}

export function buildGoogleAuthUrl(state = "login"): string {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:3000/api/auth/google/callback";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent select_account",
    state,
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeCodeForTokens(
  code: string
): Promise<GoogleTokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:3000/api/auth/google/callback";

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google token exchange failed: ${errText}`);
  }

  return response.json();
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export async function fetchGoogleUserInfo(
  accessToken: string
): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Google user profile");
  }

  return response.json();
}

export function detectAccountType(email: string): "HCMUT" | "PERSONAL" {
  return email.toLowerCase().endsWith("@hcmut.edu.vn") ? "HCMUT" : "PERSONAL";
}

export async function getValidAccessToken(accountId: string): Promise<string> {
  const account = await prisma.googleAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw new Error("Google account not found");
  }

  const now = BigInt(Date.now());
  const bufferMs = BigInt(60_000); // 1 minute buffer

  if (account.expiresAt && account.expiresAt - bufferMs > now) {
    return account.accessToken;
  }

  if (!account.refreshToken) {
    return account.accessToken;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: account.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    return account.accessToken;
  }

  const refreshed: GoogleTokenResponse = await response.json();
  const nextExpiresAt = BigInt(Date.now() + refreshed.expires_in * 1000);

  await prisma.googleAccount.update({
    where: { id: account.id },
    data: {
      accessToken: refreshed.access_token,
      expiresAt: nextExpiresAt,
    },
  });

  return refreshed.access_token;
}
