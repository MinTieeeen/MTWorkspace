"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MailWorkspaceSkeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  Archive,
  Check,
  ChevronDown,
  ExternalLink,
  Mail,
  MailOpen,
  RefreshCw,
  Search,
  Star,
} from "lucide-react";

interface GmailListItem {
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

interface GmailAccountOption {
  id: string;
  email: string;
  accountType: "HCMUT" | "PERSONAL";
}

interface GmailMessageDetail {
  id: string;
  threadId: string;
  accountId: string;
  accountEmail: string;
  accountType: "HCMUT" | "PERSONAL";
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  html: string;
  text: string;
  unread: boolean;
  starred: boolean;
}

const FOLDER_LOV_OPTIONS = [
  { value: "INBOX", label: "Hộp thư đến" },
  { value: "UNREAD", label: "Chưa đọc" },
  { value: "STARRED", label: "Gắn sao" },
  { value: "IMPORTANT", label: "Quan trọng" },
  { value: "SENT", label: "Đã gửi" },
  { value: "ALL_MAIL", label: "Tất cả thư" },
];

function extractEnableApiUrl(rawError: string): string | null {
  const match = rawError.match(/https:\/\/console\.developers\.google\.com\S+/);
  return match ? match[0] : null;
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) {
      return d.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return "";
  }
}

function MailWorkspaceContent() {
  const searchParams = useSearchParams();
  const initialMsgId = searchParams.get("id");
  const initialAccountId = searchParams.get("accountId");

  const [messages, setMessages] = useState<GmailListItem[]>([]);
  const [accounts, setAccounts] = useState<GmailAccountOption[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [apiErrors, setApiErrors] = useState<string[]>([]);

  // LOV Filters
  const [folderLov, setFolderLov] = useState("INBOX");
  const [accountLov, setAccountLov] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Selected message detail
  const [selectedId, setSelectedId] = useState<string | null>(initialMsgId);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    initialAccountId
  );
  const [detail, setDetail] = useState<GmailMessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchMailbox = async () => {
    setLoading(true);
    setApiErrors([]);
    try {
      const params = new URLSearchParams({
        folder: folderLov,
        account: accountLov,
        limit: "25",
      });
      if (searchQuery.trim()) {
        params.set("q", searchQuery.trim());
      }

      const res = await fetch(`/api/gmail/recent?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setAuthenticated(Boolean(data.authenticated));
      setAccounts(data.accounts || []);
      const list: GmailListItem[] = data.messages || [];
      setMessages(list);
      if (data.apiErrors) {
        setApiErrors(data.apiErrors);
      }

      if (list.length > 0 && !selectedId) {
        setSelectedId(list[0].id);
        setSelectedAccountId(list[0].accountId);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  };

  useEffect(() => {
    fetchMailbox();
    const onAuthChange = () => fetchMailbox();
    window.addEventListener("mt-auth-updated", onAuthChange);
    return () => window.removeEventListener("mt-auth-updated", onAuthChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderLov, accountLov]);

  useEffect(() => {
    if (!selectedId || !selectedAccountId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    const loadDetail = async () => {
      setDetailLoading(true);
      try {
        const res = await fetch(
          `/api/gmail/messages/${encodeURIComponent(
            selectedId
          )}?accountId=${encodeURIComponent(selectedAccountId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data: GmailMessageDetail = await res.json();
        if (!cancelled) {
          setDetail(data);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    };

    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedId, selectedAccountId]);

  const handleAction = async (
    accountId: string,
    messageId: string,
    action: "MARK_READ" | "MARK_UNREAD" | "STAR" | "UNSTAR" | "ARCHIVE"
  ) => {
    if (action === "ARCHIVE") {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      if (selectedId === messageId) {
        setSelectedId(null);
        setDetail(null);
      }
    } else if (action === "MARK_READ" || action === "MARK_UNREAD") {
      const nextUnread = action === "MARK_UNREAD";
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, unread: nextUnread } : m))
      );
      if (detail?.id === messageId) {
        setDetail({ ...detail, unread: nextUnread });
      }
    } else if (action === "STAR" || action === "UNSTAR") {
      const nextStarred = action === "STAR";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, starred: nextStarred } : m
        )
      );
      if (detail?.id === messageId) {
        setDetail({ ...detail, starred: nextStarred });
      }
    }

    await fetch("/api/gmail/recent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, messageId, action }),
    });
  };

  const enableUrl = apiErrors[0] ? extractEnableApiUrl(apiErrors[0]) : null;

  if (!initialLoaded) return <MailWorkspaceSkeleton />;

  return (
    <div className="mx-auto flex h-[calc(100vh-7.5rem)] max-w-7xl flex-col gap-4">
      {/* Top Toolbar with LOV Filters & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* LOV 1: Folder */}
          <div className="relative">
            <select
              value={folderLov}
              onChange={(e) => setFolderLov(e.target.value)}
              aria-label="Danh mục"
              className="h-9 appearance-none rounded-xl border bg-muted/40 pl-3 pr-8 text-sm font-semibold text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
            >
              {FOLDER_LOV_OPTIONS.map((opt) => (
                <option
                  key={opt.value}
                  value={opt.value}
                  className="bg-card text-foreground"
                >
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>

          {/* LOV 2: Account */}
          <div className="relative">
            <select
              value={accountLov}
              onChange={(e) => setAccountLov(e.target.value)}
              aria-label="Tài khoản"
              className="h-9 appearance-none rounded-xl border bg-muted/40 pl-3 pr-8 text-sm font-semibold text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
            >
              <option value="ALL" className="bg-card text-foreground">
                Tất cả tài khoản
              </option>
              <option value="HCMUT" className="bg-card text-foreground">
                HCMUT
              </option>
              <option value="PERSONAL" className="bg-card text-foreground">
                Cá nhân
              </option>
              {accounts.map((acc) => (
                <option
                  key={acc.id}
                  value={acc.id}
                  className="bg-card text-foreground"
                >
                  {acc.email}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        {/* Search Input & Refresh */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchMailbox();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm email..."
              className="h-9 w-56 rounded-xl border bg-muted/40 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary focus:bg-card"
            />
          </div>

          <button
            type="button"
            onClick={fetchMailbox}
            title="Làm mới"
            className="group inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-card text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
          >
            <RefreshCw
              className={`h-4 w-4 text-primary transition-transform duration-500 group-hover:rotate-180 ${
                loading ? "animate-spin" : ""
              }`}
            />
          </button>
        </form>
      </div>

      {/* Main Split View */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-12">
        {/* Left List */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card lg:col-span-5">
          <div className="flex items-center justify-between border-b px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <span>Thư ({messages.length})</span>
            <span>
              {FOLDER_LOV_OPTIONS.find((o) => o.value === folderLov)?.label}
            </span>
          </div>

          {!authenticated ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <Mail className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">
                Chưa đăng nhập Google
              </p>
            </div>
          ) : apiErrors.length > 0 && messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <AlertCircle className="h-7 w-7 text-amber-500" />
              <p className="text-sm font-bold text-foreground">
                Chưa bật Gmail API trên Google Cloud
              </p>
              {enableUrl && (
                <a
                  href={enableUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <span>Bật Gmail API ngay</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm font-medium text-muted-foreground">
              {loading ? "Đang tải..." : "Không có email"}
            </div>
          ) : (
            <div className="flex-1 divide-y overflow-y-auto">
              {messages.map((msg) => {
                const isSelected = msg.id === selectedId;
                return (
                  <div
                    key={msg.id}
                    onClick={() => {
                      setSelectedId(msg.id);
                      setSelectedAccountId(msg.accountId);
                      if (msg.unread) {
                        handleAction(msg.accountId, msg.id, "MARK_READ");
                      }
                    }}
                    className={`group/item relative flex cursor-pointer items-start justify-between gap-3 px-4 py-3.5 transition-colors ${
                      isSelected ? "bg-primary/10" : "hover:bg-muted/60"
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-primary" />
                    )}

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
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
                          <span className="truncate text-xs font-bold text-foreground">
                            {msg.fromName}
                          </span>
                        </div>
                        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                          {formatShortDate(msg.date)}
                        </span>
                      </div>

                      <p
                        className={`truncate text-sm ${
                          msg.unread
                            ? "font-bold text-foreground"
                            : "font-medium text-foreground/85"
                        }`}
                      >
                        {msg.subject}
                      </p>

                      <p className="truncate text-xs text-muted-foreground">
                        {msg.snippet}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction(
                          msg.accountId,
                          msg.id,
                          msg.starred ? "UNSTAR" : "STAR"
                        );
                      }}
                      title="Gắn sao"
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-amber-500"
                    >
                      <Star
                        className={`h-4 w-4 ${
                          msg.starred ? "fill-amber-400 text-amber-400" : ""
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Reader Pane */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card lg:col-span-7">
          {!selectedId || !detail ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-sm font-medium text-muted-foreground">
              {detailLoading ? "Đang tải..." : "Chọn một email để xem"}
            </div>
          ) : (
            <>
              <div className="border-b px-6 py-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="font-display text-lg font-bold leading-snug text-foreground">
                    {detail.subject}
                  </h2>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        handleAction(
                          detail.accountId,
                          detail.id,
                          detail.unread ? "MARK_READ" : "MARK_UNREAD"
                        )
                      }
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      {detail.unread ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Đã đọc</span>
                        </>
                      ) : (
                        <>
                          <MailOpen className="h-3.5 w-3.5" />
                          <span>Chưa đọc</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleAction(detail.accountId, detail.id, "ARCHIVE")
                      }
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      <span>Lưu trữ</span>
                    </button>

                    <a
                      href={`https://mail.google.com/mail/u/${encodeURIComponent(
                        detail.accountEmail
                      )}/#inbox/${detail.threadId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <span>Mở Gmail</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-foreground">
                      {detail.from}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                        detail.accountType === "HCMUT"
                          ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                          : "bg-teal-500/15 text-teal-600 dark:text-teal-400"
                      }`}
                    >
                      {detail.accountEmail}
                    </span>
                    <span>
                      {new Date(detail.date).toLocaleString("vi-VN")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {detail.html ? (
                  <iframe
                    title={detail.subject}
                    srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;margin:0;padding:0;word-break:break-word;}img{max-width:100%;height:auto;}a{color:#0284c7;}</style></head><body>${detail.html}</body></html>`}
                    className="h-full min-h-[420px] w-full rounded-lg border-0 bg-white p-3"
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                    {detail.text || detail.snippet}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MailPage() {
  return (
    <Suspense fallback={<MailWorkspaceSkeleton />}>
      <MailWorkspaceContent />
    </Suspense>
  );
}
