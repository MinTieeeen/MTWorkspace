import { BRAND, LOGO_PATH_BAR, LOGO_PATH_MAIN } from "@/lib/brand";

/**
 * Logo "một nét liền": chữ M nối thẳng sang T, kết thúc bằng chấm mốc.
 * Hiệu ứng hover nằm trong globals.css (.brand-logo*), tĩnh khi không hover.
 */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`brand-tile relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary shadow-sm ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 40 40" fill="none" className="h-full w-full">
        <path
          className="brand-stroke brand-stroke-main"
          d={LOGO_PATH_MAIN}
          pathLength={1}
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          className="brand-stroke brand-stroke-bar"
          d={LOGO_PATH_BAR}
          pathLength={1}
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <span className="brand-dot" />
    </span>
  );
}

export function BrandLogo() {
  return (
    <div className="brand-logo group flex cursor-pointer items-center gap-3">
      <BrandMark />
      <span className="relative flex items-baseline font-display text-lg leading-none">
        <span className="font-bold tracking-tight text-foreground">
          {BRAND.short}
        </span>
        <span className="brand-suffix font-medium text-muted-foreground">
          {BRAND.suffix}
        </span>
        <span className="brand-underline" />
      </span>
    </div>
  );
}
