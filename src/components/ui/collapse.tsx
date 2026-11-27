import { cn } from "@/lib/utils";

/** Vùng thu gọn/mở có animation chiều cao. Nội dung vẫn ở trong DOM khi đóng (ẩn khỏi trợ năng). */
export function Collapse({
  open,
  children,
  className,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="mt-collapse" data-open={open} aria-hidden={!open}>
      <div className={cn("mt-collapse-inner", className)} inert={!open}>
        {children}
      </div>
    </div>
  );
}
