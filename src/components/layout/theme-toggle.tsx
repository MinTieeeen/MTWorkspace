"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("mt-theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    const shouldBeDark = saved ? saved === "dark" : prefersDark;
    setIsDark(shouldBeDark);
    document.documentElement.classList.toggle("dark", shouldBeDark);
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    document.documentElement.classList.toggle("dark", nextDark);
    localStorage.setItem("mt-theme", nextDark ? "dark" : "light");
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối"}
      className="group relative inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-card text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
    >
      <Sun
        className={`h-4 w-4 text-amber-500 transition-transform duration-500 ${
          isDark
            ? "scale-0 opacity-0"
            : "scale-100 opacity-100 group-hover:rotate-90"
        }`}
      />
      <Moon
        className={`absolute h-4 w-4 text-sky-400 transition-transform duration-500 ${
          isDark
            ? "scale-100 opacity-100 group-hover:-rotate-12"
            : "scale-0 opacity-0"
        }`}
      />
    </button>
  );
}
