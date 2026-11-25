"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  ChevronDown,
  ExternalLink,
  Mail,
  RefreshCw,
} from "lucide-react";

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

type WidgetLovFilter =
  | "ALL"
  | "HCMUT"
  | "PERSONAL"
  | "UNREAD"
  | "STARRED";

const WIDGET_LOV_OPTIONS: Array<{ value: WidgetLovFilter; label: string }> = [
  { value: "ALL", label: "Tất cả" },
  { value: "HCMUT", label: "HCMUT" },
  { value: "PERSONAL", label: "Cá nhân" },
  { value: "UNREAD", label: "Chưa đọc" },
  { value: "STARRED", label: "Gắn sao" },
];

function extractEnableApiUrl(rawError: string): string | null {
  const match = rawError.match(/https:\/\/console\.developers\.google\.com\S+/);
  return match ? match[0] : null;
}

export function GmailInboxWidget() {
  const [messages, setMessages] = useState<GmailMessageItem[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [lovFilter, setLovFilter] = useState<WidgetLovFilter>("ALL");
  const [lovOpen, setLovOpen] = useState(false);
  const [apiErrors, setApiErrors] = useState<string[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async (currentFilter: WidgetLovFilter = lovFilter) => {
    setLoading(true);
    setApiErrors([]);
    try {
      const params = new URLSearchParams({ limit: "8" });
      if (currentFilter === "HCMUT" || currentFilter === "PERSONAL") {
        params.set("account", currentFilter);
        params.set("folder", "INBOX");
      } else if (currentFilter === "UNREAD" || currentFilter === "STARRED") {
        params.set("folder", currentFilter);
      } else {
        params.set("folder", "INBOX");
      }

      const res = await fetch(`/api/gmail/recent?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setAuthenticated(Boolean(data.authenticated));
      setMessages(data.messages || []);
      if (data.apiErrors) {
        setApiErrors(data.apiErrors);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  };

  useEffect(() => {
    fetchMessages(lovFilter);
    const onAuthChange = () => fetchMessages(lovFilter);
    window.addEventListener("mt-auth-updated", onAuthChange);
    return () => window.removeEventListener("mt-auth-updated", onAuthChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lovFilter]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setLovOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMarkRead = async (msg: GmailMessageItem) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, unread: false } : m))
    );
    await fetch("/api/gmail/recent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: msg.accountId,
        messageId: msg.id,
        action: "MARK_READ",
      }),
    });
  };

  const activeLabel =
    WIDGET_LOV_OPTIONS.find((o) => o.value === lovFilter)?.label || "Tất cả";
  const enableUrl = apiErrors[0] ? extractEnableApiUrl(apiErrors[0]) : null;

  return (
    <section className="group overflow-hidden rounded-2xl border bg-card transition-colors duration-200 hover:border-rose-500/40">
      {/* Compact Header Bar */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3.5">
        <Link
          href="/mail"
          className="flex shrink-0 items-center gap-2.5 text-base font-bold hover:text-primary transition-colors"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <Mail className="h-[18px] w-[18px] icon-anim-slide" />
          </span>
          <span className="font-display whitespace-nowrap">Hộp thư</span>
        </Link>

        {authenticated && (
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Custom Clean LOV Dropdown */}
            <div ref={dropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setLovOpen((prev) => !prev)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
              >
                <span>{activeLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>

              {lovOpen && (
                <div className="absolute right-0 top-9 z-20 w-32 rounded-xl border bg-card p-1 shadow-lg">
                  {WIDGET_LOV_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setLovFilter(opt.value);
                        setLovOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition-colors ${
                        lovFilter === opt.value
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {lovFilter === opt.value && (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => fetchMessages(lovFilter)}
              title="Làm mới"
              className="group/btn flex h-8 w-8 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 transition-transform duration-500 group-hover/btn:rotate-180 ${
                  loading ? "animate-spin" : ""
                }`}
              />
            </button>

            <Link
              href="/mail"
              title="Mở Hộp thư"
              className="flex h-8 w-8 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>

      {/* Body Content */}
      {!initialLoaded ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ))}
        </div>
      ) : !authenticated ? (
        <div className="flex h-52 flex-col items-center justify-center gap-3 p-6">
          <svg width="105" height="90" viewBox="0 0 105 90" fill="none">
            <rect
              x="18"
              y="28"
              width="58"
              height="42"
              rx="10"
              className="fill-card stroke-rose-500"
              strokeWidth="2.2"
            />
            <path
              d="M20 32L47 51L74 32"
              stroke="#F43F5E"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <g className="transition-transform duration-500 group-hover:translate-x-2 group-hover:-translate-y-2">
              <path d="M62 22L92 12L80 42L73 29L62 22Z" fill="#FB7185" />
              <path
                d="M92 12L73 29"
                stroke="white"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </g>
          </svg>
          <span className="text-sm font-medium text-muted-foreground">
            Chưa kết nối Gmail
          </span>
        </div>
      ) : apiErrors.length > 0 && messages.length === 0 ? (
        <div className="flex h-52 flex-col items-center justify-center gap-3 p-5 text-center">
          <AlertCircle className="h-6 w-6 text-amber-500" />
          <p className="text-sm font-semibold text-foreground">
            Chưa bật Gmail API trên Google Cloud
          </p>
          {enableUrl && (
            <a
              href={enableUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <span>Bật Gmail API ngay</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      ) : messages.length === 0 ? (
        <div className="flex h-52 items-center justify-center p-6 text-sm font-medium text-muted-foreground">
          {loading ? "Đang tải..." : "Không có email"}
        </div>
      ) : (
        <div className="divide-y max-h-80 overflow-y-auto">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="group/row flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <Link
                href={`/mail?id=${encodeURIComponent(
                  msg.id
                )}&accountId=${encodeURIComponent(msg.accountId)}`}
                className="min-w-0 flex-1 space-y-1"
              >
                <div className="flex items-center gap-2">
                  {msg.unread && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      msg.accountType === "HCMUT"
                        ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                        : "bg-teal-500/15 text-teal-600 dark:text-teal-400"
                    }`}
                  >
                    {msg.accountType === "HCMUT" ? "HCMUT" : "Cá nhân"}
                  </span>
                  <span className="truncate text-xs font-semibold text-muted-foreground">
                    {msg.fromName}
                  </span>
                </div>
                <p
                  className={`truncate text-sm ${
                    msg.unread
                      ? "font-bold text-foreground"
                      : "font-medium text-muted-foreground"
                  }`}
                >
                  {msg.subject}
                </p>
              </Link>

              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100">
                {msg.unread && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(msg)}
                    title="Đã đọc"
                    className="flex h-7 w-7 items-center justify-center rounded-md border bg-card text-muted-foreground hover:text-primary"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}
                <a
                  href={`https://mail.google.com/mail/u/${encodeURIComponent(
                    msg.accountEmail
                  )}/#inbox/${msg.threadId}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Mở Gmail"
                  className="flex h-7 w-7 items-center justify-center rounded-md border bg-card text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
