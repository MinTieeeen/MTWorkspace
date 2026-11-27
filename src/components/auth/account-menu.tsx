"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, Plus, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

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

function GoogleG({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function Avatar({ user, size = "h-9 w-9" }: { user: WorkspaceUser; size?: string }) {
  return user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={user.avatarUrl}
      alt={user.name}
      referrerPolicy="no-referrer"
      className={cn(size, "shrink-0 rounded-full object-cover")}
    />
  ) : (
    <span
      className={cn(
        size,
        "flex shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
      )}
    >
      {user.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Avatar ở header, bấm để mở menu tài khoản Google (liên kết thêm, gỡ, đăng xuất). */
export function AccountMenu() {
  const [user, setUser] = useState<WorkspaceUser | null>(null);
  const [isGoogleConfigured, setIsGoogleConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadUser = async () => {
    try {
      const res = await fetch("/api/user/me", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setUser(data.user || null);
      setIsGoogleConfigured(Boolean(data.isGoogleConfigured));
    } catch {
      toast.error("Không tải được thông tin tài khoản");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
    const onAuth = () => loadUser();
    window.addEventListener("mt-auth-updated", onAuth);
    return () => window.removeEventListener("mt-auth-updated", onAuth);
  }, []);

  // Đóng khi bấm ra ngoài hoặc nhấn Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const signIn = (mode: "login" | "link" = "login") => {
    if (!isGoogleConfigured) {
      toast.error("Chưa cấu hình GOOGLE_CLIENT_ID trong .env");
      return;
    }
    window.location.href = `/api/auth/google?mode=${mode}`;
  };

  const logout = async () => {
    const res = await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      toast.error("Đăng xuất thất bại, thử lại sau");
      return;
    }
    setUser(null);
    setOpen(false);
    toast.info("Đã đăng xuất tài khoản Google");
    window.dispatchEvent(new Event("mt-auth-updated"));
  };

  const unlink = async (accountId: string) => {
    const res = await fetch(
      `/api/user/me?accountId=${encodeURIComponent(accountId)}`,
      { method: "DELETE" }
    ).catch(() => null);
    if (res?.ok) toast.success("Đã gỡ liên kết tài khoản");
    else toast.error("Không thể gỡ liên kết tài khoản");
    await loadUser();
    window.dispatchEvent(new Event("mt-auth-updated"));
  };

  if (loading) return <Skeleton className="h-9 w-9 rounded-full" />;

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => signIn("login")}
        className="group inline-flex h-9 items-center gap-2 rounded-full border bg-card px-3 text-[13px] font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-muted/60"
      >
        <GoogleG className="h-4 w-4 transition-transform duration-500 group-hover:rotate-[360deg]" />
        <span className="hidden sm:inline">Đăng nhập</span>
      </button>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Tài khoản"
        className={cn(
          "rounded-full ring-offset-2 ring-offset-background transition-shadow hover:ring-2 hover:ring-primary/40",
          open && "ring-2 ring-primary/60"
        )}
      >
        <Avatar user={user} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-80 origin-top-right overflow-hidden rounded-2xl border bg-card shadow-xl animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-150"
        >
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <Avatar user={user} size="h-10 w-10" />
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold text-foreground">
                {user.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.primaryEmail}
              </p>
            </div>
          </div>

          <div className="space-y-1 p-2">
            <p className="px-2 pb-1 pt-1 text-xs font-semibold text-muted-foreground">
              Tài khoản Google ({user.googleAccounts.length})
            </p>
            {user.googleAccounts.map((acc) => (
              <div
                key={acc.id}
                className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted"
              >
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-px text-xs font-semibold",
                    acc.accountType === "HCMUT"
                      ? "bg-info/15 text-info-fg"
                      : "bg-success/15 text-success-fg"
                  )}
                >
                  {acc.accountType === "HCMUT" ? "HCMUT" : "Cá nhân"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                  {acc.email}
                </span>
                {acc.isPrimary ? (
                  <span className="text-xs text-muted-foreground">Chính</span>
                ) : (
                  user.googleAccounts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => unlink(acc.id)}
                      title="Gỡ liên kết tài khoản này"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger-fg focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )
                )}
              </div>
            ))}
          </div>

          <div className="space-y-0.5 border-t p-2">
            <button
              type="button"
              role="menuitem"
              onClick={() => signIn("link")}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Plus className="h-4 w-4 text-primary" />
              Liên kết thêm tài khoản Google
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={logout}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-medium text-danger-fg transition-colors hover:bg-danger/10"
            >
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
