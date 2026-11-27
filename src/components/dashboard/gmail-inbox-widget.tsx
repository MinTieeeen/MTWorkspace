"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ExternalLink,
  Mail,
  RefreshCw,
} from "lucide-react";
import { SenderAvatar } from "@/components/mail/sender-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConnectPrompt, EmptyState, ErrorState } from "@/components/ui/state";
import { toast } from "@/components/ui/toast";
import {
  extractEnableApiUrl,
  formatMailDate,
  gmailThreadUrl,
} from "@/lib/gmail-ui";
import { cn } from "@/lib/utils";

interface GmailMessageItem {
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

type WidgetFilter = "INBOX" | "UNREAD" | "STARRED";

const FILTERS: { value: WidgetFilter; label: string }[] = [
  { value: "INBOX", label: "Tất cả" },
  { value: "UNREAD", label: "Chưa đọc" },
  { value: "STARRED", label: "Gắn sao" },
];

export function GmailInboxWidget() {
  const [messages, setMessages] = useState<GmailMessageItem[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [filter, setFilter] = useState<WidgetFilter>("INBOX");
  const [apiErrors, setApiErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setApiErrors([]);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "8", folder: filter });
      const res = await fetch(`/api/gmail/recent?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.status === 401) {
        setAuthenticated(false);
        setMessages([]);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setAuthenticated(Boolean(data.authenticated));
      setMessages(data.messages || []);
      if (data.apiErrors) setApiErrors(data.apiErrors);
    } catch {
      setError("Không tải được hộp thư.");
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  }, [filter]);

  useEffect(() => {
    fetchMessages();
    const onAuthChange = () => fetchMessages();
    window.addEventListener("mt-auth-updated", onAuthChange);
    return () => window.removeEventListener("mt-auth-updated", onAuthChange);
  }, [fetchMessages]);

  const handleMarkRead = async (msg: GmailMessageItem) => {
    const previous = messages;
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, unread: false } : m))
    );
    let ok = false;
    try {
      const res = await fetch("/api/gmail/recent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: msg.accountId,
          messageId: msg.id,
          action: "MARK_READ",
        }),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }
    if (!ok) {
      setMessages(previous);
      toast.error("Không đánh dấu đã đọc được");
    }
  };

  const enableUrl = apiErrors[0] ? extractEnableApiUrl(apiErrors[0]) : null;
  const unreadCount = messages.filter((m) => m.unread).length;

  return (
    <Card>
      <CardHeader
        icon={<Mail />}
        title={
          <span className="inline-flex items-center gap-2">
            Hộp thư
            {authenticated && unreadCount > 0 && filter !== "UNREAD" && (
              <span className="rounded-full bg-primary px-1.5 font-mono text-xs font-semibold text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </span>
        }
        action={
          authenticated && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={fetchMessages}
                aria-label="Làm mới"
                title="Làm mới"
              >
                <RefreshCw
                  className={cn("h-4 w-4", loading && "animate-spin")}
                />
              </Button>
              <Link
                href="/mail"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-medium text-primary transition-colors hover:bg-primary/10"
              >
                Mở hộp thư
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )
        }
      />

      {/* Lọc nhanh: thay cho danh sách thả xuống */}
      {authenticated && (
        <div
          role="radiogroup"
          aria-label="Lọc thư"
          className="flex items-center gap-1 border-b px-4 py-2"
        >
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[13px] font-medium transition-colors",
                filter === f.value
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {!initialLoaded ? (
        <div className="divide-y">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      ) : !authenticated ? (
        <ConnectPrompt
          className="rounded-none border-0 py-10"
          title="Chưa kết nối Gmail"
          description="Đăng nhập Google để xem thư mới ngay tại đây."
          actionLabel="Đăng nhập Google"
          onConnect={() => {
            window.location.href = "/api/auth/google?mode=login";
          }}
        />
      ) : error ? (
        <ErrorState
          className="rounded-none border-0 py-10"
          title="Không tải được hộp thư"
          message={error}
          onRetry={fetchMessages}
        />
      ) : apiErrors.length > 0 && messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-5 py-10 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10 text-warning-fg">
            <AlertCircle className="h-5 w-5" />
          </span>
          <p className="font-display text-sm font-semibold text-foreground">
            Chưa bật Gmail API trên Google Cloud
          </p>
          {enableUrl && (
            <a
              href={enableUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Bật Gmail API ngay
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      ) : messages.length === 0 ? (
        <EmptyState
          className="rounded-none border-0 py-10"
          icon={<Mail />}
          title={
            filter === "UNREAD"
              ? "Không có thư chưa đọc"
              : filter === "STARRED"
              ? "Chưa có thư gắn sao"
              : "Không có email"
          }
        />
      ) : (
        <ul
          className={cn(
            "mt-stagger max-h-96 divide-y overflow-y-auto transition-opacity",
            loading && "opacity-60"
          )}
        >
          {messages.map((msg) => (
            <li
              key={msg.id}
              className="group/row relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <Link
                href={`/mail?id=${encodeURIComponent(
                  msg.id
                )}&accountId=${encodeURIComponent(msg.accountId)}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                {/* Avatar người gửi, chấm chưa đọc ở góc */}
                <span className="relative shrink-0">
                  <SenderAvatar
                    name={msg.fromName}
                    email={msg.fromEmail}
                    className="h-9 w-9 text-sm"
                  />
                  {msg.unread && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span
                      className={cn(
                        "truncate text-[13px]",
                        msg.unread
                          ? "font-semibold text-foreground"
                          : "font-medium text-muted-foreground"
                      )}
                    >
                      {msg.fromName}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground transition-opacity group-hover/row:opacity-0">
                      {formatMailDate(msg.date)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block truncate text-sm",
                      msg.unread
                        ? "font-semibold text-foreground"
                        : "text-foreground/80"
                    )}
                  >
                    {msg.subject}
                  </span>
                </span>
              </Link>

              {/* Thao tác nhanh: hiện khi rê chuột hoặc focus bàn phím, thế chỗ giờ nhận */}
              <div className="absolute right-3 top-2.5 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
                {msg.unread && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(msg)}
                    title="Đánh dấu đã đọc"
                    aria-label="Đánh dấu đã đọc"
                    className="flex h-7 w-7 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:text-primary"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}
                <a
                  href={gmailThreadUrl(msg.accountEmail, msg.threadId)}
                  target="_blank"
                  rel="noreferrer"
                  title="Mở Gmail"
                  aria-label="Mở Gmail"
                  className="flex h-7 w-7 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
