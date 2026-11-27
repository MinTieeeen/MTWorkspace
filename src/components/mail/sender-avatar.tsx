"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Gmail API không trả ảnh người gửi, nên thử lần lượt: Gravatar (nếu là địa chỉ cá nhân)
// -> logo của tên miền (nếu không phải dịch vụ email công cộng) -> chữ cái đầu.
const PUBLIC_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
]);
const AUTOMATED_LOCAL =
  /(^|[._-])(no-?reply|do-?not-?reply|notifications?|updates?|mailer|newsletter|news|info|support|alerts?|billing|marketing|team|hello)([._-]|$)/;
const TWO_LEVEL_TLD = /\.(edu|com|gov|org|ac|co)\.[a-z]{2}$/;

// Dùng chung trong cả phiên: không tải lại khi chuyển thư hoặc chuyển trang
const avatarCache = new Map<string, string | null>();
const avatarInflight = new Map<string, Promise<string | null>>();

function rootDomain(domain: string): string {
  const parts = domain.split(".");
  const keep = TWO_LEVEL_TLD.test(domain) ? 3 : 2;
  return parts.length > keep ? parts.slice(-keep).join(".") : domain;
}

async function sha256Hex(text: string): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function tryLoadImage(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.onload = () => resolve(img.naturalWidth > 1);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

function resolveAvatar(email: string): Promise<string | null> {
  const key = email.trim().toLowerCase();
  if (avatarCache.has(key)) return Promise.resolve(avatarCache.get(key) ?? null);
  const running = avatarInflight.get(key);
  if (running) return running;

  const job = (async () => {
    const [local, domain] = key.split("@");
    if (!local || !domain) return null;

    const candidates: string[] = [];
    if (!AUTOMATED_LOCAL.test(local)) {
      const hash = await sha256Hex(key);
      if (hash) candidates.push(`https://gravatar.com/avatar/${hash}?s=96&d=404`);
    }
    if (!PUBLIC_MAIL_DOMAINS.has(domain)) {
      candidates.push(
        `https://www.google.com/s2/favicons?domain=${rootDomain(domain)}&sz=64`
      );
    }
    for (const src of candidates) {
      if (await tryLoadImage(src)) return src;
    }
    return null;
  })().then((result) => {
    avatarCache.set(key, result);
    avatarInflight.delete(key);
    return result;
  });

  avatarInflight.set(key, job);
  return job;
}

/** Avatar tròn: ảnh nếu tìm được, nếu không là chữ cái đầu của tên người gửi */
export function SenderAvatar({
  name,
  email,
  className,
}: {
  name: string;
  email: string;
  className?: string;
}) {
  const key = email.trim().toLowerCase();
  const [src, setSrc] = useState<string | null>(avatarCache.get(key) ?? null);

  useEffect(() => {
    let cancelled = false;
    setSrc(avatarCache.get(key) ?? null);
    resolveAvatar(key).then((found) => {
      if (!cancelled) setSrc(found);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-display font-semibold uppercase text-primary",
        className
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full bg-white object-cover animate-in fade-in duration-200"
        />
      ) : (
        name.trim().charAt(0) || "?"
      )}
    </span>
  );
}
