"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/toast";

interface MyBkConnectModalProps {
  open: boolean;
  onClose: () => void;
  connectedStudentId?: string | null;
  lastSyncedAt?: string | null;
  onSuccess?: () => void;
}

export function MyBkConnectModal({
  open,
  onClose,
  connectedStudentId,
  lastSyncedAt,
  onSuccess,
}: MyBkConnectModalProps) {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"sso" | "token">("sso");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [jwtToken, setJwtToken] = useState("");
  const [studentId, setStudentId] = useState(connectedStudentId || "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/mybk/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: tab,
          username,
          password,
          jwtToken,
          studentId: studentId.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Kết nối myBK thất bại");
        return;
      }

      toast.success("Đã kết nối và đồng bộ myBK");
      window.dispatchEvent(new Event("mt-mybk-updated"));
      onSuccess?.();
      onClose();
    } catch {
      toast.error("Lỗi kết nối máy chủ");
    } finally {
      setLoading(false);
    }
  };

  const handleResync = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mybk/transcript", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Đồng bộ thất bại");
        return;
      }
      toast.success("Đã làm mới dữ liệu myBK");
      window.dispatchEvent(new Event("mt-mybk-updated"));
      onSuccess?.();
      onClose();
    } catch {
      toast.error("Lỗi kết nối khi đồng bộ");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    await fetch("/api/mybk/connect", { method: "DELETE" });
    toast.info("Đã ngắt kết nối myBK");
    window.dispatchEvent(new Event("mt-mybk-updated"));
    onSuccess?.();
    setLoading(false);
    onClose();
  };

  const modalContent = (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border bg-card text-card-foreground shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <h2 className="font-display text-base font-bold">
              Kết nối SSO HCMUT (myBK)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Connected Status Banner */}
        {connectedStudentId && (
          <div className="border-b bg-muted/40 px-5 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <div>
                <p className="font-bold text-foreground">
                  Đã kết nối MSSV: {connectedStudentId}
                </p>
                {lastSyncedAt && (
                  <p className="text-muted-foreground">
                    Đồng bộ: {new Date(lastSyncedAt).toLocaleString("vi-VN")}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleResync}
                disabled={loading}
                className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                />
                <span>Làm mới</span>
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={loading}
                title="Ngắt kết nối"
                className="flex h-8 w-8 items-center justify-center rounded-lg border bg-card text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Mode Switch Tabs */}
        <div className="grid grid-cols-2 gap-1.5 border-b bg-muted/20 p-2.5">
          <button
            type="button"
            onClick={() => setTab("sso")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-colors ${
              tab === "sso"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Tài khoản SSO</span>
          </button>

          <button
            type="button"
            onClick={() => setTab("token")}
            className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-colors ${
              tab === "token"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>Token trực tiếp</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleConnect} className="p-5 space-y-4">

          {tab === "sso" ? (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">
                  Tài khoản BKNetID (sso.hcmut.edu.vn)
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="VD: tien.huynhminhcse"
                  className="h-10 w-full rounded-xl border bg-muted/40 px-3.5 text-sm text-foreground outline-none focus:border-primary focus:bg-card"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">
                  Mật khẩu SSO
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-10 w-full rounded-xl border bg-muted/40 px-3.5 text-sm text-foreground outline-none focus:border-primary focus:bg-card"
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">
                  Authorization Token (myBK)
                </label>
                <textarea
                  required
                  rows={3}
                  value={jwtToken}
                  onChange={(e) => setJwtToken(e.target.value)}
                  placeholder="eyJhbGciOiJIUzUxMiJ9..."
                  className="w-full rounded-xl border bg-muted/40 p-3 font-mono text-xs text-foreground outline-none focus:border-primary focus:bg-card"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">
                  Mã số sinh viên (Tự động nhận diện nếu để trống)
                </label>
                <input
                  type="text"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="VD: 2313425"
                  className="h-10 w-full rounded-xl border bg-muted/40 px-3.5 text-sm text-foreground outline-none focus:border-primary focus:bg-card"
                />
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl border px-4 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              <span>{loading ? "Đang đồng bộ..." : "Kết nối & Đồng bộ"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
