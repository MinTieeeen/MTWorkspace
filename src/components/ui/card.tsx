import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-card transition-colors duration-200 hover:border-primary/30",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({
  icon,
  title,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b px-5 py-3",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&>svg]:h-[18px] [&>svg]:w-[18px]">
            {icon}
          </span>
        )}
        <h2 className="truncate font-display text-base font-semibold">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}
