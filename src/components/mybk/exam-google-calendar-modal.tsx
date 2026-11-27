"use client";

import { useEffect, useState } from "react";
import { Modal, useRetained } from "@/components/ui/modal";
import {
  X,
  CalendarPlus,
  Download,
  Check,
  Loader2,
  ExternalLink,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import type { NormalizedExamItem } from "@/lib/mybk-exams";

interface GoogleAccountOption {
  id: string;
  email: string;
  accountType: string;
  isPrimary: boolean;
}

interface ExamGoogleCalendarModalProps {
  open: boolean;
  onClose: () => void;
  semesterYearCode: string;
  semesterYearName: string;
  items: NormalizedExamItem[];
  onDownloadIcs: () => void;
}

export function ExamGoogleCalendarModal({
  open,
  onClose,
  semesterYearCode,
  items,
  onDownloadIcs,
}: ExamGoogleCalendarModalProps) {
  const [accounts, setAccounts] = useState<GoogleAccountOption[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [syncScope, setSyncScope] = useState<"UPCOMING" | "ALL">("UPCOMING");
  const [syncing, setSyncing] = useState(false);


  useEffect(() => {
    if (!open) return;
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

  const todayIso = new Date().toISOString().slice(0, 10);
  const upcomingCount = items.filter((i) => i.examDate >= todayIso).length;
  const totalCount = items.length;

  const handleSync = async () => {
    if (!selectedAccountId) return;
    setSyncing(true);

    try {
      const res = await fetch("/api/exams/google-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccountId,
          semesterYearCode,
          scope: syncScope,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Đồng bộ thất bại", {
          action:
            data.needsReauth && data.authUrl
              ? { label: "Cấp quyền", href: data.authUrl }
              : undefined,
        });
        return;
      }

      toast.success(`Đã thêm ${data.totalProcessed} ca thi vào Google Calendar`);
      onClose();
    } catch {
      toast.error("Lỗi kết nối Google Calendar");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} panelClassName="max-w-md">
        {/* Clean Header */}
        <div className="flex items-center justify-between border-b bg-muted/20 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <CalendarPlus className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-sm font-bold text-foreground">
                Thêm vào Google Calendar
              </h2>
              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
                HK {semesterYearCode}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Friendly Minimal Body */}
        <div className="space-y-4 p-5">
          {/* Scope Segmented Switch */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              Phạm vi
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSyncScope("UPCOMING")}
                className={cn(
                  "flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition-colors",
                  syncScope === "UPCOMING"
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-background text-foreground hover:bg-accent/50"
                )}
              >
                <span>Sắp thi</span>
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                  {upcomingCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSyncScope("ALL")}
                className={cn(
                  "flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition-colors",
                  syncScope === "ALL"
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-background text-foreground hover:bg-accent/50"
                )}
              >
                <span>Cả học kỳ</span>
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                  {totalCount}
                </span>
              </button>
            </div>
          </div>

          {/* Account Picker */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              Tài khoản Google
            </span>

            {loadingAccounts ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border bg-muted/15 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Đang tải...</span>
              </div>
            ) : accounts.length === 0 ? (
              <div className="flex items-center justify-between rounded-xl border border-dashed px-3.5 py-3">
                <span className="text-xs text-muted-foreground">
                  Chưa liên kết Google
                </span>
                <a
                  href="/api/auth/google?mode=login"
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground"
                >
                  <span>Kết nối</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ) : (
              <div className="space-y-1.5">
                {accounts.map((acc) => {
                  const isSelected = selectedAccountId === acc.id;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => setSelectedAccountId(acc.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-colors",
                        isSelected
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

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-xs font-semibold",
                            acc.accountType === "HCMUT"
                              ? "bg-primary/15 text-primary"
                              : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          )}
                        >
                          {acc.accountType === "HCMUT" ? "Bách Khoa" : "Cá nhân"}
                        </span>
                        {isSelected && (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing || accounts.length === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang thêm...</span>
                </>
              ) : (
                <>
                  <CalendarPlus className="h-4 w-4" />
                  <span>Thêm lịch ngay</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                onDownloadIcs();
                toast.success("Đã tải tệp Lịch thi (.ics)");
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border bg-background px-3.5 py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
            >
              <Download className="h-3.5 w-3.5 text-primary" />
              <span>Tải .ics</span>
            </button>
          </div>
        </div>
      </Modal>
  );
}
