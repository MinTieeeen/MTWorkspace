"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import {
  ChevronUp,
  LogOut,
  Plus,
  Trash2,
} from "lucide-react";

export interface LinkedGoogleAccount {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  accountType: "HCMUT" | "PERSONAL";
  isPrimary: boolean;
}

export interface WorkspaceUser {
  id: string;
  name: string;
  primaryEmail: string;
  avatarUrl: string | null;
  googleAccounts: LinkedGoogleAccount[];
}

export function UserProfileSidebar() {
  const [user, setUser] = useState<WorkspaceUser | null>(null);
  const [isGoogleConfigured, setIsGoogleConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [openMenu, setOpenMenu] = useState(false);

  const loadUser = async () => {
    try {
      const res = await fetch("/api/user/me", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setUser(data.user || null);
      setIsGoogleConfigured(Boolean(data.isGoogleConfigured));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
  }, []);

  const handleGoogleSignIn = (mode: "login" | "link" = "login") => {
    if (!isGoogleConfigured) {
      toast.error("Chưa cấu hình GOOGLE_CLIENT_ID trong .env");
      return;
    }
    window.location.href = `/api/auth/google?mode=${mode}`;
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setOpenMenu(false);
    toast.info("Đã đăng xuất tài khoản Google");
    window.dispatchEvent(new Event("mt-auth-updated"));
  };

  const handleUnlinkAccount = async (accountId: string) => {
    const res = await fetch(
      `/api/user/me?accountId=${encodeURIComponent(accountId)}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      toast.success("Đã hủy liên kết tài khoản");
    } else {
      toast.error("Không thể hủy liên kết tài khoản");
    }
    await loadUser();
    window.dispatchEvent(new Event("mt-auth-updated"));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2.5 border-t p-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative border-t p-3">
      {/* Multi-Account Management Popover when Logged In */}
      {user && openMenu && (
        <div className="mb-2 rounded-xl border bg-card p-3 shadow-lg space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Tài khoản đã liên kết ({user.googleAccounts.length})
            </p>
            <div className="space-y-1.5">
              {user.googleAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-2.5 py-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          acc.accountType === "HCMUT"
                            ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                            : "bg-teal-500/15 text-teal-600 dark:text-teal-400"
                        }`}
                      >
                        {acc.accountType === "HCMUT" ? "HCMUT" : "Cá nhân"}
                      </span>
                      {acc.isPrimary && (
                        <span className="text-[10px] font-medium text-muted-foreground">
                          • Chính
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate font-medium text-foreground">
                      {acc.email}
                    </p>
                  </div>

                  {user.googleAccounts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleUnlinkAccount(acc.id)}
                      title="Gỡ liên kết tài khoản này"
                      className="group flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5 icon-anim-wiggle" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="border-t pt-2 space-y-1">
            <button
              type="button"
              onClick={() => handleGoogleSignIn("link")}
              className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
              <span>Liên kết thêm tài khoản Google</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4 icon-anim-slide" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Footer Button: Either Logged-Out Sign In Button OR Logged-In Profile Card */}
      {!user ? (
        <button
          type="button"
          onClick={() => handleGoogleSignIn("login")}
          className="group flex w-full items-center justify-center gap-2.5 rounded-xl border bg-card px-3.5 py-2.5 text-sm font-semibold text-foreground transition-colors duration-200 hover:border-primary/50 hover:bg-muted/60"
        >
          {/* Official Google G Vector Icon with Internal Rotation on Hover */}
          <svg
            className="h-4 w-4 shrink-0 transition-transform duration-500 group-hover:rotate-[360deg]"
            viewBox="0 0 24 24"
          >
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span>Đăng nhập Google</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpenMenu((prev) => !prev)}
          className="group flex w-full items-center justify-between gap-2.5 rounded-xl border bg-muted/40 px-3 py-2 text-left transition-colors duration-200 hover:border-primary/40 hover:bg-muted"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-9 w-9 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                {user.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-foreground">
                {user.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.googleAccounts.length} tài khoản Google
              </p>
            </div>
          </div>
          <ChevronUp
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${
              openMenu ? "rotate-180" : ""
            }`}
          />
        </button>
      )}
    </div>
  );
}
