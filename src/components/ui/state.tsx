import { AlertTriangle, Inbox, KeyRound, RefreshCw } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

interface StateShellProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  tone?: "muted" | "danger" | "warning";
}

function StateShell({
  icon,
  title,
  description,
  action,
  className,
  tone = "muted",
}: StateShellProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-2xl border bg-card px-6 py-10 text-center animate-in fade-in duration-200",
        className
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl [&>svg]:h-5 [&>svg]:w-5",
          tone === "danger" && "bg-danger/10 text-danger-fg",
          tone === "warning" && "bg-warning/10 text-warning-fg",
          tone === "muted" && "bg-muted text-muted-foreground"
        )}
      >
        {icon}
      </span>
      <p className="font-display text-sm font-semibold text-foreground">
        {title}
      </p>
      {description && (
        <p className="max-w-sm text-[13px] text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  ...rest
}: Omit<StateShellProps, "icon" | "tone"> & { icon?: React.ReactNode }) {
  return <StateShell icon={icon ?? <Inbox />} {...rest} />;
}

export function ErrorState({
  title = "Không tải được dữ liệu",
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <StateShell
      tone="danger"
      icon={<AlertTriangle />}
      title={title}
      description={message}
      className={className}
      action={
        onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
            Thử lại
          </Button>
        )
      }
    />
  );
}

export function ConnectPrompt({
  title,
  description,
  actionLabel,
  onConnect,
  expired = false,
  className,
}: {
  title: string;
  description?: string;
  actionLabel: string;
  onConnect: () => void;
  expired?: boolean;
  className?: string;
}) {
  return (
    <StateShell
      tone={expired ? "warning" : "muted"}
      icon={<KeyRound />}
      title={title}
      description={description}
      className={className}
      action={<Button onClick={onConnect}>{actionLabel}</Button>}
    />
  );
}

/** Dải báo dữ liệu đang hiển thị là bản đã lưu (offline-first) */
export function StaleBanner({
  lastSyncedAt,
  message,
  onRefresh,
  refreshing,
}: {
  lastSyncedAt?: string | null;
  message?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  let when = "";
  if (lastSyncedAt) {
    const d = new Date(lastSyncedAt);
    if (!Number.isNaN(d.getTime())) {
      when = d.toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      });
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-2 text-[13px] text-warning-fg animate-in fade-in slide-in-from-top-1 duration-200">
      <span>
        {message ?? "Đang hiển thị dữ liệu đã lưu"}
        {when && ` · cập nhật ${when}`}
      </span>
      {onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          loading={refreshing}
          onClick={onRefresh}
          className="text-warning-fg hover:bg-warning/15"
        >
          Làm mới
        </Button>
      )}
    </div>
  );
}
