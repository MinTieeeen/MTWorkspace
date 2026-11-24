export function BrandLogo() {
  return (
    <div className="group flex items-center gap-3 cursor-pointer">
      {/* Solid Single-Color Logo Box with Internal SVG Path Animation on Hover */}
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <svg
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-7 w-7"
        >
          {/* Orbit Ring - rotates internally on hover */}
          <ellipse
            cx="18"
            cy="18"
            rx="14"
            ry="6.5"
            transform="rotate(-28 18 18)"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1.6"
            strokeDasharray="3 2"
            className="origin-center transition-transform duration-500 group-hover:rotate-12"
          />
          {/* Solid Geometric M + T Monogram */}
          <path
            d="M7.5 24.5V12.5L13 18.5L18.5 12.5V24.5"
            stroke="white"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M21 12.5H29M25 12.5V24.5"
            stroke="white"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Spark Star - spins internally on hover */}
          <path
            d="M28.5 6.5L29.4 8.6L31.5 9.5L29.4 10.4L28.5 12.5L27.6 10.4L25.5 9.5L27.6 8.6L28.5 6.5Z"
            fill="#FDE047"
            className="origin-[28.5px_9.5px] transition-transform duration-500 group-hover:rotate-90"
          />
        </svg>
      </div>

      {/* Brand Wordmark (Solid Color, Larger Font) */}
      <div className="flex items-center gap-1.5">
        <span className="font-display text-lg font-extrabold tracking-tight text-foreground">
          MTWorkspace
        </span>
        <span className="h-2 w-2 rounded-full bg-primary" />
      </div>
    </div>
  );
}
