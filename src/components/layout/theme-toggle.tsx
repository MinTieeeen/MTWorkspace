"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const THEME_EVENT = "mt-theme-changed";

/** Đổi sáng/tối từ bất kỳ đâu (nút ở header, bảng lệnh Ctrl K) */
export function toggleTheme() {
  const nextDark = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", nextDark);
  try {
    localStorage.setItem("mt-theme", nextDark ? "dark" : "light");
  } catch {
    // trình duyệt chặn localStorage: vẫn đổi được trong phiên hiện tại
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Class dark đã được script trong <head> đặt sẵn trước khi paint
    const sync = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    sync();
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối"}
      aria-label="Đổi giao diện sáng/tối"
      className="group relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
    >
      <Sun
        className={`h-[18px] w-[18px] text-warning-fg transition-all duration-500 ${
          isDark
            ? "rotate-90 scale-0 opacity-0"
            : "scale-100 opacity-100 group-hover:rotate-90"
        }`}
      />
      <Moon
        className={`absolute h-[18px] w-[18px] text-info-fg transition-all duration-500 ${
          isDark
            ? "scale-100 opacity-100 group-hover:-rotate-12"
            : "-rotate-90 scale-0 opacity-0"
        }`}
      />
    </button>
  );
}
