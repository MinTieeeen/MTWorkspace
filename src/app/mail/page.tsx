"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  ExternalLink,
  Mail,
  MailOpen,
  RefreshCw,
  Search,
  Star,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { MailWorkspaceSkeleton, Skeleton } from "@/components/ui/skeleton";
import { ConnectPrompt, EmptyState, ErrorState } from "@/components/ui/state";
import { toast } from "@/components/ui/toast";
import { SenderAvatar } from "@/components/mail/sender-avatar";
import {
  accountLabel,
  extractEnableApiUrl,
  formatMailDate,
  gmailThreadUrl,
} from "@/lib/gmail-ui";
import { cn } from "@/lib/utils";

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

type MailAction = "MARK_READ" | "MARK_UNREAD" | "STAR" | "UNSTAR" | "ARCHIVE";

const FOLDER_OPTIONS = [
  { value: "INBOX", label: "Hộp thư đến" },
  { value: "UNREAD", label: "Chưa đọc" },
  { value: "STARRED", label: "Gắn sao" },
  { value: "IMPORTANT", label: "Quan trọng" },
  { value: "SENT", label: "Đã gửi" },
  { value: "ALL_MAIL", label: "Tất cả thư" },
];

/** "Nguyễn A <a@x.com>" -> { name, email } */
function parseFrom(raw: string): { name: string; email: string } {
  const m = raw.match(/^(.*?)\s*<(.+?)>$/);
  if (m) {
    return { name: m[1].replace(/^"|"$/g, "").trim() || m[2], email: m[2] };
  }
  return { name: raw.trim(), email: raw.trim() };
}

/**
 * Hiển thị thư HTML trong iframe cách ly và tự giãn chiều cao theo nội dung,
 * để chỉ còn MỘT thanh cuộn (của khung đọc thư) thay vì hai.
 * `allow-same-origin` an toàn ở đây vì KHÔNG cấp `allow-scripts` (kèm CSP chặn script),
 * nên nội dung thư không chạy được mã nhưng trang cha đo được chiều cao.
 */
function MailHtmlFrame({ title, html }: { title: string; html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let observer: ResizeObserver | null = null;

    const measure = () => {
      const doc = frame.contentDocument;
      if (!doc?.documentElement) return;
      setHeight(Math.max(120, doc.documentElement.scrollHeight));
    };
    const onLoad = () => {
      measure();
      const body = frame.contentDocument?.body;
      if (body && typeof ResizeObserver !== "undefined") {
        observer?.disconnect();
        observer = new ResizeObserver(measure);
        observer.observe(body);
      }
    };

    frame.addEventListener("load", onLoad);
    if (frame.contentDocument?.readyState === "complete") onLoad();
    return () => {
      frame.removeEventListener("load", onLoad);
      observer?.disconnect();
    };
  }, [html]);

  return (
    <iframe
      ref={ref}
      title={title}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      scrolling="no"
      style={{ height }}
      srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data: cid:; style-src 'unsafe-inline'; font-src https: data:;"><base target="_blank"><style>html,body{margin:0;padding:0;overflow:hidden;}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;word-break:break-word;}img{max-width:100%;height:auto;}a{color:#0284c7;}</style></head><body>${html}</body></html>`}
      className="block w-full rounded-lg border-0 bg-white p-3"
    />
  );
}

/** Khung tải của khung đọc thư: hiện ngay khi chuyển sang thư khác */
function ReaderSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col animate-in fade-in duration-150">
      <div className="flex items-center gap-2 border-b px-5 py-2.5">
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="ml-auto h-8 w-28 rounded-lg" />
      </div>
      <div className="space-y-4 border-b px-6 py-5">
        <Skeleton className="h-6 w-3/4 rounded-md" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-44 rounded-md" />
            <Skeleton className="h-3.5 w-60 rounded-md" />
          </div>
          <Skeleton className="h-4 w-32 rounded-md" />
        </div>
      </div>
      <div className="flex-1 space-y-3 p-6">
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-11/12 rounded" />
        <Skeleton className="h-4 w-4/5 rounded" />
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-2/3 rounded" />
        <Skeleton className="mt-4 h-32 w-full rounded-xl" />
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex-1 divide-y overflow-hidden animate-in fade-in duration-150">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="space-y-2 px-4 py-3.5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-3.5 w-10 rounded" />
          </div>
          <Skeleton className="h-4 w-4/5 rounded" />
          <Skeleton className="h-3.5 w-3/5 rounded" />
        </div>
      ))}
    </div>
  );
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
  const [listError, setListError] = useState<string | null>(null);

  // Bộ lọc: thư mục, tài khoản cụ thể (mặc định tất cả), từ khoá
  const [folder, setFolder] = useState("INBOX");
  const [accountFilter, setAccountFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Thư đang chọn
  const [selectedId, setSelectedId] = useState<string | null>(initialMsgId);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    initialAccountId
  );
  const [detail, setDetail] = useState<GmailMessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  // Dưới lg chỉ hiện một khung: danh sách hoặc nội dung thư
  const [readerOpen, setReaderOpen] = useState(Boolean(initialMsgId));

  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  const fetchMailbox = useCallback(async () => {
    setLoading(true);
    setApiErrors([]);
    setListError(null);
    try {
      const params = new URLSearchParams({
        folder,
        account: accountFilter,
        limit: "25",
      });
      if (searchQuery.trim()) params.set("q", searchQuery.trim());

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
      setAccounts(data.accounts || []);
      const list: GmailListItem[] = data.messages || [];
      setMessages(list);
      if (data.apiErrors) setApiErrors(data.apiErrors);

      if (list.length > 0 && !selectedRef.current) {
        setSelectedId(list[0].id);
        setSelectedAccountId(list[0].accountId);
      }
    } catch {
      setListError("Không tải được danh sách thư. Kiểm tra kết nối rồi thử lại.");
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  }, [folder, accountFilter, searchQuery]);

  useEffect(() => {
    fetchMailbox();
    const onAuthChange = () => fetchMailbox();
    window.addEventListener("mt-auth-updated", onAuthChange);
    return () => window.removeEventListener("mt-auth-updated", onAuthChange);
    // Tìm kiếm chỉ chạy khi nhấn Enter, không chạy theo từng ký tự
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, accountFilter]);

  const loadDetail = useCallback(async () => {
    if (!selectedId || !selectedAccountId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(
        `/api/gmail/messages/${encodeURIComponent(
          selectedId
        )}?accountId=${encodeURIComponent(selectedAccountId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(String(res.status));
      const data: GmailMessageDetail = await res.json();
      // Bỏ qua kết quả của thư đã bị thay bằng thư khác
      if (selectedRef.current === selectedId) setDetail(data);
    } catch {
      if (selectedRef.current === selectedId) {
        setDetailError("Không mở được nội dung thư này.");
      }
    } finally {
      if (selectedRef.current === selectedId) setDetailLoading(false);
    }
  }, [selectedId, selectedAccountId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleAction = async (
    accountId: string,
    messageId: string,
    action: MailAction
  ) => {
    // Lưu trạng thái trước khi thay đổi để hoàn lại nếu thất bại
    const prevMessages = messages;
    const prevDetail = detail;
    const prevSelected = { id: selectedId, account: selectedAccountId };

    if (action === "ARCHIVE") {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      if (selectedId === messageId) {
        setSelectedId(null);
        setSelectedAccountId(null);
        setDetail(null);
        setReaderOpen(false);
      }
    } else if (action === "MARK_READ" || action === "MARK_UNREAD") {
      const unread = action === "MARK_UNREAD";
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, unread } : m))
      );
      setDetail((d) => (d?.id === messageId ? { ...d, unread } : d));
    } else {
      const starred = action === "STAR";
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, starred } : m))
      );
      setDetail((d) => (d?.id === messageId ? { ...d, starred } : d));
    }

    let ok = false;
    try {
      const res = await fetch("/api/gmail/recent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, messageId, action }),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }

    if (!ok) {
      setMessages(prevMessages);
      setDetail(prevDetail);
      if (action === "ARCHIVE") {
        setSelectedId(prevSelected.id);
        setSelectedAccountId(prevSelected.account);
      }
      toast.error("Thao tác thư thất bại, đã hoàn lại");
    } else if (action === "ARCHIVE") {
      toast.success("Đã lưu trữ email");
    }
  };

  const openMessage = (msg: GmailListItem) => {
    setSelectedId(msg.id);
    setSelectedAccountId(msg.accountId);
    setReaderOpen(true);
    if (msg.unread) handleAction(msg.accountId, msg.id, "MARK_READ");
  };

  const enableUrl = apiErrors[0] ? extractEnableApiUrl(apiErrors[0]) : null;

  if (!initialLoaded) return <MailWorkspaceSkeleton />;

  // Đang chờ nội dung của thư vừa chọn (đổi thư thì hiện khung tải, không giữ nội dung thư cũ)
  const readerLoading =
    Boolean(selectedId) &&
    !detailError &&
    (detailLoading || detail?.id !== selectedId);
  const sender = detail ? parseFrom(detail.from) : null;

  return (
    <div className="mx-auto -mb-24 flex h-[calc(100vh-6.5rem)] max-w-7xl flex-col gap-4">
      {/* ===== Thanh trên: thư mục · tài khoản | tìm kiếm · làm mới ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Select
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            aria-label="Thư mục"
          >
            {FOLDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>

          {/* Chỉ liệt kê từng tài khoản đã liên kết; chỉ hiện khi có từ 2 tài khoản */}
          {accounts.length > 1 && (
            <Select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              aria-label="Tài khoản"
              className="max-w-[16rem] truncate"
            >
              <option value="ALL">Tất cả tài khoản</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.email} ({accountLabel(acc.accountType)})
                </option>
              ))}
            </Select>
          )}
        </div>

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
              placeholder="Tìm email, nhấn Enter"
              aria-label="Tìm email"
              className="h-9 w-56 rounded-lg border bg-background pl-9 pr-8 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-primary/40 focus:border-primary"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Xóa tìm kiếm"
                onClick={() => {
                  setSearchQuery("");
                  // Tải lại ngay danh sách không còn từ khoá
                  setTimeout(() => fetchMailbox(), 0);
                }}
                className="absolute right-2 flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => fetchMailbox()}
            aria-label="Làm mới"
            title="Làm mới"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </form>
      </div>

      {/* ===== Hai khung: danh sách | nội dung thư ===== */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-12">
        {/* ----- Danh sách thư ----- */}
        <div
          className={cn(
            "min-h-0 flex-col overflow-hidden rounded-2xl border bg-card lg:col-span-5 lg:flex",
            readerOpen ? "hidden" : "flex"
          )}
        >
          <div className="flex items-center justify-between border-b px-4 py-2.5 text-[13px]">
            <span className="font-display font-semibold text-foreground">
              {FOLDER_OPTIONS.find((o) => o.value === folder)?.label}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {messages.length} thư
            </span>
          </div>

          {!authenticated ? (
            <ConnectPrompt
              className="m-auto rounded-none border-0"
              title="Chưa đăng nhập Google"
              description="Đăng nhập để xem hộp thư Gmail của bạn."
              actionLabel="Đăng nhập Google"
              onConnect={() => {
                window.location.href = "/api/auth/google?mode=login";
              }}
            />
          ) : listError ? (
            <ErrorState
              className="m-auto rounded-none border-0"
              title="Không tải được danh sách thư"
              message={listError}
              onRetry={fetchMailbox}
            />
          ) : apiErrors.length > 0 && messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
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
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Bật Gmail API ngay
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          ) : loading && messages.length === 0 ? (
            <ListSkeleton />
          ) : messages.length === 0 ? (
            <EmptyState
              className="m-auto rounded-none border-0"
              icon={<Mail />}
              title="Không có email"
              description={
                searchQuery.trim()
                  ? "Không có thư nào khớp từ khoá tìm kiếm."
                  : undefined
              }
            />
          ) : (
            <ul
              className={cn(
                "mt-stagger flex-1 divide-y overflow-y-auto pb-24 transition-opacity",
                loading && "opacity-60"
              )}
            >
              {messages.map((msg) => {
                const selected = msg.id === selectedId;
                return (
                  <li key={msg.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => openMessage(msg)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openMessage(msg);
                        }
                      }}
                      className={cn(
                        "relative flex cursor-pointer items-start gap-3 px-4 py-3 outline-none transition-colors focus-visible:bg-muted/60",
                        selected ? "bg-primary/10" : "hover:bg-muted/50"
                      )}
                    >
                      {selected && (
                        <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" />
                      )}

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

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className={cn(
                              "truncate text-[13px]",
                              msg.unread
                                ? "font-semibold text-foreground"
                                : "font-medium text-foreground/80"
                            )}
                          >
                            {msg.fromName}
                          </span>
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">
                            {formatMailDate(msg.date)}
                          </span>
                        </div>
                        <p
                          className={cn(
                            "mt-0.5 truncate text-sm",
                            msg.unread
                              ? "font-semibold text-foreground"
                              : "text-foreground/85"
                          )}
                        >
                          {msg.subject}
                        </p>
                        <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge
                            tone={msg.accountType === "HCMUT" ? "info" : "success"}
                            className="shrink-0 font-sans"
                          >
                            {accountLabel(msg.accountType)}
                          </Badge>
                          <span className="truncate">{msg.snippet}</span>
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
                        title={msg.starred ? "Bỏ gắn sao" : "Gắn sao"}
                        aria-label={msg.starred ? "Bỏ gắn sao" : "Gắn sao"}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-warning-fg"
                      >
                        <Star
                          className={cn(
                            "h-4 w-4",
                            msg.starred && "fill-warning text-warning"
                          )}
                        />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ----- Nội dung thư ----- */}
        <div
          className={cn(
            "min-h-0 flex-col overflow-hidden rounded-2xl border bg-card lg:col-span-7 lg:flex",
            readerOpen ? "flex" : "hidden"
          )}
        >
          {!selectedId ? (
            <EmptyState
              className="m-auto rounded-none border-0"
              icon={<MailOpen />}
              title="Chọn một email để xem"
            />
          ) : detailError ? (
            <ErrorState
              className="m-auto rounded-none border-0"
              title="Không mở được thư"
              message={detailError}
              onRetry={loadDetail}
            />
          ) : readerLoading || !detail || !sender ? (
            <ReaderSkeleton />
          ) : (
            <div
              key={detail.id}
              className="flex min-h-0 flex-1 flex-col animate-in fade-in duration-200"
            >
              {/* Đầu thư: tiêu đề kèm nhóm nút ở bên phải, rồi người gửi */}
              <div className="space-y-4 border-b px-6 py-5">
                <button
                  type="button"
                  onClick={() => setReaderOpen(false)}
                  className="-ml-2 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Danh sách
                </button>

                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                  <h2 className="min-w-0 flex-1 basis-60 font-display text-xl font-bold leading-snug text-foreground">
                    {detail.subject}
                  </h2>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      title={
                        detail.unread ? "Đánh dấu đã đọc" : "Đánh dấu chưa đọc"
                      }
                      aria-label={
                        detail.unread ? "Đánh dấu đã đọc" : "Đánh dấu chưa đọc"
                      }
                      onClick={() =>
                        handleAction(
                          detail.accountId,
                          detail.id,
                          detail.unread ? "MARK_READ" : "MARK_UNREAD"
                        )
                      }
                    >
                      {detail.unread ? (
                        <MailOpen className="h-4 w-4" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}
                      <span className="hidden 2xl:inline">
                        {detail.unread ? "Đã đọc" : "Chưa đọc"}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title={detail.starred ? "Bỏ gắn sao" : "Gắn sao"}
                      aria-label={detail.starred ? "Bỏ gắn sao" : "Gắn sao"}
                      onClick={() =>
                        handleAction(
                          detail.accountId,
                          detail.id,
                          detail.starred ? "UNSTAR" : "STAR"
                        )
                      }
                    >
                      <Star
                        className={cn(
                          "h-4 w-4",
                          detail.starred && "fill-warning text-warning"
                        )}
                      />
                      <span className="hidden 2xl:inline">
                        {detail.starred ? "Bỏ sao" : "Gắn sao"}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Lưu trữ"
                      aria-label="Lưu trữ"
                      onClick={() =>
                        handleAction(detail.accountId, detail.id, "ARCHIVE")
                      }
                    >
                      <Archive className="h-4 w-4" />
                      <span className="hidden 2xl:inline">Lưu trữ</span>
                    </Button>
                    <a
                      href={gmailThreadUrl(detail.accountEmail, detail.threadId)}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      Mở Gmail
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <SenderAvatar
                    name={sender.name}
                    email={sender.email}
                    className="h-11 w-11 text-base"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {sender.name}
                    </p>
                    {sender.email !== sender.name && (
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {sender.email}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-xs text-foreground">
                      {new Date(detail.date).toLocaleString("vi-VN")}
                    </p>
                    <p className="mt-1 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                      <Badge
                        tone={detail.accountType === "HCMUT" ? "info" : "success"}
                        className="font-sans"
                      >
                        {accountLabel(detail.accountType)}
                      </Badge>
                      <span className="max-w-[12rem] truncate">
                        {detail.accountEmail}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Nội dung */}
              <div className="min-h-0 flex-1 overflow-y-auto p-6 pb-24">
                {detail.html ? (
                  <MailHtmlFrame title={detail.subject} html={detail.html} />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                    {detail.text || detail.snippet}
                  </pre>
                )}
              </div>
            </div>
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
