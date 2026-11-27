"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CornerDownLeft,
  FileCheck2,
  Moon,
  Search,
  type LucideIcon,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { formatDateVi, getExamTimestampMs, normalizeSearch } from "@/lib/format";
import type { NormalizedTimetableItem } from "@/lib/mybk-timetable";
import type { NormalizedExamItem } from "@/lib/mybk-exams";
import { NAV_ITEMS, OPEN_COMMAND_EVENT } from "./nav-items";
import { toggleTheme } from "./theme-toggle";

interface CommandItem {
  id: string;
  group: string;
  label: string;
  sub?: string;
  icon: LucideIcon;
  search: string;
  run: () => void;
}

const PER_GROUP = 6;

/** Bảng lệnh Ctrl K: tìm trang, môn học, ca thi và thao tác nhanh. Tìm không phân biệt dấu. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [subjects, setSubjects] = useState<NormalizedTimetableItem[]>([]);
  const [exams, setExams] = useState<NormalizedExamItem[]>([]);
  const loadedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Phím tắt Ctrl/Cmd + K và sự kiện mở từ dock/header
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_EVENT, onOpen);
    };
  }, []);

  // Lần đầu mở: đọc dữ liệu đã lưu (không gọi myBK) để tìm môn học / ca thi
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    if (!loadedRef.current) {
      loadedRef.current = true;
      fetch("/api/mybk/timetable", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => Array.isArray(d?.items) && setSubjects(d.items))
        .catch(() => {
          loadedRef.current = false;
        });
      fetch("/api/mybk/exams", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => Array.isArray(d?.items) && setExams(d.items))
        .catch(() => {
          loadedRef.current = false;
        });
    }
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const allItems = useMemo<CommandItem[]>(() => {
    const go = (href: string) => () => router.push(href);
    const pages: CommandItem[] = NAV_ITEMS.map((n) => ({
      id: `page-${n.href}`,
      group: "Trang",
      label: n.title,
      sub: n.hint,
      icon: n.icon,
      search: normalizeSearch(`${n.title} ${n.hint} ${n.keywords ?? ""}`),
      run: go(n.href),
    }));

    const seen = new Set<string>();
    const subjectItems: CommandItem[] = [];
    for (const s of subjects) {
      if (seen.has(s.subjectCode)) continue;
      seen.add(s.subjectCode);
      subjectItems.push({
        id: `subj-${s.subjectCode}`,
        group: "Môn học",
        label: s.subjectNameVi,
        sub: `${s.subjectCode}${s.classGroup ? ` · ${s.classGroup}` : ""}`,
        icon: BookOpen,
        search: normalizeSearch(`${s.subjectCode} ${s.subjectNameVi}`),
        run: go("/timetable"),
      });
    }

    const now = Date.now();
    const examItems: CommandItem[] = exams
      .filter((e) => getExamTimestampMs(e.examDate, e.endTime) >= now)
      .sort((a, b) => a.examDate.localeCompare(b.examDate))
      .map((e) => ({
        id: `exam-${e.examId}`,
        group: "Ca thi sắp tới",
        label: e.subjectName,
        sub: `${e.examType} · ${formatDateVi(e.examDate).short} ${e.startTime} · ${
          e.roomCode || "chưa xếp phòng"
        }`,
        icon: FileCheck2,
        search: normalizeSearch(`thi ${e.subjectCode} ${e.subjectName} ${e.examType}`),
        run: go("/exams"),
      }));

    const actions: CommandItem[] = [
      {
        id: "act-theme",
        group: "Thao tác",
        label: "Đổi giao diện sáng / tối",
        icon: Moon,
        search: normalizeSearch("doi giao dien sang toi dark light theme"),
        run: toggleTheme,
      },
    ];

    return [...pages, ...subjectItems, ...examItems, ...actions];
  }, [subjects, exams, router]);

  const results = useMemo(() => {
    const q = normalizeSearch(query.trim());
    const matched = q
      ? allItems.filter((i) => q.split(/\s+/).every((t) => i.search.includes(t)))
      : allItems.filter((i) => i.group === "Trang" || i.group === "Thao tác");
    const count = new Map<string, number>();
    return matched.filter((i) => {
      const c = count.get(i.group) ?? 0;
      count.set(i.group, c + 1);
      return c < PER_GROUP;
    });
  }, [allItems, query]);

  useEffect(() => setActive(0), [query]);

  // Giữ mục đang chọn trong vùng nhìn thấy
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const runItem = (item: CommandItem | undefined) => {
    if (!item) return;
    setOpen(false);
    item.run();
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runItem(results[active]);
    }
  };

  let lastGroup = "";

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      label="Tìm kiếm nhanh"
      panelClassName="max-w-xl self-start mt-[10vh]"
    >
      <div className="flex items-center gap-3 border-b px-4">
        <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKey}
          placeholder="Tìm trang, môn học, ca thi..."
          className="h-14 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Từ khoá tìm kiếm"
        />
        <kbd className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
          Esc
        </kbd>
      </div>

      <div ref={listRef} className="max-h-[56vh] overflow-y-auto p-2">
        {results.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">
            Không tìm thấy kết quả cho &ldquo;{query}&rdquo;
          </p>
        ) : (
          results.map((item, idx) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {showGroup && (
                  <p className="px-3 pb-1 pt-3 text-xs font-semibold text-muted-foreground first:pt-1">
                    {item.group}
                  </p>
                )}
                <button
                  type="button"
                  data-index={idx}
                  onMouseMove={() => setActive(idx)}
                  onClick={() => runItem(item)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                    idx === active ? "bg-primary/10" : "hover:bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      idx === active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {item.label}
                    </span>
                    {item.sub && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.sub}
                      </span>
                    )}
                  </span>
                  {idx === active && (
                    <CornerDownLeft className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
        <span>
          <kbd className="font-mono">↑↓</kbd> chọn
        </span>
        <span>
          <kbd className="font-mono">Enter</kbd> mở
        </span>
        <span className="ml-auto">
          <kbd className="font-mono">Ctrl K</kbd> bật / tắt
        </span>
      </div>
    </Modal>
  );
}
