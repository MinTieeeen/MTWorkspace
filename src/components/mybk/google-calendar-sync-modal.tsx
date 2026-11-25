"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  CalendarPlus,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NormalizedTimetableItem } from "@/lib/mybk-timetable";

interface GoogleAccountOption {
  id: string;
  email: string;
  accountType: string;
  isPrimary: boolean;
}

interface GoogleCalendarSyncModalProps {
  open: boolean;
  onClose: () => void;
  semesterYearCode: string;
  semesterYearName: string;
  selectedWeek: number;
  items: NormalizedTimetableItem[];
  onDownloadIcs: () => void;
}

export function GoogleCalendarSyncModal({
  open,
  onClose,
  semesterYearCode,
  semesterYearName,
  selectedWeek,
  items,
  onDownloadIcs,
}: GoogleCalendarSyncModalProps) {
  const [mounted, setMounted] = useState(false);
  const [accounts, setAccounts] = useState<GoogleAccountOption[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [syncMode, setSyncMode] = useState<"SEMESTER" | "WEEK">("SEMESTER");
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{
    totalProcessed: number;
    createdCount: number;
    updatedCount: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reauthUrl, setReauthUrl] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setErrorMsg(null);
    setReauthUrl(null);
    setLoadingAccounts(true);

    fetch("/api/user/me")
      .then((res) => res.json())
      .then((data) => {
        const list: GoogleAccountOption[] = data?.user?.googleAccounts || [];
        setAccounts(list);
        if (list.length > 0) {
          const hcmut = list.find((a) => a.accountType === "HCMUT");
          setSelectedAccountId(hcmut ? hcmut.id : list[0].id);
        }
      })
      .catch(() => {
        setAccounts([]);
      })
      .finally(() => {
        setLoadingAccounts(false);
      });
  }, [open]);

  if (!open || !mounted) return null;

  const scheduledItems = items.filter(
    (item) =>
      item.dayOfWeek >= 2 &&
      item.dayOfWeek <= 8 &&
      item.startLesson > 0 &&
      item.startTime !== "0:00" &&
      item.startTime !== "00:00"
  );

  const totalSemesterSessions = scheduledItems.reduce(
    (sum, item) => sum + item.activeWeeks.length,
    0
  );
  const totalWeekSessions = scheduledItems.filter((item) =>
    item.activeWeeks.includes(selectedWeek)
  ).length;

  const handleSyncToGoogleCalendar = async () => {
    if (!selectedAccountId) return;
    setSyncing(true);
    setResult(null);
    setErrorMsg(null);
    setReauthUrl(null);

    try {
      const res = await fetch("/api/timetable/google-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccountId,
          semesterYearCode,
          mode: syncMode,
          weekNumber: syncMode === "WEEK" ? selectedWeek : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Đồng bộ Google Calendar thất bại");
        if (data.needsReauth && data.authUrl) {
          setReauthUrl(data.authUrl);
        }
        return;
      }

      setResult({
        totalProcessed: data.totalProcessed,
        createdCount: data.createdCount,
        updatedCount: data.updatedCount,
      });
    } catch {
      setErrorMsg("Lỗi kết nối khi đồng bộ lên Google Calendar");
    } finally {
      setSyncing(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-muted/20 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold text-foreground">
                Thêm Thời khóa biểu vào Google Calendar
              </h2>
              <p className="text-xs text-muted-foreground">
                {semesterYearName} ({semesterYearCode})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 p-6">
          {/* Option 1: Direct API Sync */}
          <div className="space-y-3.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              1. Chọn phạm vi đồng bộ
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setSyncMode("SEMESTER")}
                className={cn(
                  "flex flex-col items-start rounded-xl border p-3.5 text-left transition-colors",
                  syncMode === "SEMESTER"
                    ? "border-primary bg-primary/10"
                    : "bg-background hover:bg-accent/50"
                )}
              >
                <span className="text-xs font-bold text-foreground">
                  Toàn bộ học kỳ ({semesterYearCode})
                </span>
                <span className="mt-1 font-mono text-xs text-muted-foreground">
                  {totalSemesterSessions} buổi học cụ thể
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSyncMode("WEEK")}
                className={cn(
                  "flex flex-col items-start rounded-xl border p-3.5 text-left transition-colors",
                  syncMode === "WEEK"
                    ? "border-primary bg-primary/10"
                    : "bg-background hover:bg-accent/50"
                )}
              >
                <span className="text-xs font-bold text-foreground">
                  Chỉ Tuần {selectedWeek} đang xem
                </span>
                <span className="mt-1 font-mono text-xs text-muted-foreground">
                  {totalWeekSessions} buổi học trong tuần
                </span>
              </button>
            </div>
          </div>

          {/* Account Picker */}
          <div className="space-y-2.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              2. Tài khoản Google Calendar nhận lịch
            </label>

            {loadingAccounts ? (
              <div className="flex items-center gap-2 rounded-xl border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Đang kiểm tra tài khoản Google đã liên kết...</span>
              </div>
            ) : accounts.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-center">
                <p className="text-xs text-muted-foreground">
                  Chưa có tài khoản Google nào được kết nối.
                </p>
                <a
                  href="/api/auth/google?mode=login"
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                >
                  <span>Đăng nhập Google để đồng bộ</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            ) : (
              <div className="space-y-2">
                {accounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setSelectedAccountId(acc.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-colors",
                      selectedAccountId === acc.id
                        ? "border-primary bg-primary/10"
                        : "bg-background hover:bg-accent/50"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Calendar className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate font-mono text-xs font-medium text-foreground">
                        {acc.email}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 text-[10px] font-semibold",
                        acc.accountType === "HCMUT"
                          ? "bg-primary/15 text-primary"
                          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      )}
                    >
                      {acc.accountType === "HCMUT" ? "Bách Khoa" : "Cá nhân"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Feedback Alerts */}
          {result && (
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  Đã đồng bộ thành công {result.totalProcessed} buổi học lên
                  Google Calendar!
                </p>
                <p className="mt-0.5 opacity-90">
                  Tạo mới: {result.createdCount} buổi • Cập nhật:{" "}
                  {result.updatedCount} buổi (chống trùng lặp tự động).
                </p>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="space-y-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-700 dark:text-rose-300">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
              {reauthUrl && (
                <a
                  href={reauthUrl}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
                >
                  <span>Cấp quyền Google Calendar ngay</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5 pt-1 sm:flex-row">
            <button
              type="button"
              onClick={handleSyncToGoogleCalendar}
              disabled={syncing || accounts.length === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang đồng bộ lên Google Calendar...</span>
                </>
              ) : (
                <>
                  <CalendarPlus className="h-4 w-4" />
                  <span>Đồng bộ tự động qua API</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onDownloadIcs}
              className="inline-flex items-center justify-center gap-2 rounded-xl border bg-background px-4 py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
            >
              <Download className="h-4 w-4 text-primary" />
              <span>Tải tệp .ics chuẩn</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
