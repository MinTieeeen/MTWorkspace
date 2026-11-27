import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Mona_Sans } from "next/font/google";
import "./globals.css";
import { BRAND } from "@/lib/brand";
import { Dock } from "@/components/layout/dock";
import { CommandPalette } from "@/components/layout/command-palette";
import { Header } from "@/components/layout/header";
import { ToastViewport } from "@/components/ui/toast";
import { RouteProgress } from "@/components/layout/route-progress";

// Heading / chữ đậm: có subset tiếng Việt nên dấu không bị lệch ở 600-700
const display = Bricolage_Grotesque({
  subsets: ["latin", "vietnamese"],
  variable: "--font-display",
  weight: "variable",
  axes: ["opsz"],
  display: "swap",
});

// Body / UI
const sans = Mona_Sans({
  subsets: ["latin", "vietnamese"],
  variable: "--font-sans",
  weight: "variable",
  display: "swap",
});

// Số liệu, mã môn, giờ
const mono = IBM_Plex_Mono({
  subsets: ["latin", "vietnamese"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

// Đặt class dark trước khi paint để không bị nháy nền sáng
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("mt-theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
};

export const viewport: Viewport = {
  themeColor: BRAND.color,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground selection:bg-primary/20">
        <RouteProgress />
        <div className="flex h-screen flex-col overflow-hidden">
          <Header />
          {/* pb-28: chừa chỗ cho dock nổi ở cạnh dưới */}
          <main className="flex-1 overflow-y-auto px-4 pb-28 pt-6 sm:px-6">
            {children}
          </main>
        </div>
        <Dock />
        <CommandPalette />
        <ToastViewport />
      </body>
    </html>
  );
}
