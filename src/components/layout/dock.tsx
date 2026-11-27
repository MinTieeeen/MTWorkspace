"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  NAV_GROUPS,
  NAV_ITEMS,
  isActiveHref,
  openCommandPalette,
} from "./nav-items";

const BASE = 44; // kích thước icon khi nghỉ (px)
const MAX = 64; // kích thước lớn nhất ngay dưới con trỏ
const RANGE = 130; // bán kính ảnh hưởng của con trỏ
const SEARCH_HUE = "215 14% 62%";
const STORAGE_KEY = "mt-dock-hidden";

type HueStyle = React.CSSProperties & { "--hue": string };

/**
 * Dock điều hướng nổi ở cạnh dưới, nền mực tối, mỗi mục một màu nhận diện riêng.
 * Icon phóng to theo con trỏ (kiểu macOS); có thể ẩn dock và hiện lại bằng tay cầm nhỏ.
 */
export function Dock() {
  const pathname = usePathname();
  const [mouseX, setMouseX] = useState<number | null>(null);
  const [reduced, setReduced] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const refs = useRef(new Map<string, HTMLElement>());

  useEffect(() => setPending(null), [pathname]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    try {
      setHidden(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // không đọc được localStorage: mặc định hiện dock
    }
    return () => mq.removeEventListener("change", update);
  }, []);

  const setDockHidden = (value: boolean) => {
    setHidden(value);
    setMouseX(null);
    try {
      localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      // bỏ qua: chỉ mất ghi nhớ giữa các lần mở
    }
  };

  const current = pending ?? pathname;

  const sizeOf = (key: string) => {
    const el = refs.current.get(key);
    if (mouseX === null || reduced || !el) return BASE;
    const r = el.getBoundingClientRect();
    const d = Math.abs(mouseX - (r.left + r.width / 2));
    return BASE + (MAX - BASE) * Math.max(0, 1 - d / RANGE);
  };

  const setRef = (key: string) => (el: HTMLElement | null) => {
    if (el) refs.current.set(key, el);
    else refs.current.delete(key);
  };

  // Mỗi mục dùng biến --hue: chữ/icon màu riêng, nền đậm khi đang mở
  const itemClass =
    "group/item relative flex shrink-0 items-center justify-center rounded-xl outline-none transition-[width,height,background-color,color,box-shadow] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[hsl(var(--hue))]";
  const idleClass =
    "bg-white/[0.05] text-[hsl(var(--hue))] hover:bg-[hsl(var(--hue)/0.16)]";
  const activeClass = "bg-[hsl(var(--hue)/0.85)] text-white";

  const tooltip = (label: string, kbd?: string) => (
    <span className="pointer-events-none absolute bottom-full left-1/2 mb-2.5 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg border border-white/10 bg-[hsl(222_47%_11%)] px-2.5 py-1 text-xs font-semibold text-white/90 opacity-0 shadow-lg transition-all duration-150 group-hover/item:translate-y-0 group-hover/item:opacity-100 group-focus-visible/item:translate-y-0 group-focus-visible/item:opacity-100">
      {label}
      {kbd && <span className="ml-1.5 font-mono text-white/45">{kbd}</span>}
    </span>
  );

  const searchSize = sizeOf("__search");

  return (
    <>
      {/* Dock chính */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center">
        <nav
          aria-label="Điều hướng chính"
          aria-hidden={hidden}
          inert={hidden}
          className={cn(
            "pointer-events-auto transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity",
            hidden ? "translate-y-[140%] opacity-0" : "translate-y-0 opacity-100"
          )}
        >
          <div
            onMouseMove={(e) => setMouseX(e.clientX)}
            onMouseLeave={() => setMouseX(null)}
            className="flex h-[60px] items-end gap-1.5 rounded-2xl border border-white/[0.07] bg-[hsl(222_40%_10%/0.94)] px-2 pb-2 shadow-[0_14px_44px_-12px_rgba(2,8,23,0.6),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl"
          >
            {NAV_GROUPS.map((group, gi) => (
              <Fragment key={gi}>
                {gi > 0 && (
                  <span aria-hidden className="mx-0.5 mb-2 h-7 w-px self-end bg-white/[0.08]" />
                )}
                {group.map((item) => {
                  const Icon = item.icon;
                  const active = isActiveHref(item.href, current);
                  const size = sizeOf(item.href);
                  const style: HueStyle = {
                    "--hue": item.hue,
                    width: size,
                    height: size,
                    boxShadow: active
                      ? `0 6px 16px -6px hsl(${item.hue} / 0.45)`
                      : undefined,
                  };
                  return (
                    <Link
                      key={item.href}
                      ref={setRef(item.href)}
                      href={item.href}
                      aria-label={item.title}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setPending(item.href)}
                      style={style}
                      className={cn(itemClass, active ? activeClass : idleClass)}
                    >
                      <Icon
                        strokeWidth={active ? 2.4 : 2}
                        style={{ width: size * 0.42, height: size * 0.42 }}
                      />
                      {tooltip(item.title)}
                      {active && (
                        <span
                          aria-hidden
                          className="absolute -bottom-[7px] left-1/2 h-1 w-3 -translate-x-1/2 rounded-full bg-[hsl(var(--hue)/0.85)]"
                        />
                      )}
                    </Link>
                  );
                })}
              </Fragment>
            ))}

            <span aria-hidden className="mx-0.5 mb-2 h-7 w-px self-end bg-white/[0.08]" />

            <button
              type="button"
              ref={setRef("__search")}
              onClick={openCommandPalette}
              aria-label="Tìm kiếm"
              style={{ "--hue": SEARCH_HUE, width: searchSize, height: searchSize } as HueStyle}
              className={cn(itemClass, idleClass)}
            >
              <Search style={{ width: searchSize * 0.42, height: searchSize * 0.42 }} />
              {tooltip("Tìm kiếm", "Ctrl K")}
            </button>

            {/* Nút ẩn dock: nhỏ, không phóng to */}
            <button
              type="button"
              onClick={() => setDockHidden(true)}
              aria-label="Ẩn thanh điều hướng"
              style={{ "--hue": SEARCH_HUE } as HueStyle}
              className="group/item relative mb-0.5 flex h-7 w-6 shrink-0 items-center justify-center self-end rounded-lg text-white/40 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <ChevronDown className="h-4 w-4" />
              {tooltip("Ẩn thanh")}
            </button>
          </div>
        </nav>
      </div>

      {/* Tay cầm hiện lại dock khi đã ẩn */}
      <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center">
        <button
          type="button"
          onClick={() => setDockHidden(false)}
          aria-label="Hiện thanh điều hướng"
          aria-hidden={!hidden}
          tabIndex={hidden ? 0 : -1}
          className={cn(
            "group flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-[hsl(222_47%_11%/0.92)] px-3 shadow-lg backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
            hidden
              ? "pointer-events-auto translate-y-0 opacity-100 delay-150"
              : "translate-y-6 opacity-0"
          )}
        >
          {NAV_ITEMS.map((item) => (
            <span
              key={item.href}
              aria-hidden
              className={cn(
                "h-1.5 rounded-full transition-all duration-200",
                isActiveHref(item.href, current) ? "w-4" : "w-1.5"
              )}
              style={{ background: `hsl(${item.hue} / 0.85)` }}
            />
          ))}
          <ChevronUp className="ml-0.5 h-3.5 w-3.5 text-white/60 transition-transform group-hover:-translate-y-0.5" />
        </button>
      </div>
    </>
  );
}
