"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

// Thứ tự trang theo sidebar: đi xuống menu thì nội dung trượt lên, đi lên thì trượt xuống
const ROUTE_ORDER = [
  "/",
  "/mail",
  "/timetable",
  "/exams",
  "/academic-results",
  "/thesis",
];
let lastIndex = -1;

function indexOfRoute(pathname: string): number {
  const i = ROUTE_ORDER.findIndex((r) =>
    r === "/" ? pathname === "/" : pathname.startsWith(r)
  );
  return i === -1 ? 0 : i;
}

// template được mount lại mỗi lần chuyển trang nên animation chạy lại theo từng trang
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [cls] = useState(() => {
    const idx = indexOfRoute(pathname);
    // Lần tải đầu (và khi render trên server) chỉ fade để tránh lệch hydration
    if (typeof window === "undefined" || lastIndex === -1) {
      if (typeof window !== "undefined") lastIndex = idx;
      return "mt-page";
    }
    const dir = idx >= lastIndex ? "mt-page-down" : "mt-page-up";
    lastIndex = idx;
    return dir;
  });

  return <div className={cls}>{children}</div>;
}
